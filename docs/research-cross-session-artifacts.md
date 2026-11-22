# 跨会话产物索引（v2b）调研与方案

> 只读调研，未改任何代码/插件/配置。所有结论带源码或 inspect 依据；行号基于 2026-11-12 15:0x 的安装态，`plugins/dsh-artifacts-panel/client.js` 正被并行修改，本文对它的引用按函数名而非行号。
>
> 缩写：**APP** = `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai`

---

## 0. 结论（TL;DR）

**推荐方案 B：Host 侧新增 `sessionProjections` 单元 + `summary: true` 的紧凑视图，插件激活时后台回填冷会话。**

一句话理由：只有 B 能在**稳态零增量成本**下覆盖**所有会话的完整历史**——每会话日志只在 Host 本地完整读一次、折进持久化投影缓存，之后 `session.list` 零 I/O 直接带出索引；纯 Client 方案每会话都要在 Host 读完整日志、再把历史经 HTTP 传一遍，而且受 v1「一页 400 条消息」上限，天然做不到"所有产物"。

两个前置条件（必须先做 spike，见 §8 第 0 步）：

1. Host half 注册 projection 需要 Zod 形态的 `stateSchema` / `viewSchema`（`APP/dsh-session-projection/lib/index.js:120-129`）。当前插件是本地目录链接安装、无 `node_modules`，**`import('zod')` 能否解析未验证**；不行就用 40 行的手写校验器（只实现 `parse`）或 vendor 一份 zod，二者都只影响一个文件。
2. 首启回填要把 N 个冷会话的完整 log 各读一次（Host 本地磁盘 + JSON 解析），必须先量清 N 与总字节数（`sessionPersistence.list()` 已带 `eventCount/sizeBytes`，见 §3），再定并发与分批。

工期量级：B ≈ **2.5–3.5 人日**（含 spike、回填、UI、验证）；C（折中）≈ 1–1.5 人日但覆盖不完整；A（纯 Client）≈ 2–3 人日且体验最差。

---

## 1. Q1：会话枚举

### 1.1 权威数据源与字段

Client 侧单一入口是 `ctx.sessions.list`（`ISessions.list: ObservableSnapshot<SessionListState>`，`APP/dsh-cordis-client-runner/lib/client.js:2094-2100`）。

真实快照形状（内部 `buildListSnapshot` 先产出 `items`，再由 `projectList` 投影成对外的 `ids/byId`；`APP/dsh-api-session-controller/lib/types/client/sessions/service.js:491-566`）：

```ts
{ ids: SessionId[], byId: Record<SessionId, SessionRow>, phase: 'pending'|'ready', projectionsBySession }
```

`SessionRow`（`APP/dsh-api-session-controller/lib/types/client/sessions/service.js:492-514`）：

| 字段 | 含义 | 出处 |
|---|---|---|
| `id` | 会话 id | service.js:500 |
| `displayTitle` | 展示标题（title → cwd basename → id 兜底） | service.js:501 |
| `title?` | `title` 投影原值（冷会话也能有，来自缓存 hints） | service.js:510 |
| `running` | 是否运行中 | service.js:502 |
| `blank` | 空会话 | service.js:504 |
| `updatedAt` | 最近活动时间（含 `lastPromptAt` 修正） | service.js:505；manager.js:709 |
| `cwd?` | 会话工作目录 | service.js:511 |
| `parentId?` | 父会话（子代理/分叉） | service.js:512 |
| `origin?` | `'subagent'` 标记 | service.js:513 |
| `projectionValues?` | 该会话所有 client-visible 投影值（含 `title`、未来的 `artifactIndex`） | service.js:507-509 |
| `formatStatus?` / `retainedBy` | 迁移状态 / 引用计数 | service.js:503,506 |

- 列表刷新来自 Host 的 `remote.session.list`（`manager.js:340-392`），空会话也在列。
- 子代理行：既可能来自 `session.list`，也可能由父会话的 `subagentCatalog` 投影补进来（`service.js:516-565`），所以子代理一定在 `byId` 里。
- ⚠️ **无 `cwd` 的冷会话不会出现在列表里**：Host 端只把 `header.cwd !== undefined` 的冷会话计入（`APP/dsh-api-session-controller/lib/index.js:2763`）。子代理一般继承 cwd，影响小，但极端情况会漏。

### 1.2 订阅方式

- React 内：`conversation.view` 的标准 props 已包含 `useSessions: UseSessions`、`useWorkspaces`、`useProjection`（`APP/dsh-cordis-client-runner/lib/client.js:4608-4628` 的 slot catalog）。用选择器订阅最小切片：`useSessions(s => s.byId[id]?.projectionValues?.artifactIndex)`。
- 非 React / 数据层：`ctx.sessions.list.subscribe(listener)` + `getSnapshot()`（ObservableSnapshot，`client.js:2095`）；强制刷新用 `ctx.sessions.refresh()`（同处）。
- 实时更新链路：Host 的 `remote.session.control` 流 → Client `handleControlFrame` → 每会话投影 store（`APP/dsh-api-session-controller/lib/types/client/index.js:39`、`transport.js:31`、`manager.js:561-590`）。**live 会话的投影变化是推送来的**，不需要轮询。

### 1.3 归档会话

归档不属于 Session 状态，属于 Workspace 域：

- `ctx.workspaces.list.getSnapshot()` → `{ items: WorkspaceView[], pinnedSessionIds, archivedSessionIds }`（`APP/dsh-client-ui-workspace/lib/client.js:1554`、`3679`）。
- `WorkspaceView`：`{ workspaceId, path, title, sessionIds, createdAt, updatedAt }`（`APP/dsh-cordis-client-runner/lib/client.js:2515-2518`）。
- **归档会话仍然在 `ids` 里**：`sessionMemberIds()` 的注释明确"including archives"，过滤只发生在渲染层（`dsh-client-ui-workspace/lib/client.js:1127-1137`）。所以"所有会话"可以直接拿全量，再用 `archivedSessionIds` 做显示开关（默认建议全收，加"含归档"徽标/过滤）。

### 1.4 按 workspace 分组

- 主分组用 `ctx.workspaces.list.items` 的 `sessionIds`（有序）；
- 未挂到任何 workspace 的会话（或 workspace 里没有的）用 `cwd` 兜底分组；
- 排序用 `updatedAt` 倒序，组内按 `sessionIds` 原序 + 置顶（`pinnedSessionIds`）。

---

## 2. Q2：每会话产物获取成本

### 2.1 `remote.session.events` 的真实成本（关键发现）

调用链：

```
ctx.remote.session.events(request)
 → HistoryController.events            (APP/dsh-api-session-controller/lib/index.js:1789-1798)
 → usingObservation → sessionQuery.observeSession(sessionId, {projectionMode:'none'})
                                       (同文件 1924-1935)
 → SessionObservationReader.read       (APP/dsh-session-query/lib/index.js:351-398)
 → statSource + loadSource(完整 log)   (同文件 399-421)
 → Session.prepare(seed=全部事件)      (同文件 371-376)
 → history(observation, spec) 只切一页 (api-session-controller:1974-2000)
```

结论：

- **冷会话每调用一次就完整读一次 log 并重建 Session**；分页只省网络，不省 Host 的磁盘/解析。
- 只有 `preparedSessionCacheSize` 默认 **5** 的 LRU 能复用（`dsh-session-query/lib/index.js:1054`），所以"逐会话、多页"应一次会话翻完再换下一个，避免抖动。
- 活会话走内存（`this.ctx.sessions.get()` 命中），几乎零成本。
- v1 的 `maxMessages: 400` + `turnWindow` 只取一页；它的「加载更早」只是把**已取回**的轮次多渲染一些，不向前翻页（`hasMore` 未被消费）。对长会话，更早轮次的产物**根本不在结果里**。要"所有产物"就得循环向前翻页，而每翻一页都是上面那套完整读（第一页后能命中 LRU，但网络传输的是整段历史）。

### 2.2 更省的官方途径

| 途径 | 能给什么 | 成本 | 是否适合 v2b |
|---|---|---|---|
| `remote.session.list` 的 `summary` 投影 hints | 每会话已注册的 client-visible 投影值；冷会话 **零 I/O**（读投影缓存行） | 一次 list 调用 | ✅ 正是推荐方案的基础 |
| `turnOutline` 投影（`APP/dsh-session-turn-outline/lib/types/projection.js:75-135`） | 每轮 prompt/response 预览（不含文件）；`summary:false`，整值随轮数增长（约 600B/轮） | 已存在，无需新读 | ⚠️ 只能做"轮次预览"，不能给文件 |
| `workspaceChanges.summary` / deliverables 变更卡 | 单轮 changed-files 摘要 | 仅 live 会话、**纯内存**，Host 重启即失效（服务契约：Serves ... for live Sessions） | ❌ 不能做持久跨会话索引 |
| `sessionQuery.listEvents/listSessions` | 轻量事件记录（type/seq/time）、会话记录（header） | Host 内部调用；`listEvents` 仍读完整 log | ⚠️ Host 插件可用于回填，但不能直接给 Client（非 `@Remote`） |
| Host 一次性聚合（本方案 B） | 全量、完整历史、可持久 | 回填读一遍全部 log；之后零增量 | ✅ 推荐 |

### 2.3 量级估算（非实测，需 spike 校准）

- 单会话成本 ≈ `O(log 字节数)` 的磁盘读 + JSON 解析 + `Session.prepare` 校验；与 `maxMessages` 基本无关。
- 传输量 ≈ 该页覆盖的事件体积；`assistant/message` 同时带 `message.content` 与 `stream.text-chunks`（文本约两遍），`tool/result` 可能很大（文件内容、bash 输出）。
- 经验区间（需用 `sessionPersistence.list()` 的 `sizeBytes/eventCount` 实测校正）：普通编码会话 0.2–3 MB、重工具会话 5–20 MB。若 100 个会话、平均 1 MB ⇒ 回填一次性读 ~100 MB；纯 Client 方案则还要把这 ~100 MB（甚至更多，因为要翻全历史）经 HTTP 全传一遍，并按浏览器持久化。

**建议 spike**：Host half 里 10 行 `sessionPersistence.list()` 打日志（N、ΣsizeBytes、ΣeventCount、最大/中位），用它决定回填并发（建议 1–2）和每批上限。`sizeBytes` 来自 jsonl 后端的物理产物（`APP/dsh-session-persistence-jsonl/lib/index.js:2568-2590`）。

---

## 3. Q3：候选架构对比

| | A 纯 Client | B Host projection（推荐） | C 折中（最近 N + 按需） |
|---|---|---|---|
| 数据路径 | `useSessions` 拿列表 → 逐会话 `remote.session.events` 翻页 → 本地 `foldTurns` | Host 注册 `artifactIndex` projection 折全 log → `session.list` summary hints / control 推送 → Client 只读 | 同 A，但只预加载最近 N 个；其余点开再拉 |
| 完整性 | ❌ 受单页 400 条限制；翻全历史 = 全量传输 | ✅ 完整历史（全 log 折叠） | ❌ 未点开前不完整 |
| 每次刷新成本 | 每浏览器/每次失效都要重拉；新会话增量 | 稳态 0（live 会话随事件增量折叠 + 推送；冷会话读缓存行） | 打开面板要拉 N 个会话 |
| 首次成本 | 全部会话完整读 + 全历史 HTTP 传输 | 一次性 Host 本地读全部 log（可后台、可分批） | 最近 N 个的完整读（其余按需） |
| 存储 | IndexedDB（localStorage 5MB 不够）；每设备一份 | Host `session_projcache` 域（json per-record），跨客户端共享 | IndexedDB + 内存 |
| 改动面 | 只改 `client.js`（+150~250 行 IndexedDB 封装），无 Host 改动 | Host `index.js` ~400–550 行（projection + 回填 + config）；`client.js` +250–350 行（跨会话视图 + 适配） | 只改 `client.js` +200–300 行 |
| 依赖风险 | 无 | **Zod 形态 schema**（需 spike；不行用校验 shim/vendor） | 无 |
| 复杂度 | 中（分页循环、IndexedDB、失效） | 中高（投影折叠、回填、payload 控制） | 低中 |
| 失败模式 | 首次打开卡死/超时；缓存损坏；没有"全部" | 回填慢/中断；schema 版本升级要重建；summary 载荷膨胀 | 与 A 相同，只是延后暴露 |
| 工作量 | 2–3 人日 | 2.5–3.5 人日 | 1–1.5 人日 |

### 方案 B 的具体形态（推荐）

1. **Host half 注册一个投影单元** `{ key: 'artifactIndex', stateVersion: 1, summary: true }`：
   - `stateSchema/viewSchema` 需要 Zod 形态（见 §0 前置）；`wire.summary` 默认 true（`APP/dsh-session-projection/lib/index.js:120-129`，`summary` 判定在 126 行）。
   - `init(header, inheritedEventCount)` 记录 `cwd`、`inheritedEventCount`、`files: []`、`seen: {}`。
   - `apply` 只关心四类事件，其余**原引用返回**（`Object.is` 门控，registry 只在引用变化时推进）：
     - `deliverables/presented` → `files[].path/description`（source=`presented`）
     - `tool/call`（`write`/`edit`/`str_replace_editor`）→ 记录 callId→path
     - `tool/result` 成功 → 取 `meta.path`（绝对）或解析相对路径（用 init 里的 cwd），source=`produced`
     - `turn/end`（可选）→ 收尾/计数
   - 视图 = 紧凑条目数组：`{p: 路径, t: 轮次, s: 来源, q: seq, d?: 描述}`；按路径去重（保留首次轮次、最后一次时间），并复用 v1 的 `isExcludedPath()` 过滤（tmp/.git/node_modules/隐藏文件/.log）。
   - ⚠️ `summary: true` 意味着该视图进入**每次** `session.list`，且 live 会话每次视图变化都会经 control 流推给所有客户端（`drive()` 对所有有 `wire` 的单元生效，`APP/dsh-session-projection/lib/index.js:545-583`；`summary:false` 只是不进列表，**不阻止推送**）。所以条目要紧凑，建议 `maxEntriesPerSession` 配置项（默认 300–500）+ `total` 计数。
2. **回填 worker（插件激活时）**：
   - `sessionPersistence.list()` 取全部快照（含 `header/inheritedEventCount/sizeBytes`），先量总量；
   - 跳过 `formatStatus === 'migration-required'`；跳过 live 会话（registry 已在折叠）；
   - 对每个冷会话：`sessionQuery.observeSession(id, { projectionMode: 'none' })` 拿到 `{header, inheritedEventCount, events}`（一次性完整读，内部有 prepared LRU），再 `sessionProjectionCache.coldSnapshot(header, inheritedEventCount, events)`（`APP/dsh-session-projection-cache/lib/index.js:285-300`，内部 `restore` + 异步写回，fail-soft），最后 `observation[Symbol.dispose]()`；
   - 用 `cachedSnapshot(header,['artifactIndex'])` 判断是否已有可用行，已有则跳过（重装/重启后自动续跑）；
   - 并发 1–2，每会话之间 `await` 让出；分批写日志（进度 k/N）；失败按会话隔离，下次激活重试。
3. **Client**：`useSessions` 行里的 `projectionValues.artifactIndex` 直接渲染；打开面板时 `ctx.sessions.refresh()` 一次，把回填新写的行拉进来；live 会话靠 control 推送自动更新。

### 为什么首版不推荐 B2（自建 `@Remote` 服务）

自建 Remote 需要 `TypertRemoteService` + `@Remote` + `namespace`（`APP/dsh-api-session-controller/lib/index.js:3791`、包内 import 自 `@deepseek-ai/dsh-typert-protocol`），在"本地目录链接安装"的插件里会多一层内部包解析风险；而 `session.list` 的 summary hints 已经能零 I/O 提供同样的数据，完全没有必要。等 B 的载荷真的成为问题时，再升级为"summary 视图 + 独立 Remote 读全量"。

---

## 4. Q4：存储与清理

### 4.1 索引缓存放哪

- **Host `session_projcache` 域**（推荐）：`sessionProjectionCache` 打开 `session_projcache` 域，`per-record` JSON，键为会话生命周期；行是 `(sessionId, key, ver, seq, val)`（`APP/dsh-session-projection-cache/lib/index.js:91-101`、`150-154`、`267-270`）。写回时机：live 会话创建/`turn/end`/dispose 的强制点 + 节流写后；冷会话由我们的回填 `coldSnapshot` 写回。**durable，Host 重启不丢**。
- **Client 不落盘**：索引来自 `useSessions` 快照，内存里每会话几 KB；当前 localStorage 只存收藏/隐藏（`client.js` 的 `storageKey/readPrefs`），不要塞索引（5MB 配额、写放大、跨设备不一致）。
- 若未来走纯 Client：必须用 IndexedDB（localStorage 不够），按 `sessionId + updatedAt` 做失效键。

### 4.2 归档/删除清理

- Session 没有删除语义：`sessionPersistence` 只有 create/open/flush/stat/list，没有 delete；`workspaceController.delete` 的契约明确"Delete a Workspace registration without deleting Sessions or files"；归档只是 Workspace 域里的集合。所以**索引行天然与会话共存亡**，归档不需要清理。
- 插件卸载：`sessionProjections` 释放注册后，持久缓存行**保留**（registry 文档："checkpoints keep each Session's last cell of it until the key registers again"），每会话只占几 KB；同 `stateVersion` 重装可直接复用，不重新回填。
- 真要失效重建：改代码里的 `stateVersion`（旧 `ver` 行会被丢弃并重新折叠；注意同一 key 若旧单元仍注册着不同版本会抛错，`APP/dsh-session-projection/lib/index.js:143-145`）。没有公开的"按行删除"API，不要直接动 domain。
- 文档里要写明：卸载后残留 ≈ 会话数 × 几 KB，属预期。

---

## 5. Q5：子代理会话

- **区分字段**：`origin === 'subagent'` + `parentId`（来自 Host `SessionSummary.parentSessionId`，`APP/dsh-api-session-controller/lib/typert.host.js:3820-3821`）；父子相邻排序由 `flattenLineage()` 保证（`APP/dsh-api-session-controller/lib/types/client/sessions/lineage.js:11-55`），但 **`depth` 不会出现在 `byId` 行里**（`projectList` 投影时被丢弃，service.js:499-514）——面板要自己按 `parentId` 建树/算深度。
- 建议 UI：父会话分组内折叠显示"N 个子代理会话"；默认不把子代理条目混进父会话主列表，开关"包含子代理"后展开；子代理分组标 `origin` 徽标。
- **fork 重复问题**：投影 `buildCell` 会从 `init` 起折叠**全部事件（含继承前缀）**（`APP/dsh-session-projection/lib/index.js:505-513`），所以分叉/子代理的索引会包含继承来的产物。建议在 fold 里记录 `inheritedEventCount`，视图对 `origin==='subagent'` 的会话只保留 `seq >= inheritedEventCount` 的条目（子代理自身增量），父会话保持全量，避免同一文件在父子两边重复计数。
- 归档 + 子代理可叠加：分组顺序建议 根会话（按 updatedAt）→ 子会话（挂在父下）→ 归档过滤。

---

## 6. Q6：风险清单 Top5

1. **首启回填成本**：N 个冷会话 × 完整 log 读 + 解析；大库（>200 会话 / 平均数 MB）可能几十秒到几分钟。缓解：先 `sessionPersistence.list()` 量总量；并发 1–2；分批 + 进度日志；按 `sizeBytes` 从小到大先出结果；失败隔离、下次续跑；`migration-required` 跳过并标注。
2. **Host schema 依赖**：`sessionProjections.register` 需要 Zod 形态的 `stateSchema/viewSchema`（`dsh-session-projection/lib/index.js:120-129`）；链接安装的插件没有依赖解析通道。缓解：spike 先试 `import('zod')`；失败则加一个只实现 `parse`/`safeParse` 的 40 行校验器（对缓存行做真实形状校验），或 vendor zod 子集。这是 Go/No-Go 门槛。
3. **summary 载荷膨胀**：`summary: true` 的视图进每次 `session.list`，且 live 变化会全量推给所有客户端。缓解：条目短键 + 每会话上限（默认 300–500，超出记 `total`）+ 描述截断；上线前用 `session.list` 响应大小实测；超阈值就切到 B2（summary 只放计数，全量走独立 Remote/路由）。
4. **刷新时机**：live 会话靠 control 推送；冷会话的新索引只在回填写回后、下一次 `session.list` 才可见（面板打开时 `ctx.sessions.refresh()`）；没有全局"索引已更新"事件。另外 Host 重启不影响本方案（投影缓存 durable），但**会影响** `workspaceChanges` 那类内存摘要——不要拿它当索引来源。
5. **隐私 / 跨 workspace**：索引会把所有 workspace 的绝对路径集中展示；`session.list` 本身按 `remoteAccess.allows` 逐会话过滤（`api-session-controller/lib/index.js:3891-3893`），不会越权，但 UI 上建议路径做 home 缩写、标 workspace 徽标、不提供批量外发；`/tmp`、`.git`、隐藏文件、`.log` 继续沿用 v1 的 `isExcludedPath()` 过滤。

补充：无 `cwd` 的冷会话不进 `session.list`（`api-session-controller/lib/index.js:2763`）；插件升级改 `stateVersion` 会触发全量重建；`client.js` 正被并行修改，落地时以函数名为锚做合并。

---

## 7. 实施拆解（v2b）

| 步骤 | 产出 | 验收 |
|---|---|---|
| **v2b-0 spike**（0.5 人日） | ① Host half 能否拿到 Zod 形态 schema 的结论（试 `import('zod')`，备选手写校验器/vendor）；② `sessionPersistence.list()` 统计脚本/日志（N、总 sizeBytes、eventCount 分布）；③ 最小投影注册 + 在 `session.list` 里看到 hints 的验证 | 日志/结论贴进本文件；能注册并读到 `artifactIndex` 值；给出回填并发/上限建议 |
| **v2b-1 Host 索引**（1–1.5 人日） | `plugins/dsh-artifacts-panel/index.js`：投影单元（fold 四类事件、去重、过滤、`inheritedEventCount` 记录）、`Config`（maxEntries、回填并发/开关）、回填 worker（`sessionPersistence.list` 盘点 → `sessionQuery.observeSession(projectionMode:'none')` → `coldSnapshot` → 进度）、locale/meta | 重启 Host 后冷会话目录里出现 `artifactIndex` 行（`session.list` hints 可读）；100 会话量级下回填可中断可续跑；无未捕获异常 |
| **v2b-2 Client 跨会话视图**（1 人日） | `client.js`：分组（workspace → 会话 → 轮次/文件）、搜索/类型过滤、展开懒渲染、含归档/含子代理开关、`ctx.sessions.refresh()` 接入；复用 `fileAddress()` 打开右栏预览（按产物所属 sessionId） | 所有会话可见；归档/子代理开关生效；大列表首屏 <200ms（虚拟化/折叠）；点击跨会话文件能打开 |
| **v2b-3 收尾**（0.5 人日） | 进度/空态/错误态、设置页项、文档（残留行、重建方式、上限说明）、安装与回滚 | 设置页可调；卸载后无残留副作用；文档齐 |

---

## 8. 未决/需实测

- `import('zod')` 在 Host half 是否可解析（决定 v2b-0 走哪条路）。
- 每会话条目的实际上限与 `session.list` 响应大小（需要真实会话数据实测）。
- 跨会话点击文件时，右栏 `dsh-resource://file/session/<id>/<path>` 对非当前会话是否完全授权（v1 只验证过当前会话；host `remoteAccess` 已按会话允许，但需点一遍）。
- 是否默认展示归档会话（建议默认展示 + 过滤开关）。
- 子代理默认折叠深度（建议 1 层，父 → 子）。

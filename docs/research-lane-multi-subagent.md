# 产物面板 × 多 subagent：任务 / 子代理分组调研

| 项目 | 内容 |
|---|---|
| 状态 | 调研结论（2026-11-12） |
| 调研对象 | 运行版 DSH `0.2.2-rc.1`（`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` 内 `dsh/`）+ 本地 checkout `0.1.6-alpha.2`（`~/Documents/DSH/node_modules/@deepseek-ai/**`） |
| 关联设计 | `docs/dsh-artifacts-panel-设计.md`（v1 按轮次） |
| 目标 | 面板增加「会话 > 任务/子代理 > 轮次 > 产物」分组维度 |

> **版本基线警告（先说最要紧的一条）**：运行版是 **0.2.2-rc.1**，本地 checkout 是 **0.1.6-alpha.2**，两者 API 有实质差异。当前插件调用的 `ctx.remote.session.events` 在 0.1.6 里**根本不存在**（只有 `session.page/follow`），在 0.2.2 里存在。引用行号前务必确认版本；本文以运行版为准，checkout 只作结构对照。

---

## 1. 结论

| 问题 | 结论 |
|---|---|
| 按任务分组可不可行 | **可行**。任务板是 Lead 会话日志里的持久事件（`team/task`），面板已经拉的 `session/events` 里就有，零新增 RPC |
| 按子代理分组可不可行 | **可行**。父会话日志里有 `subagent/catalog`（childId+label+mode），工作流有 `tool-workflow/agent-start`（childId+phase），团队有 `team/member`（id+name） |
| 推荐方案 | **方案 A+（父会话建索引 + 按组懒加载子会话产物 + 可下钻）**：分组骨架全部由父会话事件流推导；子会话产物按需拉，展开才拉、带 TTL 缓存 |
| 不推荐 | 首屏把所有子会话产物全拉（N 个 child = N 次 RPC，且无批接口）；也不推荐只做「按子代理」不做「按任务」（任务板已有 owner/writeScopes，是更贴近老板心智的维度） |

---

## 2. 子代理会话怎么识别（字段级）

### 2.1 客户端会话列表（首选，零 RPC）

`ctx.sessions.list.getSnapshot()`（运行版 `dsh-api-session-controller/lib/client.js` 的 list 快照构造）返回：

```ts
{
  items: SessionListEntry[],      // 已按谱系拍平，带 depth（父 0，子递增）
  state, phase, error,
  projectionsBySession: Record<SessionId, { values, state, error }>,
}
byId: Record<SessionId, {      // 面板现用 cwdOf() 读的就是这里
  id, displayTitle, title?, cwd?, parentId?, origin?,
  running, retainedBy, blank, updatedAt, formatStatus?,
  projectionValues?            // ← 分组所需的全部信息在这
}>
```

| 区分目标 | 判定字段 | 说明 |
|---|---|---|
| subagent（工具派发 / 团队 teammate / 工作流成员） | `byId[id].origin === 'subagent'`（Host 侧 `SessionSummary.origin` 只有这一个枚值） | 0.1.6 里同名字段：`dsh-api-session-controller/lib/types/types.d.ts:145-152`（`SessionSummary`：`sessionId/updatedAt/running/blank/parentSessionId?/origin?:'subagent'/cwd?/projections?`），`list.js:287-293` 的 `listFields()` 决定这三个字段上线 |
| fork（会话分叉） | `byId[id].parentId` 存在 **且** `origin` 不是 `'subagent'` | fork 在 Host 侧写 `meta.parentSession` 但**不写** `origin`（0.1.6 `dsh-api-session-controller/lib/index.js:700-706`；`isSeeded:true` 不上线，故只能靠 origin 区分） |
| 团队 teammate | `origin==='subagent'` + `projectionValues.agentTeam.members[]` 里有同名/同 id 成员（team 只存在于 Lead 日志） | 团队用 continuable subagent 实现，没有独立 origin |
| 子代理名字（label） | `byId[id].projectionValues.subagent.label`（`{mode:'one-shot'|'continuable', label?, seq}`），或父的 `projectionValues.subagentCatalog[]` | 运行版 list 结果 schema 已含 `projections.values.subagent`、`subagentCatalog`、`tokenUsage`、`subagentTiming`、`title`、`inbox` |
| 子代理是否活的 | `byId[id].running` + `projectionValues.subagentTiming`（轮次耗时） | 团队另有 `phase: provisioning/active/failed`（见 §3） |

注意：`ctx.sessions.list` 里 **没有** `subagentsByParent`（0.1.6 有，运行版没有；0.2.2 全库 grep 为零）。子代理目录改从两个地方取：列表行的 `projectionValues.subagentCatalog`，或父会话事件里的 `subagent/catalog`。

**插件在 slot 组件里可直接用的 React 钩子**（运行版 `dsh-client-ui-subagent/lib/client.js` 的实际用法，官方 subagent 目录就是这么读的）：

```js
// 注意：面板是普通 client.js（h/React），这些钩子由 slot 框架注入到组件 props
useSessions(function (state) { return state.byId })              // {byId, items, projectionsBySession}
useSessions(function (state) {
  return Object.fromEntries(Object.entries(state.projectionsBySession).map(function (entry) {
    return [entry[0], entry[1].values.subagentCatalog]   // [{id, label?, mode, createdAt}]
  }))
})
useSession(function (session) { return session.subagent?.address })  // {parentSessionId, childSessionId, mode}
useProjection('agentTeam') / useProjection('goal')                   // 投影值，随帧更新
useSessionStatus(function (value) { return value })
```

这些比 `ctx.sessions.list.getSnapshot()` 轮询更好：**订阅式、零 RPC、与列表同源**。建议面板改成「钩子驱动 UI + `session/events` 只负责产物明细」。

### 2.2 父会话日志里的子会话事实（最可靠，随现有事件流免费拿到）

| 事件 | 载荷 | 用途 |
|---|---|---|
| `subagent/catalog` | `{version, childId, childCreatedAt, mode:'one-shot'|'continuable'|'external'|'unknown', label?}` | 父会话自己记录「我有哪些子会话」，无需查全局列表 |
| `subagent/descriptor` | `{version, mode, provider, label, ...}`（写在**子**会话首个轮次内） | 子会话身份/可续性；冷读子会话时用它确认 mode 与 label |
| `tool-workflow/agent-start` | `{runId, seq, label, phase?, childId}` | 工作流成员 = 子会话，且带 phase |
| `team/member` | `{version:2, teamId, member:{id, name, description, provider, context, phase, error?}}` | teammate 的 `member.id` **就是子会话 id** |
| `team/task` | `{version:2, teamId, task:{id, revision, subject, description, status, ownerId?, blockedBy, writeScopes}}` | `task.ownerId` 指向 teammate 的子会话 id → 任务↔子代理↔产物的桥 |

### 2.3 子会话产物怎么归到父会话/父轮次

1. **归父会话**：天然成立——子会话事件里所有 `write`/`edit`/`deliverables/presented` 都属于该 childId。
2. **归父轮次（近似）**：子会话事件里**没有**父轮次号。可行做法：用 `subagent/catalog`（或 `tool-workflow/agent-start`、`tool/call` of `subagent`）在**父**日志里的 `seq`，落到父会话「包含该 seq 的 `turn/start..turn/end` 区间」→ 得到 `parentTurn`。这是**创建时刻**归属，子会话跨多轮活的（continuable teammate）后续产物只能归到「最近一次被 `send_message`/`steer` 触发的父轮次」，需要额外解析父会话里 `tool/call name==='send_message'` 的参数。
3. **归任务**：`team/task.ownerId → team/member.id(childId)` 精确匹配；Lead 自己做的任务没有 ownerId，只能用 `writeScopes` 前缀匹配产物路径（提示性，不是锁）。
4. **归工作流阶段**：`tool-workflow/agent-start` 的 `{runId, phase, childId}` → 该 child 的产物统一挂到 `runId/phase` 下。

### 2.4 取子会话事件的调用

```js
// 面板现有写法（父会话）
ctx.remote.session.events({ address: { kind: 'session', sessionId }, maxMessages: 400 }, signal)

// 子会话（运行版 address 联合类型支持 subagent；mode 也可传 'unknown'）
ctx.remote.session.events({
  address: { kind: 'subagent', parentSessionId, childSessionId, mode: 'one-shot' | 'continuable' | 'unknown' },
  maxMessages: 60,
}, signal)
```

- `session/events` 的描述是「Read one cold-safe, message-aligned Session history page」，参数只有 `address / throughSeq? / beforeSeq? / maxMessages?`——**没有 `turnWindow`**（插件现在传的这个字段被静默忽略，可以删）。
- 冷子会话可读，不会激活 Agent（历史页属于 non-activating 路径）。
- 返回 `{records, hasMore}`（运行版无 `page.cursor`，插件里读 `cursor` 是空值，无影响）。

---

## 3. 任务板数据源清单

| 来源 | 可得字段 | 成本 | 适用 |
|---|---|---|---|
| **A. 会话事件 `team/task` + `team/member`**（推荐） | 完整：`id/revision/subject/description/status/ownerId/blockedBy/writeScopes` + member `id/name/phase` | 0（面板已拉父会话事件） | 按任务分组的主数据源；历史 revision 也在日志里，可回放任务状态变化时间线 |
| **B. 会话投影 `agentTeam`**（`stateVersion: 4`，wire 有客户端视图） | `{members:[{id,name,role,phase}], tasks:[{id,revision,subject,description,status,blockedBy,writeScopes,ownerName?,ready,writeScopeWarnings}], failure?}` | 0（`ctx.sessions.binding(sid).session.projections.get('agentTeam')`，或 `faceOf('agentTeam')` 订阅） | 实时刷新更省事；**注意客户端视图丢了 `ownerId`，只有 `ownerName`**，且 `deleted` 任务被过滤 |
| **C. Remote `ctx.remote.agentTeams.view(leadSessionId)`** | `TeamView {members: TeamMemberView[], tasks: TeamTaskView[]}`，比 B 多 `model/context/description/diagnostics`、`status:'running'|'idle'|'inactive'|'provisioning'|'failed'` | 1 次 RPC / 次刷新 | 需要 teammate 运行状态与模型信息时；`leadSessionId` 用 `binding(sid).session.getSnapshot().subagent.address.parentSessionId ?? sid` 求（官方 client-ui-agent-team 就是这么算的） |

结论：**A 做骨架与历史，B 做实时补丁，C 可选增强**。A 不依赖 team UI 包是否挂载，最稳。

任务板在前端**已有**现成 UI：`@deepseek-ai/dsh-experimental-client-ui-agent-team` 在 `conversation.session.header.actions`（id `agent-team`, order 20）挂 Team panel，能看 roster + 任务板（identity/owner/blocker/readiness/write scope/重叠 warning），也能 create/update 任务。产物面板不要重做 CRUD，只读它的数据源。

---

## 4. workflow 运行数据

`workflow-run` 聊天节点（`@deepseek-ai/dsh-client-ui-workflow-run`）是**纯事件回放**，运行版事件名与载荷：

| 事件 | 载荷 |
|---|---|
| `tool-workflow/run-start` | `{runId, name}` |
| `tool-workflow/agent-start` | `{runId, seq, label, phase?, childId}` |
| `tool-workflow/agent-end` | `{runId, seq, outcome}` |
| `tool-workflow/run-end` | `{runId, stopReason}` |

- 运行/阶段/成员三级可还原：`runId` → `phase`（阶段分组只来自「已开始过的成员」）→ `seq` 成员。
- 成员就是子会话（`childId`），产物按 `childId` 归到「运行/阶段」下完全可行。
- 节点本身**只显示身份与状态**：脚本、输出、错误、日志、用量、拓扑、控制都不在节点里——所以「workflow 各子任务产物」**只能由产物面板从子会话事件里取**，节点拿不到。
- 运行版新增：`workflow/phase|log|agent-start|agent-end` 会镜像到后台 job 的 log ring（`dsh-tool-workflow/lib/types/record.js`），因此后台运行还多一份 `job` 维度（事件 `job/registered` / `job/settled`）。

---

## 5. goal / 计划能不能当分组维度

| 维度 | 数据 | 判定 |
|---|---|---|
| goal | 事件 `goal/change`（完整 `GoalSnapshot` 或 clear tombstone）；投影 `goal`（`GoalView{id,revision,objective,phase,maxGoalRounds,roundsStarted,createdAt,updatedAt,activation}`，用 `useProjection('goal')` 或 `projections.get('goal')`） | **只能做「会话内时间分段」**：goal 是 session 级状态，一个会话可以有多个 goal（create→clear→create）。用 `goal/change` 的 `seq` 把轮次切成「无 goal / goal#1 / goal#2」段，产物挂到段上。**不能**做到「每个产物属于哪个 goal」的精确归属（除时间窗外无关联） |
| 计划/待办 | `todo/write`（每次整表覆盖）、`plan/mode` | 同理只有快照没有产物引用，最多做「该轮有哪些 todo 项」的旁注，不建议当分组主轴 |

结论：goal 可作为**会话头部的上下文条（显示 objective/phase）**，或作为「按目标分段」的次级分组；不建议作为一级导航维度。计划/待办不要进产物面板。

---

## 6. 设计方案（3 选 1 + 推荐）

### 方案 A（推荐）：父会话建索引 + 按组懒加载 + 下钻

```
┌ 产物面板（当前会话 scope） ─────────────────────────────┐
│ 分组维度: [自动] [按任务] [按子代理] [按运行] [按轮次]   │  ← segmented control
│ 过滤/搜索/收藏（沿用现有）                              │
├──────────────────────────────────────────────────────┤
│ ▾ 任务 T3 校验面板（in_progress，owner: verifier）  12  │  ← 组头：任务 subject/status/owner/writeScopes
│    ▾ verifier（子会话，running）                     8  │  ← 子组：子代理 label/状态
│        · 第 2 轮最终回复                              │
│        · docs/verify-report.md                        │
│    ▾ lead（本会话，未分配）                           4  │
│        · build/panel.png                              │
│ ▸ 任务 T4 打包（pending，owner: -）                   0  │  ← 折叠，未加载 → 不拉 RPC
│ ▸ 未归属（无任务，子代理 3 个）                       —  │
└──────────────────────────────────────────────────────┘
```

数据流：

1. 一次 `session/events`（父）→ 同时喂三个 fold：`turns`（现有 `foldTurns`）、`teamBoard`（`team/task`+`team/member` 按 id 覆盖，取最新 revision）、`runs`（`tool-workflow/*`）、`children`（`subagent/catalog` + `agent-start.childId` + `team/member.id`）。
2. 组头徽标 = 子会话数 + 已知父会话产物数；子会话产物数未知时显示 `—`（不预取）。
3. 展开某组 → 对该组 childIds 逐个 `session.events({kind:'subagent', ..., maxMessages:60})`，限流 2 并发，结果进 LRU（键 `childId+updatedAt`，TTL 15s）。
4. 归属：`ownerId/ownerName → member.id` 精确；Lead 自身产物按 `writeScopes` 前缀匹配；都不中 → `未归属`。
5. 刷新：父会话保持 5s 轮询（现有 `POLL_INTERVAL`）；子会话只在「展开中 + `running`」时随父轮询刷新，其余按 TTL 失效。

UI 层级落地：`ArtifactsView` 增加 `groupBy` 状态（默认 `auto`：有 team 任务→任务；否则有 workflow run→运行；否则→轮次），组头复用现有轮次头样式加 `status/owner` 徽标。右栏紧凑模式只显示「组 + 计数」，点击下钻。

### 方案 B：子会话清单 + 单 scope 切换（最省）

面板顶部加一个「会话选择器」：`本会话 / teammate×N / 工作流运行×M`，切换后整个面板变成那个子会话的产物（复用现有 `foldTurns`，只是 `address` 换成 subagent）。零聚合逻辑、零归属推断，实现最小；缺点是**看不到「一次任务跨 Lead+teammate 的合并视图」**，老板要的「按任务分类」会退化成「按会话分类」。

### 方案 C：全量预取 + 一份全局树

首屏拉所有子会话（`subagent/catalog` 全展开 + 每 child 一页），在内存合成「任务 → 子代理 → 轮次 → 产物」完整树。体验最好、无展开等待；成本 = 1 + N 次 RPC、N×maxMessages 条事件解析，团队 8 人 × 100 条 ≈ 800 条事件，尚可，但 50 个 one-shot 子代理会明显卡首屏，且没有批量接口。

### 推荐：A 为主，C 降级为「开启即预取」的开关

理由：分组骨架（任务/阶段/子代理）**全部来自父会话已有的那一份事件流**，边际成本近零；产物正文按需拉，最坏情况与 C 相同、平均远低于 C；B 作为 A 的「下钻终点」自然包含（点组头进入单 scope）。

---

## 7. 性能与限制

| # | 限制 | 量化 / 对策 |
|---|---|---|
| 1 | **跨会话无批量接口** | 每个子会话一次 `session/events`；无 `children/events` 批接口。对策：懒加载 + 2 并发 + LRU(TTL 15s) + 单 child `maxMessages` 上限 60~100 |
| 2 | **历史页按消息数对齐，不按轮次** | 只有 `maxMessages/beforeSeq/throughSeq`；`turnWindow` 不存在（现插件传了但无效）。长会话可能截断早期轮次 → 面板需保留 `hasMore` 并显式提供「加载更早」 |
| 3 | **任务↔产物归属是启发式** | Lead 自己执行的任务没有 `ownerId`，只能按 `writeScopes` 前缀匹配；write scope 是**提示性**元数据，Bash/生成器会绕过 → 必须有「未归属」组兜底，并在 UI 标注「按写入范围推测」 |
| 4 | **客户端团队投影丢 `ownerId`，删任务不保留** | `agentTeam` 视图只给 `ownerName`（要 `members` 名字反查 id），`status==='deleted'` 被过滤。需要精确 owner 时回落到日志里的 `team/task`（有 `ownerId`） |
| 5 | **子会话事件里没有父轮次号** | 只能按「创建 seq → 父轮次区间」近似；continuable teammate 的后续轮次需解析父会话 `send_message`/`steer` 的 tool call 才能对齐。KPI：归属正确率≈「一任务一子代理」场景 100%，多任务复用同一 teammate 时下降 |
| 6 | **数据源可用性不一致** | `ctx.remote.agentTeams` 需要 client-ui-agent-team 挂载才可解析；`team/*` 事件、`tool-workflow/*` 事件只在用过对应工具时存在。分组维度必须「按数据自动降级」（有任务才显示「按任务」） |
| 7 | **插件当前 API 与运行版有漂移** | 现插件用 `session.events`（0.1.6 无、0.2.2 有）与 `page.cursor`（0.2.2 无）。加分组前应先对齐一次运行版 smoke test |

---

## 8. 实施拆解（5 步）

1. **数据层拆分**：把 `foldTurns(records)` 拆成纯函数 `foldSession(records)` → `{turns, team:{members,tasks}, runs[], children[]}`；四个索引各自单测（用一条含 `team/task`/`agent-start`/`subagent/catalog` 的事件数组当 fixture）。
2. **分组器**：`buildGroups(fold, groupBy)` 输出 `Group[] {key, kind, title, status, meta, items, childIds[]}`；`auto` 选择顺序 任务 → 运行 → 轮次；未命中路径/owner 的产物进「未归属」。
3. **子会话加载器**：`loadChild(parentId, childId, mode)` 调 `session.events({kind:'subagent'})`，带并发闸门、LRU、AbortSignal；组展开/折叠触发；失败单组降级不阻塞。
4. **UI**：`ArtifactsView` 加维度切换 + 组头（subject/status/owner/writeScopes 徽标）+ 子组（子代理 label/状态）+ 下钻到单 scope；右栏紧凑模式只渲染组与计数。下钻/跳转用 `ctx.uiWorkspace.openSession({ parentSessionId, childSessionId, mode })`（运行版 `dsh-client-ui-workspace/lib/client.js` 有 `openSession(target)`，官方 agent-team 面板就是这么跳 teammate 的）。审计现有收藏/隐藏/导出键（`path`）在跨组时是否会重复——建议 `id` 加 `groupId` 前缀。
5. **验收**：造 3 个场景 fixture/真会话——(a) 无 team 无 workflow（应等价今天的按轮次）；(b) 1 个 teammate + 2 任务（任务分组、owner 归属、未归属兜底）；(c) 1 次 workflow 3 阶段 5 成员（运行/阶段分组、成员下钻）。逐项比对渲染结果 + `console` 无错。

---

## 9. 未确认 / 待验证

- `session/events` 对 `mode:'unknown'` 的子会话地址是否真的被 Host 接受（schema 允许，但未见调用样板）——建议先用一个 workflow 成员 childId 实测。
- 客户端 `ctx.sessions.list` 快照里 `items` 是否包含**非当前工作区**的子会话（可能被 workspace 过滤）——影响「跨工作区子代理产物」是否可见。
- `agentTeam` 投影是否在**非 Lead** 会话上也存在（子会话读自己的 team 状态）——按设计只存在 Lead 日志。

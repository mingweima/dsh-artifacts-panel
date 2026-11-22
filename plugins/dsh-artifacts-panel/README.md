# 产物面板 · 跨会话索引（v2b）

本目录是 DSH 插件 `dsh-artifacts-panel`。v1 提供「本会话」产物页签、右侧栏 tab 与设置页；v2b 增加 **跨会话产物索引**，在产物页签顶部切换「本会话 | 全部会话」。

运行要求：DSH `>=0.2.2-rc.2 <0.3.0`（实测 `0.2.2-rc.2`），依赖 `@deepseek-ai/schemastery` `^3.19.0`。

## 0. 安装后对 agent 的影响（提示词透明）

- **提示词**：安装后 Host 会通过 `systemPrompt` 服务给每个会话增加一段约 80 字的「产物引导」，内容是提示 agent 用 `present` 显式交付（路径 + 说明），不会改变其他行为。不需要时在插件配置里设 `promptGuidance: false`（需重启 DSH）；宿主没有 `systemPrompt` 服务时该段自动跳过，插件照常加载。
- **跨会话索引**：只保存引用（会话 id、文件路径、轮次、来源、类型，可选 size/sha），不保存回复正文、描述或文件内容。不需要时设 `crossSessionIndex: false`（Host 不写索引，「本会话」视图不受影响）。
- **索引位置**：`$DSH_HOME/artifacts-panel/index/`（`DSH_HOME` 缺失时回退到系统临时目录 `dsh-artifacts-panel/index/`），**不再写进插件安装目录**；升级/重装不会丢索引。
- **读取方式**：Client 通过 Host 注册的同源只读 HTTP 路由 `/artifacts-panel/index.json` 与 `/artifacts-panel/sessions/<sid>.json` 读取；浏览器不需要知道任何绝对路径。宿主没有 HTTP 路由时，可在设置页手填「索引目录」走旧的文件读取降级。

## 1. 数据边界（云人硬约束）

- **只读 DSH 会话**：Host 通过 `sessionPersistence` 服务列出并读取 DSH 自己的会话日志；不读取、不索引 Cursor / Grok agent 的任何数据。
- **只存引用**：每条记录只有 `路径`、`轮次`、`来源（presented/produced）`、`类型（doc/image/file）`，可选 `size` / `sha`。不保存回复正文、描述、文件内容或会话标题。
- **私有位置**：索引写在 DSH profile 的数据目录 `$DSH_HOME/artifacts-panel/index/`（`DSH_HOME` 缺失时回退到系统临时目录），不再写进插件安装目录；旧版插件目录下的 `.index/` 只做一次性复制迁移，不删除。插件代码不直接打开 `~/.dsh` 下的其他文件；会话日志只经 `sessionPersistence` / `sessionQuery` 服务读取。
- **跳过噪音**：临时目录、隐藏文件、`node_modules`、`.git`、`*.log`、`~/.dsh` 与 `.index` 自身都不会进入索引。

## 2. 索引格式

```
$DSH_HOME/artifacts-panel/index/
  index.json                 # 清单：每个会话一行元数据（不含正文）
  sessions/<sessionId>.json  # 该会话的引用行
```

`index.json`：

```json
{
  "v": 1,
  "mode": "persistent",
  "generatedAt": 1763000000000,
  "totals": { "sessions": 12, "files": 87, "turns": 64 },
  "backfill": { "running": false, "done": 12, "total": 12, "finishedAt": 1763000000000 },
  "sessions": {
    "<sid>": { "t": 5, "u": 1762999999000, "c": 9, "n": 120, "a": 1762900000000, "upd": 1763000000000, "w": "/workspace/example-project", "p": "<parent-sid>" }
  }
}
```

- `t` 轮数、`u` 最后活动时间、`c` 引用条数、`n` 已折叠事件数（断点续跑用）、`a` 创建时间、`upd` 索引写入时间、`w` 会话工作目录、`p` 父会话（子代理）。
- `sessions/<sid>.json`：`{ "v": 1, "sid": "...", "rows": [["/abs/path.md", 3, "presented", "doc", 1234]] }`，第 5 位 `size`、第 6 位 `sha` 可选。

## 3. 运行方式

- Host 启动后延迟约 2.5 秒开始回填：`sessionPersistence.list()` 按 `sizeBytes` 升序（并发 2，每 20 个让出事件循环），失败会话隔离；之后按 `index.json` 的 `n` 只补新事件。
- 索引目录默认取 `process.env.DSH_HOME` 下的 `artifacts-panel/index`；环境变量缺失时回退到 `os.tmpdir()` 下的 `dsh-artifacts-panel/index`，并在 Host 日志里说明。
- 迁移：启动时若旧插件目录 `.index/` 存在、新目录还没有 `index.json`，把旧索引 **复制** 到新目录（含 `sessions/*.json`），旧目录保留不删；只执行一次。
- 读取：Host 通过 `webServer` 注册前缀路由 `/artifacts-panel`，经 `connection.requestRejection()` 做与 DSH `/api` 相同的浏览器鉴权后，提供 `GET /artifacts-panel/index.json`、`GET /artifacts-panel/sessions/<sid>.json` 和 `POST /artifacts-panel/rebuild`；响应带 `cache-control: no-store` 与 ETag。
- 实时增量：注册 host-only projection `artifactIndex`（不设 wire、不进会话摘要），`session/event` 只在 `turn/end` 与 `session/disposed` 时标脏；写入 2 秒节流、temp→rename 原子替换。
- 容量：最多 300 个会话（按 `u` 裁旧）、每会话 300 行、`index.json` ≤ 512KB、单会话文件 ≤ 256KB；超限先裁旧会话再裁行。
- 超过 32MB 的会话日志在回填时跳过（避免一次性占用过多内存），日志里会记一条。

### 降级

- 索引目录不可写 → 内存模式，`mode` 记为 `projection`；UI 显示「持久化降级」，**回填仍会在内存中执行**，HTTP 路由直接服务内存索引（不因不可写而停摆）。
- `sessionProjections` 不可用 → 只靠 `session/event` 折叠（非投影增量）。
- HTTP 路由或 `connection` 不可用 → Client 显示「跨会话索引服务不可用」；可在设置页填绝对「索引目录」走 `remote.workspaceFiles` 读取。
- 索引不存在 / 不可读 → 「全部会话」显示「索引准备中」，不影响「本会话」。
- 索引损坏 / 版本不符 → 改名为 `index.json.bad.<ts>`，下次启动重建；会话文件同理。
- 设置页「重建索引」→ `POST /artifacts-panel/rebuild`，丢弃当前索引并重新扫描（内存模式同样可用）。

## 4. 设置

产物页签的「设置 → 产物面板 → 跨会话索引」：

- 「启用『全部会话』视图」是浏览器侧开关（`localStorage`），只控制 UI；
- Host 侧是否写索引由插件配置 `crossSessionIndex`（默认 `true`）控制；
- 「索引目录（可选）」留空 = 走 Host 同源 HTTP 路由；填绝对路径则直接读该目录（仅宿主没有路由时的降级）；
- 「重建索引」按钮触发 Host 重新扫描；
- 面板显示容量上限与最近回填时间（来自 `localStorage` 里缓存的索引摘要）；
- 设置页同时说明提示词：安装会为每个会话增加约 80 字产物引导，可在插件配置 `promptGuidance: false` 关闭。

**重要**：本次改动包含 Host 代码，需 DSH 下次正常启动才生效；Client 代码经 HMR 立即生效。Client 在索引不存在时会显示准备中，不会报错。

## 5. 卸载清理

索引现在位于 `$DSH_HOME/artifacts-panel/index/`（`DSH_HOME` 缺失时在系统临时目录）：

```bash
# 直接删除数据目录即可重置（示例；请先确认 DSH_HOME 的值）
rm -rf "$DSH_HOME/artifacts-panel/index"

# 旧版插件目录下的 .index/ 只做一次性复制迁移，可手动删除
node tools/clean-index.mjs --dry-run   # 看将删除什么（仅插件目录 .index/）
node tools/clean-index.mjs
```

`tools/clean-index.mjs` 只接受 basename 恰为 `.index` 的目录，绝不触碰会话日志、DSH 投影缓存或 `$DSH_HOME` 下的其他数据。

**projection 缓存残留说明**：host-only `artifactIndex` 单元在运行期间可能被 DSH 写入自己的投影缓存（位于 `~/.dsh` 下，插件不直接读写）。卸载插件后这些检查点可能残留，内容同样是「只存引用」的行数据；DSH 重建缓存后会自然失效。`clean-index.mjs` 按约束不清理该缓存。

## 6. 自测

```bash
node --check client.js
node --input-type=module --check < index.js
node tools/test-v2b.mjs
node tools/validate-index.mjs --self-test
node tools/validate-index.mjs            # 校验新索引目录（默认 $DSH_HOME/artifacts-panel/index；未建立时 exit 0）
node tools/render-harness.cjs
```

- `tools/test-v2b.mjs`：fold、回填断点续跑、越界/失败隔离、容量裁剪、校验器接受/拒绝。
- `tools/validate-index.mjs`：结构 + 交叉校验（totals、meta.c、孤儿会话文件）。
- `tools/render-harness.cjs`：v1/v3/v4/v5/v6/v7/v8/v9 断言（200 项）+ v2b 纯数据层与降级渲染断言；`failures` 为空、exit 0。
- `tools/interactive-harness.cjs`：最小 hook 运行时驱动点击路径，结束时打印 `INTERACTIVE_OK`。
- `tools/VERIFY.md`：逐条验证记录。

## 7. 已知限制

- `sha` 字段目前只在事件 `meta` / `deliverables` 自带 `sha` 时记录；默认回填不读文件，因此通常为空（预留字段）。
- 索引路径由 Host 单一来源决定（`DSH_HOME` → OS 临时目录），Client 默认经同源 HTTP 路由读取；仅在宿主没有路由时，才使用浏览器 `localStorage` 的 `dsh-artifacts-panel.indexDir.v1`（设置页「索引目录」）作为绝对路径降级。
- 回填断点续跑以事件计数为锚；若上一次读取恰好停在 `tool/call` 与 `tool/result` 之间（崩溃窗口），该条结果可能漏记，下一次全量重建或新会话轮次可修正。

## 8. 第二批功能（A1/A2/A3/A4/D2）

- **A1 每轮 diff 深链**：折叠 `workspace/changes` 公告（该事件只带 `turn`，文件清单按需读 `api/changes.summary`），轮次头「看改动」与卡片 ⋯ 菜单「看改动」经 `ctx.sidebarRight.openResource('dsh-resource://changes-review/session/<sid>/<seq>/<turn>', { params: { index } })` 打开官方评审页；本轮没有公告、或运行时未注册 `changes-review` tab 类型时不显示入口。不自行计算 diff。
- **A2 导出升级**：「导出包」菜单包含会话 ZIP（`ctx.sessionLogDownload.download`；不可用时降级为带下载链接的清单并在菜单里注明）、导出清单（Markdown）、复制全文 Markdown（`api/session.markdown` 探测可用才显示）。
- **A3 文件动作**：卡片 ⋯ 菜单 / 右键 = 在 Finder 中显示、用默认应用打开（`remote.session.openWorkspacePath`）、复制路径、下载、另存为（`ctx.fileActions.canSaveAs`）。不可用项按特性检测隐藏；无 `fileActions` 时下载退回浏览器 `api/file?path=`。
- **A4 图片画廊**：「图片」筛选（轮次维度）下可切「列表 / 画廊」；缩略图用 `api/file?path=`（`dsh-resource://file/...` 是右侧栏 tab 地址，不能作为 `<img src>`），加载失败显示占位；灯箱全屏支持左右切换、Esc 与点击背景关闭。
- **D2 迷你悬浮条**：注册 `shell.overlay`，右下角「产物 N」小条，点击打开右侧栏产物 tab，可关闭；设置页可整体关闭（**默认开**）。计数按最近 400 条会话事件折叠，与面板产物定义一致。
- **新设置项**：`imageView`（`list` / `gallery`，默认 `list`）、`showFloatingBar`（默认 `true`），仍存 `dsh-artifacts-panel.settings.v1`。
- **自测**：新增 `node tools/interactive-harness.cjs`，用最小 hook 运行时驱动点击路径（卡片菜单、深链 index、Finder 显示、画廊/灯箱、ZIP 导出、悬浮条）。

## 9. 收录来源与「无产物」轮次（默认显示）

- **只认三类来源**：文件产物只从 `deliverables/presented`、成功的 `write` / `edit` / `str_replace_editor` 的 `meta.path`、`workspace/changes` 公告折叠出来。**通过 bash 等非文件工具写入的文件暂不自动收录**（例如 `cat > file`、Python 脚本落盘），这类轮次会以「无产物」徽标显示，不是面板坏了。
- **默认显示无产物轮次**：`hideTurnsWithoutArtifacts` 默认改为 `false`。有最终回复但没有文件的轮次照常渲染轮次头 + 最终回复（长回复折叠到约 6–8 行，可「展开全文」），轮次头带轻量「无产物」徽标。
- **快速开关**：工具栏「只看有产物」与设置页「隐藏没有产物的轮次」是同一个设置项（`hideTurnsWithoutArtifacts`），打开后只显示至少有一个可收录产物的轮次。
- **短回复过滤仍默认开**：无产物且回复短于 30 字的轮次默认隐藏（避免「总线无新消息，已处理到 #N」噪音）；长回复（≥阈值）即使无产物也显示。阈值与忽略关键词可在设置页调整。
- **刷新**：本会话视图每 3 秒轮询一次新事件，工具栏「刷新」按钮可手动强制拉取；切换页签或重新打开面板也走同一拉取逻辑。


## 10. 配色主题（themeMode / accentColor）

设置页「配色主题」组，两个设置项都存进同一个 `dsh-artifacts-panel.settings.v1`：

- `themeMode`：`inherit`（默认，跟随 DSH 宿主主题）/ `dark` / `light`；
- `accentColor`：`default`（默认，沿用宿主强调色）/ `blue` / `amber` / `green` / `purple` / `rose`。

实现：插件根容器（产物页签、右侧栏 tab、悬浮条、灯箱、设置页）通过内联样式写入 `--ap-bg` / `--ap-surface` / `--ap-border` / `--ap-text` / `--ap-muted` / `--ap-accent` / `--ap-accent-fg` 等变量；CSS 统一写成 `var(--ap-x, var(--dsw-alias-y))`，`inherit` 时变量为空自动回退宿主 token。强制模式使用内置两套中性色与语义色（错误/警告/成功/业务），正文对比度按 WCAG AA ≥ 4.5:1 校验（深色正文 ≈14:1，浅色正文 ≈16:1）。灯箱遮罩固定深色，不随浅色模式变白。

旧设置没有这两个字段时自动补默认值（`inherit` / `default`），`SETTINGS_VERSION` 保持 2（纯增量字段，无需迁移版本号）。

## 11. 右侧栏停靠增强（v7）

三项与「左对话 / 右产物资产」停靠布局相关的增强，均只使用 `ctx.sidebarRight` 的公开方法，不接管原生 `conversation.session.header.corner` 槽位：

- **自动展开（`autoOpenSidebar`，默认 `false`）**：设置页「视图与悬浮条」组的开关。开启后，打开/切换会话时若右侧栏处于**收起**状态，调用 `ctx.sidebarRight.openTab('artifacts', { revealIfOpened: true })`；已展开的其他标签页不会被抢占，每个会话只触发一次，失败静默降级、不弹 toast。实现为 `shell.overlay` 内的无渲染组件 `AutoOpenSidebar`（与悬浮条同一个 slot 注册，`ShellOverlay` 组合两者）。
- **宽栏自适应**：`SidebarArtifacts` 用 `ResizeObserver` 测量自己的容器宽度（effect 内建立、卸载时 `disconnect`，不用 `window.innerWidth`），按宽度切换（`sidebarLayoutForWidth`）：`< 480px` 保持单列紧凑；`≥ 480px` 产物卡片两列网格（`.ap-layout-two-column`）；`≥ 720px` 轮次头保持，正文 `.ap-turn-body` 左右并排——左回复、右资产（`.ap-layout-split`，右侧卡片单列以免过窄）。容器未测量到宽度时回退单列。
- **折叠状态入口**：产物页签工具栏的「在右侧栏打开」按钮两态——右栏已展开且当前活动标签就是产物 tab 时显示「收起右栏」（`sidebarRight.toggleExpanded()`），否则显示「在右侧栏打开」；状态用 1s 轻量探针（`isExpanded()` + `active()`）同步，宿主没有这些方法时保持「打开」文案。悬浮条点击「产物 N」改为 `openTab('artifacts')` 后再按 `isExpanded()` 判断是否 `toggleExpanded()`，只在收起时补一次展开，不会把刚展开的栏又切回收起。

新增设置仍存 `dsh-artifacts-panel.settings.v1`；`SETTINGS_VERSION` 保持 2（纯增量字段，缺省即 `false`）。


## 12. 跨会话索引服务降级（0.2.0 修复）

- **注入清单**：Client 插件 `inject` 现为 `['slots', 'locale', 'sessions', 'uiWorkspace', 'remote', 'remote.session', 'remote.workspaceFiles', 'sidebarRight', 'sidebarRightTabs']`。`remote.workspaceFiles` 是独立服务，未注入时 Cordis 在属性访问处直接抛错，已补齐。
- **读取守卫**：`readIndexFile` 与 `downloadArtifact` 对 `ctx.remote.workspaceFiles` 的访问包在 try/catch 里；服务缺失时返回 `WORKSPACE_FILES_UNAVAILABLE`，视图降级为「索引服务不可用」，不再把 `cannot get property "remote.workspaceFiles" without inject` 抛给用户。
- **三类失败文案**：`classifyIndexError` 把索引读取失败分成
  1. `unavailable` 服务不存在（旧宿主 / 未注入）→「跨会话索引服务不可用」；
  2. `missing` 索引文件不存在 →「索引准备中（需 DSH 下次启动生效）」；
  3. `denied` 路径无权限 →「没有读取索引的权限」。
  其他错误走通用「读取跨会话索引失败」。原始错误只出现在折叠的「原始错误」`<details>` 小字里，标题与正文不出现原始错误码。

## 13. UI 美化（P0 八项，0.2.0）

1. **工具栏减负**：工具栏按「身份（本会话/全部会话 · 轮次/任务/运行）/ 筛选（全部/文档/图片/文件 · 搜索 · 筛选▾）/ 动作（刷新 · 设置 · 在右侧栏打开 · ⋯）」三分区。三个「眼睛」开关（只看有产物、显示全部轮次、显示已隐藏）与图片视图切换全部收进「筛选▾」popover；popover 另含排序（默认/最新在前/按名称）与「清除全部筛选」，按钮上显示生效条件数。导出只保留 ⋯ 菜单一个入口（导出清单 / 导出包 / 复制全文 Markdown）。
2. **设置可直达**：工具栏齿轮与 ⋯ 菜单「打开设置面板」都打开内嵌右侧抽屉（宽 380px，`min(380px, 92vw)`），复用 `SettingsPage`；Esc、点遮罩、关闭按钮都能关，焦点陷阱 + 关闭回焦到触发按钮。不再弹「去设置里改」的 toast。
3. **三类状态**：`EmptyNew`（首次使用：一句说明 + 看看会收集什么 / 调整字号与主题）、`EmptyFiltered`（列出生效筛选 chip，可逐个 × 或一键清空，另给「显示全部轮次」）、`ErrorState`（人话标题与原因 + 重试 + 复制诊断信息 + 折叠的技术细节）。三者分别带 `data-state="new|filtered|error"`。
4. **卡片可发现性与 ARIA**：卡片容器去掉 `role="button"`/`tabIndex`，改为普通容器 + 覆盖整卡的透明 `<button class="ap-card-hit">`；☆ 与 ⋯ 常显 40% 透明度、hover/focus 100%；小屏只留 ⋯；下载/打开子会话/隐藏移入 ⋯ 菜单。卡片不再有嵌套交互元素。
5. **键盘可达**：筛选 popover、工具栏 ⋯、卡片菜单、灯箱、设置抽屉都有焦点陷阱、打开聚焦首个可操作项、关闭回焦；分段控件补 `aria-pressed`；会话树 chevron 改成 `<button aria-expanded>`、标题改成独立按钮（去掉 `role=button` 容器）。
6. **长路径可读**：卡片路径中间省略并保留文件名尾段（`middleEllipsis`），单击复制完整路径并 toast「路径已复制」；容器 `title` 仍是完整路径；移除描述行的 `maxWidth:180px` 硬限制。
7. **对比度与动效下限**：强制主题沿用 WCAG AA 验算的 `--ap-*`；`inherit` 模式也把 `--ap-subtle` / `--ap-muted` 固定到对应明暗色板（≥4.5:1）。`data-hidden` 透明度改为 0.72 + 灰化；新增 `@media (prefers-reduced-motion: reduce)` 关闭动效与无限动画；所有小于 `.85em` 的字号加 `max(11px, …)` 下限。
8. **发布材料**：首启引导卡只出现一次（`localStorage: dsh-artifacts-panel.onboarded.v1`），设置 → 视图与悬浮条 →「重新显示引导」可复位；设置页合并为 6 组，每组都有说明；版本与截图占位见下一节。

## 14. 发布材料：截图 / GIF 占位与首启引导文案

真实截图与 GIF 由发布人补齐（本仓库暂不存放二进制素材）。占位文件清单：

| 占位文件 | 内容 | 建议尺寸 |
|---|---|---|
| `docs/screenshots/panel-main.png` | 宽屏主面板：三分区工具栏、首启引导卡、卡片 ☆/⋯ | 1440×900 |
| `docs/screenshots/filter-popover.png` | 「筛选▾」popover：只看有产物 / 显示全部轮次 / 显示已隐藏 / 视图 / 排序 | 720×480 |
| `docs/screenshots/settings-drawer.png` | 内嵌设置抽屉与 6 组设置 | 900×900 |
| `docs/screenshots/panel-tour.gif` | 12–15 秒：筛选 → 打开卡片 → 复制路径 → 打开设置抽屉 | ≤ 4 MB |

素材就位后，用下面注释块里的 Markdown 替换本节占位说明（现在不要直接引用不存在的图片）：

```markdown
<!--
![产物面板主视图](docs/screenshots/panel-main.png)
![筛选 popover](docs/screenshots/filter-popover.png)
![设置抽屉](docs/screenshots/settings-drawer.png)
![操作演示](docs/screenshots/panel-tour.gif)
-->
```

**首启引导文案（与 `zh` 词典一致）**：

- 标题：第一次用产物面板？
- 正文：这里会自动收集每轮的最终回复、文档、图片和其他产出文件。点卡片打开内容，点齿轮可以调整字号、主题和过滤规则。
- 按钮：知道了 / 去设置
- 只出现一次；点「知道了」或卡片右上角关闭后写入 `dsh-artifacts-panel.onboarded.v1=1`。想再看一次：设置 → 视图与悬浮条 →「重新显示引导」。

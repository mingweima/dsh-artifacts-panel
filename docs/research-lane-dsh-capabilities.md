# DSH 本机能力面调研（只读 · 产物面板并入清单）

> 调研对象：`plugins/dsh-artifacts-panel`（v1 已上线：`conversation.view`「产物」页签 + 右栏 tab + `settings.section` 设置页，5s 轮询 `remote.session.events`，localStorage 存偏好）。
> 方法：安装包 `app.asar` 内 `dsh/node_modules/@deepseek-ai/*` 的源码与 README.zh.md + Cordis Inspect（host Service/Event 目录）。只读，未改 profile、未重启、未读凭据。
> 形态细节（float/dock/split/全屏/多窗口）已由另一路深挖，见 [research-lane-multiwindow.md](research-lane-multiwindow.md)，本文不重复。

---

## 0. 结论：最值得并入的 5 项（按性价比）

1. **会话谱系聚合（子代理 / workflow 成员 / teammate 的产物）**——`ctx.sessions.list` 零 RPC 拿到全部子会话，`snapshot.subagent.address` 给出 `{parentSessionId, childSessionId, mode}`；`remote.session.page` 读子会话日志，按父会话聚合成「本轮派了谁、各自交付了什么」。团队场景价值最高。
2. **每轮改动文件 + changes-review 深链**——`dsh-client-ui-deliverables` 已实现「按 `sessionId/seq/turn` 打开 diff 评审页」：`ctx.sidebarRight.openResource('dsh-resource://changes-review/session/<sid>/<seq>/<turn>', { params: { index } })`。产物面板只需记录坐标，不自己算 diff。
3. **会话投影做骨架（turnOutline / sessionStats / todos / plan / goal / agentTeam）**——不用重放事件：`ctx.sessions` 共享 store 的 `projectionsBySession[sid].values.<key>` 直接读，面板头部统计、跨轮导航、每轮意图一次到位。
4. **导出能力**——`ctx.sessionLogDownload.download(sessionId)`（ZIP）/ `api/session.markdown?sessionId=`（整段 Markdown，含客户端未加载的历史），替掉自建「导出清单」。
5. **文件动作服务 `ctx.fileActions`**——下载/Save As/复制/在 Finder 显示，配合 `remote.session.openWorkspacePath({path, action})` 与 `remote.workspaceFiles.readBytes`，不用手写 `<a download>` 与 blob。

---

## 1. 底座盘点（决定「能不能接」）

### 1.1 Client 服务（`inject` 可申请）
`slots` `locale` `sessions` `remote`(+命名空间) `sidebarRight` `sidebarRightTabs` `layout` `uiWorkspace` `uiConversation` `uiSession` `jobs` `contextMenus` `shortcuts` `fileActions` `configForms` `documentPreviews` `resources` `modules` `connection` `theme` `timer` `workspaces`

### 1.2 Remote 命名空间（官方 client 包实际调用过的）
`session` `workspace` `workspaceFiles` `goals` `schedule` `settings` `skills` `commands` `terminal` `userQuestions` `agentPresets` `actionCards` `messageFeedback` `sessionFeedback` `sessionReferenceResolver` `fileReferences` `fileUploads` `pluginInventory` `pluginManager` `pluginMarket` `account` `llm` `credentials` `directoryPicker` `productAnalytics` `speech` `cotTranslation` `forgePanel` `permissionPresets` `$host` `$mount` `$on` `$stream`
> 没有 `remote.team` / `remote.workflow` / `remote.diff`：团队与工作流只能走投影或会话日志。

### 1.3 客户端可见投影键（`SessionProjectionMap` 的 `wire.view`）
`turnOutline` `sessionStats` `tokenUsage` `contextBreakdown` `contextPressure` `todos` `plan` `goal` `agentTeam` `subagent` `modelSelection` `permissions` `actionCards` `userQuestions` `inbox` `imageLimits`

### 1.4 可用事件（Host 侧 `ctx.on`，且大多经 `remote.$on` 推到浏览器）
`session/event`（每条提交事件）`deliverables/presented` `tool-workflow/run-start|run-end|agent-start|agent-end` `goal/changed` `goal/activation-changed` `schedule/changed` `subagent/start|end` `workflow/start|end` `plugin-manager/changed` `settings/document-updated` `agent/status` `session/created|disposed`

### 1.5 实时通道（替代 5s 轮询，P0 级基础设施）
- `ctx.remote.$stream({ name, open: s => ctx.remote.session.observeEvent(req, s), ended })`：断线重连的流式 RPC，官方 job/terminal/workspace/account 全用它。
- 或 `ctx.uiConversation.events.register(definition)` 接进 Conversation assembler（能拿到 turn/step 归属与增量），但会与 chat 共用事件源，语义更重。
- 结论：面板应改为「首次分页拉 + `$stream` 增量」，现在的 5s 全量轮询既慢又重复解析。

---

## 2. 内容类清单

| 能力 | 数据源（API / 事件） | 用途 | 现成度 | 优先级 | 难度 |
|---|---|---|---|---|---|
| 最终回复（已有） | `assistant/message` | 按轮归档回复 | 已接 | — | — |
| 显式交付（已有） | `deliverables/presented` → `files[{path,description}]` | 交付卡 | 已接 | — | — |
| 每轮改动文件 | `tool/call`+`tool/result`（现方案）或 `workspaceChanges.summary(sessionId, seq)` | 产物去重、补全工具外改动 | 半现成 | P1 | S |
| diff 评审 | `dsh-resource://changes-review/session/<sid>/<seq>/<turn>` + `sidebarRight.openResource(addr,{params:{index}})` | 点产物看逐行 diff | 现成 | P1 | S |
| 子代理产物 | `ctx.sessions.list`（`byId/order`）+ `snapshot.subagent.address` + `remote.session.page`；打开用 `dsh-resource://subagentchat/session/<child>?parent=&mode=` | 父子会话产物树、旁栏对照 | 现成零件 | P1 | M |
| workflow 运行 | 日志事件 `tool-workflow/run-start|agent-start|agent-end|run-end`（runId/phase/member） | 一次编排的成员与产出清单 | 现成（`dsh-client-ui-workflow-run` 同源） | P1 | M |
| 会话投影骨架 | `projectionsBySession[sid].values.{turnOutline,sessionStats,todos,plan,goal}` | 头部统计、轮次跳转、每轮意图 | 现成 | P1 | S |
| 导出 | `ctx.sessionLogDownload.download(sessionId)`；`GET /api/session.markdown?sessionId=`；`formatSessionMarkdown(events)` | 整段 Markdown / ZIP | 现成 | P1 | S |
| 文件动作 | `ctx.fileActions`（save/saveAs/download/copy）+ `remote.session.openWorkspacePath({path,action:'reveal'|'open'})` + `remote.workspaceFiles.readBytes` | 下载/另存/复制路径/Finder/默认应用 | 现成 | P1 | S |
| 任务板 | 投影 `agentTeam`（roster + tasks，只读，含 `ready/blocked/in_progress/completed`） | 「本轮团队交付」一节 | 实验性、随 bundle | P2 | M |
| 定时任务 | `ctx.remote.schedule.catalog/list/history/run`；事件 `schedule/changed` | 「定时产出」清单与投递历史 | 现成 | P2 | M |
| 后台 job | `ctx.jobs.watchRows/state/observe/kill`（`job.list` 流） | 命令产物/日志摘要 | 现成（非持久） | P3 | M |
| 图片附件 | `ctx.uiConversation.imageUrl(sessionId, attachment)`；trajectory 的 `conversation.trajectory.images` 模式 | 提示词/工具里的图内联预览 | 现成但要接线 | P3 | M |
| 动作卡 | 投影 `actionCards` | 卡片类产物 | 现成 | P3 | M |
| 全局搜索 | `remote.session.search(req)` / `sessionQuery.searchEvents` | 跨会话找产物 | 现成 Remote | P3 | M |
| 终端 / PTY | `remote.terminal.list/attach/retain` | 仅实时，不落盘 | 非持久 | 不做 | — |
| MCP 结果 | 无独立数据源，均落在 `tool/result` | — | 已覆盖 | — | — |
| 技能 / 插件清单 | `remote.skills` / `remote.pluginInventory` | 与"产物"无关 | 不适用 | — | — |

---

## 3. 交互形态清单（数据相关部分；布局类见姊妹篇）

| 能力 | API | 用途 | 现成度 | 优先级 | 难度 |
|---|---|---|---|---|---|
| 资源预览 | `tab.actions.openResource` / `ctx.sidebarRight.openResource(fileAddress)`（md/代码/图片/PDF/Office 由 `documentpreviews` 解析） | 点开即预览 | 已用 | — | — |
| 深链到某一轮/某个文件 | `openResource(addr,{params})`；`dsh-resource://changes-review/...`、`subagentchat` | 「在产物面板看这轮」 | 现成 | P1 | S |
| 灯箱 / 全屏预览 | `shell.overlay`（root 级 slot，官方 toast/欠费/右键菜单都挂这） | 图片/文档大图 | 现成 | P2 | M |
| 右键菜单 | `ctx.contextMenus.register({id,target:'file'|'image',order,resolve})` + `contextMenuProps` | 产物行统一动作 | 现成 | P2 | S |
| Toast | `ctx.contextMenus.notify(text, success?, action?)` | 下载/复制反馈 | 现成 | P2 | S |
| 快捷键 | `ctx.shortcuts.register({id,binding,run,...})`（`dsh-client-shortcuts`，自动进速查表） | 切页签/开关面板 | 现成 | P2 | S |
| 面板内搜索 | `remote.session.search` 或本地过滤（现方案） | 跨会话产物检索 | 现成 | P3 | M |
| 导出/复制 | 见 §2 导出；`fileActions` 负责落盘 | 交付清单 | 现成 | P1 | S |
| 新窗口 | **无**（`window.open` 一律 deny，Desktop 桥只有 `fileActions/keyboard/shortcuts/deviceInfo`） | — | 不可行 | — | — |

---

## 4. 设置/配置：用 Host Config 替掉自建设置页

### 4.1 机制（已核实）
- Host 半：`export const Config = z.object({ ... .volatile() })`（schemastery `z`），Loader 条目 id 即命名空间。
- `ctx.settings.describe()` 遍历 Loader 条目，**只投影带 `.volatile()` 的字段**（`volatileForm(schema)`，`dsh-settings/lib/index.js`）；普通字段不进表单。
- `ctx.settings.configure({ auto })`：`auto:true` 自动生成表单；`auto:false` 由自建页面渲染。
- Client 半：`ctx.configForms.get(entryId)` 拿 `{value,base,user,revision,writable}` + `set/unset/mutate`（原子、CAS、冲突保留草稿）；`ctx.configForms.whileServed(ns, register)` 只在 Host 服务该命名空间时注册页面（官方四个配置页都这么写）；`ctx.settingsSchema` 做校验。

### 4.2 三种落点怎么选
| 落点 | 适用 | 取舍 |
|---|---|---|
| `settings.section`（现用） | 页面大的独立分区 | 占一级导航；与主题/模型等并列，权重偏高 |
| `plugins.row.config`（key = `<包名>#<行 id>` = `@local/dsh-artifacts-panel#dsh-artifacts-panel`） | **插件自己的配置页**（本插件应迁到这里） | 只在 bundle 开启时出现「配置」控件；需在 patch 声明该行 id（已有） |
| `settings.general.item`（id/order/label + 行组件） | 单个开关（如「隐藏无产物轮次」） | 只放 1~2 个高频开关，别把整页塞进通用 |

**建议**：偏好全部上 Host Config（`volatile` 即时生效、不重启）→ 页面注册 `plugins.row.config` → 通用区只留 1 个「默认打开方式」开关；localStorage 只保留「已读/收藏/隐藏」这类纯客户端 UI 状态。

### 4.3 代价
- 需要动 Host 半边（现在 `index.js` 是空 `apply`），Config schema 改动要重载 profile（Host 侧不能纯 HMR）；Client 页面可热更。
- `view:'page'` 表单要自己画保存按钮；`view:'summary'` 只在包描述缺失时用。

---

## 5. Host 侧增强

| 机制 | 怎么写 | 能解决什么 | 代价 |
|---|---|---|---|
| `sessionProjections.register({ key, stateVersion, stateSchema, init, apply, wire:{ viewSchema, view } })` | 纯折叠已提交事件；`apply` 同步、不相关事件返回同一引用；`wire` 决定是否下发客户端 | 跨轮/跨会话产物索引、去重、统计；客户端零重放 | M（100–200 行）+ 需 `await` 注册；重启后靠 checkpoint 或重折 |
| `sessionQuery`（`listSessions/readSession/searchEvents/filterEvents`） | Host 只读冷会话日志 | 跨会话聚合、全文找产物 | S–M；注意冷读 I/O |
| `ctx.webServer.register({ path, handler })`（参考 `dsh-session-log-export` 的 `/api/session.export`） | 自定义 GET，走连接鉴权 | 给浏览器一个「全局产物索引」端点，不必造 typert Remote | M；要自己做鉴权/分页/缓存 |
| `systemPrompt.section({ name, order: getSectionOrder('DELIVERABLE_FILE_REFERENCES'), text })` | 现有 `dsh-deliverable-file-references` 已是范例 | 让模型多用 `present`、统一文件链接写法 | S，但**全局加 token、影响 KV cache**；不建议再加一段 |
| `ctx.tools.register(defineTool(...))` | 注册 `artifacts.list/search` 之类只读工具 | 让模型查历史产物 | M；每工具常驻 schema 成本，且与面板目标弱相关 |
| 事件监听 `ctx.on('session/event' | 'deliverables/presented' | 'tool-workflow/*' | 'subagent/start')` | 增量喂内存索引 / 触发通知 | 有状态就有内存增长与重启丢失，需上限 |

**判断**：v2 不需要 Host 投影；只有做「跨会话产物索引」时才值得上 `sessionProjections` + 自定义路由，且必须带分页与上限。

---

## 6. 不该并入（附理由）

1. **终端 PTY 滚动缓冲 / 后台 job 原始输出**——非持久、进程内、体量大；只适合实时小窗，不该当"产物"归档（`ctx.terminals`/`ctx.jobs` 都不落盘）。
2. **MCP 资源目录、技能清单、插件清单**——不是"本次会话产出"，塞进产物面板会稀释语义（`remote.skills`/`pluginInventory` 另有入口）。
3. **跨会话全量日志重放**——N 个会话 × 全量 `session.page` 是 O(总事件数)，会拖垮页面；只允许按需分页或走 Host 索引。
4. **其他 workspace / 其他用户的会话**——跨会话读取要过授权与 `retain`，且属隐私边界；面板默认只碰当前会话 + 其子会话。
5. **原始 diff 文本自己算**——已有 `changes-review` tab 与 `workspaceChanges.diff`；重复实现既慢又会与官方口径不一致。
6. **凭据 / 账号 / 遥测数据**——`credentials`、`account`、`productAnalytics` 与本插件无关，且属敏感面。
7. **全局提示词段落**——`DELIVERABLE_FILE_REFERENCES` 已覆盖；再加一段是纯 token 成本，无收益。

---

## 7. 路线建议

**v2（1–2 天，纯 Client + 小改 Host）**
- 实时化：`remote.$stream` 增量替代 5s 轮询；首屏用 `turnOutline` 占位。
- 顶部统计条：`sessionStats`（turns/steps/llmMs/toolMs/ttft/decode）+ `tokenUsage`。
- 每轮加「改动 N 文件 / 查看 diff」：存 `{sessionId, seq, turn}`，点开 `changes-review` 深链。
- 导出换 `sessionLogDownload`（ZIP / Markdown），文件动作换 `ctx.fileActions` + `openWorkspacePath`。
- 设置迁到 `plugins.row.config` + Host Config（`volatile`），保留收藏/隐藏于 localStorage。

**v3（3–5 天，需要 Host 半边）**
- 子代理/workflow 产物树：按 `subagent.address` 聚合子会话，右栏分格对照。
- 「团队交付」一节：`agentTeam` 投影（任务板只读）+ `schedule` 产出。
- 跨会话产物索引：`sessionProjections`（新 key `artifactsIndex`，`wire.view` 下发）+ `webServer` 路由 + 分页/上限；搜索接 `remote.session.search`。
- 可选：`actionCards` 卡片产物、图片附件灯箱（`shell.overlay` + `uiConversation.imageUrl`）。

---

## 8. 证据索引（包 → 关键点）

- `dsh-client-ui-deliverables/lib/client.js`：`changesReviewAddress()`、`sidebarRight.openResource(addr,{params:{index}})`、`deliverables.file.actions`（`actionUrl/available/pending/onAction`）、`conversation.chat.turnTail` 注册。
- `dsh-client-ui-subagent/lib/client.js`：`dsh-resource://subagentchat/session/<child>?parent=&mode=`，子目录来自 `ctx.sessions.list`（零 RPC），token 总量来自 `subagent` 投影。
- `dsh-experimental-client-ui-agent-team/lib/client.js`：`useSessions(s => s.projectionsBySession[lead].values.agentTeam)`、`useSession(s => s.subagent?.address...)`。
- `dsh-experimental-agent-team/lib/index.js`：`key:'agentTeam'`、`stateVersion:4`、`wire:{viewSchema,view}`。
- `dsh-client-ui-workflow-run/lib/client.js`：事件 `tool-workflow/run-start|agent-start|agent-end|run-end`；节点只显示身份/状态（脚本、输出、日志不暴露）。
- `dsh-client-ui-goal/lib/client.js`：`useProjection('goal')`、`remote.goals.get`、`remote.$on('goal/activation-changed')`。
- `dsh-session-turn-outline/lib/types/projection.js`：每轮 `{seq, prompt(50 字), reply(120 字)}`，`turn/start` 为锚。
- `dsh-session-stats/lib/types/projection.js`：`turns/steps/llmMs/toolMs/ttftMs/decodeMs/...`。
- `dsh-session-log-export/lib/index.js`：`/api/session.export`、`/api/session.markdown`、`formatSessionMarkdown(events)`；Client 侧 `ctx.provide('sessionLogDownload')`。
- `dsh-client-ui-file-actions/lib/client.js`：`ctx.provide('fileActions')`、`ctx.contextMenus.notify(text, ok, action)`、`remote.session.openWorkspacePath`、`remote.workspaceFiles.readBytes`。
- `dsh-settings/lib/index.js`：`describe()` 遍历 Loader 条目、`volatileForm()` 只认 `.volatile()`、`configure({auto})`。
- `dsh-client-ui-settings/lib/client.js`：`configForms.get(entryId)`、`whileServed`、`settingsSchema`。
- `dsh-client-ui-plugin-manager/lib/client.js`：`plugins.row.config` key 为 `<包名>#<行 id>`。
- `dsh-session-projection/README.zh.md`：注册形态、`wire.view`、checkpoint、`Object.is` 引用门。
- `dsh-api-job-controller/lib/client.js`：`remote.$stream({name,open,ended})` 标准写法。
- `dsh-deliverable-file-references/lib/index.js`：`ctx.systemPrompt.section({ order: getSectionOrder('DELIVERABLE_FILE_REFERENCES') })`。

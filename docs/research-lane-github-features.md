# 调研：GitHub / 业界热门功能 → DSH 产物面板

| 项目 | 内容 |
|---|---|
| 调研人 | 大鱼人 Lead 派出的只读调研 subagent（lane：GitHub/业界热门功能） |
| 日期 | 2026-11-12 |
| 目的 | 找出可并入 `plugins/dsh-artifacts-panel` 的功能点（多 subagent / 多窗口 / 按任务分类等） |
| 边界 | 只读调研；未安装/修改插件；未触碰线上服务与凭据 |

> 结论先行：产物面板当前定位是「会话级只读索引」。业界同类产品（Claude Artifacts、Cursor Canvases、Nimbalyst、Vibe Kanban、AutoGen Studio）已经走过的路说明，价值最高的增量不是"更好看的预览"，而是三件事：**① 跨会话总库（产物不再随会话消失）；② 产物挂到任务/子代理上（回答"谁产出的"）；③ 同一文件的版本时间线与对比（回答"改了什么"）**。多窗口/分享属于体验加成，成本高、优先级靠后。

---

## 1. 产品调研表

| 名称 | 关键功能（与产物相关） | 可借鉴点 | 链接 |
|---|---|---|---|
| Cursor Agents Window + Canvases（Cursor 3，2026-04） | Agents Window 是 agent-first 统一工作区：多 workspace、并行 agent、worktree 隔离、云子代理；canvas 是「durable artifacts」，与 terminal/browser/SCM 并列存放；每个 canvas 进 workspace 的 canvas 列表；Publish 生成只读分享链接；canvas 可作为 tab 在 Agents Window 打开 | **产物是一等公民且集中成列表**；分享=只读快照；产物可"重跑刷新" | [Agents Window](https://cursor.com/docs/agent/agents-window) / [Canvases](https://cursor.com/docs/agent/tools/canvas) / [Blog](https://cursor.com/blog/canvas) |
| Claude Artifacts（2026 版） | 产物开在对话旁边独立窗口；侧栏全局 **Artifacts tab** 汇总所有产物，可从任意会话找回；模板（Docs/Slides/Design/Data/Sheets）；导出 Word/PDF/MD/PPT/zip/HTML；改早期消息生成"另一个版本"；发布→分享链接；Claude Code 可把会话输出发布为 artifact | **全局产物库 + 模板 + 多格式导出 + 版本**；"编辑早期消息得新版本"是轻量版本机制的范本 | [帮助文档](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) |
| ChatGPT Canvas / Codex | Canvas 在侧栏打开，可版本回退与导出；Codex 侧在向 workspace 演进（任务并行、环境隔离） | 侧栏 + 版本切换 + 一键导出 | [Canvas 指南](https://instapods.com/blog/what-is-chatgpt-canvas/) / [Codex docs](https://learn.chatgpt.com/docs) |
| Devin | 会话内多工具面板（shell、editor、browser、wiki）；Session Insights 做会话级分析；Devin Review 做 PR 级审查 | **会话内多 tab 工具区**；会话级汇总视图 | [Session tools](https://docs.devin.ai/zh/work-with-devin/devin-session-tools) / [Session Insights](https://docs.devin.ai/product-guides/session-insights) |
| OpenHands（93.3k★） | 单个会话内 Chat / Changes / VS Code / Terminal / App / Browser 多 tab；Agent Canvas | 一个会话 = 一个多 tab 工作区；Changes tab 即"本轮产物" | [Key Features](https://docs.openhands.dev/openhands/usage/key-features) / [GitHub](https://github.com/OpenHands/OpenHands) |
| Nimbalyst（原 Crystal，3.1k★） | agent-native 视觉工作区：并行多会话（完成提醒、搜索/恢复/分支/归档）；**会话与文件双向绑定**（每个会话列出读过/写过的文件）；tracker 用 `@task/@idea/@bug/@decision` 内联标记，跨 plan 的看板+优先级+进度；**Context Graph：每个产物（plan/spec/diagram/session/diff/file/decision）都是节点，带类型边**；文件历史+恢复；Mermaid/Excalidraw；worktree 每会话独立 | **本次调研最贴近的产品**：产物→会话→任务三方互链、看板、文件历史 | [Features](https://nimbalyst.com/features/) / [GitHub](https://github.com/Nimbalyst/nimbalyst) |
| Vibe Kanban（28.7k★，已宣布 sunset） | kanban issue 规划 → 每个 issue 开 workspace（branch+terminal+dev server）→ diff 行内评论回传 agent → 内置浏览器预览 → 10+ agent 任选 → PR 合并 | **任务看板即产物归属维度**；"任务卡片 → 产物/工作区"的跳转 | [README](https://github.com/BloopAI/vibe-kanban) |
| AutoGen Studio（autogen 61.8k★） | Team Builder（可视化组队）/ Playground（实时消息流 + 控制转移图 + 暂停停止）/ Gallery（组件市场）/ Deployment | 多 agent **消息流图**与运行控制；Gallery 式的集中浏览 | [文档](https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/index.html) / [源码](https://github.com/microsoft/autogen/tree/main/python/packages/autogen-studio) |
| LangGraph Studio / LangSmith | 图可视化、状态检查、时间旅行、中断点、运行历史 | 时间线/状态回放式浏览 | [Studio docs](https://docs.langchain.com/langsmith/studio) |
| Langfuse（37.3k★）/ AgentOps（6.0k★）/ Phoenix（12.3k★）/ OpenLLMetry（7.5k★） | trace 树、按 session/user 分组、标签过滤、评分与数据集、成本统计 | **按 session 分组的树形聚合 + 标签过滤**；"按成本/时间排序" | [Langfuse](https://github.com/langfuse/langfuse) / [AgentOps](https://github.com/AgentOps-AI/agentops) / [Phoenix](https://github.com/Arize-ai/phoenix) / [OpenLLMetry](https://github.com/traceloop/openllmetry) |
| Cline（71.5k★） | Checkpoints：回滚代码但保留对话；任务列表 + diff 视图 | 版本快照 + 回滚语义；"保留对话"的取舍 | [Checkpoints](https://docs.cline.bot/core-workflows/checkpoints) |
| Aider（50.1k★） | 每次 AI 改动自动 git commit，`/diff` 查看 | 产物与 commit 绑定，版本天然可追 | [GitHub](https://github.com/Aider-AI/aider) |
| claude-squad（8.8k★） | tmux 管理多个终端 agent 会话，快速切换 | 多会话切换器（列表 + 状态） | [GitHub](https://github.com/smtg-ai/claude-squad) |
| claude-directory-tree（npm） | 跨项目浏览 Claude Code 产物 | 直接对标"产物总库"这一需求 | [npm](https://www.npmjs.com/package/claude-directory-tree) |
| 看板实现参考：Planka（12.7k★）/ Wekan（21.2k★）/ react-trello（2.3k★） | 自托管看板、可嵌入 React 看板组件 | 若要自研看板，先看 react-trello 的交互 | [Planka](https://github.com/plankanban/planka) / [Wekan](https://github.com/wekan/wekan) / [react-trello](https://github.com/rcdexta/react-trello) |
| 多窗口/预览基础设施 | Electron（123.9k★）/ Tauri（112.8k★）；Document Picture-in-Picture API；react-markdown（15.9k★）、shiki（13.9k★）、pdf.js（54.1k★） | 浮动面板用 Document PiP（Chrome only）；预览复用现成组件 | [Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) / [react-markdown](https://github.com/remarkjs/react-markdown) / [shiki](https://github.com/shikijs/shiki) |

---

## 2. 功能并入清单（按主题）

评估口径：
- **价值**：对老板痛点（产物被覆盖、会话多、多 subagent、找不到）的缓解程度。
- **可行性**：基于当前插件已用到的 hook（`conversation.view`、`sidebar.right.pane.tab`、`settings.section`、`ctx.sidebarRight.openTab/openResource`、`fileAddress()` 资源协议、会话事件流）判断。
- **成本**：低 ≈ 1 天内；中 ≈ 2–4 天；高 ≈ 1 周以上或依赖宿主改造。

### A. 多 subagent / 多会话

| 功能 | 价值 | 可行性 | 成本 |
|---|---|---|---|
| A1 跨会话产物总库（全局页 + 按会话分组 + 分页/LRU） | 高：从"当前会话"升级为"所有会话的产物都能找回"，正打痛点 | 高：会话列表 + 事件回放已具备；需解决性能 | 中 |
| A2 按父会话/子代理分组（子代理产物折叠到父任务下） | 高：多 subagent 场景下知道"谁产出的" | 中：取决于事件流是否带 agent/child session 标识，需先验证 schema | 中 |
| A3 并行进度（每个子代理一条进度条 + 完成态） | 中高：并行时不用来回切会话 | 中：需消费 team/task 事件；无事件则只能显示"最后活动时间" | 中 |
| A4 子代理结果汇总卡（N 个子代理 → 一张对比表） | 中：收官时一屏看全 | 中：结构化提取依赖回复格式约定（可用标题/列表启发式） | 中 |
| A5 完成提醒（会话/子代理跑完弹通知或角标） | 中：减少轮询 | 中：宿主通知 API 未知；可先做页签角标 | 低中 |

### B. 按任务分类（goal / 任务板 / 时间线）

| 功能 | 价值 | 可行性 | 成本 |
|---|---|---|---|
| B1 按 goal / 任务分组产物（产物挂到任务卡） | 高：从"第 N 轮"升级为"哪个任务"，符合老板心智 | 中：DSH 任务板 hook 若可读则高；否则先用首条用户消息/标题聚类 | 中 |
| B2 看板视图（待办/进行中/已完成三列） | 中高：一眼看任务与产物分布 | 中：纯前端可做；拖拽改状态需写权限，建议只读 | 中 |
| B3 标签（tag）+ 自定义分组 | 中：手动整理，成本低 | 高：本地状态即可 | 低 |
| B4 时间线视图（按时间轴铺产物，跨轮跨会话） | 中：适合"今天产出了什么" | 高：事件自带 ts | 低中 |
| B5 产物 pin 到对话 / 点击跳回原轮次 | 中高：找回上下文最直接 | 中：需要会话滚动定位 API | 中 |

### C. 多窗口 / 对比

| 功能 | 价值 | 可行性 | 成本 |
|---|---|---|---|
| C1 新窗口/新页签打开单个产物（独立浏览） | 中：边聊边看 | 中：`openResource` 已存在，可复用；真正"新浏览器窗口"需宿主路由支持 | 中 |
| C2 右栏浮动/固定面板 | 中：已有右栏 tab，增强为可拖宽/浮动 | 中：右栏已具备，浮动需 Document PiP（Chrome only） | 中 |
| C3 并排对比（两个产物/两版本文档 diff） | 中高：版本对比刚需 | 中：前端双栏 + 复用 documentpreview；diff 需文本 diff 库 | 中 |
| C4 多窗口独立会话（一个窗口盯一个子代理） | 低中：DSH 是 Web GUI，多开页面会重复加载 | 低：需要宿主支持按 sessionId 路由 | 高 |

### D. 其他（检索/整理/分享/导出）

| 功能 | 价值 | 可行性 | 成本 |
|---|---|---|---|
| D1 全文搜索（md 正文，限 64KB）+ 路径/标题搜索 | 中高 | 高：读文件内容即可 | 低中 |
| D2 收藏/隐藏持久化（settings store） | 中：刷新不丢 | 高：`settings.section` 已有 | 低 |
| D3 画廊/缩略图视图（图片网格、md 首图） | 中：视觉检索快 | 高：懒加载 + 缩略图 | 低中 |
| D4 导出增强（zip + manifest + 复制 markdown 链接） | 中：交付/归档 | 高：v1 已有导出，扩展格式即可 | 低 |
| D5 分享只读快照链接 | 低中：单人本机价值有限 | 低：需服务端快照与鉴权 | 高 |
| D6 同一文件版本时间线 + 版本对比 | 高：解决"同一个 md 改了三版" | 中：无 mtime，只能按轮次；内容需从 write 事件或 git 取 | 中高 |
| D7 权限/可见性（隐藏敏感文件） | 低中 | 高：本地视图层过滤 | 低 |

---

## 3. 最值得并进的 8 个（排序）

1. **跨会话产物总库（A1）** — 老板痛点"对话一多产物被覆盖"的根因在会话隔离，只做当前会话治不了本。
2. **产物挂任务 / goal 分组（B1）** — 业界（Vibe Kanban、Nimbalyst）一致把"任务"当产物的一级归属，比"轮次"更符合人的记忆。
3. **子代理分组 + 结果汇总（A2/A4）** — 多 subagent 是当前工作方式，产物必须能回答"哪个代理产出的"。
4. **同一文件版本时间线 + 双栏对比（D6/C3）** — 多次写入同一 md 是高频场景，现在只能看到并列条目。
5. **搜索 + 收藏持久化（D1/D2）** — 成本最低、体感最强的一档；收藏跨刷新保留。
6. **画廊/缩略图视图（D3）** — 图片与文档一屏扫，比列表快。
7. **产物 pin + 跳回原轮次（B5）** — 找回上下文，闭合"看到产物→回到当时对话"的环路。
8. **新窗口/右栏独立打开 + 分享导出（C1/D4）** — 体验加成，放最后；分享在单人本机降级为"导出 + 复制链接"。

---

## 4. 不建议做

| 不做 | 理由 |
|---|---|
| 产物编辑器 / WYSIWYG / Excalidraw 画布（Nimbalyst 级） | 与"只读索引"定位冲突，工作量数倍于整个面板；DSH 已有文档预览与外部编辑器 |
| 实时多人协作 / 云端分享链接 / 权限 ACL | 老板单人本机；需要服务端、鉴权、隐私设计，收益接近 0 |
| 全链路 trace 观测（Langfuse/AgentOps 式） | DSH 已有 Trajectory 页签，重复建设；面板应做"产物"不做"调用链" |
| Agent 自动生成 dashboard/canvas（Cursor Canvases 的生成侧） | 需要渲染沙箱与组件库，且会把"索引"变成"生成器"，范围失控 |
| 独立 Electron/Tauri 桌面壳做多窗口 | GUI 已是 Web，另起壳成本极高、维护双份 |
| 自研看板拖拽改状态 | 写操作会碰任务板真实状态，只读展示即可，避免误改 |

---

## 5. 建议实现顺序

1. **v1.5 跨会话总库**：会话列表 → 按会话分组 → 懒加载/分页 + LRU；收藏/隐藏落 settings store（`settings.section` 复用）。验收：切 3 个会话能找回旧产物，刷新后收藏仍在。
2. **子代理归属**：先验证事件 schema 是否含 child session / agent id（这是 A2/A3/A4 的前置门槛），能识别则加"父会话 → 子代理"折叠分组与结果汇总；不能识别则退化为"按轮次 + 手动标签"。
3. **任务/Goal 分组**：读 DSH 任务板数据挂接产物；无 API 时用首条用户消息标题聚类 + 手动标签兜底。
4. **版本时间线 + 双栏 diff**：同一路径多条目聚合为一条"版本线"，展开看各轮 diff（文本 diff 库 + 现有 documentpreview）。
5. **画廊 + pin + 导出**：缩略图网格、pin 到对话并跳回原轮次、导出 zip/manifest、复制 markdown 链接。

---

## 6. 来源清单

- Cursor：[Agents Window](https://cursor.com/docs/agent/agents-window)、[Canvases](https://cursor.com/docs/agent/tools/canvas)、[Canvas blog](https://cursor.com/blog/canvas)
- Claude：[Artifacts 帮助](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- OpenHands：[Key Features](https://docs.openhands.dev/openhands/usage/key-features)、[GitHub](https://github.com/OpenHands/OpenHands)
- Nimbalyst：[Features](https://nimbalyst.com/features/)、[GitHub](https://github.com/Nimbalyst/nimbalyst)
- Vibe Kanban：[README](https://github.com/BloopAI/vibe-kanban)
- AutoGen Studio：[文档](https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/index.html)
- LangSmith Studio：[文档](https://docs.langchain.com/langsmith/studio)
- 可观测性：[Langfuse](https://github.com/langfuse/langfuse)、[AgentOps](https://github.com/AgentOps-AI/agentops)、[Phoenix](https://github.com/Arize-ai/phoenix)、[OpenLLMetry](https://github.com/traceloop/openllmetry)
- Cline：[Checkpoints](https://docs.cline.bot/core-workflows/checkpoints)
- Devin：[Session tools](https://docs.devin.ai/zh/work-with-devin/devin-session-tools)
- 组件：[react-markdown](https://github.com/remarkjs/react-markdown)、[shiki](https://github.com/shikijs/shiki)、[pdf.js](https://github.com/mozilla/pdf.js)、[react-trello](https://github.com/rcdexta/react-trello)、[Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)
- 星数：GitHub REST API `/repos/{owner}/{repo}`，2026-11-12 取数

> 备注：本文件中所有 star 数为调研当日 GitHub API 返回值，仅用于量级比较；产品功能以官方文档为准，未在本机复现。

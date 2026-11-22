# 多窗口 / 多面板 / 交互形态 调研（只读）

> 调研对象：DSH 桌面端（Electron 44.7.0 / Chromium 140+）+ Web 前端；产物面板（`conversation.view`「产物」页签）已上线，右栏 tab 在 v2a。
> 结论日期：2026-11-12。证据取自安装包 `app.asar` 内 `@deepseek-ai/*` 的 README 与打包产物（下称 `<pkg>`，均为 `dsh/node_modules/@deepseek-ai/<pkg>/…`），只读，未改 profile。

---

## 0. 结论（三个最值的形态升级，按性价比排序）

1. **右栏「浮出 / 全屏 / 双格对照」三个动作**（纯调用 `ctx.sidebarRight.float / toggleFullscreen / split`）——零新基础设施，半天到一天，直接给老板「边聊边看 + 随时变大 + 两块并排」。
2. **跨会话产物对照（单 tab 内双栏）**——右栏一个停靠面只属于「当前会话」，所以「并排两个会话」只能在一个 tab 内部做（`ctx.sessions.retain` 拉另一会话历史）。成本中，价值最高（多子代理产出场景）。
3. **迷你悬浮球 / 常驻小条**（`shell.overlay` + 快捷键 + tab 右键菜单）——满足「不占地方但一直在」的诉求；成本低，但要做层级/遮挡与关闭清理。

**明确不做**：新 BrowserWindow（DSH 无 API、无 IPC，`window.open` 被主进程一律 deny）。**可选实验**：`documentPictureInPicture`（Chromium 原生画中画，Electron 44 应该有，需 5 分钟实测），拿到的是 OS 级置顶小窗，但样式/交互/React 移植成本高，不建议进 v2。

---

## 1. 现有能力盘点

| 能力 | 有无 | API / 入口 | 限制 |
|---|---|---|---|
| 主窗口 | 有，**只有一个** | `lib/main.js`：`mainWindow ?? createMainWindow()`（≈21104/21348） | 单实例锁 `requestSingleInstanceLock`（15227），第二个实例只 `focusOwner`（15231） |
| 多窗口 | **无** | 无 IPC、无命令、无菜单项 | `setWindowOpenHandler` 对一切 `window.open` 返回 `{action:'deny'}`，http(s) 转系统浏览器（20138–20140） |
| OS 级浮窗 / 置顶 | **无** | 全文无 `alwaysOnTop`（0 处） | 浮动面板是应用内 DOM，不是原生窗口 |
| 应用内浮窗（float） | 有，**可多个** | `ctx.sidebarRight.float(tabId, rect?)`；`openResource(..., {destination:'float'})` | **每个浮窗只装 1 个 tab**（zod 校验：`host==='float'` 时 `tabs.length===1`）；矩形随布局持久化；新浮窗为级联位；只有前台会话的浮窗渲染 |
| 右栏分格（split） | 有，**上限 2 格** | `split(paneId?) → paneId \| undefined` | 默认均分、分隔条 20%–80%；宽度不足或已 2 格时拒绝并返回 `undefined`（不记历史）；触屏隐藏禁用按钮 |
| 全屏面板 | 有 | `toggleFullscreen(target)`；`ctx.layout.openRightbar(track, fullscreen)` | 共用同一棵内容树，不重挂载；窗口 <768px 打开右栏自动全屏；Windows 有标题栏避让 |
| 全局浮层 | 有 | `shell.overlay`（root 级 slot，覆盖整个 frame） | 官方 toast/欠费提示/文件拖拽失败都挂这里；插件注册条目即可，不需要碰 body |
| 全局页面 | 有 | `ctx.layout.selectPanel(id)` + `main` keyed slot；`null`=会话界面 | 与「顶部页签」是两套（顶部是 `conversation.view`） |
| 顶部页签 | 已有（产物 v1） | `conversation.view` | —— |
| 右栏 tab | 有 | `ctx.sidebarRightTabs.register({id,kind,patterns?,priority?,canOpen?,title,guide?,keepMounted?})` + `ctx.slots.register('sidebar.right.pane.tab',{key:id})` | 同一个 kind 最多 1 个 builtin + 1 个 extension；id 必须全局唯一；`keepMounted:true` 可保活正文 |
| 画中画 / PiP | **无官方能力** | 仅浏览器原生 `documentPictureInPicture` 可试（同源、需要用户手势、样式要手工搬） | 未在 DSH 代码中出现；Electron 44 大概率支持，需实测 |
| 会话 header 控件 | 有 | `conversation.session.header.corner`（右栏展开钮）/ `...header.utilities` | 插件可加按钮，但 corner 已被右栏占用 |
| 第二窗口（浏览器） | 手工可行 | 用 `dsh web` 打印的 `?token=` URL 在浏览器打开一次 → 写 host-only 签名 cookie（默认 30 天），之后同源新标签自动带 cookie | 插件无法程序化打开；Electron 内不行；会话/布局共享但各窗口独立连接 |

---

## 2. 产物面板可用的形态（可行性 / 成本 / 风险）

| 方案 | 可行性 | 成本 | 风险 |
|---|---|---|---|
| ① 顶部 `conversation.view` 页签（已有） | ✅ | 已完成 | 整页切换会离开对话 |
| ② 右栏 tab（v2a 在做） | ✅ | 低 | 宽度只有视口 45%（上限 70%），内容要自适应窄栏 |
| ③ 浮窗 `float` | ✅ | **很低**（已有 tab，加一个「浮出」动作 = `float(tab.id)`） | 每浮窗 1 tab；只能前台会话；小窗里表格要横向滚 |
| ④ 全屏 `toggleFullscreen` | ✅ | **很低**（一个动作 + 快捷键） | 全屏时右栏把手隐藏；要在 <768px 下测 |
| ⑤ 第二窗口 / 新 BrowserWindow | ❌ | —— | 无 API；`window.open` 被拒；沙箱化插件拿不到 Electron |
| ⑥ `shell.overlay` 悬浮球 / 迷你条 | ✅ | 中（自绘定位、层级、拖动、z-index、关闭清理） | 与菜单/弹窗层级冲突（右栏内容树层级固定，浮窗不会抬到菜单之上）；要自己处理遮挡 |
| ⑦ 文档画中画 `documentPictureInPicture` | ⚠️ 待实测 | 中高 | 需用户手势；跨文档样式要复制；Electron/DSH 无先例；不建议 v2 |

> 结论：③④ 是「多窗口」诉求的真正落点（应用内多浮窗 + 全屏工作台），⑤ 不可做，⑦ 仅作后备实验。

---

## 3. 多窗口 / 多任务方案

### 3.1 硬事实
- 右栏是**每会话一个停靠面**（`SurfaceState` per sessionId），tab 属于「屏幕上的会话」。所以右栏两格 ≠ 两个会话，而是同一个会话的两个 tab。
- 打开另一个会话：`ctx.sessions.retain(target, {source})` 拿 `SessionEventStream`（支持 `loadOlder()` / `loadThrough(seq)`），可以先只读历史、不激活 Agent。产物聚合可复用这条流。

### 3.2 「并排看两个会话的产物」推荐做法
- 一个 tab 内做 **双栏对照**：左栏当前会话（已有 store），右栏按 sessionId 显式 retain 的对端会话；首屏只拉最近 N 条事件，滚动再 `loadOlder`；每栏独立筛选、独立滚动。
- 记忆对照目标：`localStorage['dsh.artifacts.compare.v1']`（`{hostSessionId, peerSessionId}`），刷新后恢复。
- 不做「两格各一个会话」：右栏 API 语义不允许，且 `mounted` 只反映屏幕会话。

### 3.3 「新窗口常驻产物列表」
- 桌面端：**只能浮窗**（③）。建议提供「浮出为常驻小窗」按钮，浮窗保持在前台会话上方，切会话不消失的前提是它属于前台会话（切到别的会话时浮窗不渲染——这是硬限制，要告知老板）。
- 若老板愿意开浏览器窗口：提供「复制带 token 的访问地址」不可行（token 只在 `dsh web` 启动时打印，客户端拿不到）；可行的是主机侧一次性执行 `dsh web` 并在浏览器打开，之后同源新窗口免 token（cookie 30 天）。这属于运维动作，不写进插件。

### 3.4 跨窗口同步
- DSH 既有先例：右栏布局写 `localStorage['dsh.sidebar-right.v1.<sessionId>']`，同源窗口共享「最后保存的布局」，但**当前窗口的成员关系不被别人的写入覆盖**；快捷键偏好 `dsh.keybindings.v1` 监听 `storage` 事件。
- 建议：单写者 + 版本号。`localStorage['dsh.artifacts.v2'] = {rev, updatedAt, pins:{...}}`，写前比对 rev，冲突时 last-write-wins 并保留对方未冲突字段（与 sidebar-right 同款合并策略）。
- 同源多标签的即时性用 `BroadcastChannel('dsh-artifacts')`（Chromium 支持；DSH 核心未用，属新增但零风险）；`storage` 事件作为兜底（Safari/隐身模式差异）。
- **不要**同步瞬时 UI（当前选中项、滚动位置、悬停），只同步「收藏 / 隐藏 / 对照目标 / 导出清单」。

---

## 4. 交互细节

### 4.1 快捷键
- 注册：`ctx.inject(['shortcuts'], ctx => ctx.effect(() => ctx.shortcuts.register({...})))`；字段：`id / label / aliases / defaults`（必须显式给 `desktop:macos|windows|linux` 与 `web:*`）/ `regions`（如 `['page','editable','terminal']`）/ `modals` / `resolve({target}) → {status:'handled',run} | {status:'blocked',reason}`。
- 只读展示行用 `registerFixed()`；冲突校验由服务做（重复 id、默认键重叠会报错）。
- 持久化：Web `dsh.keybindings.v1`，Desktop `userData/keybindings.json`；Desktop 走原生键盘桥（preload），模态层内默认不触发。
- 建议给产物加三个命令：`artifacts.toggle`（开关右栏浮窗）、`artifacts.fullscreen`、`artifacts.compare`。

### 4.2 右键菜单
- 数据式贡献：`ctx.effect(() => ctx.contextMenus.register({id,target,order,resolve}))`；`resolve` 返回本地化动作（含 `commandId` 可显示快捷键，但不会派发命令）。
- 右栏 tab 专属：Slot `sidebar.right.tab.menu.item`（list），排在布局动作（关闭/关闭其他/关闭右侧）之后。
- 自绘触发元素：`useContextMenu().getTriggerProps(target, handlers?)`。
- Toast：`ctx.contextMenus.notify(text, success, action?)`，支持文字动作 + `failureLabel`；也可在 `shell.overlay` 注册自己的常驻提示。

### 4.3 拖拽
- tab：dockkit 内建（拖到另一格=移动、拖出=浮窗、拖到边缘=分屏、拖入引导页=合并），无需插件实现。
- 文件拖出：`ctx.fileDrag.actions.prepare(source, signal)` → 桌面端可拖到 Finder/其他应用（原生交付最可靠），Web 端依赖 `DownloadURL`，**令牌不跨窗口/标签**。
- 产物条目做拖拽源时，用 `fileDrag` 而不是自造 `dataTransfer`，否则拿不到原生文件。

---

## 5. 导出 / 分享

| 能力 | 结论 |
|---|---|
| 另存为 | `ctx.fileActions.save(source, 'saveAs')`：Desktop 弹原生保存框并返回绝对路径（`cancelled \| requested \| saved+path`）；Web 只有浏览器下载（`canSaveAs=false`，调用会在读取源前拒绝） |
| 下载 | 同一 API；MIME/文件名规范化、图片复制为 PNG 走剪贴板 |
| Finder 显示 | 保存成功提示内置「在 Finder 显示」（复用 `session.openWorkspacePath`，无独立 reveal IPC）；条目定位用 `ui-open-in-app` |
| 会话导出 | `dsh-session-log-export` 已有「下载 JSON / 复制到剪贴板」+ `shell.overlay` 提示，可参考其写法 |
| zip 打包 | **无现成客户端能力**（fflate 只作为 session-log-export 的 Node 依赖存在）；要么自带 fflate，要么用 `CompressionStream('gzip')` 单文件，要么走 Host 侧脚本 |
| Live Share | `dsh-experimental-liveshare`：需自建服务端 + owner 身份 + profile patch，默认不启用；不适合本需求 |
| 跨窗口分享 | 无（`fileDrag` 令牌不跨窗口，剪贴板是唯一通用通道） |

---

## 6. 限制 Top 5

1. **单窗口是硬边界**：无 BrowserWindow API、无 IPC、`window.open` 一律 deny；插件在渲染进程且 `sandbox:true / contextIsolation:true / nodeIntegration:false`，拿不到 Electron。
2. **`dshDesktop` 是内部桥**：仅 `dsh-app://app` 主 frame 注入，暴露 `fileActions / fileDrag / shortcuts / deviceInfo / browser / updates / keyboard.closeWindow`，**没有任何开窗能力**；插件依赖它属于越界使用，建议只走公开 Client 服务。
3. **右栏每会话一个面 + 最多 2 格 + 浮窗 1 tab**：决定「并排两会话」只能在一个 tab 内实现；浮窗只在所属会话前台时渲染。
4. **插件不能碰 DOM 根**：只能注册 slot / 服务；`document.body.appendChild` 这类做法会破坏 shell 的层级、主题变量与清理，禁止。
5. **鉴权是 cookie 不是 token 传递**：`dsh` 启动令牌只在 `GET /` 换 host-only、HttpOnly、SameSite=Strict 的签名 cookie（30 天，绑 hostname+port）；`Host` 必须是 loopback/绑定 IP，`Origin` 必须同 authority，否则 403/401。任何「让外部窗口访问 127.0.0.1:51732」的方案都要先过这道门。

---

## 7. 实施顺序（3 步）

1. **右栏三动作**（1 天，零风险）：在产物 tab 标题栏/工具栏加「浮出」「全屏」「与当前格分栏」；`float(tab.id)` / `toggleFullscreen()` / `split()`，失败时给可用性提示（`undefined` 表示空间不足）。补 3 个快捷键 + tab 右键菜单项。
2. **跨会话对照模式**（2–4 天）：一个 tab 内双栏；`sessions.retain` + 事件流分页（首屏 ≤200 条，滚动 `loadOlder`）；对照目标存 `dsh.artifacts.compare.v1`；给 LRU/上限，避免多会话内存膨胀。
3. **迷你悬浮球 + 导出收敛**（1–2 天）：`shell.overlay` 里的小条/圆球（可折叠、显示未读产物数、点击展开浮窗）；导出统一到 `fileActions.save`（Desktop 另存为 + 粘贴路径），补 `contextMenus.notify` 反馈。

---

## 8. 证据索引

- 单窗口 / 单实例：`lib/main.js` 21104、21348、15227、15231
- window.open 拒绝：`lib/main.js` 20138–20140（另有 16662、17918、18277、18567、19716）
- 无 alwaysOnTop：`lib/main.js` 全文 0 处
- 右栏两格/浮窗单 tab/矩形/级联/上限：`dsh-client-ui-sidebar-right/README.zh.md`（状态、Tab 域、引导页）；zod 校验在 `lib/client.js` ≈37479
- 布局持久化与多窗口合并：同 README「状态」节（`dsh.sidebar-right.v1.<sessionId>`）
- tab 类型注册与正文：同 README「扩展席位」节
- 全屏与 `openRightbar(track, fullscreen)`：`dsh-client-ui-layout/README.zh.md`
- `shell.overlay` / `shell.bottom` / `selectPanel`：同上；官方用例见 `dsh-client-ui-file-drag`、`dsh-client-ui-settings-account`、`dsh-session-log-export`
- 快捷键签名与平台默认：`dsh-client-shortcuts/README.zh.md`；实例 `dsh-client-ui-sidebar-files/lib/client.js` ≈88290
- 右键菜单 + toast：`dsh-client-ui-context-menu/README.zh.md`
- 文件拖拽：`dsh-client-ui-file-drag/README.zh.md`
- 保存/另存为：`dsh-client-ui-file-actions/README.zh.md`；IPC `desktop:file-save` 见 `lib/main.js` 1442、`lib/preload-app.cjs` 1878
- 跨会话读历史：`dsh-api-session-controller/README.zh.md` 84（`sessions.retain / using`）与 58（`SessionEventStream`）
- 鉴权与 cookie：`dsh-client-connection/README.zh.md` 41–51
- Electron 44.7.0：`Contents/Frameworks/Electron Framework.framework` Info.plist
- 沙箱/协议：`lib/main.js` 20048（`dsh-app` secure/standard）、20112（`sandbox:true`）

# 产物面板 v1 · 验证记录

日期：2026-11-12（Asia/Shanghai）
包：`@local/dsh-artifacts-panel` 0.1.0
位置：`plugins/dsh-artifacts-panel/`

## 1. 安装

`plugin_manager install_bundle`（target 为本包绝对路径）返回：

- `application: "applied"`，`warnings: []`，`version: "0.1.0"`
- 持久操作记录：`~/Library/Application Support/@deepseek-ai/dsh-desktop/plugin-operations/operations.jsonl`
  最新一条 `reason:"install"`、`stage:"enable"`、`phase:"settled"`、`application:"applied"`、`changed:true`
- `plugin_manager list_plugins`：`include:dsh-artifacts-panel` / `@local/dsh-artifacts-panel` / `enabled:true` / `fiberPhase:"active"`
- `plugin_manager list_bundles`：`@local/dsh-artifacts-panel`，`enabled:true`，`installed:true`，`removable:true`
- `cordis_inspect_query` Host `Config.listConfigs` name=本包：返回 `include:dsh-artifacts-panel`，`status:"absent"`（本包没有 Config，符合预期）

## 2. Client 模块是否进入实时 client-module 图

本机页面无法用 headless Chrome 打开（`http://127.0.0.1:51732` 裸地址 401，本会话拿不到带 token 的 URL），
因此用 Host 的 `/plugins` 路由做了权威侧证。

client-modules 的单个包 bundle 地址为：

```
/plugins/??@local/dsh-artifacts-panel/client.js&rev=<artifactRevision>
```

其中 `artifactRevision` 由 `client.js` 的 `mtimeMs`、`ctimeMs`、`size` 经
`sha1("plugin-artifact" + 长度前缀字段)` 取前 12 位得到（读取自 `@deepseek-ai/dsh-client-modules` 源码）。

- 安装后计算 rev 并请求：`HTTP 200`，body 50037+ 字节，内容为
  `window.__ModuleLoader__.load({ id: "@local/dsh-artifacts-panel", ...`，即当前 `client.js` 原文。
- 修改 `client.js` 后重新计算 rev 再请求：`HTTP 200`，新 rev 命中，body 中含新文案
  `本轮未正常结束`，说明 HMR 已重建该包的 client bundle 并发布新 rev。

结论：client-module registry 的表里有本包，且正在提供当前代码。页面侧工厂加载所需的前置条件成立。

## 3. Slot 注册（Client Inspect 不可用）

按要求尝试：

```
cordis_inspect_query platform=client provider=Slots method=listSubTree root=conversation.view
```

结果：`Client inspect query ... timed out after 10000ms`。
同一时段内 `Builtin.listBuiltins`、`Service.listService`、`Theme.listTokens` 也全部同样超时，
说明是当前环境的 Client Inspect 桥不可用（Desktop 页面未响应 inspect），不是本插件单点报错。
因此 **occupants 级验证未能取得**，此处如实记录。

替代验证：静态 harness（第 4 节）会用真实 `client.js` 走一遍模块工厂与 `apply()`，
断言 `conversation.view` 的 `id:"artifacts"`、`order:45`、`locale:"artifacts"`、
`label()` 返回「产物」、`inject(sessionId)` 给出 `loadArtifacts/openArtifact`。

## 4. 静态渲染 harness

脚本：`tools/render-harness.cjs`（可重复运行）

```bash
cd plugins/dsh-artifacts-panel
node tools/render-harness.cjs            # sample：两轮、回复、文档/图片/文件卡片
HARNESS_DATA=empty node tools/render-harness.cjs   # 空态
```

两次均 `exit 0`、`failures: []`。断言覆盖：

- 模块 id 等于包名 `@local/dsh-artifacts-panel`
- 工厂返回 `{ inject, apply }`，`inject` 含 `slots/locale/sessions/remote/remote.session/sidebarRight`
- locale 注册命名空间 `artifacts`，含 zh/en
- slot 注册：`conversation.view` / id `artifacts` / order 45 / label「产物」
- 组件可渲染：标题、筛选（全部/文档/图片/文件）、搜索框、刷新、导出清单
- sample 态：第 1/2 轮、最终回复、`report.md` 全路径、`chart.png`、`data.xlsx`、显式交付标签、异常轮标签
- empty 态：空态标题

## 5. 数据层

从真实事件折出（源码核对过字段）：

- `turn/start` / `turn/end` → 轮次与时间、`reason.kind`
- `assistant/message` → `data.message.content` 中 `type:"text"` 的块，取该轮最后一条非空正文
- `deliverables/presented` → `data.files[].path/description`（显式交付）
- `tool/call` + 成功 `tool/result` → `write`/`edit`/`str_replace_editor` 的路径；绝对路径优先
  `data.meta.path`，否则用调用参数并按 cwd 补全
- 按绝对路径去重；过滤 `/tmp`、`/var/folders`、`.git`、`node_modules`、`dist/build/.next`、隐藏文件、`*.log`
- 分类：md/txt/json/yaml/csv…→文档；png/jpg/webp/gif/svg…→图片；其余→文件
- `remote.session.events({ address:{kind:"session",sessionId}, maxMessages, turnWindow })` 首次取 400 条 /
  至少 20 轮；之后每 5 秒增量取 30 条按 seq 合并；手动刷新重建；组件卸载清 interval 并 abort

数据层未能在真实页面上跑通（受第 3 节限制），首次打开若接口形态有偏差会显示错误态与「重试」，
不会让 slot 条目崩成空白。

## 6. 未验证 / 已知限制

- 未亲眼看到「产物」页签（Client Inspect 全挂、401、整屏截图返回黑屏，均属环境限制）
- 未验证真实会话数据、右侧栏预览打开、下载链接在 Desktop 协议下的行为
- 未做 Finder 打开（需要 Host 桌面动作），v1 用「预览 + 复制路径 + 下载 + 导出清单」
- 未做右侧栏 tab（v2）
- 只索引当前会话；结构上用 `sessionId` 注入，留给跨会话索引

## 7. 停用 / 回滚

停用（保留安装）：

```
plugin_manager action:"set_plugin" target:"include:dsh-artifacts-panel" enabled:false
```

卸载：

```
plugin_manager action:"remove_bundle" target:"@local/dsh-artifacts-panel"
```

卸载会移除 profile 里的 link 依赖与 bundle 选择；源码目录
`plugins/dsh-artifacts-panel/` 不会被删除。
手工兜底（仅在 plugin_manager 不可用时）：删除
`~/.dsh/profiles/desktop/node_modules/@local/dsh-artifacts-panel` 链接、从 profile `package.json`
依赖中去掉该包，并在 profile 目录执行 pnpm install —— 不建议绕过 plugin_manager。

---

# v1.1 验证记录（2026-11-12 下午）

老板已确认 v1 页签可见、能打开、按轮次列出。v1.1 在同一 `client.js` 上迭代：

## 1. 改动

- 设置存储：`settings store`（client.js 480 起），全局 key `dsh-artifacts-panel.settings.v1`，`getSettings/setSettings/subscribeSettings/useSettings`，改动即时广播；设置页与产物页同模块共享。
- 设置页：`SettingsPage`（1220 起），`settings.section` 注册（1358-1365，id `@local/dsh-artifacts-panel`、order 60、label「产物面板」）。
- 产物视图：`ArtifactsView`（733 起）接入 `useSettings`；字号/密度用根节点 inline `font-size` + CSS 变量；新增噪音过滤、默认 20 轮分页、`显示全部轮次`、设置齿轮（提示「设置 → 产物面板」，不做未验证的跳转）。
- 样式：CSS 624 起改为 `em` 相对字号，新增 `.ap-settings-*`；标题 1.3em（15px 时 19.5px）、轮次标题 .95em、回复 1em、卡片名 .95em。
- 现有功能（类型筛选/搜索/收藏/隐藏/导出/复制/下载/预览/空态/错误态）保留；设置与收藏/隐藏互不影响。

## 2. 默认值

| 项 | 默认 |
|---|---|
| 字号 | 15px（小 13 / 标准 15 / 大 17 / 特大 19） |
| 行距/密度 | 标准（紧凑 / 标准 / 宽松） |
| 每轮最终回复 | 开 |
| 文档 | 开 |
| 图片 | 开 |
| 其他文件 | 开 |
| 隐藏没有产物的轮次 | 开 |
| 隐藏短回复 | 开，阈值 30 字（0–200 可调；仅对无产物轮生效） |
| 忽略轮次关键词 | `总线无新消息,已处理到` |
| 分页 | 每页 20 轮（10 / 20 / 50 / 全部） |

## 3. 验证

- `node --check client.js` → exit 0；`node --input-type=module --check < index.js` → exit 0；三个 JSON 解析通过。
- `node tools/render-harness.cjs` → exit 0，`failures: []`；覆盖：
  - `conversation.view` id `artifacts` / order 45 / label「产物」；
  - `settings.section` id `@local/dsh-artifacts-panel` / order 60 / label「产物面板」；
  - 默认根字号 `15px`；设置页显示「标准 15」；
  - 26 个有产物轮 + 8 个总线噪音轮 + 1 个无产物短回复轮 + 1 个有产物短回复轮：
    默认输出 20 轮，总线轮/185-192 轮/第 30 轮全部不出现，第 31 轮（有产物、短回复）保留；
  - 统计为「26 轮 · 26 个产物」，底部出现「加载更早（还剩 6 轮）」；
  - 文档/图片/文件卡片默认都渲染；设置页字号、密度、收录、噪音、分页、恢复默认全部可见。
- 实时 client bundle：按当前 `client.js` 的 mtime/ctime/size 计算 rev，请求
  `/plugins/??@local/dsh-artifacts-panel/client.js&rev=…` → `HTTP 200`，body 含
  `settings.section`、`ap-settings-title`、`pagination.loadOlder` 等新代码；`node --check` 通过。
  说明 HMR 已重建并对外提供 v1.1 代码。
- Client Inspect：`Slots.listSubTree` 的 `settings.section` 与 `conversation.view` 各查询两次，
  均 10s 超时（同 v1，环境级桥不可用）→ **occupants 未取得**，如实记录。

## 4. 限制 / 未做

- 设置齿轮不跳转设置页（未确认可靠 API），只弹「设置 → 产物面板」提示；避免猜测 API 导致崩溃。
- 短回复过滤只作用于没有产物的轮次，避免隐藏有交付但回复很短的轮次。
- 「加载更早」只展开已折叠的轮次；更早历史仍受首次 `remote.session.events` 的 400 条窗口限制。
- 设置是全局的；收藏/隐藏仍按会话存 localStorage。
- 页签与设置页的实际视觉仍未能亲验（Client Inspect 桥不可用；401/黑屏限制同 v1）。

## 5. 回滚

不变：

```
plugin_manager action:"set_plugin" target:"include:dsh-artifacts-panel" enabled:false
plugin_manager action:"remove_bundle" target:"@local/dsh-artifacts-panel"
```

---

# v1.2 字号倍率（2026-11-12 下午）

## 改动

- 设置项 `fontSize`（绝对 px）改为 `fontScale`（相对宿主字号倍率，0.8–2.5，步进 0.1，默认 **1.5**）；旧 `fontSize` 迁移：13→1.0、15→1.5、17→1.75、19→2.0。
- 面板根节点 `font-size: calc(<scale> * 1em)`，继承宿主 root 字号；所有字号、行高、间距、卡片 padding/gap、按钮高度、图标尺寸改为 em（仅保留边框/阴影/focus ring 的 px）。
- 设置页：滑杆 + 档位 1.0/1.25/1.5/1.75/2.0/2.5；显示「当前实际字号 ≈ Npx」（`documentElement` 字号 × 倍率，resize + 1s 刷新）；预览行按倍率缩放。
- 密度（紧凑/标准/宽松）的 line-height/padding/gap 改为 em，与倍率相乘。
- 侧栏（v2a 进行中）同一根节点、同一倍率，紧凑布局用 `.ap-page-sidebar`。

## 验证

- `node --check client.js` → exit 0。
- `node tools/render-harness.cjs` → exit 0、`failures: []`：
  默认根字号 `calc(1.5 * 1em)`；设置页「1.5×」「字号倍率」「当前实际字号 ≈ 24px」（harness 宿主 16px）、滑杆 min 0.8/max 2.5/step 0.1、6 个档位；原过滤/分页/卡片断言全部保持；侧栏注册与紧凑渲染断言通过。
- 实时 client bundle 按新文件 rev 请求返回 200（见 v2a 记录）；Client Inspect 仍超时（环境桥）。

## 限制

- 实际视觉未亲验；「实际字号」按 `documentElement` 字号计算，若宿主对面板父容器单独缩放会有少量偏差。

---

# v1.3 / v1.4 Host prompt 与开关（2026-11-12 下午）

## 改动

- `index.js`：
  - v1.3：`inject=['systemPrompt']`，`apply` 内 `ctx.effect(() => ctx.systemPrompt.section({name:'artifacts-panel-guidance', order:60, text:...}))`，文本 82 字，固定，不用 complete/waterfall。
  - v1.4：`export const Config = z.object({ promptGuidance: z.boolean().default(true) })`；`apply(ctx, config)` 仅在 `config.promptGuidance !== false` 时注册。
  - 依赖：`@deepseek-ai/schemastery ~3.19.0` 写入 `package.json`，本地 `node_modules` 已安装（3 包，292K），确保 Host 从插件目录解析。
- 配置文件与插件目录均在插件写域内；未改 profile 配置。

## 自测输出

```text
$ node --input-type=module --check < index.js
index ESM check OK
$ node --input-type=module -e '<mock ctx 两态 + Config.resolve>'
{"checks":{"inject":true,"schemaFlag":true,"schemaType":"object","resolvedDefault":true,"onRegisters":true,"offSkips":true,"missingDefaultsOn":true,"textStable":true,"noComplete":true},"resolved":{"promptGuidance":true},"textLength":82}
```

- `plugin_manager list_plugins`：`include:dsh-artifacts-panel` 仍 `enabled:true`、`fiberPhase:"active"`。
- `cordis_inspect_query` Host `Config.listConfigs` name=本包：仍返回 `status:"absent"`（Host 进程尚未重新导入 index.js）。
- 结论：v1.3/v1.4 Host 代码**需下次正常启动生效**（未热重载，未重启 DSH）；届时 Config 的 `promptGuidance` 默认 true，可在插件配置中一键关。Client 注册不受影响。

# v2a 右侧栏产物 tab（2026-11-12 下午）

## 改动

- `client.js`：
  - 新增 `SIDEBAR_TAB_ID='@local/dsh-artifacts-panel/sidebar'`、`SIDEBAR_KIND='artifacts'`。
  - `ctx.sidebarRightTabs.register({id, kind, title, guide:[{id,title,description}]})`，包在 `ctx.effect`。
  - `sidebar.right.pane.tab` body：key=`SIDEBAR_TAB_ID`，`inject` 复用 `makeSessionInjection(sessionId)`（events 拉取、fold、cwd、预览地址同一份）。
  - `SidebarArtifacts`：用框架注入的 `useTabInfo()` 取 `{tab,panel}`；预览走 `tab.actions.openResource(...)`；把 `ArtifactsView` 以 `variant:'sidebar'` 渲染，零复制折叠/卡片逻辑。
  - Top 页签工具行加「在右侧栏打开」→ `ctx.sidebarRight.openTab('artifacts')`，异常 toast，不猜 API。
  - 侧栏紧凑 CSS `.ap-page-sidebar`（窄栏单列、单行标题、工具栏换行、字号/密度跟 v1.2 设置）。
  - 侧栏 tab 头部「⋮」菜单：`浮出为浮动面板`（`sidebarRight.float(tabId)`）、`全屏 / 退出全屏`（`toggleFullscreen(commandTarget(document.activeElement))`）、`分屏`（`sidebarRight.split(paneId)`）；动作失败/栏宽不足 toast。
- `tools/render-harness.cjs`：新增 sidebar 注册、紧凑渲染、同过滤、动作注入与调用断言。

## 自测输出

```text
$ node --check client.js
client node --check OK
$ node --input-type=module --check < index.js
index ESM check OK
$ node tools/render-harness.cjs
{"registrations":["conversation.view","sidebar.right.pane.tab","settings.section"],
 "defaultFont":"calc(1.5 * 1em)","fontScale":1.5,
 "checks":{"sidebarRegistered":true,"sidebarCompact":true,"sidebarContent":true,
           "sidebarNoSubtitle":true,"sidebarSameFiltering":true,"sidebarMenu":true,
           "sidebarActions":true},"failures":[]}
$ 计算当前 client.js rev 并请求 /plugins/??@local/dsh-artifacts-panel/client.js&rev=…
bundle HTTP 200 bytes=91354
grep ap-tabmenu/sidebarActions/fontScale → 31 处
served bundle check OK
```

- Client Inspect：`Slots.listSubTree` root `sidebar.right.pane.tab` 查询两次均 10s 超时；
  `conversation.view` 同刻也超时（环境桥不可用），**occupants 未取得**。
- 打包/安装：本包仍为 profile 的 link 安装，`plugin_manager` 未改动；client 变更已由 HMR 发布（bundle 200）。

## 限制

- 侧栏实际视觉、浮动/全屏/分屏的交互未亲验；全屏依赖 `commandTarget(document.activeElement)`（服务上的非公开方法，已做 typeof/异常保护），焦点不在 tab 内时会 toast。
- 未注册 tab 右键菜单项，动作放在 tab 头部「⋮」菜单（满足“右键/菜单”二者之一）；快捷键未加。
- 顶部页签与右侧栏同时打开时各自轮询一次（5s），代码复用但请求不共享；v2b 若做跨会话可统一缓存。
- v1.3/v1.4 Host 变更需下次正常启动生效；v2a Client 已通过 HMR 生效。

## 回滚

插件停用/卸载同前。额外：本包 `node_modules/`（仅为 Host Config 的 schemastery 依赖）随插件目录保留；彻底删除时移除整个
`plugins/dsh-artifacts-panel/` 即可。

# v3 维度分组 + 子代理卡片 + 测试补齐（2026-11-12 15:30）

## 改动

- `client.js`：
  - 产物页签/右栏头部新增「轮次 | 任务 | 运行」维度切换；`resolveDimension` 在 `auto` 时优先任务、其次运行、最后轮次，用户点选后本会话固定。
  - 维度为任务/运行时渲染 `buildGroups` 分组：组头含名称、状态徽标（`status.*` 文案 + `data-status` 配色）、负责人、成员数、产物数、任务组 `writeScopes` 简写（前 2 个 + 「还有 N 个」）；组内复用原产物卡片。
  - 未归属组固定最后，标题「未归属」+ 副标题「无法精确匹配到任务或运行的产物」。
  - 子代理卡片带「子代理 · 成员名」徽标与「打开子代理会话」下钻按钮（`ctx.uiWorkspace.openSession(childId)`，try/catch + 返回 false 时 toast）。
  - 懒加载：首屏不拉子会话；页面模式组默认展开但点「加载子代理产物（N）」或折叠后重新展开才 `loadChildArtifacts`；右栏窄栏组默认收起，点组头展开并拉取；加载中显示「正在读取子代理产物…」，失败显示失败文案。
  - 组分页：每页最多 30 组，超出显示「显示更多分组（还剩 N 组）」，避免一次渲染过多组。
  - 修复 v3 数据层遗留的两个未定义引用（`remainingTurns`、`shownFileCount`），否则首次渲染即 ReferenceError；统计改用 `stats.groups`（组数 · 产物数）。
  - `buildGroups`：仅有子代理产物、没有父轮次产物的任务/运行阶段组也会出现在结果中（带「加载子代理产物」入口），不再被丢弃。
  - `plugin.__testing = { foldSession, buildGroups, resolveDimension }` 以 `Object.defineProperty` 非枚举挂载，live loader 只读 `inject/apply`，不影响运行时契约。
- `tools/render-harness.cjs`：保留全部 v1/v2a 断言，新增长短三套 v3 fixture 与渲染断言。

## 自测输出

```text
$ node --check client.js
exit 0
$ node --input-type=module --check < index.js
exit 0
$ node tools/render-harness.cjs
exit 0，checks=74，failures=[]
  v3.folds: {"turns":2,"tasks":2,"members":1,"runs":1}
  v3.dimensions: {"turns":"turns","tasks":"tasks","runs":"runs"}
  v3.taskGroups: [{"key":"task:t-2","rows":1,"childIds":0},
                  {"key":"task:t-1","rows":2,"childIds":1},
                  {"key":"unassigned","rows":1,"childIds":0}]
  v3.runGroups: [{"key":"run:r-1:scan","rows":1,"members":["侦察"]},
                 {"key":"run:r-1:build","rows":1,"members":["施工"]}]
  v3.lazyChildCalls: ["m-1"]（首屏 0 次；点击「加载子代理产物」后 1 次）
```

断言覆盖：纯轮次会话 auto→turns、2 轮 2 产物；teammate+2 任务（最新 revision 生效）auto→tasks、owner/写域归属正确、未归属兜底出现、子代理徽标/下钻文案渲染；1 次 workflow（run-start + 2 agent 两阶段 + run-end）auto→runs、阶段/成员/产物归属正确；窄栏紧凑渲染只出组头且默认收起。另用 spy 断言首屏不调用 `loadChildArtifacts`、点击后才拉取，且只拉 owner 对应的子会话。

## live bundle / Client Inspect

- 无 token 直接请求 `http://127.0.0.1:51732/plugins/??@local/dsh-artifacts-panel/client.js` 返回 `HTTP 404`（本会话拿不到带鉴权的页面 URL，未尝试绕过鉴权）。
- 改为文件侧证：`client.js` size 131908，mtime `2026-11-12T15:31:41+0800`；HMR 的 `rev` 由 mtime/size 计算，页面刷新后会加载这份新 bundle。
- `cordis_inspect_query` Client `Slots.listSubTree` root `conversation.view` 连续两次 10s 超时，**occupants 未取得**（与 v2a 记录的环境桥问题一致），artifacts 是否 active 未能用 Inspect 复核。

## 限制

- 维度切换、组头布局、窄栏展开是静态渲染断言（fake React，不跑 effects），真实浏览器视觉与点击未亲验。
- `ctx.uiWorkspace.openSession` 的确切签名未从 Client Inspect 取得（超时）；当前按子会话 id 调用并 try/catch，工作区拒绝时只 toast，不崩面板。
- 任务/运行维度不做「组内产物」分页，只按 30 组/页截断；单个超大组仍会一次渲染全部卡片。
- 子代理产物归属：任务按 `ownerId`（取最新 revision），运行按阶段内 agent；同一子会话若跨阶段会在多个阶段组重复出现。
- 子会话运行中的刷新依赖 5s 轮询，且只对用户显式展开过的组生效；页面默认展开组需先点一次「加载子代理产物」。

## 回滚

仅 `client.js` 与 `tools/render-harness.cjs` 的改动；停用/卸载插件方式同 v1。

---

# 产物面板 v2b · 跨会话索引验证记录

日期：2026-11-12（Asia/Shanghai）
范围：`index.js`（Host）、`client.js`（Client）、`README.md`、`tools/clean-index.mjs`、`tools/validate-index.mjs`、`tools/test-v2b.mjs`、`tools/render-harness.cjs`

## 1. 数据边界自查

- 会话来源只有 `sessionPersistence` 服务（`list` / `open` / `read` / `close`），不直接打开 `~/.dsh` 下任何文件；未读取 Cursor / Grok agent 数据。
- `.index/` 只写：会话 id、绝对路径、轮次、来源、类型，可选 `size` / `sha`；不写回复正文、描述、文件内容或会话标题。
- 索引位置：`plugins/dsh-artifacts-panel/.index/`，不是同步目录。
- 排除规则含 `/tmp`、`/private/tmp`、`/var/folders`、隐藏文件名、`node_modules`、`.git`、`dist`、`build`、`.next`、`*.log`、`/.dsh/`、`/.index/`。

## 2. 索引样例与校验

用 mock 的 `sessionPersistence` 生成样例索引（`/tmp/dsh-artifacts-v2b-sample/.index`）：

```text
index.json:
{"v":1,"mode":"persistent","generatedAt":1794469590152,
 "totals":{"sessions":1,"files":1,"turns":1},
 "backfill":{"running":false,"done":1,"total":1,"finishedAt":1794469590152},
 "sessions":{"sample-session":{"t":1,"u":2000,"c":1,"n":2,
   "a":900,"upd":1794469590152,"w":"/tmp-workspace"}}}
sessions/sample-session.json:
{"v":1,"sid":"sample-session","rows":[["/tmp-workspace/report.md",1,"presented","doc"]]}
```

```text
$ node tools/validate-index.mjs /tmp/dsh-artifacts-v2b-sample/.index
status: valid
mode: persistent · sessions: 1 · rows: 1 · turns: 1
exit 0

$ node tools/validate-index.mjs
artifact index: .../plugins/dsh-artifacts-panel/.index
status: not initialized (no .index/index.json yet)
exit 0
```

`node tools/validate-index.mjs --self-test`：好样例 `ok=true`、坏样例 `ok=false`（相对路径被拒 + totals 不一致），exit 0。

## 3. Host 离线单测

```text
$ node tools/test-v2b.mjs
PASS fold adds presented/tool rows and ignores errors, exclusions and noise
PASS backfill indexes sessions in size order and resumes from the stored event count
PASS backfill skips out-of-range snapshots and isolates per-session read failures
PASS live turn/end uses the projection state and falls back without sessionProjections
PASS capacity trims oldest sessions and per-session rows, deleting evicted files
PASS validators accept good documents and reject broken ones

v2b host tests: 6 passed, 0 failed
exit 0
```

覆盖点：
- 实时增量：有 `sessionProjections` 时用 projection.stateOf(session)，没有时用 session/event 折叠兜底，均在 turn/end 落盘；
- 回填按 `sizeBytes` 升序；第二次运行只读新增尾段（`read.offset=2`），未变化会话不再 `open`；
- `formatStatus=migration-required` 与 `open` 抛错的会话被跳过且不影响其他会话；
- `maxSessions=2` / `maxRowsPerSession=2` 时最旧会话及文件被删，行被裁；
- `writeAtomic` 产物落盘后可被 `validate-index.mjs` 的全部交叉校验通过；
- 校验器拒绝 `v≠1`、非法 session id、负 totals、非法 mode、sid 不匹配、相对路径、非法 source、负 size、坏 sha。

## 4. Client 静态 harness（v1/v3 不回退 + v2b 新断言）

```text
$ node --check client.js
exit 0

$ node --input-type=module --check < index.js
exit 0

$ node tools/render-harness.cjs
exit 0，checks=86，failures=[]
```

v2b 断言（全部 true）：
- 顶部工具栏出现「本会话」「全部会话」；
- `normalizeIndexPayload` 解析好数据、拒绝 `v:2`；
- workspace→会话→子代理树：2 个 workspace、父会话下挂 1 个子代理、归档默认隐藏、勾选「含归档」后出现；
- 搜索 `report` 只剩命中父会话，搜索 `child` 保留父+子；
- 索引缺失渲染「索引准备中（需 DSH 下次启动生效）」+「重试读取」；
- 就绪渲染含 session 标签、workspace 路径、「含归档」「含子代理」开关；
- 设置页出现「跨会话索引」「启用『全部会话』视图」「最多 300 个会话」。

## 5. live Client bundle

按 `dsh-client-modules` 的 `framedHash("plugin-artifact", [mtimeMs, ctimeMs, size])` 计算 rev 后请求：

```text
$ curl .../plugins/??@local/dsh-artifacts-panel/client.js&rev=a8ef5ebceeb8
HTTP 200 bytes=178294
body 以 window.__ModuleLoader__.load({ id: "@local/dsh-artifacts-panel", ... 开头
body 含「全部会话」5 次
```

说明 HMR 已重建并发布当前 Client bundle。

## 6. 插件 / Slot 状态

```text
plugin_manager list_plugins:
include:dsh-artifacts-panel / @local/dsh-artifacts-panel / enabled:true / fiberPhase:"active"
```

`cordis_inspect_query platform=client provider=Slots method=listSubTree root=conversation.view`：连续两次 10s 超时（与 v1/v3 记录的环境桥问题一致），**occupants 未取得**；artifacts slot 的 active 状态以第 4 节静态 harness 的 `conversation.view id="artifacts" order=45` 断言 + 第 5 节 bundle 200 作为替代证据。

## 7. 降级行为

- 索引不存在 / 不可读：Client 显示「索引准备中（需 DSH 下次启动生效）」，可重试；「本会话」视图照常工作。
- `.index` 不可写：Host `mode=projection`（内存），日志记一条；已存在的索引若仍可读则继续展示，UI 显示「持久化降级」。
- `sessionProjections` 不可用：`session/event` 折叠兜底，索引仍可写。
- 索引损坏 / 版本不符：`index.json.bad.<ts>` 隔离后重建；单会话文件损坏同理并回退全量读该会话。
- 跨 workspace 读失败：`all.error` 状态 + 重试按钮；单个会话文件失败只影响该会话面板。

## 8. 卸载清理

```text
$ node tools/clean-index.mjs --dry-run
[dry-run] would remove .../.index (2 files, 370 bytes)
$ node tools/clean-index.mjs
removed artifact index: .../.index (2 files, 370 bytes)
exit 0
```

脚本只接受 basename 为 `.index` 的目标；不碰 `~/.dsh`、会话日志、投影缓存。

**projection 缓存残留**：host-only `artifactIndex` 单元可能被 DSH 写入自己的投影缓存（`~/.dsh` 下，插件不直接读写）。卸载后残留的是同样的引用行；DSH 重建缓存或重新注册单元时自动失效。`clean-index.mjs` 按云人约束不清理该缓存。

## 9. 限制

- Host 改动要 DSH 下次正常启动才生效；本次未重启 DSH，因此 `.index` 尚未生成，live 回填/实时增量未在真实 Host 上跑过（仅离线 mock + 静态断言）。
- Client Inspect 桥仍超时，Slot occupants 未取得。
- `sha` 当前只在事件 `meta`/`deliverables` 自带时记录，默认不回填阶段读文件。
- 回填断点以事件计数为锚，极窄的「call 已提交、result 未提交」崩溃窗口可能漏一条。
- 全量搜索最多懒加载 200 个会话文件（并发 3），超出部分不参与本次搜索。

---

# 第二批功能（A1/A2/A3/A4/D2）验证记录

日期：2026-11-12（Asia/Shanghai）
范围：仅 Client（`client.js`、`README.md`、`tools/render-harness.cjs`、新增 `tools/interactive-harness.cjs`）。`index.js` / Host / `.index` 未改动，无需重启 DSH。

## 1. 静态与语法

```text
$ node --check client.js
exit 0

$ node --input-type=module --check < index.js
exit 0

$ node tools/test-v2b.mjs
v2b host tests: 6 passed, 0 failed
exit 0

$ node tools/validate-index.mjs --self-test
good sample ok=true issues=[]
bad sample ok=false issues=[...]
exit 0
```

## 2. 静态 harness（v1/v3/v2b 不回退 + 第二批 23 条断言）

```text
$ node tools/render-harness.cjs
exit 0
checks=109
failures=[]
batch2={"checks":23,"overlaySlot":true,"galleryItems":2}
```

第二批断言（全部 true）：
- `changesReviewAddress('session-test',12,3)` → `dsh-resource://changes-review/session/session-test/12/3`；含空格/斜杠的 sessionId 按 `encodeURIComponent` 编码；
- `workspace/changes` 事件折叠进轮次 `changes[{seq,turn}]`；
- summary / full-markdown 路由形态：`api/changes.summary?sessionId=s-1&seq=9`、`api/session.markdown?sessionId=s-1`；
- 卡片 ⋯ 菜单能力门：满能力 = `reveal,open,copy,download,saveAs,changes`；无能力 = 仅 `copy`；
- 导出菜单：有 `sessionLogDownload` = `manifest,bundle,copyMarkdown`；无 = `manifest,degradedManifest` 且 `degraded=true`；
- 降级清单 `manifestText(...,{links,fileUrl})` 生成 `[文档 · a.md](api/file?path=%2Fws%2Fa.md)`；
- 顶栏同时存在「导出清单」「导出包」；卡片存在「更多操作」；无桌面能力时不出现「在 Finder 中显示」；
- 有 `changes-review` tab 类型且本轮有公告时渲染「看改动」，否则不渲染；
- `ImageGallery` 渲染「图片画廊 · 2」、缩略图 `api/file?path=...`；`GalleryLightbox` 渲染「2 / 2」与关闭；
- 设置页出现「视图与悬浮条」「图片默认视图」「列表/画廊」「显示产物悬浮条」；
- `shell.overlay` 注册 id=`@local/dsh-artifacts-panel/floating-bar`，inject 合同含 `useSelection/openPanel/loadCount`，首渲染含「产物」「关闭悬浮条」「打开产物面板」。

## 3. 点击路径交互 harness

```text
$ node tools/interactive-harness.cjs
card menu buttons: 3
menu items after open: [ '在 Finder 中显示', '用默认应用打开', '复制路径', '下载', '另存为…', '看改动' ]
opened resources: [{"address":"dsh-resource://changes-review/session/session-test/9/2","options":{"params":{"index":0}}}]
host calls: [["openPath",{"path":"/ws/out/b.png","action":"reveal"}]]
save calls: ["download"]
thumbs: 2 imgs: 2
lightbox caption: a.png · 2 / 2/ws/out/a.png
export items: 导出清单（Markdown） | 导出本会话产物包（ZIP） | 复制全文 Markdown
zip calls: [["zip","session-test"]]
clipboard writes: 1 "# full markdown"
open tabs: ["artifacts"]
INTERACTIVE_OK
exit 0

覆盖：卡片 ⋯ 菜单打开、summary 拉取后按文件匹配 index=0、`openResource` 深链参数、`openWorkspacePath({action:'reveal'})`、图片筛选→画廊→灯箱→关闭、导出菜单 ZIP、悬浮条点击 `sidebarRight.openTab('artifacts')`。

## 4. live Client bundle（HMR）

按 `dsh-client-modules` 的 `framedHash("plugin-artifact", [mtimeMs, ctimeMs, size])` 计算：

```text
$ node --check client.js && stat -f%z client.js
232583
rev=b3eba751118d

$ curl -s ".../plugins/??@local/dsh-artifacts-panel/client.js&rev=b3eba751118d" -w "HTTP %{http_code} bytes=%{size_download}\n"
HTTP 200 bytes=232666
body 以 window.__ModuleLoader__.load({ id: '@local/dsh-artifacts-panel', ... 开头
markers: 看改动×1 / 导出本会话产物包×1 / dsh-resource://changes-review×1 / ap-dock×11 / 图片画廊×1
```

结论：HMR 已发布本批最新代码（无需重启 DSH）。

## 5. Client Inspect

`cordis_inspect_query platform=client provider=Slots method=listSubTree`：

- `root=shell.overlay`：连续 2 次 10s 超时，**occupants 未取得**；
- `root=conversation.view`：1 次 10s 超时，**occupants 未取得**（与此前 v1/v3/v2b 记录的环境桥超时一致）。

替代证据：第 2 节 harness 的 `conversation.view id="artifacts" order=45`、`shell.overlay id=@local/dsh-artifacts-panel/floating-bar` 注册断言 + 第 4 节 live bundle 200。

## 6. 运行时事实与降级（按运行版 0.2.2-rc.1 核实）

- `workspace/changes` 持久事件的数据只有 `{ turn }`（Host 类型为 `{ turn: number }`）；文件清单/二进制或超大标记来自 `api/changes.summary?sessionId=&seq=`，本插件按需懒读（每轮 ≤1 次，并发 2，失败 60s 后重试），不自算 diff。
- `dsh-resource://file/...` 是右侧栏 tab 内容地址，不是可 fetch 的图片 URL（官方图片预览用 `api/file?path=`）；画廊缩略图优先 `api/file`，无绝对路径时退回 `dsh-resource://file/session/<sid>/<path>` 并显示失败占位。
- `ctx.fileActions` 不存在：隐藏「另存为」；下载退回浏览器 `api/file?path=`；存在则走 `save({url,read,name,mediaType}, mode)`。
- `remote.session.openWorkspacePath` / `canOpenWorkspacePath` 不存在或桌面不可用：隐藏「在 Finder 中显示」「用默认应用打开」。
- `sidebarRightTabs` 未注册 `changes-review`：隐藏「看改动」（turn 头与卡片菜单都不出现）。
- `ctx.sessionLogDownload` 不存在：导出菜单变「导出带下载链接的产物清单（降级）」并显示降级说明。
- `api/session.markdown` 探测失败：隐藏「复制全文 Markdown」。

## 7. 限制

- 卡片菜单的 deep link 只在「轮次」维度可用（任务/运行分组的行没有轮次公告上下文），与 v3 分组视图一致。
- 子代理会话里的文件动作按父会话 `readBytes`/workspace 解析，跨 workspace 的子代理文件可能失败并提示，不静默。
- 「全部会话」视图里的卡片文件动作同样按当前会话的 workspace 解析（预览仍按行的 owner session 打开）；跨会话文件动作可能失败并提示，不静默。
- 悬浮条计数按最近 400 条会话事件折叠，与面板「全部轮次」口径一致；超长会话与面板一样会受事件窗口限制。
- Client Inspect 桥仍超时，Slot occupants 未取得。

## 8. 「新产物不收录」修复（2026-11-12 晚）

根因：`DEFAULT_SETTINGS.hideTurnsWithoutArtifacts` 默认 `true`，而没有文件产物的轮次整轮被过滤；文件产物只认 `deliverables/presented`、成功 `write`/`edit`/`str_replace_editor` 的 `meta.path`、`workspace/changes` 三类来源，bash 等写的文件不入账 → 新轮次看起来「没有收录」。

改动：

- `client.js` `DEFAULT_SETTINGS.hideTurnsWithoutArtifacts`: `true` → **`false`**。
- 新增纯函数 `selectVisibleTurns(turns, options)`，会话视图与 harness 共用同一套过滤；结果行带 `noArtifacts`（按轮次真实文件数判定，不受当前类型/搜索筛选影响）。
- `turnSection`：无文件轮次渲染轮次头 + 最终回复，并加「无产物」徽标；回复折叠阈值改为 `>700 字` 或 `>8 行`（约 6–8 行）。
- 工具栏（筛选行）新增「只看有产物」toggle，与设置页 `hideTurnsWithoutArtifacts` 同一设置项；`aria-pressed` 反映状态。
- 短回复过滤保持默认开（阈值 30 字）：无产物且短回复仍默认隐藏；长回复即使无产物也显示。
- 本会话轮询 `POLL_INTERVAL` 5000 → **3000ms**（仅本会话视图；`INDEX_POLL_INTERVAL` 未动）。
- 设置页「收录内容」组新增来源限制说明；README §9 同步。
- `__testing` 新增 `selectVisibleTurns`、`normalizeSettings`、`DEFAULT_SETTINGS`。
- 设置迁移：新增 `SETTINGS_VERSION = 2`；旧 localStorage 负载（无 `settingsVersion`）里 `hideTurnsWithoutArtifacts: true` 是旧默认值，迁移时归为新的 `false`；显式写入 v2 的 `true` 仍被尊重。避免老板本地已持久化的旧默认把修复抵掉。

验证命令与结果：

```text
$ node --check client.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=118  failures=[]
replyOnly={"checks":8,"visible":2,"filtered":0}

$ node tools/interactive-harness.cjs
exit=0
reply-only toggle: ok
INTERACTIVE_OK
```

新增 8 项断言（渲染 harness）：默认 `hideTurnsWithoutArtifacts=false`；无产物轮次渲染轮次头 + 回复 + 「无产物」徽标；长回复出现「展开全文」；短回复无产物轮仍被过滤；`hideTurnsWithoutArtifacts=true` 时该轮被过滤（纯函数 `visible=2` → `filtered=0`）；工具栏有「只看有产物」；设置页面文案为「默认关」；来源限制文案含 bash / 暂不自动收录 / present；旧设置迁移为 false 且显式 v2 true 被尊重。

交互 harness 新增端到端点击：默认显示「第 4 轮」（纯回复无产物）与「无产物」徽标 → 点「只看有产物」后该轮消失 → 再点恢复。

## 9. 配色主题（themeMode / accentColor，2026-11-12 晚）

新增设置：`themeMode`（`inherit` 默认 / `dark` / `light`）、`accentColor`（`default` 默认 / `blue` / `amber` / `green` / `purple` / `rose`），仍存 `dsh-artifacts-panel.settings.v1`；`SETTINGS_VERSION` 保持 2，旧负载缺字段时补默认（纯增量，无需迁移版本号）。

实现要点：

- 根容器（产物页签 / 右侧栏 tab / 悬浮条 / 灯箱 / 设置页）写 `--ap-bg`、`--ap-surface`、`--ap-surface-2/3`、`--ap-border`、`--ap-border-strong`、`--ap-text`、`--ap-muted`、`--ap-subtle`、`--ap-hover`、`--ap-overlay`、`--ap-skeleton`、`--ap-link`、`--ap-accent`、`--ap-accent-fg`；`inherit` 不写中性变量，CSS 的 `var(--ap-x, var(--dsw-alias-y))` 回退宿主 token。
- 强制模式额外覆盖 `--dsw-alias-state-*` / toast / switch 等语义 token，状态徽标与开关在浅色模式下仍可读。
- 强调色 5 套预设各带深/浅两个变体：`inherit` 时用 `getComputedStyle` 探测宿主底色（失败回退 `prefers-color-scheme`，再回退 dark）选择变体；正文与强调色对比度按 WCAG AA ≥ 4.5:1 校验。
- 灯箱固定深色舞台（`--ap-mask: rgba(0,0,0,.62)`），浅色模式下遮罩不变白。
- 设置页新增「配色主题」组：三选段控件 + 6 个 `role=radio` / `aria-checked` 色点 + 标题/正文/主按钮/强调色芯片预览。

验证命令与结果：

```text
$ node --check client.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=139  failures=[]
theme={"checks":21,"modes":["inherit","dark","light"],"accents":["default","blue","amber","green","purple","rose"],"hostMode":"dark"}

$ node tools/interactive-harness.cjs
exit=0
INTERACTIVE_OK
```

render harness 新增 21 项（118 → 139），覆盖：默认 `inherit`/`default`；旧 settingsVersion=1 负载补默认；非法值回退；设置页渲染 3 个模式与 6 个色点（`data-accent`）；`inherit` 根容器不写中性覆盖；`dark` 时产物页签/右侧栏/悬浮条/设置页根容器均带深色变量；`light` 时带浅色变量；`accentColor=blue` 时 `--ap-accent`/`--ap-accent-fg` 等于浅色变体；`rose` 在深色模式用深色变体；灯箱始终使用深色变量且 `--ap-mask` 固定；另用纯函数按 WCAG 公式断言深/浅两套正文、次要文字与 5 个强调色在对应表面上的对比度均 ≥ 4.5:1。

既有 118 项全部保持通过；interactive harness 无改动仍 `INTERACTIVE_OK`。

## 10. 右侧栏停靠增强（autoOpenSidebar / 宽栏自适应 / 折叠入口，2026-11-12 晚）

改动（仅 `client.js` + 本目录 harness/文档）：

- `DEFAULT_SETTINGS.autoOpenSidebar = false`（并入 `BOOLEAN_SETTINGS`，`SETTINGS_VERSION` 保持 2）；设置页「视图与悬浮条」组新增开关，文案含「默认关」。
- 新增 `SidebarArtifacts` 容器测量：`ResizeObserver` + `getBoundingClientRect`/`clientWidth` 回退，effect 卸载时 `disconnect`；不使用 `window.innerWidth`。
- 新增纯函数 `sidebarLayoutForWidth(width)`：`< 480 → single`、`480–719 → two-column`、`≥ 720 → split`；`ArtifactsView` 根容器输出 `ap-layout-<layout>` 与 `data-layout`，轮次正文包进 `.ap-turn-body`（无回复时 `ap-turn-body-files`）。
- 工具栏「在右侧栏打开 / 收起右栏」两态：`probeSidebar()` = `sidebarRight.isExpanded()` + `active().kind`，1s 轻量轮询同步；`collapseSidebar()` 调 `toggleExpanded()`。
- `shell.overlay` 改为 `ShellOverlay`：`AutoOpenSidebar`（无渲染，`useSelection` 会话变化时每会话一次）+ `FloatingBar`；自动展开只走 `openTab('artifacts', { revealIfOpened: true })` 且 `isExpanded()` 为 false 时才发。
- 悬浮条点击链：`openPanel()` = `openTab('artifacts')` → 若仍未展开则 `toggleExpanded()`（不会把刚展开的栏又收起）。
- 未注册 `conversation.session.header.corner`（原生占用保持不动）。

验证命令与结果：

```text
$ node --check client.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=157  failures=[]
sidebarDock={"checks":18,"breakpoints":{"twoColumn":480,"split":720},"layouts":{"narrow":"single","wide":"two-column","split":"split"},"autoOpenDefault":false}

$ node tools/interactive-harness.cjs
exit=0
auto-open tabs: [ 'artifacts' ] {"revealIfOpened":true}
open tabs: ["artifacts","artifacts"]
toolbar two-state: ok
INTERACTIVE_OK
```

render harness 新增 18 项（139 → 157）：`sidebarLayoutForWidth` 五个边界（0/479/480/719/720/1200）；`SidebarArtifacts` 按注入宽度渲染出 `single` / `two-column` / `split` 根标记；`.ap-turn-body` 存在、两列/并排 CSS 规则存在；默认 `autoOpenSidebar=false` 且显式 true 被保留；设置页出现该开关与「默认关」；工具栏默认「在右侧栏打开」、探针报告已展开产物 tab 时变「收起右栏」且 `aria-pressed=true`；`ensureArtifactsSidebar()` 只在收起时 `openTab('artifacts',{revealIfOpened:true})`、已展开时不动；悬浮条点击先 `openTab` 再 `toggleExpanded`，宿主已展开时不重复 toggle。

interactive harness 新增端到端点击：开启设置后首次挂载只自动展开一次（第二次挂载不重复）、`revealIfOpened:true`；悬浮条点击链；工具栏两态文案与「收起右栏」点击后状态回落。

限制：本轮未做真实浏览器截图验证（运行版 Web 入口需登录态，401 无法绕过），以上为**静态 harness 验证**；HMR 发布后请在实际右栏宽度下目视确认 480/720 两个断点。

回滚：`client.js` 改动前备份于 `/tmp/client.js.bak-v7`（临时件，不随交付）；或按本目录 git 之外的人工快照恢复。三项增强都是纯增量（新设置缺省 false、新组件不注册新 slot、未改 DSH 布局协议），删掉对应代码块即可回退。

## 11. 跨会话索引注入修复 + UI P0 八项（0.2.0，2026-11-12 晚）

改动范围：`client.js`、`tools/render-harness.cjs`、`tools/interactive-harness.cjs`、`README.md`、`package.json`、新增 `CHANGELOG.md`。`index.js`（Host）未改，无需重启 DSH；Client 改 HMR 生效。

### 11.1 紧急 bug：`remote.workspaceFiles` 未注入

- 症状：「全部会话」报「读取跨会话索引失败」，控制台 `cannot get property "remote.workspaceFiles" without inject`。
- 根因：`inject` 未声明 `remote.workspaceFiles`，Cordis 在 `ctx.remote.workspaceFiles` 属性访问处直接抛错。
- 修复（`client.js`）：
  - `inject` 补 `remote.workspaceFiles`（最终清单 9 项，见 `client.js:5137`）；审计全部 `ctx.<service>.<member>` 访问，除它之外均已声明。
  - `readIndexFile`（`client.js` 内 `makeSessionInjection`）把属性访问与 `read()` 都包进 try/catch，缺失时 reject `WORKSPACE_FILES_UNAVAILABLE`。
  - `downloadArtifact` 里的 `ctx.remote.workspaceFiles` 同样加 try/catch（不可用时退回浏览器下载）。
  - 新增 `classifyIndexError`（`client.js:1459`）：`unavailable` / `denied` / `missing` / `error`。
  - 全部会话视图按三类给文案（服务不存在 / 索引文件不存在·准备中 / 路径无权限），原始错误只进折叠的 `<details>`；单会话索引读取失败也不再把原始异常直接铺在面板上。
- harness：mock `ctx.remote` 改为 Proxy，读取 `workspaceFiles` 时抛真实的 Cordis 错误，验证读取函数返回 `WORKSPACE_FILES_UNAVAILABLE` 而不是同步抛出。

### 11.2 UI P0 八项

1. 工具栏三分区（identity/filter/actions）；只看有产物、显示全部轮次、显示已隐藏、图片视图、排序进「筛选▾」popover；导出只保留 ⋯ 菜单入口（导出清单/导出包/复制全文 Markdown）。
2. 齿轮与 ⋯ 菜单打开内嵌右侧设置抽屉（`min(380px,92vw)`，复用 `SettingsPage`，`embedded` 模式），Esc / 遮罩 / 关闭按钮关闭，焦点陷阱 + 回焦。
3. `EmptyNew` / `EmptyFiltered` / `ErrorState` 三态，`data-state=new|filtered|error`；筛选空态 chip 可逐个移除或一键清空；错误态含重试、复制诊断信息、折叠技术细节。
4. 卡片容器去 `role=button`/`tabIndex`/`onKeyDown`，改为普通容器 + `.ap-card-hit` 透明整卡按钮；☆/⋯ 常显 40% 透明度、hover 100%；小屏只留 ⋯；下载/打开子会话/隐藏进 ⋯ 菜单；无嵌套按钮。
5. 筛选 popover、⋯、卡片菜单、灯箱、设置抽屉均焦点陷阱 + 关闭回焦；`.ap-seg-btn` 补 `aria-pressed`；会话树 chevron 改 `<button aria-expanded>`，标题独立按钮。
6. `middleEllipsis` 路径中间省略保留文件名尾段；卡片路径是复制按钮，点击写剪贴板 + toast「路径已复制」；容器 `title` 保留完整路径；删除描述行 `maxWidth:180px`。
7. `inherit` 模式固定 `--ap-subtle` / `--ap-muted`（对应明暗色板，≥4.5:1）；强制主题仍用 WCAG 验算色板；`data-hidden` 0.72 + 灰化；`prefers-reduced-motion` 关闭动效；<.85em 字号统一 `max(11px, …)`。
8. 首启引导卡（`localStorage: dsh-artifacts-panel.onboarded.v1`，只出现一次，设置内可复位）；设置页由 8 组合并为 6 组，每组带说明；README 增加截图/GIF 占位与首启引导文案。

### 11.3 验证命令与结果

```text
$ node --check client.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=200  failures=[]
indexService={"checks":10,"inject":["slots","locale","sessions","uiWorkspace","remote","remote.session","remote.workspaceFiles","sidebarRight","sidebarRightTabs"]}
uiP0={"checks":30,"groups":6}

$ node tools/interactive-harness.cjs
exit=0
settings drawer: ok
filter popover: ok
empty filtered chips: ok
copy path: ok
onboarding once: ok
INTERACTIVE_OK

$ node tools/test-v2b.mjs
v2b host tests: 6 passed, 0 failed
```

- render harness 由 157 项增至 200 项（+43）：v8 索引服务降级 10 项、v9 UI P0 30 项，另把 4 条旧断言按新交互位置改写（工具栏标签、导出入口、子代理入口、只看有产物开关）——行为覆盖未减少，旧断言其余全部保持通过。
- interactive harness 新增：筛选 popover 开关与「只看有产物」、设置抽屉（⋯ 菜单入口 / 齿轮 / 关闭按钮 / 遮罩）、筛选空态 chip 移除、卡片路径复制 + toast、首启引导只出现一次；导出路径改从 ⋯ 菜单进入。

回滚：改动前备份 `/tmp/client.js.ap-ui-p0.bak`（临时件，不随交付）。UI P0 全在 CSS 与 ArtifactsView/SettingsPage 内，索引修复是纯增量（补 inject + try/catch + 新状态分支），`SETTINGS_VERSION` 保持 2、索引格式与 Host 未改。


## 12. 发布 P0 修复（0.2.0 发布门禁，2026-11-12 晚）

范围：`client.js`、`index.js`、`package.json`、`cordis.patch.yml`、`README.md`、`CHANGELOG.md`、`tools/render-harness.cjs`、`tools/test-v2b.mjs`、`tools/validate-index.mjs`、`release/build.mjs`、`release/verify.mjs`、`release/README.md`。

### 12.1 修了什么（对审计 5 条 P0）

1. **P0-1 包身份**：`package.json` 改为 `dsh-artifacts-panel`，删 `private`，补 `license: MIT` / `author` / `repository` / `homepage` / `keywords` / `engines`；`cordis.patch.yml` 与 `client.js` 5 处 `@local/...` id（ModuleLoader、sidebar tab、悬浮条、settings section、诊断串）同步改名。
2. **P0-2 索引路径**：删除 `client.js` 的 `DEFAULT_INDEX_DIR = '/Users/...'` 与绝对路径兜底；Host 注册同源只读路由 `GET /artifacts-panel/index.json`、`GET /artifacts-panel/sessions/<sid>.json`（`webServer` 前缀路由 + `connection.requestRejection()` 浏览器鉴权，与 DSH `/api` 同一道门），响应 `cache-control: no-store` + ETag。Client 只认路由前缀；设置页保留「索引目录」绝对路径覆盖作为无路由宿主的降级。
3. **P0-3 数据目录**：`index.js` 新增 `resolveDefaultIndexDir()`：`$DSH_HOME/artifacts-panel/index` → `os.tmpdir()/dsh-artifacts-panel/index`（日志说明）。启动时若旧插件目录 `.index/` 存在且新目录无 `index.json`，**复制**（不删旧目录、只一次）；不可写时不再跳过回填，内存索引由路由直接服务；设置页「重建索引」`POST /artifacts-panel/rebuild`。
4. **P0-4 engines / 依赖**：DSH 范围统一 `>=0.2.2-rc.2 <0.3.0`（package.json、build.mjs、verify.mjs、README）；schemastery 放宽 `^3.19.0`。
5. **P0-5 提示词透明**：Host `inject` 改为 `[]`，`systemPrompt` 走 `ctx.inject([...])` 可选注入（缺服务只跳过提示词）；README 与设置页写明「安装后增加约 80 字产物引导，可在 `promptGuidance: false` 关闭」，跨会话索引只存引用、可 `crossSessionIndex: false` 关闭。

### 12.2 验证（同一份冻结代码，md5 见 `release/verify/gate.md`）

```text
$ node --check client.js
exit=0

$ node --input-type=module --check < index.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=213  failures=[]
（新增：noUserAbsolutePath / noLegacyLocalId / indexPathDefaultsToRoute / indexPathOverride /
  routeFetch / routeMissing / settingsIndexDirRow / settingsRebuildRow / settingsPromptGuidanceNote 等）

$ node tools/interactive-harness.cjs
exit=0
INTERACTIVE_OK

$ node tools/test-v2b.mjs
v2b host tests: 11 passed, 0 failed
（新增 5 组：DSH_HOME 目录解析、inject 可选 + ctx.inject 路径、旧 .index 一次性复制、只读内存回填、
  索引 HTTP 路由 200/404/405/202 与鉴权拒绝）

$ cd release && node build.mjs && node verify.mjs
build exit=0；verify exit=0
check.json：publishReady=true / ok=true / blockers=[] / problems=[] / userPathHits=[]
engines={"dsh":">=0.2.2-rc.2 <0.3.0"}；hasPrivate=false；toolsIncluded=false；indexDirIncluded=false

$ grep -R '/Users/' release/pkg   → 无输出（exit 1）
$ grep -R '@local' release/pkg    → 无输出（exit 1）
```

### 12.3 风险与未决

- 运行中的 DSH 未重启：Host 侧（路由、数据目录、迁移）尚未在真实宿主内实测；Client 若被 HMR 加载，重启前「全部会话」会显示不可用，重启后恢复。
- 同源路由依赖 `webServer` + `connection`；两者缺失时降级为手填「索引目录」，该路径只有单测覆盖，未在真实无路由宿主上走查。
- 仓库/署名默认 `https://github.com/mingweima/dsh-artifacts-panel` / `mingweima`；若实际不同，用 `PKG_REPO_URL` / `PKG_AUTHOR` 覆盖后重跑 build + verify。
- 按边界未做 npm publish / npm login / 干净 profile 实装。

发布门禁完整记录见 `release/verify/gate.md`；机器可读结果见 `release/verify/check.json`。

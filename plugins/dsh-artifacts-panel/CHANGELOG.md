# CHANGELOG

## 0.2.1 — v3 任务分组真机修复（2026-11-22，未发布）

### 修复（真机上会静默失效的三处）

- **team/task、team/member 解包错**：DSH 0.2.2-rc.x 起 payload 是 `{version, teamId, task|member}` 嵌套对象，旧代码按扁平字段读，任务恒为 0 个，`auto` 维度永远回落到轮次、任务分组根本不出现。现在两种形状都吃（`client.js` foldSession）。
- **subagent/catalog 没折叠**：一次性 subagent（只走 `subagent` 工具、不在团队/workflow 下）不出现在 `children`，其产物既不能展开也不能下钻。现在按 `{childId, label, mode}` 折进 `children`（`kind: 'catalog'`）。
- **未归属组不触发子会话加载**：`childIds` 为空导致「加载子代理产物」按钮不出现。任务维度下未归属组现在带上没有任务归属的一次性子代理。

### 其他

- 任务状态 `deleted` 的任务不再成组（与官方面板口径一致）。
- `childCache` 加 24 个 child 的 LRU 上限，长会话内存不再只增不减。
- `tools/render-harness.cjs` 夹具改成真实嵌套 wire 形状，并新增 `t-3(deleted)` 与 `c-9(subagent/catalog)` 用例；新增断言 `taskNestedPayload` / `taskDeletedFiltered` / `catalogChildFolded` / `catalogInUnassigned`。

### 验证

- 修复前：新夹具 7 条断言变红（`taskMember`、`tasksGroupCount`、`taskNestedPayload`、`catalogChildFolded`、`catalogInUnassigned`、`renderTaskStats` 等）
- 修复后：`node tools/render-harness.cjs` → `failures: []`
- `node tools/test-v2b.mjs` → 11 passed, 0 failed


## 0.2.0 — 发布门禁修复（2026-11-12 晚）

### P0 修复（发布阻塞）

- **包身份**：`package.json` 改为 `dsh-artifacts-panel`，移除 `private`，补 `license: MIT`、`author`、`repository`、`homepage`、`keywords`、`engines.dsh = ">=0.2.2-rc.2 <0.3.0"`；代码内 4 处 `@local/` 模块 id（ModuleLoader、sidebar tab、悬浮条、settings section）同步改名，发布包 `grep @local` 清零。
- **索引路径**：删除 `client.js` 中写死的 `/Users/.../.index` 绝对路径。Host 在 profile 数据目录（`$DSH_HOME/artifacts-panel/index`，缺失时回退 OS 临时目录）维护索引，并通过同源 HTTP 路由 `/artifacts-panel/index.json`、`/artifacts-panel/sessions/<sid>.json` 提供给浏览器（`webServer` + `connection.requestRejection` 鉴权）；Client 不再需要任何绝对路径。
- **数据目录 / 迁移 / 降级**：启动时把旧插件目录 `.index/` **复制** 到新目录（旧目录保留、只执行一次）。索引目录不可写时仍执行内存回填，HTTP 路由直接服务内存索引；设置页新增「重建索引」按钮（`POST /artifacts-panel/rebuild`）与可选「索引目录」手填降级。
- **engines / 依赖**：DSH 实测 `0.2.2-rc.2`，`engines.dsh` 与 `release/build.mjs`、`release/verify.mjs` 同步为 `>=0.2.2-rc.2 <0.3.0`；`@deepseek-ai/schemastery` 放宽为 `^3.19.0`。
- **提示词透明**：`inject` 去掉硬依赖 `systemPrompt`，改为 `ctx.inject(['systemPrompt'])` 可选注入；宿主没有该服务时只跳过提示词、插件照常加载。README 与设置页写明「安装后增加约 80 字产物引导，可在 `promptGuidance: false` 关闭」，并说明跨会话索引只存引用、可 `crossSessionIndex: false` 关闭。
- **可发布性**：`release/build.mjs` 默认署名/仓库改为具体值，构建时对 `/Users/` 与 `@local/` 直接 fail；`release/verify.mjs` 新增 `noLegacyId` / `indexRoute` / `optionalInject` / `schemasteryRange` / `promptGuidanceDoc` 门禁。

### 验证

- `node --check client.js`、`node --input-type=module --check < index.js` → exit 0
- `node tools/render-harness.cjs` → 213 项，`failures: []`
- `node tools/test-v2b.mjs` → 11 passed, 0 failed
- `node tools/interactive-harness.cjs` → `INTERACTIVE_OK`
- `cd release && node build.mjs && node verify.mjs` → `publishReady=true`、`userPathHits=[]`

## 0.2.0 — 2026-11-12

### 修复

- **跨会话索引服务未注入**：`client.js` 的 `inject` 补 `remote.workspaceFiles`。此前「全部会话」视图访问 `ctx.remote.workspaceFiles` 会被 Cordis 直接抛 `cannot get property "remote.workspaceFiles" without inject`，现在按「服务不存在 / 索引文件不存在 / 读取被拒」三类降级文案展示，原始错误折叠在 `<details>`。
- `readIndexFile` 与 `downloadArtifact` 对 `ctx.remote.workspaceFiles` 的访问加 try/catch，旧宿主或服务缺失时返回 `WORKSPACE_FILES_UNAVAILABLE`，不再把原始异常抛给用户。

### UI（P0 八项）

- 工具栏三分区（身份 / 筛选 / 动作）；三个「眼睛」开关、图片视图、排序收进「筛选▾」popover；导出只保留 ⋯ 菜单一个入口。
- 设置齿轮与 ⋯ 菜单打开内嵌右侧设置抽屉（Esc / 遮罩 / 关闭按钮，焦点陷阱 + 关闭回焦），不再弹「去设置页」toast。
- 空态拆成 EmptyNew / EmptyFiltered / ErrorState 三类；筛选空态显示可移除的条件 chip；错误态给重试、复制诊断信息与折叠的技术细节。
- 卡片改为普通容器 + 整卡透明按钮覆盖层，去掉 `role=button` 与嵌套交互；☆/⋯ 常显 40%，小屏只留 ⋯，其余动作进 ⋯ 菜单。
- 筛选 popover / ⋯ / 卡片菜单 / 灯箱 / 设置抽屉统一焦点陷阱与回焦；分段控件补 `aria-pressed`；会话树 chevron 改 `<button aria-expanded>`。
- 卡片路径中间省略（保留文件名尾段），单击复制完整路径并 toast；容器 `title` 保留完整路径；移除描述行 `maxWidth:180px`。
- 强制主题对比度沿用 WCAG AA 验算；`inherit` 模式固定 `--ap-subtle` / `--ap-muted`（≥4.5:1）；`data-hidden` 透明度 0.72 + 灰化；新增 `prefers-reduced-motion` 块；小于 `.85em` 的字号加 `max(11px, …)` 下限。
- 首启引导卡（只出现一次，`localStorage: dsh-artifacts-panel.onboarded.v1`）；设置页合并为 6 组并补组说明，新增「重新显示引导」。
- README 增加截图 / GIF 占位说明与首启引导文案。

### 验证

- `node --check client.js` → exit 0
- `node tools/render-harness.cjs` → 200 项断言，`failures: []`
- `node tools/interactive-harness.cjs` → `INTERACTIVE_OK`
- `node tools/test-v2b.mjs` → 6 passed, 0 failed

## 0.1.0 — 2026-11-12

- 首个本地版本：本会话产物页签、右侧栏 tab、设置页、跨会话索引（v2b）、diff 深链、文件动作、图片画廊、导出与悬浮条。

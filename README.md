# 产物面板（Artifacts panel）

![产物面板](icon.svg)

A DeepSeek Harness plugin that gathers everything a session produces — final replies, Markdown documents, images and other files — into one organized page plus a right-sidebar tab, so artifacts stop being buried by the next reply. Group by turn, team task or workflow run, browse a reference-only cross-session index, adjust theme and font size, and export or download. Requires DSH `>=0.2.2-rc.2 <0.3.0`; MIT licensed.

在会话里集中查看和整理所有产物（最终回复、Markdown 文档、图片和其他文件）：顶部「产物」页签、右侧栏「产物」标签页和右下角迷你悬浮条共用同一套数据，本该被下一条回复冲掉的东西都能回看。

## 特性

- **产物面板**：会话顶部页签打开完整面板，右侧栏提供「产物」标签页，右下角「产物 N」悬浮条一键唤起；三者共用数据、卡片与筛选。
- **按轮次 / 任务 / 运行分组**：分组维度可切「自动 / 轮次 / 任务 / 运行」；「自动」优先任务，其次运行，最后轮次；子代理产物可展开，无法归属的进「未归属」组。
- **跨会话索引**：顶部可切「本会话 | 全部会话」，按会话树浏览历史产物，可下钻子会话；索引只存引用，不存正文。
- **主题与字号**：字号 0.8–2.5 倍（默认 1.5 倍，宿主 16px 时约 24px）、三档密度、跟随 DSH / 深色 / 浅色主题、6 种强调色。
- **筛选与搜索**：全部 / 文档 / 图片 / 文件、关键词搜索、只看有产物、排序、图片画廊与全屏灯箱。
- **导出与下载**：导出 Markdown 清单、导出会话 ZIP、复制全文 Markdown；卡片支持下载、另存为、在 Finder 中显示、复制路径，以及跳到官方改动评审页。

## 截图

界面截图随后补进本仓（拍摄要求已写在 [docs/README.md](docs/README.md)）。先用一句话说清它长什么样：左侧会话产物流、中间卡片（类型图标 + 名称 + 路径 + 大小 + 时间）、右侧可停靠的「产物」标签页；顶部一行是视图切换、分组维度与筛选，齿轮打开设置抽屉。

## 安装

要求 DSH `>=0.2.2-rc.2 <0.3.0`（见 `package.json` 的 `engines.dsh`）。

### 方式一：直接从 GitHub 安装（推荐）

DSH 的安装框与命令行都接受 Git 规格，仓库根就是包根，clone 下来即用，无需构建：

- **图形界面**：Plugins → Add plugin → 填 `github:mingweima/dsh-artifacts-panel`
- **命令行**（Desktop 需先在应用菜单里装好 `dsh` 命令）：

```bash
dsh plugin --profile desktop add github:mingweima/dsh-artifacts-panel   # dsh web 用户把 desktop 换成 web
```

要锁定某个提交，在规格末尾加 `#<40 位 commit sha>`。

### 方式二：本地目录（开发自用，改文件即生效）

```bash
git clone https://github.com/mingweima/dsh-artifacts-panel.git
dsh plugin --profile desktop add /绝对路径/dsh-artifacts-panel
```

图形界面则填该目录的**绝对路径**（相对路径会被界面拒绝）。

> `--profile` 必须写在子命令之前，漏了会报 `error: --profile <name> is not specified`。安装/替换已装包后按提示刷新页面或重启 DSH；Host 部分在启动时加载。

## 用法

1. **打开面板**：会话顶部「产物」页签，或右侧栏「产物」标签页，或右下角「产物 N」悬浮条。右侧栏可在设置里设为打开会话时自动展开（`autoOpenSidebar`）。
2. **切视图**：顶部「本会话 | 全部会话」；分组维度在「自动 / 轮次 / 任务 / 运行」之间切换。
3. **分组 / 搜索 / 筛选**：工具栏按「身份 / 筛选 / 动作」分区；「筛选▾」里有只看有产物、显示全部轮次、隐藏项、图片视图、排序与清除筛选。卡片上的 ☆ 收藏、⋯ 菜单包含打开、下载、另存为、复制路径、在 Finder 中显示、看改动等动作。
4. **导出**：⋯ 菜单 →「导出清单（Markdown）」「导出本会话产物包（ZIP）」「复制全文 Markdown」；运行时缺少对应能力时会按特性降级并在菜单里注明。
5. **设置**：工具栏齿轮或 ⋯ 菜单打开内嵌设置抽屉，按「字号与密度 / 配色主题 / 收录内容 / 过滤噪音 / 分组与子代理 / 视图与悬浮条」六组排列；改动立即生效，保存在本机浏览器存储（`dsh-artifacts-panel.settings.v1`）。

## 设置项

以下键与默认值取自 `client.js` 的 `DEFAULT_SETTINGS`（`settingsVersion` 为内部字段，不列出）：

| 键 | 默认值 | 作用 |
| --- | --- | --- |
| `fontScale` | `1.5` | 字号倍率，0.8–2.5，按宿主字号放大 |
| `density` | `"standard"` | 行距 / 密度：`compact` / `standard` / `relaxed` |
| `themeMode` | `"inherit"` | 主题：`inherit`（跟随 DSH）/ `dark` / `light` |
| `accentColor` | `"default"` | 强调色：`default` / `blue` / `amber` / `green` / `purple` / `rose` |
| `showReplies` | `true` | 收录每轮最终回复 |
| `showDocs` | `true` | 收录文档（md / txt / json 等） |
| `showImages` | `true` | 收录图片 |
| `showFiles` | `true` | 收录其他文件 |
| `hideTurnsWithoutArtifacts` | `false` | 隐藏没有产物的轮次（即「只看有产物」） |
| `hideShortReplies` | `true` | 隐藏短回复，仅作用于没有产物的轮次 |
| `shortReplyThreshold` | `30` | 短回复阈值，0–200 字 |
| `ignoreKeywords` | `"总线无新消息,已处理到"` | 命中关键词的轮次默认隐藏，逗号分隔 |
| `pageSize` | `20` | 每页轮次：`10` / `20` / `50` / `all` |
| `defaultDimension` | `"auto"` | 默认分组维度：`auto` / `turns` / `tasks` / `runs` |
| `showSubagents` | `true` | 展开任务 / 运行组时拉取子会话产物 |
| `showUnassigned` | `true` | 显示无法归属的「未归属」组 |
| `crossSessionIndex` | `true` | 启用「全部会话」视图（仅浏览器侧开关；Host 侧写入由插件配置同名项控制） |
| `imageView` | `"list"` | 图片视图：`list` / `gallery`（仅图片筛选与轮次维度生效） |
| `showFloatingBar` | `true` | 显示右下角迷你悬浮条 |
| `autoOpenSidebar` | `false` | 打开会话时在右侧栏收起状态下自动展开产物标签页 |
| `renderMarkdown` | `true` | 渲染最终回复的 Markdown；关闭则显示原始源码 |

另有宿主侧插件配置（`index.js` 的 `Config`，改后需重启 DSH）：

| 配置 | 默认值 | 作用 |
| --- | --- | --- |
| `promptGuidance` | `true` | 是否注入下方那段约 80 字的产物引导 |
| `crossSessionIndex` | `true` | 是否维护跨会话索引（关闭后「全部会话」不可用，「本会话」不受影响） |

## 会写入系统提示词（请先读这一条）

安装后，**所有 Agent 的每次会话都会多一段约 80 字的「产物引导」**，提示 Agent 用 `present` 显式交付产物（路径 + 说明），不改变其他行为。不需要时把宿主侧插件配置设为 `promptGuidance: false` 并重启 DSH；宿主没有 `systemPrompt` 服务时该段会自动跳过，插件照常加载。

## 数据与隐私

- **只读 DSH 自己的会话**：Host 通过 `sessionPersistence` 读取会话事件，不读取、不索引其他 agent 的数据，也不直接打开 `$DSH_HOME` 下的文件。
- **索引只存引用**：会话 id、文件路径、轮次、来源（`presented` / `produced`）、类型（`doc` / `image` / `file`），可选大小与 sha；不保存回复正文、描述或文件内容。索引位于 `$DSH_HOME/artifacts-panel/index/`（`DSH_HOME` 缺失时回退到系统临时目录）。
- **自动跳过噪音路径**：临时目录、隐藏文件、`node_modules`、`.git`、`*.log` 与索引自身目录。

## 已知限制

- **只收三类来源**：`present` 的交付、成功的 `write` / `edit` / `str_replace_editor` 的 `meta.path`、`workspace/changes` 公告。**通过 bash、脚本等直接落盘的文件不会自动收录**，该轮会显示「无产物」徽标——这是收录范围的限制，不是面板坏了。
- **历史有事件窗口**：本会话视图每 3 秒轮询一次新事件，工具栏「刷新」可手动拉取；首次加载受 DSH `remote.session.events` 约 400 条事件的窗口限制，「加载更早」只展开已折叠的轮次。
- **索引有容量上限**：最多 300 个会话、每会话 300 行、`index.json` ≤ 512 KB；单个超过 32 MB 的会话日志在回填时跳过。
- **`sha` 通常为空**：只有事件自身带 `sha` 时才记录，默认回填不读文件内容（预留字段）。
- **回填断点续跑有崩溃窗口**：若上次恰好停在 `tool/call` 与 `tool/result` 之间，该条结果可能漏记，下次全量重建或新轮次可修正。
- **卸载不清理投影缓存**：DSH 自身可能在 `$DSH_HOME` 下写入本插件的投影检查点，内容同样是「只存引用」；插件不清理它，DSH 重建缓存后自然失效。
- **「全部会话」依赖宿主路由**：索引经同源只读路由 `/artifacts-panel/...` 提供给浏览器；宿主没有该路由时可在设置页手填索引目录降级，否则显示「索引服务不可用」。

## 兼容性

- `engines.dsh`：`>=0.2.2-rc.2 <0.3.0`（实测 `0.2.2-rc.2`）。DSH 会在安装前校验，不满足会被直接拒绝；确实要装可走版本豁免，风险自担。
- **预发布版本的 semver 坑**：下界是预发布版 `0.2.2-rc.2`，按 semver 它小于正式版 `0.2.2`；范围里的预发布版只在同一 `major.minor.patch` 上才被纳入——实测 `0.2.2-rc.2`、`0.2.2`、`0.2.3`、`0.2.9` 能过，`0.2.2-rc.1`、`0.2.3-rc.1` 与 `0.3.x` 会被拒绝。DSH 升到 0.3 之前需要本插件先适配。
- 运行时依赖 `@deepseek-ai/schemastery`（`^3.19.0`），由安装流程解析；本仓带预构建的浏览器产物，不需要构建步骤。

## 卸载

- **图形界面**：Plugins → 找到「产物面板」→ Remove。
- **命令行**：

  ```bash
  dsh plugin --profile <profile> remove dsh-artifacts-panel
  ```

卸载后重启 DSH。索引数据在 `$DSH_HOME/artifacts-panel/index/`，可手动删除（插件目录下的旧 `.index/` 只做一次性复制迁移，可自行清理）。

## License 与致谢

MIT License，见 [LICENSE](LICENSE)。版本变更见 [CHANGELOG.md](CHANGELOG.md)。

基于 DeepSeek Harness 公开的 Cordis 插件 API 构建；运行时依赖 `@deepseek-ai/schemastery`。问题与建议请提 [GitHub Issues](https://github.com/mingweima/dsh-artifacts-panel/issues)。

# DSH 产物面板 · 功能清单与优先级（四路调研合并）

日期：2026-11-12 · 来源：`research-lane-dsh-capabilities.md`、`research-lane-github-features.md`、`research-lane-multi-subagent.md`、`research-lane-multiwindow.md`、`research-cross-session-artifacts.md`
运行版基准：DSH 0.2.2-rc.1（asar 内）；本地 checkout `~/Documents/DSH/node_modules` 是 0.1.6-alpha.2，**写代码以运行版为准**。

## 0. 已交付/在途

| 版本 | 内容 | 状态 |
|---|---|---|
| v1 | 顶部「产物」页签（conversation.view）：按轮次收集最终回复/md/图片/其他文件，筛选/搜索/收藏/隐藏/导出/预览 | 已上线（老板已批） |
| v1.1 | 设置页（DSH 设置→产物面板）+ 噪音过滤（无产物轮/短回复/关键词）+ 分页 | 已上线 |
| v1.2 | 字号改相对倍率（默认 1.5×≈24px，可到 2.5×≈40px）+ 全 em 缩放 | 已上线 |
| v1.3/v1.4 | system prompt 引导语（固定文本，鼓励 present 显式交付）+ 插件配置一键关 | v1.4 在做；Host 改动下次正常启动生效 |
| v2a | 右侧栏「产物」tab + 浮出/全屏/分屏动作；复用同一套数据与卡片 | 在做 |

## 1. 候选功能（按主题）

### A. 内容增强（高性价比）
| # | 功能 | 价值 | 可行性 | 成本 | 依据 |
|---|---|---|---|---|---|
| A1 | 每轮改动文件**深链到官方 diff 评审页**（`dsh-resource://changes-review/...`），不自己算 diff | 高 | 高 | 低 | lane-dsh |
| A2 | 导出升级：会话 ZIP（`ctx.sessionLogDownload.download`）、`/api/session.markdown` 全文 | 中高 | 高 | 低 | lane-dsh |
| A3 | 文件动作：另存/下载/复制路径/系统应用打开（`ctx.fileActions`、`openWorkspacePath`），替代现在只做预览+下载 | 中高 | 高 | 低 | lane-dsh |
| A4 | 图片画廊/缩略图 + 灯箱全屏（`shell.overlay`） | 中高 | 高 | 低中 | lane-github |
| A5 | 统计条：本会话轮数/产物数/token（`sessionStats` 投影） | 中 | 高 | 低 | lane-dsh |
| A6 | 同路径多版本时间线 + 双栏对比（无 mtime，用事件 time/seq） | 高 | 中 | 中高 | lane-github |

### B. 多 subagent / 任务分类（老板点名）
| # | 功能 | 价值 | 可行性 | 成本 | 依据 |
|---|---|---|---|---|---|
| B1 | 按**任务板**分组：父会话事件 `team/task`、`team/member` 折叠出任务组（status/owner/writeScopes 徽标） | 高 | 高 | 中 | lane-multi |
| B2 | 按 **workflow 运行**分组：`run-start/agent-start/agent-end/run-end` 事件 → 阶段+成员产物 | 高 | 中高 | 中 | lane-multi |
| B3 | 子代理产物展开（`origin==='subagent'`+`parentId`，`remote.session.events` 用 subagent address 懒加载，2 并发+LRU） | 高 | 中高 | 中 | lane-multi |
| B4 | **归属兜底**：ownerId→member 精确归属，Lead 自身按 writeScopes 前缀匹配，都不中进「未归属」并标注 | 高 | 高 | 低中 | lane-multi |
| B5 | 子代理会话直接下钻（`openSession`）、组头显示 running 状态 | 中 | 高 | 低 | lane-multi |
| B6 | goal 做**头部上下文条**（不做一级导航） | 中低 | 高 | 低 | lane-multi |

### C. 跨会话（老板已批，云人约束）
| # | 功能 | 价值 | 可行性 | 成本 | 依据 |
|---|---|---|---|---|---|
| C1 | 跨会话产物索引（Host `sessionProjections` + 索引只存 id/路径/sha，插件目录落盘；全部会话按会话分组） | 高 | 高（需按运行版 API） | 中高（2.5-3.5 天） | lane-cross |
| C2 | 全局搜索（`remote.session.search`）跨会话找产物 | 中高 | 高 | 中 | lane-dsh |
| C3 | 跨会话并排对比（一个 tab 内双栏，`sessions.retain` 拉对端历史） | 中高 | 中 | 中 | lane-window |

### D. 形态 / 交互
| # | 功能 | 价值 | 可行性 | 成本 | 依据 |
|---|---|---|---|---|---|
| D1 | 右栏 tab + **浮出浮动面板 / 全屏 / 分屏（2 格）** | 高 | 高 | 低 | lane-window |
| D2 | `shell.overlay` 迷你悬浮条（常驻小入口，点开面板） | 中 | 高 | 中 | lane-window |
| D3 | 快捷键（`ctx.shortcuts.register`）+ tab 右键菜单（`sidebar.right.tab.menu.item`）+ toast 反馈 | 中 | 高 | 低 | lane-dsh/window |
| D4 | 设置迁移：主配置迁 Host Config + 插件配置页（`plugins.row.config`），`settings.general.item` 只放引导语开关 | 中 | 高 | 中 | lane-dsh |

### E. 数据/性能
| # | 功能 | 说明 |
|---|---|---|
| E1 | `remote.$stream` 实时化替代 5s 轮询 | 中成本，减少空转 |
| E2 | 跨会话索引回填：分批、并发 1-2、可续、按 sizeBytes 控量 | C1 的前置 |

## 2. 不做（明确排除）
- 新窗口 / 多 BrowserWindow：DSH 单窗口硬限制，插件拿不到 Electron API，`window.open` 被 deny；
- 产物编辑器 / WYSIWYG / canvas 生成器：越界、数倍工作量；
- 云端分享链接 / 实时协作 / ACL：单人本机，收益≈0；
- Langfuse 式全链路 trace：与 Trajectory 重复；
- 看板拖拽改真实任务状态：误改风险；
- 终端 PTY/job 原始输出、MCP/技能/插件清单：非本次产物、体量大。

## 3. 建议实施顺序
1. **v2（1-2 天）**：v2a 右栏 tab（含浮出/全屏/分屏）→ A1 diff 深链 → A2/A3 导出与文件动作 → A4 画廊/灯箱 → v1.4 引导语开关验收。
2. **v3（2-4 天）**：B1/B3/B4/B5 多 subagent 任务分组（方案 A：父事件流建索引 + 懒加载子会话 + 未归属兜底）→ B2 workflow 分组 → B6 goal 头部条。
3. **v4（2-4 天）**：C1 跨会话索引（Host 投影 + 引用落盘 + 回填）→ C2 全局搜索 → C3 并排对比。
4. **v5（随做）**：D2/D3 迷你悬浮条与快捷键、E1 实时化、D4 设置迁移。

## 4. 风险与约束（四路合并 Top5）
1. 跨会话无批量接口：N 个子会话 = N 次 RPC，必须懒加载 + LRU + 并发闸；
2. 历史页按消息数对齐，长会话早期轮次会被截断；跨会话索引需要 Host 侧全量回填才能完整；
3. 任务归属只能靠事件 + writeScopes（提示性、可绕过）→ 必须有「未归属」兜底并标注；
4. 无 mtime，时间轴只能靠事件 time/seq；同文件多版本对比要自建聚合；
5. 运行版 0.2.2-rc.1 与本地 checkout 0.1.6 有 API 差异（如 `remote.session.events`），写代码只认运行版，且 Host 改动要下次正常启动才生效（不为此重启）。

## 5. 云人硬约束（落实记录）
- 引导语：固定文本、可一键关（插件配置布尔开关），只影响 DSH 内 agent；
- 跨会话索引：只收 DSH 范围（不碰 Cursor/Grok 产物）；只存 id/路径/sha 引用，不存正文；放插件自己的目录；卸载清理干净；不碰 `~/.dsh` 数据与凭据；
- 交付：git diff / 文件 diff + 自测输出，交马人转云人轻验收。

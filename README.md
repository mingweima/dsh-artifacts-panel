# SuperDick — 本地 Super Agent 工作台

一个可以长期派活的「超级智能体」团队：Lead（主脑）+ 按需派生的 durable 队友 + 共享任务板，全部跑在你本机的 DeepSeek Harness（DSH）里。

灵感来自 DeepSeek 开源的 [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)：Router 接单 → 工单（Ticket/Mandate）→ Worker 执行 → 独立验收 → 回复/交付。我们把「GitHub 事件触发」换成了「你在 GUI 里派任务」，用 DSH 自带的 Agent Teams 实现，无需额外账号、无需常驻独立进程。对照表见 [`docs/architecture.md`](docs/architecture.md)。

## 已就绪

- ✅ DSH 预设 **`Super Agent`**（`super-preset/`）— 主脑 persona + 全套执行/编排工具（bash / 文件 / web / plan / todo / goal / 子代理 / workflow / skill / 压缩）
- ✅ 团队章程 [`AGENTS.md`](AGENTS.md) — 每个会话自动载入
- ✅ 作业技能 `super-team`（[`.dsh/skills/super-team/`](.dsh/skills/super-team/SKILL.md)）— 流程、角色卡、工单模板，按需加载
- ✅ 编排模板 [`workflows/`](workflows/README.md) — 大规模 fan-out 时用
- ✅ workspace 已 `git init`，可版本化

## 开始使用

1. 在 DSH 里**新建会话**，工作目录选 `~/Documents/SuperDick`。
2. Agent 预设选 **`Super Agent`**（新建会话时的预设选择器里；默认的 `standard` 没有团队主脑 persona）。
3. 直接派活，例如：

   > 帮我把 `projects/demo/` 里那个静态页面加一个深色模式，再找个人独立验收。

   > 用团队调研一下：本地知识库里关于 X 的记录有哪些？给我带出处的结论。

   > 这周帮我把项目 A 的 README 补齐、把测试跑通，交付时给我证据。

4. Lead 会自己判断：小任务直接做；需要并行/独立验收才开队友、建任务板。你可以随时插话改范围。
5. 交付格式固定：**结论 → 改动 → 验证证据（命令 + 退出码）→ 风险/未决**。

> 上面派活示例里的 `projects/demo/` 是假设路径；实际项目放 `projects/` 下自建即可。

> 想固定成「长期团队」：把一个长期项目的会话当作 HQ，持续在同一个任务板上加任务；队友和任务板在该会话内 durable，可冷恢复。

## 团队怎么工作

```
接单定界 → 立案(任务板 DAG) → 派单(durable 队友) → 施工 → 独立验收 → 交付 → 归档
```

- **Lead**：定界、拆单、派单、协调、终审、对你交付。
- **scout / builder / verifier / scribe**：按需派生；实现者不能验收自己的活。
- **质量门**：每条验收标准都要有证据（命令 + 退出码或文件行号），测试/构建必须真跑。
- 详细规则见 [`AGENTS.md`](AGENTS.md) 与 `super-team` 技能。

## 目录结构

```
SuperDick/
├── super-preset/          # DSH bundle：Super Agent 预设声明
│   ├── package.json
│   └── cordis.patch.yml
├── AGENTS.md              # 团队常驻章程（自动载入）
├── .dsh/skills/super-team # 作业技能（流程/角色卡/工单模板）
├── workflows/             # workflow 工具编排模板
├── docs/architecture.md   # 与官方 super-agent 的架构对照
└── README.md
```

## 维护

### 安装 / 重装预设

预设是一个本地 DSH bundle。安装（或改了 `cordis.patch.yml` 后重装）：

- 在 DSH 侧边栏 **Plugins** 页面安装本地 bundle，目录选 `super-preset/`；
- 或让一个开了插件管理工具的会话调用 `plugin_manager`：`action: install_bundle`，`target: /Users/mingweima/Documents/SuperDick/super-preset`。

装好后 `plugin_manager` `list_plugins` 里应能看到 `preset-super` 行且无激活诊断；新会话即可选到 `Super Agent`。**已存在的会话保留旧组合**，要新会话才生效。

> 如果新会话的预设选择器里暂时看不到 `Super Agent`：重启一次 DSH（或重新安装 bundle），再新建会话。

### 改团队规则 / 角色

- 章程：直接改 `AGENTS.md`，下一个请求生效。
- 角色卡与工单模板：改 `.dsh/skills/super-team/references/`。
- 作业流程：改 `.dsh/skills/super-team/SKILL.md`。
- 工具集 / persona：改 `super-preset/cordis.patch.yml` 后重装预设。

### 卸载

`plugin_manager`：`action: remove_bundle`，`target: @local/dsh-super-agent-preset`。

## 与官方原型的区别

官方原型是**无人值守的事件驱动**版本（GitHub/飞书监听 + 独立 profile + Web 面板 + PR 交付）。本 workspace 是**人的 GUI 派单**版本：触发来自你，worker 共享当前目录，工单存在会话任务板里。两者定位不同，可共存；需要监听外部事件时再部署官方原型。

## 边界与注意

- 队友共享同一工作目录：并行任务靠 `write_scopes` 划分 + Lead 终审，任务板只是**建议性**提示，不是文件锁。
- 队友是 fresh 上下文：派单 prompt 必须自包含。
- 会话结束不跨会话保留队友；长期项目请固定 HQ 会话。
- 默认只做被要求的事，不做主动后台工作；部署/外发/花钱/删数据前必须问你。

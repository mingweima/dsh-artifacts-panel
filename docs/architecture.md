# 架构：本地 Super Agent 如何映射 DeepSeek 的 super-agent

DeepSeek 在 2026-11 开源了 [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（MIT，研究原型）：一个常驻的 Router 监听 GitHub/飞书，把被授权的请求变成 Ticket，派给隔离的 Worker 会话执行，结果以 PR/回复回到原对话，另有一个 Web 面板显示需要人处理的事。核心设计文档是 *Exploring Super-agent Design: Towards a More Autonomous Agent System*。

本 workspace 借用它的**工作方式**，但把触发源换成你在 DSH GUI 里的任务，用 DSH 自带的 Agent Teams 实现，不引入独立进程和额外账号。

## 1. 概念对照

| 官方概念 | 官方实现 | 本 workspace 实现 |
|---|---|---|
| Source（触发源） | GitHub / 飞书插件轮询 | 你在 GUI 会话里的消息；后续可扩展 webhook/session 引用 |
| Trigger | issue/PR 评论、群消息 | 一条用户任务 |
| Eval / Decision | 主会话模型判断是否接单 | Lead 接单定界（`AGENTS.md` §3、技能 §1） |
| Ticket | 工单对象，独立会话与目录 | `team_task_*` 共享任务板工单 |
| Mandate | 不可变的授权记录（为什么可以做） | 工单 description 的 Authority/Scope 段 |
| Executor / Worker | `dsh-superagent-worker` 预设的隔离会话 | `spawn_teammate` 派生的 durable 队友（同预设、共享 cwd） |
| Report | worker 汇报状态/问题/PR | 队友完成消息 + 任务板状态 |
| Outbox / Reply | 回到触发对话的消息 | Lead 的最终回复（`present` 交付文件） |
| Panel | 独立 Web 面板 | DSH Web GUI 的 Agent Teams 名册/任务板 |
| 独立验收 | reviewer 门禁 | verifier 角色 + Lead 终审（`AGENTS.md` §7） |

## 2. 本仓库的组件

```
SuperDick/
├── super-preset/          # DSH bundle → 注册 `Super Agent` 预设
│   ├── package.json       #   dsh.bundle.patch 指向 cordis.patch.yml
│   └── cordis.patch.yml   #   persona + 工具集（standard 超集）
├── AGENTS.md              # 常驻团队章程（每会话自动载入）
├── .dsh/skills/super-team # 作业技能：流程/角色卡/工单模板（按需加载）
├── workflows/             # workflow 工具编排脚本模板（大规模 fan-out）
└── docs/                  # 架构与长期文档
```

### 预设层（super-preset）

- 安装后写入 desktop profile 的 bundle 选择；新会话可在预设选择器里选 `Super Agent`。
- 工具集 = 官方 `standard` 预设的全套（bash/fs/jobs/web/plan/todo/goal/delegation/workflow/skill/compaction）+ 团队主脑 persona。
- 队友由 Agent Teams 的 spawn provider 创建，**默认继承父会话预设**，所以队友也拥有同一套工具；Lead/队友身份由 Agent Teams 的运行时上下文注入，无需第二个 worker 预设。

### 章程层（AGENTS.md）

- 由 `dsh-agent-instructions` 自动载入，是每支团队的共同约束：接单原则、编制、流程、工单契约、质量门、汇报格式、安全边界。
- 章程放在 workspace 而不是预设里，好处是改动即时生效、可版本化、可随项目演进。

### 技能层（.dsh/skills/super-team）

- `skill-filesystem` 的项目根扫描（`.dsh/skills`）自动发现，按需 `skill` 加载，不占常驻 prompt。
- 装着可执行细节：规模判断表、立案/派单/验收步骤、spawn prompt 模板、失败处理、反模式、角色卡、工单模板。

### 编排层（workflows/）

- `workflow` 工具适合**大规模独立 fan-out**（审计 N 个文件、调研 N 个主题）：脚本内 `agent()` 起临时 subagent，有 phase/log/结构化 schema，跑完即弃。
- Agent Teams 适合**需要持续上下文、名册和任务板**的协作；两者互补，不要用 workflow 替代需要 durable 队友的场景。

## 3. 一次任务的时序

```
用户 → Lead：任务
Lead：查清事实 → 定界（目标/验收/边界）→ todo + 任务板 DAG
Lead：spawn scout/builder/verifier（prompt 内含工单契约）
teammates：claim → 执行 → 汇报 → complete
Lead：独立验收（verifier 或自己重跑）→ 审 diff → 交付/退回
用户 ← Lead：结论 + 改动 + 证据 + 风险
```

## 4. 与官方原型的差距（诚实说明）

| 能力 | 官方原型 | 本 workspace |
|---|---|---|
| 无人值守的事件驱动 | ✅ GitHub/飞书轮询 + 常驻进程 | ❌ 由用户消息触发 |
| 独立 worker 目录 | ✅ 每单独立 checkout | ❌ 共享 cwd，靠写域划分 |
| 授权/评估模型 | ✅ Policy/Source/Assessor 全套 | 简化版：章程 + 工单 Authority |
| 持久工单库 | ✅ SQLite + 面板 | 会话内任务板（跨会话不留存） |
| 主动工作模式 | ✅ off/observe/auto | ❌ 默认只做被要求的事 |

需要事件驱动版时，直接部署官方原型（独立 profile + GitHub bot 账号 + 目标仓库），二者不冲突：官方负责「监听外部事件」，本 workspace 负责「你在 GUI 里派的任务」。

## 5. 扩展路径

- **接 GitHub**：可装官方 `@deepseek-ai/dsh-webhook-github`（实验包）或官方原型；把 webhook 事件转成 Lead 的任务。
- **跨会话团队**：把长期项目的 HQ 固定在一个会话；任务是 durable 的，冷恢复后继续。
- **加角色/技能**：在 `references/role-cards.md` 加角色卡；在 `.dsh/skills/` 加技能；在 `AGENTS.md` 的编制表登记。
- **改预设工具集**：编辑 `super-preset/cordis.patch.yml` → 重新安装 bundle → 新会话生效（已有会话保留旧组合）。

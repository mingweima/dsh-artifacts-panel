---
name: super-team
description: Super Agent 团队作业手册：接单定界、建任务板 DAG、派发 durable 队友、独立验收与交付。需要派活/开团队/管理任务板时加载。
whenToUse: 接到多步、可并行、或多角色协作的任务；或需要 spawn/协调队友、维护共享任务板时。
---

# Super Team 作业手册

本技能是 `AGENTS.md` 的执行细则。默认原则：**能一个人快速做好的事，就不开团队；开团队就按流程走完整。**

## 0. 规模判断

| 情况 | 做法 |
|---|---|
| 1 个明确小任务（读文件、改一处、回答） | Lead 自己做，不建任务板 |
| 2~4 个可并行或需要独立验收的子任务 | 建任务 DAG，spawn 1~3 个队友 |
| 大量独立小项（审计 N 个文件、调研 N 个主题） | 用 `workflow` 工具写 fan-out 脚本（临时 subagent，无会话负担），模板见 `workflows/` |
| 需要持续多轮、要保留上下文和名册的长期项目 | Agent Teams 团队，固定会话当 HQ |

不要为「看起来像 super agent」而 spawn。队友是成本，不是装饰。

## 1. 接单定界

1. 读 workspace 与任务相关文件，把能查清的事实查清。
2. 写下三件事：**目标 / 验收标准 / 边界**（不能动什么、是否可外发、是否可部署）。
3. 只有以下情况才问用户（`ask_user_question`，一次问清）：用户偏好或取舍、授权范围不明、要求互相矛盾。
4. 定界后先给用户一句「我打算怎么做」的极简计划（1~3 行），再开工；除非任务明确要求直接做。

## 2. 立案（任务板 DAG）

- `todo_write` 记 Lead 自己的步骤进度（会话内可见）。
- `team_task_create` 为每个子任务建工单，description 用 **工单契约** 模板（见 `references/task-contract.md`），并在参数里给 `blocked_by` 和 `write_scopes`。
- 依赖只写真实依赖；无依赖的并行任务不要串成链。
- 写作用域必须互不重叠；同一文件只能有一个 owner。发现重叠 → 拆任务或串行。

示例顺序：先建 `t1`（调研/定方案）、`t2`（实现 A，blocked_by t1）、`t3`（实现 B，blocked_by t1）、`t4`（独立验收，blocked_by t2,t3）。

## 3. 派单（spawn_teammate）

队友是 **fresh 上下文**：它看不到你的对话、任务板和文件之外的任何东西。prompt 必须自包含，至少包含：

```
你是 <name>，本团队的 <角色>。工作目录：<workspace 绝对路径>。
任务：<task-id> — <标题>。
背景：<为什么做、上下文、关键文件路径>。
契约：
  - Objective: ...
  - Scope: 只改 <路径>；不要动 <路径>
  - Acceptance: ...
  - Verify: <命令/检查方式>
  - Deliverable: <产出形态>
  - Authority: <只读 / 可改文件 / 可跑测试 / 不可外发>
写作用域：<workspace 相对路径>（其他文件只读）
流程：先 team_task_update(action=claim, expected_revision=<当前 revision>) 认领；完成后按下方格式汇报，并 team_task_update(action=complete) 结单。
汇报格式：结论 / 改动文件 / 验证命令+退出码 / 风险与未决。遇到需要决策的阻塞，用 send_message 发给 lead，不要自行扩大范围。
禁止：越权部署/外发/删数据；改 write 域之外的文件；替自己验收。
```

要点：
- **先建任务再 spawn**，把 task id 和 revision 写进 prompt。
- `context` 用默认 `fresh`；只有任务确实依赖你的完整对话时才用 `fork`。
- 名字用 lower-kebab-case 且描述职责（如 `scout-api`、`builder-auth`）；名字永久，失败也不可复用。
- 一次最多 spawn 2~4 个；先派能立即开工的，依赖任务等前序完成再派或让队友等待。

## 4. 施工协调

- Lead 自己也要干活（通常是集成、裁决、最终验收），不要只当调度台。
- 队友开工后，用 `wait_agent` 等变化；超时后 `list_agents` + `team_task_list` 重读状态，**不要空转轮询**。
- 队友需要信息 → `send_message` 给完整事实（它可能已冷恢复，消息要自包含）。
- 队友卡住/跑偏 → `interrupt_agent` 保留其收件箱，再发纠正消息或改派。
- 改任务范围用 `team_task_update(action=edit)`；改负责人用 `reassign`；都带最新 revision。
- 关键决策（换方案、缩范围、放弃某任务）由 Lead 定，并同步给受影响队友和用户。

## 5. 验收门（不可跳过）

1. **独立**：实现者不能验自己 → 用不同的 verifier 队友，或 Lead 亲验。
2. **逐条**：对 acceptance 每一条给「通过/未通过 + 证据」。
3. **真跑**：verify 命令必须实际执行，记录命令与退出码；不能只看代码。
4. **审 diff**：Lead 用 `git diff`/`git status` 审最终改动，检查写域外改动与调试残留。
5. **回归**：有测试/构建的项目跑既有测试；没有则至少跑静态检查或最小可复现验证。

任一条不满足 → 任务回退（`team_task_update(action=reopen)`），带具体缺口再派修。

## 6. 交付与归档

最终回复用 `AGENTS.md` 第 8 节格式。有成品文件用 `present` 挂出。
归档：所有任务 complete；在最终回复或 `docs/decisions/` 写下可复用结论；长期项目保留会话继续下一批。

## 6.1 子代理安全硬约束（派发前逐条照做，漏一条算派发人越界）

任何带自测/探测/回归的子代理派发，prompt 必须逐字带上
`~/Documents/DSH/ops/subagent-safety/子代理派发模板.md` 第一节的【测试目标硬约束】段。

- 自测脚本先接守卫 `~/Documents/DSH/ops/subagent-safety/port_guard.py`：写请求只允许副本端口（8767/8777/8799），
  命中 8766/8768 直接 `SystemExit(3)`，判定在发请求之前完成，无开关可放开。
- 派发者责任：子代理越界算派发人的。
- 复核子代理交付时**先看脚本里有没有 `port_guard`，再看输出**；不看输出先看守卫。
- 证据留档：模板原文、守卫代码、自测记录随送审材料一起交。

## 7. 失败处理

| 现象 | 处理 |
|---|---|
| 队友 spawn 失败 | 名字已占用，不能复用；用新名字 + 诊断后的 prompt 重派 |
| 队友反复出错 | interrupt → 缩小任务 → 重派或 Lead 自己做 |
| 验收失败 | reopen 任务，明确缺口清单，派回原 builder（或换人） |
| 依赖任务被阻塞 | 检查 blocked_by 是否真实；必要时重新拆单 |
| 预算/时间不够 | 缩范围交付「部分完成 + 明确未决」，不要假装完成 |

## 8. 反模式

- ❌ 没验收标准就派单
- ❌ 实现者给自己验收
- ❌ 两个队友同时改同一批文件
- ❌ 无限 `wait_agent` 轮询
- ❌ 把「我做了」当成「验证了」
- ❌ 为用户能查的事实反复问用户
- ❌ 为小任务 spawn 一堆队友

## 参考

- `references/task-contract.md` — 工单契约模板与填写示例
- `references/role-cards.md` — scout / builder / verifier / scribe 角色卡
- `workflows/` — fan-out 编排脚本模板
- `docs/architecture.md` — 与官方 super-agent 设计的对照

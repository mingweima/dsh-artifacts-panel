# workflow 编排模板

`workflow` 工具用来做**大规模 fan-out**：脚本里用 `agent()` 起临时 subagent、`pipeline()` 流式处理、`parallel()` 汇合，最后返回一个 JSON。适合「审计 N 个文件 / 调研 N 个主题 / 多角度验证同一批发现」，跑完即弃，不占用会话名册。

## 什么时候用

| 场景 | 用 workflow | 用 Agent Teams |
|---|---|---|
| 独立小项很多（>5），彼此不需要协调 | ✅ | ❌ 队友开销太大 |
| 每项处理流程相同（审计→复核） | ✅ | 可以但没必要 |
| 需要持续多轮、保留上下文和名册 | ❌ | ✅ |
| 需要写同一批文件、要划写域 | ❌ | ✅ |
| 需要中间给人看进度/审批 | 可用后台 job | ✅ 更适合 |

## 怎么执行

1. Lead 读取模板（例如 `workflows/fanout-audit.js`），按任务改写 `args` 和 prompt。
2. 调用 `workflow` 工具：`meta`（name/description/phases）、`script`（文件正文，去掉注释头可按需保留）、`args`（JSON 对象）。
3. 大规模任务可加 `run_in_background: true`，用 `job_output` 收结果。

## 脚本约定

- 脚本只做编排：文件读写/命令由 subagent 在共享 workspace 里执行。
- `agent()` 默认返回子 agent 的最终文本；传 `opts.schema` 时返回校验后的对象，失败返回 `null`。
- 用 `pipeline()` 让同一项的两三个阶段无屏障地串行，比 `parallel` 更省墙钟时间。
- 失败项会被丢成 `null`，最后 `.filter(Boolean)` 并统计缺口，不要把部分成功报成完成。
- 返回值必须 JSON-serializable；大文本请截断，避免超 `maxResultChars`。

支持的 schema 关键字只有：`type` / `properties` / `required` / `additionalProperties` / `items` / `enum` / `const` / `oneOf`，根必须是 object。

## 模板文件

- `fanout-audit.js` — 并行审计 + 对发现做对抗复核的标准两段式。

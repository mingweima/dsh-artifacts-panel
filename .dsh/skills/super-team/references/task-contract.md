# 工单契约模板（Task Mandate）

每个 `team_task_create` 的 description 都按下表填写。工单就是队友的「授权书」：写清做什么、做到什么算完、被授权到哪一步。

## 模板

```markdown
## Objective
<一句话目标，可验证>

## Background
<为什么做、上下文、关键文件/入口/约束；fresh 队友只能看到这里的内容>

## Scope
- 允许修改：<workspace 相对路径列表>
- 只读：<路径>
- 不要动：<路径/模块>

## Acceptance
- [ ] <可逐条判定的标准 1>
- [ ] <标准 2>
- [ ] <标准 3>

## Verify
- `命令` → 期望（exit 0 / 输出包含 X / 文件存在）
- 检查方式：<静态检查 / 手动核对 / 测试>

## Deliverable
<文件路径 / 结论格式 / 补丁 / 报告>

## Authority
<只读 | 可改 Scope 内文件 | 可运行测试 | 不可外发/部署/提交远端>

## write_scopes
<workspace 相对路径前缀，与 team_task_create 参数保持一致>
```

## 示例（实现类）

```markdown
## Objective
为 `projects/snake/` 增加暂停/继续功能并保留现有玩法。

## Background
现有入口 `projects/snake/index.html`，逻辑在 `game.js`；Tests: `node projects/snake/smoke.mjs`。

## Scope
- 允许修改：`projects/snake/game.js`, `projects/snake/index.html`
- 只读：`projects/snake/smoke.mjs`
- 不要动：仓库其他目录

## Acceptance
- [ ] 空格键在运行/暂停间切换，暂停时蛇不移动
- [ ] 恢复后从暂停位置继续，不跳帧
- [ ] 既有 smoke 测试通过
- [ ] 无控制台报错

## Verify
- `node projects/snake/smoke.mjs` → exit 0
- 手动：打开 index.html 按空格两次，确认状态提示文字变化

## Deliverable
改动后的两个文件 + 一段自测记录

## Authority
可改 Scope 内文件、可运行本地测试；不可部署、不可外发、不可提交远端。
```

## 示例（调研类）

```markdown
## Objective
确认 DSH 预设的安装机制与失败排查路径，供后续维护预设使用。

## Background
我们有一个本地 bundle `super-preset/`；需要知道安装、验证、更新、卸载的准确命令与观察点。

## Scope
- 只读：`/Applications/DeepSeek Harness.app/.../dsh/node_modules/@deepseek-ai/dsh-agent-preset*`、`super-preset/`
- 不要动：任何文件

## Acceptance
- [ ] 给出安装/验证/更新/卸载的准确操作与预期结果
- [ ] 列出 3 种常见失败与诊断入口
- [ ] 结论带文件路径或行号证据

## Verify
- 每一条结论都有出处（路径或命令输出）
- Lead 抽查 2 条

## Deliverable
结构化结论（不超过 40 行）

## Authority
只读。
```

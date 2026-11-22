# DSH 产物面板（Artifacts Panel）设计

| 项目 | 内容 |
|---|---|
| 文档状态 | 设计稿（2026-11-12） |
| 实现位置 | `plugins/dsh-artifacts-panel/` |
| 验证脚本 | `tools/artifacts-panel-verify/verify.py` |
| 适用版本 | 当前 DSH Web GUI（顶部 View 导航现有 Chat / Trajectory / 上下文 / 统计，本插件新增「产物」） |

> **结论先行**：做一个**只读、会话级**的产物索引页。顶部 `conversation.view` 增加「产物」页签（id `artifacts`，`order 45`），右侧栏同步注册一个产物 tab；数据来自当前会话事件流（每轮最终回复、交付物、写文件、附件），在内存里按轮次聚合，支持类型过滤 / 搜索 / 收藏 / 隐藏 / 导出 / Finder 打开；预览复用 DSH 现有文件协议与预览组件。v1 只做当前会话，不做持久化、不做跨会话；**先本地验证通过，再安装**。

---

## 1. 需求与原话摘要

老板的原话大意（转述）：

> 每轮最终回复、md 文档、图片、其他文件，被后面的消息覆盖掉，翻不回去；想要 Cursor 那种产物界面，对话过程中或结束都能看，还能整理。

拆成四条需求：

| 编号 | 需求 | 现状痛点 |
|---|---|---|
| R1 | 每轮最终回复要能回看 | 长会话里被后续消息顶走，只能滚回去翻 |
| R2 | 文档 / 图片 / 文件要集中 | 散落在工具输出、`present` 卡片、附件里，各找各的 |
| R3 | 能整理 | 没有分类、搜索、收藏、隐藏、导出；Finder 里文件名对不上轮次 |
| R4 | 两个入口 | 顶部 View 导航要有页签；右侧栏也要能开，边聊边看 |

使用场景：单人本机（老板本人），一个会话一次任务；产物可能出现在对话中途，也可能在结束时一次性交付。

---

## 2. 决策

> 【已定】以下 D1–D7 已由老板/Lead 在 2026-11-12 派单中确认；D8 为设计侧建议，标【待定】。

| 编号 | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 入口 | 双入口：顶部 `conversation.view` 页签 + 右侧栏 tab | R4；顶部适合"整页看"，右栏适合"边聊边看" |
| D2 | 收录范围 | 每轮最终回复、`deliverables/presented`、`write`/`edit` 的 `meta.path`、`workspaceFiles`、`attachment`、`workspace/changes` | 只收"成品/文件"，不收中间工具日志，避免刷屏 |
| D3 | 收集方式 | 自动收集 + 手动整理（收藏 / 隐藏 / 删除条目仅影响视图） | 不打断对话；整理是附加动作，不是前置条件 |
| D4 | 组织维度 | 轮次 / 类型 / 搜索 / 收藏 / 隐藏 / 导出 / Finder 打开 | R3；轮次是主骨架，类型与搜索是快速定位 |
| D5 | 跨会话 | v1 当前会话；v2 跨会话并按会话分组 | 跨会话要回放全部会话事件，成本与复杂度高，先小步验证 |
| D6 | 发布 | 先本地验证（脚本 + 手工），再安装到 profile | 插件安装影响全 profile，不能拿主环境试错 |
| D7 | 存储 | v1 纯内存，不新建持久层；从会话事件回放重建 | 没有可靠的 mtime / 外部存储依赖；刷新重建可接受 |
| D8 | 去重键 | 【待定】建议 `(sessionId, turnIndex, kind, path \|\| url \|\| seq)` 归一，重放幂等 | 同一文件多轮写入时"每轮各记一条"，体现"这轮改了什么"；不做版本合并 |

---

## 3. 技术方案

### 3.1 注册与入口

```
conversation.view 槽
├── Chat
├── Trajectory
├── 上下文
├── 统计
└── 产物（id=artifacts, order=45）        ← 顶部页签：整页视图

sidebar.right.pane.tab 槽
└── 产物（id=artifacts）                  ← 右栏：紧凑视图，与顶部共享状态
```

- 顶部页签：在 `conversation.view` 注册 `id: "artifacts"`、`order: 45`、标题「产物」。`order` 排在同槽现有页签之后，不改变旧页签顺序。
- 右侧栏：`ctx.sidebarRightTabs.register({ id, title, order, render })`，面板渲染到 `sidebar.right.pane.tab` 插槽。
- 两个入口共用同一个 `ArtifactsStore`（React Context / 模块级 store），切换入口不重建、不丢失滚动位置与筛选状态。
- 视图组件拆分：`ArtifactsView`（筛选栏 + 轮次列表 + 预览抽屉）；紧凑模式隐藏大标题与统计条。

注册示意（具体签名以 DSH 客户端插件 SDK 实际类型为准）：

```ts
ctx.slots.register("conversation.view", {
  id: "artifacts",
  order: 45,
  title: "产物",
  render: () => <ArtifactsView />,
});

ctx.sidebarRightTabs.register({
  id: "artifacts",
  title: "产物",
  order: 45,
  render: () => <ArtifactsView compact />,
});
```

### 3.2 数据源（字段级）

| 数据 | 来源 | 关键字段 | 用途 / 取舍 |
|---|---|---|---|
| 轮次边界 | `remote.session.events`（`follow` 增量订阅） | `type=user/message`、`seq`、`ts` | 每条用户消息开启一轮；`seq` 保证顺序 |
| 最终回复 | `assistant/message` | 文本、`seq` | 每轮**最后一条** assistant 文本作为「最终回复」；中间 assistant 消息不进面板，避免刷屏 |
| 交付物 | `deliverables/presented` | `kind`、`title`、`path`、`url` | `present` 工具产生的卡片，语义最贴近"产物" |
| 写文件 | 工具调用 `write` / `edit` | `meta.path` | 只取路径，不读内容；路径缺失则跳过 |
| 工作区变更 | `workspace/changes` | `path`、变更类型 | 补外部改动 / 删除，用于标记"文件已不在" |
| 文件清单 | `workspaceFiles` | `path`、`size`、类型 | 校验存在性，补大小与类型（**没有 mtime**） |
| 附件 | `attachment` | 名称、路径 / MIME | 用户上传的图片 / 文件，归入该轮 |

> 约束：面板不主动扫描磁盘、不复制文件、不缓存文件内容；文件是否存在、能否预览由 `dsh-resource://` 协议与 `workspaceFiles` 判定。

### 3.3 聚合模型

```ts
type ArtifactKind = "reply" | "doc" | "image" | "file" | "other";

interface ArtifactItem {
  id: string;            // sha1(sessionId|turn|kind|path||url||seq) 前 16 位，重放幂等
  turn: number;          // 轮次序号，从 1 开始
  kind: ArtifactKind;
  title: string;         // 文件名 / 交付物标题 / "第 N 轮最终回复"
  path?: string;         // 会话工作区内相对路径
  url?: string;          // 外部链接（presented url）
  source: string;        // assistant/message | presented | write | edit | workspace/changes | attachment
  size?: number;
  favorite: boolean;     // v1 仅内存
  hidden: boolean;       // v1 仅内存
}

interface Turn {
  index: number;
  startedAt?: string;    // 事件 ts；缺失时按序号排序
  finalReply?: ArtifactItem;
  items: ArtifactItem[];
}
```

- 重放：打开面板时回放当前会话事件，边回放边建 `Turn[]`；之后 `follow` 增量更新。
- 幂等：增量事件与回放可能重叠，按 `id` 去重。
- 排序：轮次倒序（最新在上），轮内按"回复 → 交付物 → 文件 → 附件"稳定排序。

### 3.4 预览

- 统一 URL：`dsh-resource://file/session/<sid>/<path>`。
  - `path` 先归一化：拒绝绝对路径与 `..`，只允许会话工作区内；URL 编码后拼接。
- Markdown：复用 `documentpreview` 渲染；图片：`<img>` 懒加载；文本：前 64KB 只读展示；二进制：元信息 + Finder 打开 / 下载。
- 外部 URL（`presented` 的 `url`）用系统浏览器打开，不在面板内嵌 iframe。
- 失败态：文件被删 / 移走 → 面板内显示「文件不存在或已移动」，不抛全局错误、不阻塞其它条目。

### 3.5 性能

- 首屏只回放当前会话；`follow` 增量更新，200ms 合并一次重渲染（coalesce）。
- 列表虚拟化（>200 条），缩略图懒加载，预览按需读取。
- 单条事件解析失败 → 跳过并计数（面板底部显示"已跳过 N 条异常事件"），不中断。

### 3.6 已知限制

1. **无 mtime**：`workspaceFiles` 不提供修改时间，只能按轮次时间 / 序号排序，不能"按文件修改时间"排。
2. **summary 只在内存**：刷新 / 重开页面后需要重新回放事件重建；v2 可落盘缓存。
3. **事件字段不稳定**：老会话可能缺 `meta.path`、`presented` 形态不一 → 归入"未归类"。
4. **同一文件多轮写入**：v1 每轮各记一条，不合并版本；如需"最新版"用过滤 + 轮次倒序。
5. **只读**：面板不编辑、不删除真实文件；"隐藏"只影响面板视图。

---

## 4. 与 DSH 已有能力的关系

| 已有能力 | 它做什么 | 产物面板的差异 | 关系 |
|---|---|---|---|
| `ui-deliverables` 每轮卡片 | 在对话流里内联展示当轮交付物 | 面板把它抽成**会话级索引**，跨轮聚合、可过滤 / 搜索 / 导出 | 复用 `presented` 事件语义，不重写卡片渲染 |
| `documentpreview` | 单文件预览（md / 图片 / 文本） | 面板负责"找到并打开"，预览交给它 | **复用**，不重复实现渲染 |
| `sidebar-files` | 工作区文件树，按文件系统组织 | 面板按**轮次 / 会话**组织，回答"这轮产出了什么" | 复用文件访问协议，不复制文件 |
| 顶部 View 页签 | Chat / Trajectory / 上下文 / 统计 | 新增「产物」，不改旧页签 | 同槽扩展，`order` 排后 |

结论：产物面板是**索引层 + 聚合层**，不是新的存储、不是文件管理器、不是编辑器。预览、文件访问、交付物语义全部复用现有能力，避免重复造轮子。

---

## 5. 范围

### 5.1 v1（本次）

- 当前会话聚合；顶部页签 + 右栏 tab 双入口；轮次分组（倒序）。
- 类型过滤（回复 / 文档 / 图片 / 其他文件）、标题 + 路径搜索、收藏 / 隐藏。
- 点击预览（md / 图片 / 文本），外部链接用系统浏览器打开。
- 导出（选中条目 / 整轮，复制到指定目录 + JSON 清单）。
- Finder 打开（单条或整轮目录）。
- 空态文案、新轮自动刷新、文件缺失错误态。

### 5.2 v2（待办）

- 跨会话：会话列表 + 按会话分组；懒加载 / 分页 / LRU 缓存。
- 收藏与隐藏持久化（settings store）。
- 全文搜索（标题 / 路径 / 正文摘要）。
- 批量导出 zip、拖拽导出。
- 产物 pin 到对话、点击跳回原轮次。
- 预览内"用默认应用打开"与复制路径。

### 5.3 非目标

- 不做文件编辑器、不做版本管理、不做云同步、不做多用户共享。
- 不替代 Finder；不主动扫描工作区以外的目录。
- 不改变 DSH 原有对话流渲染与 `present` 行为。

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 长会话事件量大（数千条） | 首屏卡顿 | 只回放当前会话；增量 follow；虚拟列表；200ms 合并；预览懒加载 |
| 跨会话（v2）成本高 | 内存 / 时间膨胀 | 分页 + 按需加载 + LRU 上限；不预加载全部会话 |
| 安装影响全 profile | 所有会话都出现入口，出问题面大 | 先本地 bundle + 脚本验证，再手动启用；随时可 `set_plugin enabled:false` |
| 事件字段缺失 / 形态不一 | 条目缺失或错乱 | 适配层容错；异常事件计数；"未归类"分组兜底 |
| 无 mtime | 不能按修改时间排序 | 用轮次时间排序，并在 UI 标注排序口径 |
| summary 只在内存 | 刷新后重建慢 | 打开时回放；v2 落盘缓存 |
| 路径穿越 / 越权读取 | 读到工作区外文件 | 归一化并限制在 session workspace；`dsh-resource://` 侧校验；不展示环境变量与凭据 |
| 插件与 DSH 版本不兼容 | 装不上或页面报错 | 安装前核对 `engines.dsh`；不满足即放弃安装并回滚 |

---

## 7. 验收标准

逐条可判定，全部通过才算 v1 完成：

| # | 验收项 | 判定方式 |
|---|---|---|
| V1 | 顶部出现「产物」页签，点击可打开 | 脚本 A2 + 目视 |
| V2 | 右栏 tab 可打开，且与顶部共享状态 | 手工：切换入口筛选不丢 |
| V3 | 两轮以上对话，轮次分组、序号、顺序正确 | 手工造 2–3 轮含文件的任务 |
| V4 | 类型过滤（回复 / 文档 / 图片 / 文件）各自命中 | 手工 + 截图 |
| V5 | 点击 md / 图片能预览；文件缺失有错误态 | 手工删文件复测 |
| V6 | 无产物时显示空态文案 | 脚本 A3（空态命中） |
| V7 | 新一轮完成后列表 ≤2s 自动刷新 | 手工计时 |
| V8 | 收藏 / 隐藏 / 搜索生效且不改原始数据 | 手工 + 刷新后确认（v1 允许丢失） |
| V9 | 导出到指定目录，文件数与内容一致 | 手工核对 |
| V10 | 页面无 console error、无崩溃文本 | 脚本 A4 + console_errors |
| V11 | 脚本退出码 0，截图 1440×900 | `python3 tools/artifacts-panel-verify/verify.py --url "<带 token 的地址>"` |

自动化命令（插件未装时应优雅失败并提示）：

```bash
# 机制自检（不依赖 DSH，必须 0）
python3 tools/artifacts-panel-verify/verify.py --selftest

# 真实验收（需要 dsh web 打印的带 token URL；裸端口 401 → 退出码 2）
python3 tools/artifacts-panel-verify/verify.py --url "http://127.0.0.1:51732/?token=..."
```

---

## 8. 附录 A：厂商参考

- **Cursor Canvases**：把 agent 产出渲染在对话旁边的独立视图，可重新打开、编辑、迭代，并进入 workspace 的 canvas 列表。
  - 文档：<https://cursor.com/docs/agent/tools/canvas>
  - 发布说明：<https://cursor.com/blog/canvas>
- **Claude Artifacts**：把可独立渲染的内容放到侧边面板，支持迭代与复用。
  - 帮助文档：<https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them>

参照点：两者都强调"**对话流之外的第二视角**"。DSH 产物面板的差异是**只读索引**——不生成新内容，只把已有产物按轮次聚合起来，降低理解与找回成本。

---

## 9. 附录 B：产物安装与回滚

> 影响面提示：插件安装 / 启用作用于**整个 profile**，所有会话都会看到「产物」入口。安装前先完成本地验证。

### 9.1 安装

1. 确认插件 bundle 已构建：`plugins/dsh-artifacts-panel/`（`package.json` 的 `dsh.bundle` 指向 patch，含 `conversation.view` 与右栏注册）。
2. 核对 DSH 版本要求（`engines.dsh` 或 peer 依赖），不满足不要装。
3. 安装：
   ```
   plugin_manager({ action: "install_bundle", target: "<插件包名或本地目录/安装 spec>" })
   ```
4. 查询是否启用：
   ```
   plugin_manager({ action: "list_plugins" })
   ```
5. 刷新 Web 页面（或按插件加载机制重载 profile），确认顶部出现「产物」页签、右栏出现产物 tab。

### 9.2 停止 / 卸载

- 临时停用（保留插件文件）：
  ```
  plugin_manager({ action: "set_plugin", target: "<entry id>", enabled: false })
  ```
  刷新页面后页签消失即生效。
- 彻底卸载：
  ```
  plugin_manager({ action: "remove_bundle", target: "<bundle 包名>" })
  ```
- 回滚验证：页签消失 + `verify.py` 返回非 0（1 或 2）即说明入口已移除；v1 无持久化数据，回滚**无数据损失**。

### 9.3 关键文件与职责

| 路径 | 职责 |
|---|---|
| `plugins/dsh-artifacts-panel/package.json` | bundle 声明、DSH 版本要求 |
| `plugins/dsh-artifacts-panel/src/`（规划） | 注册入口、`ArtifactsStore`、视图与预览 |
| `tools/artifacts-panel-verify/verify.py` | 页面验证（页签存在、渲染、截图、清理） |
| `tools/artifacts-panel-verify/shots/` | 截图与 JSON 结果（时间戳命名） |

---

## 10. 待定问题（【待定】）

| 编号 | 问题 | 建议 |
|---|---|---|
| Q1 | 同一文件多轮写入，是否合并为"最新版" | v1 每轮一条；v2 提供"只看最新"开关 |
| Q2 | 收藏 / 隐藏是否需要跨会话持久化 | v2 落 settings store，键为 sessionId + artifactId |
| Q3 | Finder 打开用宿主哪个服务 | 以插件可用 API 为准；无 reveal API 时 v1 用 `open -R` 兜底（仅 macOS） |
| Q4 | 导出格式 | v1 复制文件 + `manifest.json`；v2 增加 zip |

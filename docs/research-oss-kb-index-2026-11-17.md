# 开源侦察报告：多级索引与检索（2026-11-17）

> 检索口径：仅公开网络（GitHub API 元数据经 ungh.cc / shields.io 取用 + README 原文）。未 clone、未安装、未改本机环境。
> Star 数为**近似值，检索于 2026-11-17 11:2x（CST）**；「最近提交」取仓库默认分支最近一次 push 时间（`pushed_at`）。
> 适用背景：单机 Mac（Apple Silicon）、Markdown 为主几万页、中文为主、自写 Python 服务（8766）已有「目录树 + 页面树 + metadata」多级结构、调用方是本地 agent、一个人长期维护。

## 0. 一句话结论

真正值得偷的是三个**索引原语**，不是三个平台：

1. **树索引 + LLM 逐层下钻**（PageIndex）——和我们已有的「目录树/页面树」同构，最贴题；
2. **嵌入式混合索引（稠密+稀疏+SQL 过滤，单进程无服务）**（txtai）——最低成本给 8766 加语义层；
3. **时间/实体维度的旁路索引**（Graphiti 双时间轴、HippoRAG 的 PPR 一跳扩展）——解决「跨页聚合、旧结论过期」。

平台型项目（RAGFlow / Khoj / AnythingLLM / Letta）**不建议引入**：它们的价值在"产品完成度"，代价是容器编排与常驻服务，和「一个人装完不折腾」直接冲突。

## 1. 项目对照表

| 项目 | Star（近似） | 最近提交 | 许可 | 能否纯本地 | 中文支持 | 维护成本 | 对我方的可借鉴点（≤40字） |
|---|---|---|---|---|---|---|---|
| [mem0](https://github.com/mem0ai/mem0) | 69.1k | 2026-11-17 | Apache-2.0 | 可，需自配 Ollama/本地向量库，默认走 OpenAI | 中（抽取提示词英文，中文实体名易碎） | 中（库很轻，坑在提示词与版本升级） | 事实级记忆的「增/删/改 + 冲突消解」写入管线，给页面加 fact 层 |
| [Letta (MemGPT)](https://github.com/letta-ai/letta) | 25.5k | 2026-10-18 | Apache-2.0 | 可（本地 server，LLM 可本地） | 中 | 高（常驻服务 + DB + 工具链） | memory blocks 分级上下文（core/archival）＝目录树/页面/metadata 的分层读法 |
| [Graphiti](https://github.com/getzep/graphiti) | 32.9k | 2026-11-15 | Apache-2.0 | 可，但必须自带图库（Neo4j/FalkorDB） | 中低（提示词英文向） | 高（图库 + 抽取流水线） | 双时间轴（valid_at/invalid_at）：metadata 加「何时为真/何时记录」 |
| [LightRAG](https://github.com/HKUDS/LightRAG) | 40.7k | 2026-11-16 | MIT | 可（Ollama + 轻量存储，默认 NetworkX） | 中（中文抽取可用，需调实体合并） | 中高（建图成本 + 版本更新快） | local/global 双级查询，正好对上「页内细节 / 全库主题」两档 |
| [RAPTOR（论文官方实现）](https://github.com/parthsarthi03/raptor) | 1.8k | 2024-09-03 | MIT | 可（换本地模型） | 低（英文聚类+摘要脚本） | 低但**已停更**＝自己养 | 递归聚类+摘要树；换成「按目录树自底向上摘要」即可落地 |
| [PageIndex](https://github.com/VectifyAI/PageIndex) | 40.5k | 2026-11-15 | MIT | 可（SDK local 模式，树存本地；LLM key 可换兼容端点） | 中（版面切分偏 PDF，Markdown 更简单） | 中低（一个 pip 包，无外部服务） | 树索引 + LLM 逐层选节点 + 引用可追溯 ← 最贴「多级索引」 |
| [txtai](https://github.com/neuml/txtai) | 13.4k | 2026-11-13 | Apache-2.0 | **是**，单进程 SQLite + Faiss | 高（模型自选，bge-m3 / Qwen3-Embedding 都可） | 低（pip 装完即用，无服务） | 嵌入库 + 稠密/BM25 混合 + SQL 过滤，可整体塞进 8766 |
| [Khoj](https://github.com/khoj-ai/khoj) | 38.1k | 2026-08-02 | AGPL-3.0 | 可（offline 模式 + 本地模型） | 中 | 高（server + pgvector + 多模型配置） | `search`→`fetch` 两段式 agent 检索接口，接口设计可抄 |
| [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) | 68.3k | 2026-11-13 | MIT | 可（桌面版/Docker，内嵌 LanceDB） | 高 | 中（升级省心，但它是应用不是零件） | workspace 级隔离 + 引用高亮；产品层参考，代码难拆 |
| [RAGFlow](https://github.com/infiniflow/ragflow) | 94.2k | 2026-11-16 | Apache-2.0 | 可，但要 Docker 全家桶 | 高（中文文档解析最强之一） | **极高**（ES/MySQL/MinIO/Redis，4C16G 起） | 只借 DeepDoc 版面解析质量，别借平台 |
| [cognee](https://github.com/topoteretes/cognee) | 33.3k | 2026-11-16 | Apache-2.0 | 可（嵌入式图库 + 本地向量） | 中 | 中高（API 变得快，升级易断） | 一次 ingest 出「图+向量」双索引，适合当旁路实验 |
| [MemOS](https://github.com/MemTensor/MemOS) | 12.4k | 2026-11-11 | Apache-2.0 | 可（本地模式），但文档偏平台 | 中 | 高（组件多、概念重） | 「记忆调度/分层」概念可借，代码别接 |
| [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) | 4.1k | 2026-10-06 | MIT | 可（本地 LLM 能跑） | 低（OpenIE 英文为主） | 中高 | 实体图 + Personalized PageRank 做多跳，适合公司/人物跨页 |
| [MiniRAG](https://github.com/HKUDS/MiniRAG) | 2.0k | 2025-10-16 | MIT | 可（专为小模型设计） | 中 | 中（但已 13 个月没推代码） | 轻量实体图 + 小模型抽取，成本比 LightRAG 低一档 |
| [KAG](https://github.com/OpenSPG/KAG) | 9.2k | 2026-01-28 | Apache-2.0 | 可（OpenSPG + Neo4j 自托管） | 高（蚂蚁出品，中文文档全） | **极高**（OpenSPG 引擎 + 图库） | 「逻辑形式」先编译查询再检索，思想可借、落地太重 |
| [mgrep](https://github.com/mixedbread-ai/mgrep) | 4.4k | 2026-04-25 | Apache-2.0 | **否**（文件上传 Mixedbread 云 store） | 高（多语 embedding） | 低 | `mgrep watch` 增量同步 + CLI 形态可抄，后端不可用 |
| [supermemory](https://github.com/supermemoryai/supermemory) | 31.6k | 2026-11-16 | MIT | 部分（自托管要 Cloudflare Workers） | 中 | 中 | 记忆「空间/容器」抽象与缓存层，偏云，谨慎 |

## 2. 别只看 star：三类坑

### 2.1 star 高但代码停了（star 惯性）

| 项目 | Star | 最后一次代码 push | 停滞 |
|---|---|---|---|
| Khoj | 38.1k | 2026-08-02 | ≈3.5 个月（star/watch 仍在动，属典型 star 惯性） |
| KAG | 9.2k | 2026-01-28 | ≈10 个月 |
| memobase | 3.0k | 2026-01-11 | ≈10 个月 |
| MiniRAG | 2.0k | 2025-10-16 | ≈13 个月 |
| mgrep | 4.4k | 2026-04-25 | ≈7 个月 |
| RAPTOR 官方 | 1.8k | 2024-09-03 | ≈26 个月（论文代码，本来就不维护） |

判据：**README 里的商业入口（Cloud/Platform/预约 demo）比 commit 活跃**时，开源仓往往只剩「引流分支」，停更是迟早的事。

### 2.2 重运维：装完就得当运维

- **RAGFlow**：官方最低 4 vCPU / 16 GB RAM / 50 GB 磁盘 / Docker ≥24 / Compose ≥2.26，ES 还要 `vm.max_map_count≥262144`，实际是 ES（或 Infinity）+ MySQL + MinIO + Redis 一套（[要求出处](https://shop.zimaspace.com/pages/ragflow-hardware-requirements)、[仓库](https://github.com/infiniflow/ragflow)）。Mac 上 16G 内存跑完这堆，再跑本地模型基本没余量。
- **KAG**：要跑 OpenSPG 引擎 + Neo4j + LLM，是「领域知识图谱方案」不是库。
- **Graphiti / cognee / Letta / MemOS / Khoj**：都要多一个常驻服务或图库/关系库；单机一个人维护，升级时最疼的是数据迁移。

### 2.3 强依赖云 API / 违反「隐私不出机器」

- **mgrep**：README 明写「Every file is pushed into a Mixedbread Store」，要 `mgrep login` 或 `MXBAI_API_KEY`，语义检索在云端做（[README](https://github.com/mixedbread-ai/mgrep)）。**对我们直接出局**——它按 1MB/文件、1000 文件/目录限流，也根本扛不住几万页。
- **supermemory**：自托管依赖 Cloudflare Workers + 外部存储，本地部署门槛高于收益。
- **mem0 / PageIndex / RAPTOR / HippoRAG**：默认 OpenAI key，能换本地兼容端点，但抽取质量是按云模型调的，换小模型后要重新评测。
- **PageIndex**：local 模式省掉向量库和云存储，但建树/摘要仍要 LLM；MCP、文件夹、OCR、metadata 是 **Cloud 专属**（[README](https://github.com/VectifyAI/PageIndex)）。

### 2.4 谨慎对待「新仓库 / 血统不明」

- `Winoren/OpenViking`：2026-11-15 才建、0 star，自称「自进化上下文数据库」，概念很对我们胃口，但**没有任何可验证的使用记录**——观察 3 个月再说。
- `latentsp/raptor-rag`：2025-09 新建、0 star，自称 RAPTOR「官方维护版」并已发 v0.3（LiteLLM/FAISS/rerank），但和原仓无 star 继承关系，**血统无法核实**；要用就按「第三方复刻」对待（[repo](https://github.com/latentsp/raptor-rag)）。

## 3. 三个最值得试点

### 试点 A（首选）：txtai 当 8766 的「外挂语义层」

- **试什么**：在 8766 旁起只读索引器，按现有页面树切块（路径+标题+层级写进 metadata），embedding 用本地 bge-m3 或 Qwen3-Embedding-0.6B，索引落 SQLite+Faiss 单文件；暴露 `GET /semantic?q=&path_prefix=&limit=`，与现有 metadata 检索**并列**返回，由 agent 合并。
- **多久**：搭 1 天 + 评测 1 天。
- **成功判据**：50 条中文真实查询，top-5 命中率比现有 metadata 检索 +20pp；p95 < 300 ms；索引重建 < 10 min。
- **失败怎么退**：整个索引目录删掉、8766 不引用即回到现状（零侵入，因为只是旁路只读）。
- 依据：txtai 单进程、Faiss + SQLite、稠密/BM25 混合、SQL 过滤，无外部服务（[仓库](https://github.com/neuml/txtai)）。

### 试点 B（最贴题）：PageIndex 式「树导航」

- **试什么**：不改存储，写 ~100 行 tree-router：把「目录树+页面树」序列化成 JSON（每节点：标题 + 60 字摘要 + 子节点），让本地 LLM 逐层选孩子、最多 3 跳，返回「路径 + 命中页 + 引用」。用 300 页中文样本，对比「整树塞上下文」「纯向量 top-k」两种基线。
- **多久**：2–3 天。
- **成功判据**：引用页正确率 ≥ 90%，路径可解释；平均 token < 8k；错答时能看出「在哪一层走错」。
- **失败怎么退**：降级为纯 BM25 + 目录过滤（树只作展示），脚本留在实验目录，不进 8766。
- 依据：PageIndex 的核心就是「树索引 + LLM 推理检索 + 引用可追溯」，且 local 模式不需要向量库（[README](https://github.com/VectifyAI/PageIndex)）。

### 试点 C（可选）：图索引只做离线 A/B

- **试什么**：取 500 页样本，用本地 7B/8B 模型抽实体关系，建 NetworkX 图，用 PPR 做一跳扩展，把图召回与向量召回融合；人工看 30 条「跨页实体」问题（同一公司/人物散落在多页）。
- **多久**：3–5 天（大头是抽取质量与中文实体对齐）。
- **成功判据**：跨页问题召回 +15pp，抽取错误率 < 20%，单页抽取成本可接受。
- **失败怎么退**：只留一份评测结论（「图不值」也是结论），不引入图库；产物是离线文件，删目录即回滚。
- 依据：HippoRAG 的 PPR 多跳（[仓库](https://github.com/OSU-NLP-Group/HippoRAG)）、MiniRAG 的小模型抽取（[仓库](https://github.com/HKUDS/MiniRAG)）、LightRAG 的 local/global 双级（[仓库](https://github.com/HKUDS/LightRAG)）。

## 4. 明确不建议引入：RAGFlow

- **理由一：它是平台，不是零件。** 引入等于把「一个 8766」换成「五个容器」，还要接受它自己的 UI、账号、数据集概念，与现有「目录树+页面树+metadata」重复建设。
- **理由二：运维成本压过收益。** 4C/16G/50G 起、ES 要改内核参数、升级要重跑 compose；一个人维护，Mac 上留给本地模型的资源所剩无几（[要求出处](https://shop.zimaspace.com/pages/ragflow-hardware-requirements)）。
- **理由三：它解决的问题不是我们的痛点。** RAGFlow 的强项是扫描件/复杂版面解析（DeepDoc）；我们的知识库是 Markdown，真正的瓶颈是**多级索引怎么路由**，不是版面理解。
- **次选（同样不建议）**：Khoj（AGPL-3.0 + Postgres/pgvector + 服务化，且已 3.5 个月没推代码）；AnythingLLM（好用，但它是给人用的应用，不是给 agent 调的零件）。

## 5. 落地顺序建议

1. 先做试点 A（txtai 旁路），一周内拿到「中文召回到底差多少」的硬数字；
2. 同时做试点 B（树导航），它才是「多级索引」的正解，且不依赖任何外部件；
3. 图索引（试点 C）等 A/B 的评测集跑顺了再说——没有评测集，任何图索引都是玄学；
4. 任何情况下都不引入常驻平台；所有新增件都应是「可删目录即回滚」的旁路。

## 6. 引用与数据口径

- 元数据：`https://ungh.cc/repos/<owner>/<repo>`（GitHub 仓库快照：stars / pushed_at），许可证：`https://img.shields.io/github/license/<owner>/<repo>.json`。
- 项目主页见上表链接；关键事实引用：PageIndex [README](https://github.com/VectifyAI/PageIndex)、mgrep [README](https://github.com/mixedbread-ai/mgrep)、RAGFlow [硬件要求](https://shop.zimaspace.com/pages/ragflow-hardware-requirements)。
- 未使用任何本机内部内容、路径或日志；全程未 clone、未安装。

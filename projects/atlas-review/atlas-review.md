# 审阅：Antimeridian Sector Ticker Scarcity Score Atlas

> 审阅对象：`/Users/mingweima/Downloads/Antimeridian_Sector_Ticker_Scarcity_Score_Atlas.html`（117,745 B / 1,773 行，单文件 HTML）
> 文件来源：macOS quarantine 标记显示来自 Lark（飞书），创建于 2026-11-06 15:17；无作者/机构/日期元数据。
> 审阅日期：2026-11-06。本文是文档审阅，不构成投资建议。

## 0. 一句话结论

**框架有可取之处（尤其 "Own Choke vs Rent Window" 这个区分），但这一份 HTML 是没做完的生成式草稿：数量宣称、数据完整性、事实时点、估值列都有硬伤，不能当投研依据或对外材料。** 建议把它当"议题地图 / 尽调清单"，并向作者要完整数据版 + 方法论 + 来源。

## 1. 它想做什么

一篇伪装成严肃投研的交互式 HTML 单页，声称：

- 把全球 AI 算力与电力基础设施拆成 **22 个战略物理咽喉板块（C01–C22）** 和 **31 个二级子链**；
- 用「物理扩产刚性 × 定价权 × 2026Q4 排产上修 × 紧缺时长」给出 **0–100 的综合稀缺分**；
- 给出 **"140 家核心标的"** 的 Ticker 对照表（含市值、Fwd PE、EPS 增速、卡位性质）；
- 用四象限图区分 **Own Choke（物理独占咽喉）** 与 **Rent Window（扩产周期租约）**；
- 标注 "AS OF 2026Q4"，大量断言后缀 `(fact)`。

排版是 "didone-anatomy" 编辑风：KPI 卡、排行榜、SVG 四象限、可筛选表格，单文件自包含。

## 2. 值得肯定的地方

1. **"Own Choke vs Rent Window" 是个好透镜。** 把"物理独占（CoWoS/Foundry/燃气轮机）"和"周期扩产窗口（光模块/ODM/电源）"分开，比单纯罗列"卡脖子"更接近可交易的框架。
2. **产业链拆解得足够细。** 22 个环节覆盖算力、先进封装、HBM、光互连、交换、电源、配电、发电、冷却、AIDC，适合当研究底稿或议题地图。
3. **22 个板块的分数在三个位置一致。** 排行榜、筛选器下拉、四象限标签里的板块分数完全对得上（程序核对 0 处不一致）。
4. **四象限图的数据是真的按报告数值画的。** 22 个散点的坐标可由「刚性、定价权」用线性映射精确复算，不是随手摆的（仅 C19/C20 两点完全重叠，见 §5）。
5. **"一句话说清公司怎么赚钱" 的方向对。** 每行都有机制 + 盈利来源的拆解——只可惜全部被截断（见 §5）。
6. **工程形态合格。** 单文件、零外部请求、无追踪、无恶意脚本、有打印样式；适合离线传阅（安全面见 §7）。

## 3. 硬伤：数据完整性与自洽性

以下全部为本地只读复算所得，可复现命令见 §10。

| # | 问题 | 证据 |
|---|---|---|
| E1 | **宣称 140 家，实际只有 24 行** | 第 03 节 h2 写「140 家核心标的」（L988），筛选器硬编码「当前显示 140 家」（L1002）；实际 `<tr data-choke>` 只有 **24** 行（L1026–L1435）。JS 只在 change/input 时更新计数，首屏永远显示 140 |
| E2 | **24/24 行机制描述全部被硬截断** | 每行 `truth-cell` 都以「…」结尾，且长度**全部恰好 104 字符**——固定长度截断。例：L1040「…最新财季晶圆收入里…」、L1244「…FQ3 DRAM 均价环比涨…」 |
| E3 | **三套样本量口径互相矛盾** | 宣称 140 家；第 04 节 31 个子链"覆盖样本数"求和 = **242**；实际 Ticker 表 24 行 |
| E4 | **子链"最高稀缺分"是模板填充** | 该列 31 行只有 4 个取值：92.0×13、82.0×10、62.0×4、54.0×4。且与母板块矛盾：先进封装子链最高 82.0 vs C02 板块分 96.1；散热子链 62.0 vs C08 78.5 |
| E5 | **6/22 板块在 Ticker 表里完全没有标的** | 缺失 C05/C06/C11/C14/C18/C19；筛选这些板块会得到空表 |
| E6 | **8/24 行 Ticker 后缀错误，且同文档他处写法正确** | `3711.TT`/`2308.TT` 应为 `.TW`；`ENR.GR` 应为 `.DE`；`7011.JP`/`6857.JP`/`6981.JP` 应为 `.T`；`688256.CH`/`600900.CH` 应为 `.SH`。同一份文档里 2330.TW、2308.TW、ENR.DE、6857.T 等写法又是对的 |
| E7 | **估值列与自述营收数学矛盾** | 市值 ÷ Fwd PE 反推隐含净利润：**MU 204.3B > 自述年化营收 166.0B（净利率 123%，不可能）**；TSM 隐含净利率 70.4%；AVGO 77.9%。市值/PE/EPS 增速列不可用，需要整表重算 |
| E8 | **全部 24 行都标"全球核心池"** | 含寒武纪、长江电力等 A 股，股票池分类没有实际区分度 |

## 4. 12 条关键事实抽查（独立检索核查）

样本：半导体/算力链 6 条 + 电力/能源链 6 条。结果：**✅ 1 条、⚠️ 10 条、❌ 1 条**。通病是**把 2025 年数据/旧预测贴上 2026Q4 标签**，以及把不同口径的数字拼在一起。

### 4.1 半导体 / 算力链

| 编号 | 原文要点 | 判定 | 核查结论（证据见 §11） |
|---|---|---|---|
| A1 | CoWoS-L 月产 "95K–100K"、"全年产出 1,150K 片"、"CoWoS-L 占比 68%" | ⚠️ | 1,150K 可溯源（96K/月 × 12）；但 95–100K 是**全年平均**，2026 年底实际约 12–13 万片/月，原文偏低 25–35%；"68%" 疑把 "CoWoS-L 68k 片/月" 误读成占比 |
| A2 | 2026 年 3nm/5nm/CoWoS 提价 8–15%、毛利率 "58%+" | ⚠️ | 提价方向成立：3nm 2H26 最高 +15%（2027 再 +5–10%）、CoWoS +10–20%；但 **58%+ 严重滞后**——TSMC 2026Q3 官方毛利率 66.4%（Q4 指引 65–67%），58.7% 是营业利润率 |
| A3 | 爱德万垄断 AI GPU/HBM 测试 65%+、交期 9 个月、测试时间 2.8–3.5x | ⚠️ | 65% 是**整体 ATE 市占**（SoC 66%/存储 61%），不是 AI GPU/HBM 细分"垄断"；交期 9 个月落在 V93K 8–12 个月区间；测试时间公开口径为 3–4x（Advantest CEO），2.8–3.5x 无单一出处 |
| A4 | 2026E 800G 出货 1,950 万只、1.6T 420 万只、硅光渗透率 42% | ❌ | 卖方预测 2026E 800G ≈4,539 万只、1.6T ≈3,283 万只；原文分别**低 57%、低 87%**；"42%" 是 LightCounting **2031 年**的硅光预测，被挪到 2026 |
| A5 | HBM 2026E 排产 34.5 亿 GB（+25%）；HBM 占 DRAM 晶圆 22%；Rubin HBM4 8×12-Hi 288GB | ⚠️ | 288GB 成立；22% 是占三大厂**产能**约 22%（占 bit 仅约 9%）；"34.5 亿 GB/+25%" 找不到直接来源，公开口径差异大（+70%/+90%），应标单一卖方测算 |
| A6 | 博通本季半导体营收 208 亿美元/70.4%；市值 1,556.6B；Tomahawk 6 "启动流片" | ⚠️ | 208.39 亿/70.4% 准确，但那是 **FY26Q3**（截至 2026-08-02），不是"2026Q4"；市值是 10/30–11/4 快照，11/5 跌 10.4% 后约 1.39 万亿；**Tomahawk 6 已于 2025-06 交付**，"启动流片"是明显时点错配 |

### 4.2 电力 / 能源链

| 编号 | 原文要点 | 判定 | 核查结论 |
|---|---|---|---|
| B1 | "PJM 2026/2027 容量拍卖暴涨 9.3x 至 $269.92/MW-day 顶格" | ⚠️ | **两场拍卖被拼成一句**：$269.92 + 833% 属于 **2025/2026** BRA（2024-07 公布）；2026/2027 BRA 实际是 **$329.17/MW-day 的 FERC 上限**（2025-07 公布，同比仅 +22%）；$269.92 本身不是"顶格" |
| B2 | GEV/SIE/MHI 占重型燃机 88%、排期锁到 2029（38–44 个月）、服务利润率 >30% | ⚠️ | 88% 来自 **2020 年预测口径**（GE 47.4+SIE 21.9+MHPS 19.3）；实际排期已到 2030/31（三菱称交付压到 2031）；"服务利润率 >30%" 无公开披露（GEV Power FY25 EBITDA 率 14.7%） |
| B3 | 345/500kV 变压器与中压开关柜交期 36–42 个月 | ⚠️ | 2026 年 Tier-1 变压器交期实际 **48–60 个月**（原文偏低）；中压开关柜 36–42 个月偏高（Eaton 交付 12–18 个月为主）；"三家积压创纪录"成立 |
| B4 | Bloom Energy 与 Oracle/AEP 签 GW 级表后 SOFC 大单 | ✅ | Oracle 1.2GW → 扩至 **2.8GW**（2026-04-14）；AEP 协议上限 1GW、首单 100MW（2024-11-15）。方向与量级成立 |
| B5 | ERCOT 大负荷排队 63GW、并网 48–60 个月 | ⚠️ | 63GW 是 **2025 年**数字，2026 已 >233GW（+269%）；并网等待公开口径数据中心区约 36–48 个月，48–60 偏高 |
| B6 | 微软/亚马逊/Meta 包揽 Constellation/Talen/Vistra 核电重启 PPA | ⚠️ | 长协真实，但**"重启"只有 TMI**；Talen/Vistra 是存量核电延寿/上容；PJM 2026/27 顶格（$329.17）成立 |

> 核查方法：所有引用页均实际打开核对；S&P/Reuters/Bloomberg/ERCOT PDF 等 403/付费墙来源已注明，改用政府公告、公司 IR、WNN、DCD 等可访问来源交叉验证。Lead 抽查了 PJM/NJBPU 与 DCD/Bloom（均核对通过）。

## 5. 方法论与投资逻辑问题

1. **"稀缺分"不可复现。** 公式只有一句"刚性 × 定价权 × 上修幅度 × 时长"，没有权重、没有标准化方法、没有分母解释。结果就是"卡脖子榜"里，刚性 83% 的光模块（C04）排第 6，压过刚性 93% 的变压器（C18）和 94% 的 HBM（C01）——因为"预期差上修 +38%"权重很高。**这是"稀缺 + 动量"的混合分，不是纯物理刚性分，名字有误导性。**
2. **"缓解时点"与刚性不单调。** C22（刚性 99%）缓解于 2028Q4，C16（98%）却要 2029Q4，C17（97%）2029Q2。可以解释（产能投放节奏不同），但文中没有任何推演，读者无法判断这是模型还是拍脑袋。
3. **"物理咽喉"概念被拉伸。** CoWoS/Foundry 是物理产能；国产 AI 芯片是政策/技术管制；ISO 并网队列/PPA 是市场结构与牌照；ODM 是营运资金壁垒。四种完全不同的东西装进一个"物理刚性 %"里，跨板块比较没有意义。
4. **Ticker 映射错误暴露了"自动生成、未人工校验"。** 例：PLTR 归入 Foundry 3nm（C22）、AAPL 归入 AI 机柜 ODM（C13）、ETN 归入 CDU/冷板（C08）、长江电力归入"北美缺电"（C16）、LRCX 归入 QLC eSSD/HDD（C20）。24 行里至少 5 行映射明显不对。
5. **31 个子链混入无关行业。** 消费平台、加密资产、Robotaxi、游戏、整车、支付……与"AI 算力与电力基础设施"标题不符；像是拿一张通用市场地图套了个 AI 主题。
6. **没有"Priced in"与风险框架。** 稀缺是供给侧事实，不等于预期收益：文中没有估值锚、没有拥挤度/持仓分析、没有替代路线（CoWoS vs 面板级封装、HBM vs 定制存储、燃机 vs 燃料电池/储能、铜连接 vs 光）、没有需求下行情形。这是"研究笔记"而不是"投资结论"，但排版让人误以为是后者。
7. **零来源、零作者、零日期、零免责声明。** 22 个板块各标一个 `(fact)`，全文外部链接数 = 0；无来源/引用/作者/免责声明。任何数字都不可审计、不可对外引用。

## 6. 独立数据审计（第三方复核）

由 auditor-data 独立复算（只读，审计前后文件 sha256 不变），D1–D8 **全部 FAIL**（仅"纯本地自包含"安全面 PASS）：

- D1：实际 24 行 vs 宣称 140 —— 差 5.8 倍，首屏即误导
- D2：24/24 行描述以「…」结尾、长度全部恰为 104 字符
- D3：子链覆盖样本数求和 242（≠140，≠24）
- D4：最高分列仅 4 个取值，92.0 出现 13/31
- D5：8/24 Ticker 后缀非标准
- D6：MU/AVGO/TSM 隐含净利与自述营收矛盾（MU 净利 > 营收）
- D7：外部链接 0，无来源/作者/日期元数据
- D8：22 个点但只有 21 个唯一坐标（C19/C20 完全重叠）；C19（刚性 89%）被错放右栏 "Own Choke"；22 个标签里 6 个名称被截断

## 7. 技术与安全

- **安全：可以放心打开。** 单文件、0 个外链/外链资源、无 fetch/XHR/iframe/表单提交、无 eval；只有一个本地筛选脚本，没有追踪或数据外发。未发现提示注入文本。
- **有 Bug：** 计数初值写死 140；筛选器无初始化调用；6 个板块筛选为空；C19/C20 两点重叠；图例颜色/半径无说明；6 个图表标签被截断；表格无 `scope` 等可访问性语义。
- **有打印样式**（`@media print`），但密集表格在 A4 上可能溢出。
- **来源痕迹**：quarantine 标 "Lark"，创建于 15:17 —— 说明是从飞书收到/保存的，不是本地生成。

## 8. 怎么用（建议）

**定位：把它当"研究议题地图 + 尽调清单"，不要当证据、不要当结论、不要直接转发。**

1. **保留框架：** 22 环节清单 + Own vs Rent 透镜 + "每个环节的钱赚在哪"的问题清单。
2. **先要三样东西再谈使用：**
   - 完整的 140 家数据（CSV/Excel），以及 31 子链的样本明细；
   - 稀缺分的公式、权重、标准化方法与数据截止日；
   - 每条 `(fact)` 的来源/日期，以及哪些是模型生成、哪些经人工核过。
3. **自己先核最重要的 3 件事**（本报告已代核，结论见 §4）：CoWoS 产能、光模块出货量、PJM 拍卖年份。任何一条对不上，全篇数字都要重估。
4. **做决策时再加三层：** 估值/预期（Priced in）、拥挤度与持仓、替代路线与需求下行情形。稀缺 ≠ 超额收益；"own choke" 要看盈利久期，"rent window" 要看资本开支周期拐点。
5. **内部使用前加免责声明**，并注明"数据截至日 + 来源"。

## 9. 可以直接发给朋友的反馈

> 框架很受用，尤其 Own Choke / Rent Window 的区分。不过这份 HTML 看起来像生成流程的中间产物：标题写 140 家但表里只有 24 行、描述统一截断在 104 字符、子链样本数 242、最高分列只有 4 个取值、8 个 ticker 后缀不对、MU 的隐含净利（204B）超过自述营收（166B），还有几条事实是 2025 年数据贴了 2026Q4 标签（PJM $269.92 其实是 2025/26 拍卖）。方便的话给我完整数据版和稀缺分公式/来源？我这边可以帮着做一轮独立复核。

## 10. 复现命令（节选）

```bash
f=/Users/mingweima/Downloads/Antimeridian_Sector_Ticker_Scarcity_Score_Atlas.html
grep -c '<tr data-choke' "$f"                 # 24
grep -n '140 家' "$f"                          # L988 / L1002
grep -c '…</td>' "$f"                          # 24
grep -n '92.0 分' "$f" | wc -l                 # 13
grep -oE 'https?://' "$f" | wc -l              # 0
```

标签长度、市值/PE 反推、后缀审计、四象限坐标复算，见审阅过程中的 Python 脚本（可复跑）。

## 11. 主要引用来源（事实核查）

- PJM / NJBPU：<https://www.nj.gov/bpu/newsroom/2025/approved/20250723.html>（2025-07-23，2026/27 BRA $329.17 上限；2025/26 为 $269.92，+833%）
- PJM 历史表：<https://resources.generalenergycorp.com/blog/pjm-capacity-prices-833-percent-increase>
- TSMC 官方 2026Q3：<https://pr.tsmc.com/english/news/3346>（毛利率 66.4%）
- TrendForce 3nm 涨价：<https://www.trendforce.com/news/2026/05/27/news-tsmc-reportedly-eyes-up-to-15-3nm-price-hike-in-2h26-further-5-10-seen-in-2027-amid-ai-asic-demand/>
- CoWoS 115 万片测算：<https://hao.cnyes.com/post/225627>；CoWoS-L 分配：<https://www.sourcebyspec.com/news/cowos-l-vs-cowos-s-2026-allocation-capacity-customer-split-and-overflow-routes.html>
- 爱德万份额/交期：<https://m.sohu.com/a/1025037762_120498874>
- 2026E 光模块出货（高盛/财联社）：<https://caifuhao.eastmoney.com/news/20260907221335130716110>；LightCounting 硅光：<http://www.iccsz.com//Site/CN/News/2026/06/01/20260601012532659011.htm>
- HBM 产能占比：<https://mreza.bug.hr/memorije/ai-memorija-zauzima-22--proizvodnih-kapaciteta-a-daje-samo-9--memorije-63510>；Rubin 288GB：<https://wccftech.com/nvidia-rubin-gpus-expected-to-stick-with-12-hi-hbm4-despite-reports-of-an-8-hi-shift-as-hbm-prices-could-surge-121-in-2027/>
- 博通 FY26Q3：<https://m.21jingji.com/timeline/295f6812a962a8917bcbcd35c9f3092a.html>；AVGO 行情：<https://stockanalysis.com/stocks/avgo/history/>
- Bloom/Oracle：<https://www.datacenterdynamics.com/en/news/oracle-expands-fuel-cell-supply-deal-with-bloom-energy-to-28gw/>；Bloom/AEP：<https://www.datacenterdynamics.com/en/news/bloom-energy-secures-1gw-fuel-cell-supply-deal-with-aep/>
- 核电 PPA：<https://www.world-nuclear-news.org/articles/constellation-to-restart-three-mile-island-unit-powering-microsoft>；<https://www.world-nuclear-news.org/articles/meta-announces-landmark-agreements-for-new-nuclear>
- 变压器/开关柜与并网：<https://www.chokepoints.ai/stack/grid-transmission/hv-ehv-power-transformers-materials-and-services>；<https://www.go15.org/2026/01/26/ercot-focuses-on-technical-and-operational-challenges-after-successful-rtc-deployment/>
- 燃机份额口径：<https://www.turbomachinerymag.com/view/worldwide-gas-turbine-report>；三菱交付排到 2031：Bloomberg 2026-10-27（付费墙）

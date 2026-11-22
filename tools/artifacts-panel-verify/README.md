# artifacts-panel-verify

验证 DSH「产物」页签（插件 `dsh-artifacts-panel`）是否真的装好、能打开、能渲染。

## 依赖

- Python 3.9+，`websockets`（本机 conda 环境已带）
- 本机 Chrome / Chromium（自动探测，或用 `CHROME_BIN` 指定）

## 用法

```bash
# 1) 不依赖 DSH，先自检脚本机制（内置夹具页，必定可跑）
python3 tools/artifacts-panel-verify/verify.py --selftest

# 2) 验证真实 GUI（需要 dsh web 打印的带 token 的完整 URL）
python3 tools/artifacts-panel-verify/verify.py --url "http://127.0.0.1:51732/?token=..."
# 或
DSH_WEB_URL="http://127.0.0.1:51732/?token=..." python3 tools/artifacts-panel-verify/verify.py
```

> 裸 `http://127.0.0.1:51732` 会返回 `401 dsh web authentication required`，脚本会以退出码 2 结束并提示如何传 URL。脚本不读取、不落盘 token（结果 JSON 中已脱敏）。

## 输出

- 截图：`shots/artifact-page-<YYYYmmdd-HHMMSS>.png`（1440×900）
- 结果：`shots/artifact-page-<YYYYmmdd-HHMMSS>.json`（断言、页面文本摘要、console error、清理结果）

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 全部断言通过 |
| 1 | 断言失败（含「页签未找到，插件可能未安装/未生效」） |
| 2 | 环境问题（Chrome 起不来、页面 401、导航超时等） |

## 清理

脚本用独立临时 profile + 随机调试端口，结束时杀本轮 Chrome、删 profile，并自检「带本脚本临时 profile 的残留进程 = 0」。不会 kill 其它 Chrome 进程。

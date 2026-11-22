# 产物面板 · 发布工作区

本目录**只用于构建可发布包**，不承载开发包本身，也不改动已安装的开发版插件身份。

- 开发包（源）：`../plugins/dsh-artifacts-panel/`（`@local/dsh-artifacts-panel`，`private:true`，与已安装的 profile 行一致；发布身份 `dsh-artifacts-panel` 由构建时显式改名得到）
- 发布包（构建产物）：`./pkg/`（`dsh-artifacts-panel@0.2.0`，每次构建前整个清空）
- 校验记录：`./verify/`

## 目录

| 文件 | 作用 |
| --- | --- |
| `build.mjs` | 构建脚本：复制发布文件 + 变换 `package.json` / `cordis.patch.yml` / `README.md`，生成 `LICENSE` |
| `verify.mjs` | 本地校验：语法检查、`npm pack --dry-run`、包内文件扫描、manifest 结构校验，输出 `verify/check.json` |
| `pkg/` | 发布包内容（9 个文件） |
| `verify/npm-pack-dryrun.txt` | `npm pack --dry-run` 原始输出（文件清单 / 体积 / shasum） |
| `verify/check.json` | 机器可读校验结果（files / sizes / engines / hasPrivate / toolsIncluded / userPathHits / blockers / publishReady） |

## 发布流程

> 标 **[老板]** 的步骤必须由账号持有人本人操作；其余由我们做。npm 当前未登录（`npm whoami` → ENEEDAUTH），所以流程停在「打包 + 本地校验」。

| # | 步骤 | 命令 / 操作 | 谁 |
| --- | --- | --- | --- |
| 1 | 构建 | `cd release && node build.mjs` | [我们] |
| 2 | 本地校验 | `node verify.mjs`；要求 exit 0、`problems` 为空、`npm pack --dry-run` 通过 | [我们] |
| 3 | 元数据 | 默认署名 `mingweima`、仓库 `https://github.com/mingweima/dsh-artifacts-panel`；需要换署名/仓库时用 `PKG_AUTHOR` / `PKG_REPO_URL` / `PKG_HOMEPAGE` 覆盖后重跑 1–2 | [我们] / [老板] 确认 |
| 4 | P0 门禁 | 已修复：`userPathHits` 为空、`publishReady=true`；后续改动重跑 1–2 即可复核 | [我们] |
| 5 | 打包 | `cd release/pkg && npm pack` → `dsh-artifacts-panel-0.2.0.tgz` | [我们] |
| 6 | 登录 | `npm login`（2FA 一次性码） | **[老板]** |
| 7 | 发布 | `npm publish --access public`（非 scoped 包可省略 `--access`，带上无害） | **[老板]** |
| 8 | 线上核对 | `npm view dsh-artifacts-panel version dist.tarball engines`；`npm view dsh-artifacts-panel@0.2.0 dist.shasum` 与本地 tgz 对比 | [我们] |
| 9 | 干净 profile 实装 | 在独立测试 profile：`dsh plugin --profile <test> add dsh-artifacts-panel@0.2.0`，逐项走查 | [老板] 批 / [我们] 做 |
| 10 | GitHub Release | 建 tag（如 `dsh-artifacts-panel-v0.2.0`），上传第 5 步的 `.tgz`，写安装方法与 SHA256 | **[老板]**（仓库/账号） |
| 11 | 收尾 | 记录版本、tgz sha256、`npm view` 输出到 `verify/`；更新 `docs/` 与候选清单 | [我们] |

### 命令速查

```bash
cd ~/Documents/SuperDick/release

# 1) 构建（Node 18+ 目标；本机 Node 16.13 也可运行）
node build.mjs

# 2) 校验（exit 0 = 结构通过；blockers 里是发布前必须清掉的事项）
node verify.mjs
cat verify/check.json

# 3) 打包（生成 tgz；发布前可先 npm pack --dry-run 复核）
cd pkg && npm pack

# 4) [老板] 登录并发布
npm login
npm publish --access public
```

### 构建可配置项（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEV_PACKAGE` | `../plugins/dsh-artifacts-panel` | 开发包目录 |
| `OUT_DIR` | `./pkg` | 输出目录（每次清空） |
| `PKG_VERSION` | `0.2.0` | 发布版本，必须与 `CHANGELOG` 一致 |
| `PKG_AUTHOR` | `mingweima` | 发布署名；可覆盖 |
| `PKG_REPO_URL` | `https://github.com/mingweima/dsh-artifacts-panel` | 发布仓库；可覆盖 |
| `PKG_HOMEPAGE` | `PKG_REPO_URL + '#readme'` | 同上 |
| `CLIENT_INDEX_DIR` | 空（不改代码） | **已废弃**：client.js 不再有 `DEFAULT_INDEX_DIR` 字面量；设置它会显式报错。索引目录由 Host 运行时决定 |

### 构建做了什么

1. **`package.json`**：`name` → `dsh-artifacts-panel`（去 scope）、删 `private`、`version` → `0.2.0`；
   补 `license: MIT`、`author`、`repository`、`homepage`、`keywords`；
   加 `engines.dsh = ">=0.2.2-rc.2 <0.3.0"`（实测运行版为 `0.2.2-rc.2`；prerelease 陷阱：`>=0.2.0` / `>=0.2.0-rc.1` 都匹配不上 `0.2.2-rc.2`）；
   `files` 收敛为 `index.js / client.js / cordis.patch.yml / locale/*.json / icon.svg / README.md / LICENSE`，去掉 `tools/*`；
   `dsh.bundle.patch`、`dsh.client`（platform / inject 8 项）、`exports`、`dependencies` 原样保留。
2. **`cordis.patch.yml`**：row `name` 改为 `'dsh-artifacts-panel'`，row `id` 为 `dsh-artifacts-panel`，避免与已安装的 `@local/...` 行混淆。
3. **`README.md`**：开发包 README 的标题替换成面向用户的标题，并在前面插入「安装 / 版本要求 / 安装后新增了什么 / 卸载 / 升级 / 数据位置与清理 / 隐私与数据边界」中文段 + 对应英文段；工程笔记降为「工程说明（面向维护者）」附录。构建会脱敏 `@local/` 与 `/Users/me/project`；若仍残留 `/Users/` 或 `@local/`，构建直接失败。
4. **`LICENSE`**：MIT，版权行 `Copyright (c) 2026`（不写个人姓名）。
5. **`index.js` / `client.js`**：复制时做发布身份变换 —— 把 `@local/dsh-artifacts-panel` 统一替换成裸包名 `dsh-artifacts-panel`（覆盖 `window.__ModuleLoader__.load({ id })`、`SIDEBAR_TAB_ID`、`settings.section` / `shell.overlay` 等注册 id），再断言产物不含 `/Users/`、不含 `@local/`（发布门禁），否则构建失败。开发包本身保持 `@local/...` 身份不受影响。

## 当前状态（2026-11-12）

- 构建：通过，9 个文件 / 解包 338,940 B（约 339.0 kB）/ `npm pack` 81,261 B（约 81.3 kB），`npm pack --dry-run` exit 0；
  快照对应开发包 `client.js` sha256 `b416316d…`（与原文件一致）。
- 语法：`node --check client.js` exit 0；`node --input-type=module --check < index.js` exit 0。
- 包内：无 `tools/`、无 `.index/`、无 `node_modules/`；`hasPrivate=false`；`engines.dsh` 正确；`package.json` 的 17 项结构检查全为 true。
- **发布阻塞（`check.json` 的 `blockers`，`publishReady=false`）**：
  1. `client.js:15` 仍有 `/Users/mingweima/...` 硬编码索引目录（P0，另一条线修；本脚本默认不改代码，可用 `CLIENT_INDEX_DIR` 做过渡替换）。
  2. `repository` / `homepage` / `author` 仍是占位值，发布前用环境变量覆盖。
- **开发包在本次任务期间被并行修改**（`client.js` 268,373 → 277,326 B），`pkg/` 是构建时刻的快照；代码线收尾后必须重跑 `node build.mjs && node verify.mjs`。
  构建脚本已加语法闸门：开发包 `client.js` / `index.js` 语法不过时**拒绝构建**，保留上一份可用快照。
- 另需后续：README 缺截图/动图（P1）、`CHANGELOG.md` 未建、索引数据仍落在包目录内（P0-3）、README 里 `~/.dsh` 与内部 `tools/` 命令仍在工程说明附录中（发布包不含 `tools/`，附录已注明）。

## 边界（本工作区不做的事）

- 不 `npm publish`、不 `npm login`、不安装/卸载任何插件、不改 profile、不写 `~/.dsh`。
- 不改 `plugins/dsh-artifacts-panel/`（开发包身份保持 `@local/...` + `private:true`），否则宿主行解析会乱。
- 不碰 8766/8768 端口服务。

# 发布门禁记录（gate.md）

日期：2026-11-12 晚
范围：产物面板发布 P0 修复（包身份 / 索引路径 / 数据目录 / engines / 提示词透明）
结论：**门禁通过，`publishReady=true`**。同一份冻结代码的 md5 在门禁前后一致。

## 1. 冻结代码 md5（门禁前后一致）

| 文件 | md5 |
| --- | --- |
| `plugins/dsh-artifacts-panel/client.js` | `e7170d2b74e12de65796cc0688d48b00` |
| `plugins/dsh-artifacts-panel/index.js` | `73854e82054e7e6a9ba323925f294fae` |
| `plugins/dsh-artifacts-panel/package.json` | `97fe3754392d0e3cefd8e6a6bf7bfe95` |
| `plugins/dsh-artifacts-panel/cordis.patch.yml` | `b22da9db8715c1a5a146ccf38e2f4e05` |
| `plugins/dsh-artifacts-panel/README.md` | `238c4325acadac55763ca91f8f5830cf` |
| `release/build.mjs` | `9c56e6714244f2302cb79fd045727ec2` |
| `release/verify.mjs` | `630f9c5a1593ed2e93f02447de4485b5` |

> 说明：以上 md5 由 `md5 -q` 计算；门禁运行 `build.mjs` / `verify.mjs` 只写 `release/pkg` 与 `release/verify`，不回写上述源文件，运行后 md5 未变化。

## 2. 门禁命令与结果（同一份冻结代码）

```text
$ cd plugins/dsh-artifacts-panel
$ node --check client.js
exit=0

$ node --input-type=module --check < index.js
exit=0

$ node tools/render-harness.cjs
exit=0
checks=213  failures=[]

$ node tools/interactive-harness.cjs
exit=0
INTERACTIVE_OK

$ node tools/test-v2b.mjs
v2b host tests: 11 passed, 0 failed
exit=0

$ cd ../../release
$ node build.mjs
[build] 语法闸门通过（client.js / index.js）
[build] 构建完成，9 个文件（含 package.json），解包 406031 字节
exit=0

$ node verify.mjs
[verify] 文件数: 9（npm pack 清单 9）
[verify] 打包含工具脚本: false / 含 .index: false / 含 node_modules: false / private: false
[verify] /Users/ 命中: 0
[verify] engines: {"dsh":">=0.2.2-rc.2 <0.3.0"}
[verify] 全部校验通过，可以打包发布
exit=0

$ grep -R '/Users/' release/pkg
（无输出，exit=1）
$ grep -R '@local' release/pkg
（无输出，exit=1）
```

## 3. `release/verify/check.json` 关键字段

| 字段 | 值 |
| --- | --- |
| `publishReady` | `true` |
| `ok` | `true` |
| `problems` | `[]` |
| `blockers` | `[]` |
| `userPathHits` | `[]` |
| `hasPrivate` | `false` |
| `toolsIncluded` / `indexDirIncluded` / `nodeModulesIncluded` | `false` / `false` / `false` |
| `engines.dsh` | `>=0.2.2-rc.2 <0.3.0` |
| `package.name` | `dsh-artifacts-panel` |
| `package.version` | `0.2.0` |
| `package.fileCount` | `9` |
| `package.packedBytes` | `98360` |
| `package.shasum` | `c98fe8c72ec2be5f0b33887b5df29b358e37cab0` |
| 新增 checks | `noLegacyId` / `indexRoute` / `optionalInject` / `schemasteryRange` / `promptGuidanceDoc` 全为 `true` |

## 4. 覆盖的 P0（对审计 5 条）

| 审计项 | 修复落点 | 验证 |
| --- | --- | --- |
| P0-1 包身份 | dev `package.json` / `cordis.patch.yml` / `client.js` 5 处 id 全部改为 `dsh-artifacts-panel`；`private` 移除、license/repo/keywords 补齐 | `grep -R '@local' release/pkg` 空；`checks.noLegacyId=true` |
| P0-2 索引路径 | 删除 `client.js:15` 绝对路径与 `DEFAULT_INDEX_DIR`；Host 以同源 HTTP 路由 `/artifacts-panel/index.json`、`/artifacts-panel/sessions/<sid>.json` 下发；设置页保留手填降级 | `checks.indexRoute=true`、harness `indexPathDefaultsToRoute`、`routeFetch`、`routeMissing` 全过 |
| P0-3 数据目录 | `index.js` 索引目录改为 `$DSH_HOME/artifacts-panel/index`（缺失回退 `os.tmpdir()/dsh-artifacts-panel/index`）；启动一次性复制旧 `.index/`（不删）；不可写也内存回填；设置页「重建索引」触发 `POST /artifacts-panel/rebuild` | `test-v2b` 新增目录解析 / 迁移 / 只读内存回填 / HTTP 路由 4 组测试（11 passed） |
| P0-4 engines | `package.json`、`release/build.mjs`、`release/verify.mjs`、README 统一 `>=0.2.2-rc.2 <0.3.0`；schemastery `^3.19.0` | `checks.engines=true`、`checks.schemasteryRange=true` |
| P0-5 提示词透明 | Host `inject=[]`，`systemPrompt` 用 `ctx.inject([...])` 可选注入；README + 设置页写明约 80 字引导与 `promptGuidance:false` 关闭 | `checks.optionalInject=true`、`checks.promptGuidanceDoc=true`；`test-v2b` 缺服务不崩 + 有服务注册 section |

## 5. 仍缺 / 风险

- 运行中的 DSH 尚未重启，Host 新代码（路由、数据目录、迁移）未在真实宿主内实测；Client 若被 HMR 加载，在重启前「全部会话」会显示不可用，重启后恢复。
- 同源路由依赖 `webServer` + `connection` 两个 Host 服务；二者缺失时按设计降级为手填「索引目录」，但这条降级路径未在真实无路由宿主上实测（仅单测）。
- 仓库地址 / 署名使用 `https://github.com/mingweima/dsh-artifacts-panel` 与 `mingweima`；若实际发布仓库不同，需用 `PKG_REPO_URL` / `PKG_AUTHOR` 覆盖后重跑 build + verify。
- 未做 npm publish / npm login / 干净 profile 实装（按边界留待发布人）。

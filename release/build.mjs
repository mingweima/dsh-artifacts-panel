#!/usr/bin/env node
/**
 * 产物面板 · 可发布包构建脚本
 *
 * 从开发包（plugins/dsh-artifacts-panel）复制发布所需文件到 release/pkg/，
 * 并做发布所需的元数据变换；不修改开发包本身，也不改已安装的插件身份。
 *
 * 用法：
 *   node build.mjs
 *
 * 环境变量（都可选，默认值见下）：
 *   DEV_PACKAGE        开发包目录，默认 ../plugins/dsh-artifacts-panel
 *   OUT_DIR            输出目录，默认 ./pkg（每次构建前清空）
 *   PKG_VERSION        发布版本，默认 0.2.0
 *   PKG_AUTHOR         author 字段，默认 "mingweima"
 *   PKG_REPO_URL       repository 地址，默认 https://github.com/mingweima/dsh-artifacts-panel
 *   PKG_HOMEPAGE       homepage 地址，默认取 repository + #readme
 *   CLIENT_INDEX_DIR   已废弃（client.js 不再有 DEFAULT_INDEX_DIR）；设置后会显式报错
 *
 * 目标运行时：Node.js 18+。本脚本刻意只用 node:fs / node:path / node:url 的旧 API，
 * 因此在 Node 16 上也能运行（本机实测 Node 16.13.0）。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.resolve(HERE, '..')
const DEV_PACKAGE = path.resolve(process.env.DEV_PACKAGE || path.join(WORKSPACE, 'plugins', 'dsh-artifacts-panel'))
const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(HERE, 'pkg'))

const PKG_NAME = 'dsh-artifacts-panel'
const PKG_VERSION = process.env.PKG_VERSION || '0.2.0'
const PKG_AUTHOR = process.env.PKG_AUTHOR || 'mingweima'
const PKG_REPO_URL = (process.env.PKG_REPO_URL || 'https://github.com/mingweima/dsh-artifacts-panel').replace(/\/+$/, '')
const PKG_HOMEPAGE = process.env.PKG_HOMEPAGE || PKG_REPO_URL + '#readme'
// prerelease 陷阱：comparator 的 prerelease 必须落在 0.2.2 这个 tuple 上，
// 否则 0.2.2-rc.2 匹配不上（>=0.2.0 / >=0.2.0-rc.1 都不行）。
const ENGINES_DSH = '>=0.2.2-rc.2 <0.3.0'
const CLIENT_INDEX_DIR = process.env.CLIENT_INDEX_DIR || ''

/** 发布包只带这些文件（LICENSE 为构建生成）。 */
const SHIPPED_FILES = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'locale/zh.json',
  'locale/en.json',
  'icon.svg',
  'README.md',
  'LICENSE',
]

const warnings = []

function log(message) {
  process.stdout.write('[build] ' + message + '\n')
}

function warn(message) {
  warnings.push(message)
  process.stderr.write('[build][warn] ' + message + '\n')
}

async function statSize(absolute) {
  const stat = await fs.stat(absolute)
  if (!stat.isFile()) throw new Error('不是普通文件: ' + absolute)
  return stat.size
}

async function copyFile(from, to, { sanitize } = {}) {
  let content = await fs.readFile(from, 'utf8')
  if (sanitize) content = sanitize(content)
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.writeFile(to, content)
  return Buffer.byteLength(content)
}

function fail(message) {
  process.stderr.write('[build][error] ' + message + '\n')
  process.exit(1)
}

/**
 * 语法闸门：在清空输出目录之前先检查开发包的 client.js / index.js。
 * 开发包可能正被另一条线并行修改，半成品代码不允许打进发布包（也避免把 pkg 里的
 * 上一份可用快照覆盖成坏包）。
 */
async function assertSourceSyntax(devDir) {
  const clientPath = path.join(devDir, 'client.js')
  const clientCheck = spawnSync('node', ['--check', clientPath], { encoding: 'utf8' })
  if (clientCheck.status !== 0) {
    fail('开发包 client.js 语法不通过（可能正被并行修改），拒绝构建，pkg 保持上一份可用快照：\n' +
      (clientCheck.stderr || '').trim())
  }
  const indexSource = await fs.readFile(path.join(devDir, 'index.js'), 'utf8')
  const indexCheck = spawnSync('node', ['--input-type=module', '--check'], { input: indexSource, encoding: 'utf8' })
  if (indexCheck.status !== 0) {
    fail('开发包 index.js 语法不通过，拒绝构建：\n' + (indexCheck.stderr || '').trim())
  }
  log('语法闸门通过（client.js / index.js）')
}

/** 把开发包 package.json 变换成可发布的 manifest（字段顺序固定，便于 diff）。 */
function buildManifest(devPkg) {
  const missing = ['exports', 'dependencies', 'dsh'].filter((key) => devPkg[key] === undefined)
  if (missing.length > 0) fail('开发包 package.json 缺少字段: ' + missing.join(', '))

  const patchFile = devPkg.dsh && devPkg.dsh.bundle && devPkg.dsh.bundle.patch
  if (typeof patchFile !== 'string' || patchFile === '') fail('开发包 dsh.bundle.patch 缺失')

  const client = devPkg.dsh && devPkg.dsh.client
  if (!client || client.platform !== 'web' || !Array.isArray(client.inject) || client.inject.length === 0) {
    fail('开发包 dsh.client 段不完整（需要 platform / inject）')
  }

  const manifest = {
    name: PKG_NAME,
    version: PKG_VERSION,
    description: devPkg.description,
    keywords: [
      'dsh',
      'dsh-plugin',
      'deepseek-harness',
      'artifacts',
      'deliverables',
      'session',
      'sidebar',
      'workbench',
    ],
    license: 'MIT',
    author: PKG_AUTHOR,
    repository: { type: 'git', url: PKG_REPO_URL + '.git' },
    homepage: PKG_HOMEPAGE,
    engines: { dsh: ENGINES_DSH },
    type: devPkg.type || 'module',
    exports: devPkg.exports,
    files: [
      'index.js',
      'client.js',
      'cordis.patch.yml',
      'locale/*.json',
      'icon.svg',
      'README.md',
      'LICENSE',
    ],
    dependencies: devPkg.dependencies,
    dsh: devPkg.dsh,
  }
  if (Object.prototype.hasOwnProperty.call(devPkg, 'private')) {
    log('已丢弃开发包的 private 字段（发布版不能再带 private:true）')
  }
  if (/OWNER|your-org|example\.com/i.test(PKG_REPO_URL + ' ' + PKG_HOMEPAGE)) {
    warn('repository/homepage 仍是占位地址（' + PKG_REPO_URL + '），发布前必须用 PKG_REPO_URL / PKG_HOMEPAGE 覆盖')
  }
  if (PKG_AUTHOR === 'dsh-artifacts-panel contributors') {
    warn('author 仍是默认占位值，发布前建议用 PKG_AUTHOR 覆盖成真实署名')
  }
  return manifest
}

/** cordis.patch.yml：row 的 id 与 name 同步成发布包身份（与已安装的 @local 行区分开）。 */
function buildPatch(devPatch) {
  let out = devPatch
  out = out.replace(/^(\s*-\s*id:\s*).*$/m, '$1' + PKG_NAME)
  out = out.replace(/^(\s*name:\s*)['"]?[^'"\s]+['"]?\s*$/m, "$1'" + PKG_NAME + "'")
  if (!out.includes('id: ' + PKG_NAME) || !out.includes("'" + PKG_NAME + "'")) {
    fail('cordis.patch.yml 变换失败：id/name 未同步为 ' + PKG_NAME)
  }
  return out.endsWith('\n') ? out : out + '\n'
}

/** README：保留开发包的工程说明，前面加面向用户的安装 / 卸载 / 升级 / 数据 / 版本要求段。 */
function buildReadme(devReadme) {
  const body = devReadme
    .replace(/^# .*\n+/, '')
    .split('@local/' + PKG_NAME)
    .join(PKG_NAME)
    .split('/Users/me/project')
    .join('/workspace/example-project')
    .split('~/.dsh')
    .join('$DSH_HOME')

  if (/\/Users\//.test(body)) {
    const lines = body.split('\n').map((line, index) => [index + 1, line]).filter(([, line]) => line.includes('/Users/'))
    fail('开发包 README 仍含 /Users/ 绝对路径，需先在开发包脱敏（行号: ' + lines.map(([n]) => n).join(',') + '）')
  }
  if (/@local\//.test(body)) {
    fail('开发包 README 仍含 @local 包名，发布前必须清零')
  }

  const header = [
    '# 产物面板（Artifacts panel）',
    '',
    '把一次会话产出的最终回复、文档、图片与其他文件收进一个页面，同时在右侧栏提供「产物」标签页；' +
      '跨会话索引可以按引用检索历史会话的产物，支持导出、深链与图片画廊。',
    '',
    '> English quick start: see [Installation (English)](#installation-english).',
    '',
    '## 安装',
    '',
    'DSH 没有官方插件市场，本插件通过 npm 公共包分发。任选一种方式安装：',
    '',
    '1. **图形界面**：Plugins → **Add plugin**，填包名 `' + PKG_NAME + '`（或锁定版本 `' + PKG_NAME + '@' + PKG_VERSION + '`）→ 确认安装。',
    '2. **命令行**（需要 `dsh` 在 PATH）：',
    '',
    '   ```bash',
    '   dsh plugin --profile <profile> add ' + PKG_NAME,
    '   ```',
    '',
    '3. **离线 tarball**：从 Release 下载 `.tgz` 后，Add plugin 里填绝对路径，或',
    '',
    '   ```bash',
    '   dsh plugin --profile <profile> add ./' + PKG_NAME + '-' + PKG_VERSION + '.tgz',
    '   ```',
    '',
    '安装（或升级）后**重启 DSH**：Host 代码在启动时加载。重启后打开会话，右侧栏出现「产物」页签；' +
      '也可以在插件详情页或页面内入口打开完整产物页。',
    '',
    '## 版本要求',
    '',
    '- DSH `' + ENGINES_DSH + '`（包内 `engines.dsh`；实测 `0.2.2-rc.2`）。不满足时 DSH 在安装前直接拒绝。',
    '- 安装预构建包不需要构建环境；只有从源码构建才需要 Node.js 18+。',
    '- 依赖 `@deepseek-ai/schemastery`（`^3.19.0`），随 npm 自动安装。',
    '',
    '## 安装后新增了什么',
    '',
    '- **一段 agent 提示词**（约 80 字）：引导 agent 用 `present` 显式交付产物（路径 + 说明），不改变其他行为。',
    '  不需要时在插件配置里设 `promptGuidance: false` 关闭；宿主没有 `systemPrompt` 服务时自动跳过。',
    '- **跨会话索引**：只存引用（会话 id、文件路径、轮次、来源、类型，可选大小/sha），不存回复正文或文件内容。',
    '  不需要时在插件配置里设 `crossSessionIndex: false` 关闭；关闭后「全部会话」视图不可用，「本会话」不受影响。',
    '- **右侧栏「产物」标签页 + 迷你悬浮条**：悬浮条可在插件设置页关闭（`showFloatingBar`）。',
    '',
    '> 说明：宿主侧配置项（`promptGuidance` / `crossSessionIndex`）与浏览器侧设置项' +
      '（`dsh-artifacts-panel.settings.v1`）相互独立；改宿主配置后需重启 DSH。',
    '',
    '## 卸载',
    '',
    '- **图形界面**：Plugins → 找到「产物面板」→ Remove。',
    '- **命令行**：',
    '',
    '  ```bash',
    '  dsh plugin --profile <profile> remove ' + PKG_NAME,
    '  ```',
    '',
    '- 卸载后重启 DSH。插件写入的索引数据在 `$DSH_HOME/artifacts-panel/index/`（旧的插件目录 `.index/` 只做一次性复制迁移），可手动删除；DSH 自身的投影缓存（`$DSH_HOME` 下）' +
      '可能在下次重建前残留检查点，内容同样是「只存引用」的行数据，DSH 重建后自然失效——本插件不清理该缓存。',
    '',
    '## 升级',
    '',
    '第三方 npm 插件没有自动更新通道，按下面任一方式升级：',
    '',
    '- **图形界面**：先 Remove，再 Add plugin 安装新版本（输入 `' + PKG_NAME + '@<新版本>`）。',
    '- **命令行**：`dsh plugin --profile <profile> add ' + PKG_NAME + '@<新版本>`。',
    '',
    '升级后重启 DSH。跨会话索引写在 `$DSH_HOME/artifacts-panel/index/`，重装/升级不会丢失；旧版插件目录下的 `.index/` 会在启动时一次性复制迁移（旧目录保留，可手动删除）。',
    '',
    '## 数据位置与清理',
    '',
    '| 数据 | 位置 | 说明 |',
    '| --- | --- | --- |',
    '| 跨会话索引 | `$DSH_HOME/artifacts-panel/index/`（`DSH_HOME` 缺失时回退到系统临时目录） | `index.json` + `sessions/<sessionId>.json`，只存引用，不存正文 |',
    '| 浏览器设置 | `localStorage` 的 `dsh-artifacts-panel.settings.v1` 等键 | 主题、视图、悬浮条、跨会话开关等 |',
    '',
    '- **清理索引**：删除 `$DSH_HOME/artifacts-panel/index/` 即可重置；旧版插件目录下的 `.index/` 只做一次性复制迁移，可手动删除。',
    '- **不会进索引的路径**：临时目录、隐藏文件、`node_modules`、`.git`、`*.log` 以及索引自身目录。',
    '- **读取方式**：Client 通过 Host 注册的同源只读 HTTP 路由 `/artifacts-panel/index.json`、`/artifacts-panel/sessions/<sid>.json` 读取，浏览器不需要绝对路径；宿主没有该路由时可用设置页的「索引目录」手填绝对路径降级。',
    '',
    '## 隐私与数据边界',
    '',
    '- 只读 DSH 自己的会话日志（经 `sessionPersistence` 服务），不读其他 agent 的数据，也不直接打开 `$DSH_HOME` 下的文件。',
    '- 索引只存引用：路径、轮次、来源、类型，可选大小与 sha；不含回复正文、描述或文件内容。',
    '- 导出的清单默认不包含凭据；分享截图或清单前请自行确认路径中的用户名、项目名是否敏感。',
    '',
    '## Installation (English)',
    '',
    'DSH has no official plugin marketplace; this plugin ships as an npm package. Install it either from',
    '**Plugins → Add plugin** (`' + PKG_NAME + '`, optionally pinned as `' + PKG_NAME + '@' + PKG_VERSION + '`), or:',
    '',
    '```bash',
    'dsh plugin --profile <profile> add ' + PKG_NAME,
    '```',
    '',
    'Restart DSH after install/upgrade (the host half loads at startup). Requires DSH `' + ENGINES_DSH + '`.',
    '',
    'The index lives in `$DSH_HOME/artifacts-panel/index/` and is served to the browser over same-origin routes',
    '(`/artifacts-panel/...`); it is copied once from a legacy in-package `.index/` and never deleted automatically.',
    '',
    'The plugin adds a short (~80 character) agent-prompt guidance section (disable with `promptGuidance: false`), a',
    'cross-session index that stores **references only** (session id, path, turn, source, kind; no reply text,',
    'no file contents — disable with `crossSessionIndex: false`), a right-sidebar tab and a floating bar.',
    '',
    'Uninstall with **Plugins → Remove** or `dsh plugin --profile <profile> remove ' + PKG_NAME + '`.',
    'It is copied once from a legacy in-package `.index/`; delete the new directory to reset it.',
    '',
    '---',
    '',
    '## 工程说明（面向维护者）',
    '',
    '> 以下内容是开发包原有的工程笔记（索引格式、数据边界、自测与已知限制）。npm 发布包不包含 `tools/` 自测脚本，',
    '> 文中的 `node tools/...` 命令需要在源码仓库里执行。',
    '',
    '',
  ].join('\n')

  // 附录里的工程笔记整体降一级标题，避免与上面的用户文档抢层级。
  const demoted = body.replace(/^(#{1,5}) /gm, '#$1 ')

  return header + demoted.replace(/^\n+/, '')
}

function buildLicense() {
  return [
    'MIT License',
    '',
    'Copyright (c) 2026',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy',
    'of this software and associated documentation files (the "Software"), to deal',
    'in the Software without restriction, including without limitation the rights',
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
    'copies of the Software, and to permit persons to whom the Software is',
    'furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all',
    'copies or substantial portions of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
    'SOFTWARE.',
    '',
  ].join('\n')
}

async function main() {
  log('开发包: ' + DEV_PACKAGE)
  log('输出:   ' + OUT_DIR)

  const devPkg = JSON.parse(await fs.readFile(path.join(DEV_PACKAGE, 'package.json'), 'utf8'))
  if (devPkg.name !== PKG_NAME && devPkg.name !== '@local/' + PKG_NAME) {
    warn('开发包 name 不是预期的 ' + PKG_NAME + '（当前 ' + devPkg.name + '），继续按发布身份构建')
  }

  const devPatch = await fs.readFile(path.join(DEV_PACKAGE, 'cordis.patch.yml'), 'utf8')
  const devReadme = await fs.readFile(path.join(DEV_PACKAGE, 'README.md'), 'utf8')

  // 先过语法闸门，再动 pkg：并行改动中的半成品不会覆盖上一份可用快照。
  await assertSourceSyntax(DEV_PACKAGE)

  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(OUT_DIR, 'locale'), { recursive: true })

  // 1) package.json
  const manifest = buildManifest(devPkg)
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  await fs.writeFile(path.join(OUT_DIR, 'package.json'), manifestText)

  // 2) cordis.patch.yml
  await fs.writeFile(path.join(OUT_DIR, 'cordis.patch.yml'), buildPatch(devPatch))

  // 3) index.js / client.js：复制并做发布身份变换。
  //    开发包身份是 @local/dsh-artifacts-panel（与已安装的 profile 行一致），发布包必须是裸包名
  //    dsh-artifacts-panel；client.js 的 loader id、SIDEBAR_TAB_ID、各 slot/设置注册 id 都以
  //    '@local/' + PKG_NAME 开头，统一剥掉 @local/ 前缀即可，不依赖开发包原本就是公开名。
  const localPrefix = '@local/' + PKG_NAME
  let clientSource = await fs.readFile(path.join(DEV_PACKAGE, 'client.js'), 'utf8')
  if (CLIENT_INDEX_DIR) {
    if (CLIENT_INDEX_DIR.includes("'") || CLIENT_INDEX_DIR.includes('\n')) fail('CLIENT_INDEX_DIR 不能包含单引号或换行')
    const before = clientSource
    clientSource = clientSource.replace(
      /(const DEFAULT_INDEX_DIR = )'[^']*'/,
      "$1'" + CLIENT_INDEX_DIR + "'",
    )
    if (clientSource === before) fail('CLIENT_INDEX_DIR 替换失败：client.js 里没找到 DEFAULT_INDEX_DIR 字面量')
    log('已把 client.js 的 DEFAULT_INDEX_DIR 替换为 ' + CLIENT_INDEX_DIR)
  }
  clientSource = clientSource.split(localPrefix).join(PKG_NAME)
  if (/\/Users\//.test(clientSource)) {
    fail('client.js 仍含本机绝对路径 /Users/，发布包必须清零（P0）')
  }
  if (clientSource.indexOf('@local/') !== -1) {
    fail('client.js 变换后仍含旧包身份 @local/，发布包必须清零（P0）')
  }
  await fs.writeFile(path.join(OUT_DIR, 'client.js'), clientSource)
  let indexSource = await fs.readFile(path.join(DEV_PACKAGE, 'index.js'), 'utf8')
  indexSource = indexSource.split(localPrefix).join(PKG_NAME)
  if (/\/Users\//.test(indexSource)) {
    fail('index.js 仍含本机绝对路径 /Users/，发布包必须清零（P0）')
  }
  if (indexSource.indexOf('@local/') !== -1) {
    fail('index.js 变换后仍含旧包身份 @local/，发布包必须清零（P0）')
  }
  await fs.writeFile(path.join(OUT_DIR, 'index.js'), indexSource)

  // 4) 其余静态文件
  await fs.copyFile(path.join(DEV_PACKAGE, 'icon.svg'), path.join(OUT_DIR, 'icon.svg'))
  for (const lang of ['zh', 'en']) {
    await fs.copyFile(path.join(DEV_PACKAGE, 'locale', lang + '.json'), path.join(OUT_DIR, 'locale', lang + '.json'))
  }

  // 5) README / LICENSE
  await fs.writeFile(path.join(OUT_DIR, 'README.md'), buildReadme(devReadme))
  await fs.writeFile(path.join(OUT_DIR, 'LICENSE'), buildLicense())

  // 6) 自检：发布清单里的文件必须都在
  const rows = []
  let total = Buffer.byteLength(manifestText)
  for (const relative of SHIPPED_FILES) {
    const absolute = path.join(OUT_DIR, relative)
    try {
      const size = await statSize(absolute)
      rows.push([relative, size])
      total += size
    } catch (error) {
      fail('发布清单文件缺失: ' + relative + '（' + error.message + '）')
    }
  }

  log('构建完成，' + (rows.length + 1) + ' 个文件（含 package.json），解包 ' + total + ' 字节')
  log('  package.json  ' + Buffer.byteLength(manifestText) + ' B')
  for (const [relative, size] of rows) log('  ' + relative + '  ' + size + ' B')
  if (warnings.length > 0) log('有 ' + warnings.length + ' 条告警，见上方 [build][warn]')
}

main().catch((error) => {
  process.stderr.write('[build][error] ' + (error && error.stack ? error.stack : String(error)) + '\n')
  process.exit(1)
})

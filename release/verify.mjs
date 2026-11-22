#!/usr/bin/env node
/**
 * 产物面板 · 发布包本地校验
 *
 * 在 release/pkg 上执行（不发布、不安装、不改 profile）：
 *   1. node --check client.js
 *   2. node --input-type=module --check < index.js
 *   3. npm pack --dry-run（人读输出落 verify/npm-pack-dryrun.txt，--json 结果用于统计）
 *   4. 包内文件扫描：不得含 tools/、.index/、node_modules/、/Users/ 绝对路径、旧包身份 @local/
 *   5. package.json 结构校验：合法 JSON、dsh.bundle.patch 指向的文件存在、dsh.client 段存在、engines 正确
 *   6. 写 verify/check.json（files / sizes / engines / hasPrivate / toolsIncluded / userPathHits）
 *
 * 用法：node verify.mjs
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_DIR = path.join(HERE, 'pkg')
const VERIFY_DIR = path.join(HERE, 'verify')
const EXPECTED_DSH_RANGE = '>=0.2.2-rc.2 <0.3.0'

const problems = []
const blockers = []
const notes = []

function log(message) {
  process.stdout.write('[verify] ' + message + '\n')
}

function problem(message) {
  problems.push(message)
  process.stderr.write('[verify][fail] ' + message + '\n')
}

/**
 * 发布阻塞项：属于已知的 P0 代码/元数据问题（例如 client.js 硬编码本机路径、
 * repository 还是占位地址）。本任务只报告、不改代码，因此不判构建失败，
 * 但 check.json 会把 publishReady 置为 false。
 */
function blocker(message) {
  blockers.push(message)
  process.stderr.write('[verify][blocker] ' + message + '\n')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null,
  }
}

async function walk(dir, prefix = '') {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : prefix + '/' + entry.name
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), relative)))
    else if (entry.isFile()) out.push(relative)
  }
  return out
}

function parsePackJson(text) {
  const trimmed = text.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

async function main() {
  await fs.mkdir(VERIFY_DIR, { recursive: true })

  try {
    await fs.access(path.join(PKG_DIR, 'package.json'))
  } catch {
    throw new Error('release/pkg 不存在或不完整，请先运行 node build.mjs')
  }

  // ---- 1. 语法检查 ----
  const clientCheck = run('node', ['--check', 'client.js'], { cwd: PKG_DIR })
  if (clientCheck.status !== 0) problem('node --check client.js 失败: ' + (clientCheck.stderr || clientCheck.error))
  else log('node --check client.js → exit 0')

  const indexSource = await fs.readFile(path.join(PKG_DIR, 'index.js'), 'utf8')
  const indexCheck = run('node', ['--input-type=module', '--check'], { input: indexSource })
  if (indexCheck.status !== 0) problem('node --input-type=module --check < index.js 失败: ' + (indexCheck.stderr || indexCheck.error))
  else log('node --input-type=module --check < index.js → exit 0')

  // ---- 2. npm pack --dry-run（人读输出 + JSON 统计）----
  const packHuman = run('npm', ['pack', '--dry-run'], { cwd: PKG_DIR })
  const packText = [
    '$ cd ' + PKG_DIR,
    '$ npm pack --dry-run',
    '',
    packHuman.stdout,
    packHuman.stderr,
    '[exit ' + packHuman.status + ']',
    '',
  ].join('\n')
  await fs.writeFile(path.join(VERIFY_DIR, 'npm-pack-dryrun.txt'), packText)
  if (packHuman.status !== 0) problem('npm pack --dry-run 失败，详见 verify/npm-pack-dryrun.txt')
  else log('npm pack --dry-run → exit 0（输出已存 verify/npm-pack-dryrun.txt）')

  const packJsonRun = run('npm', ['pack', '--dry-run', '--json'], { cwd: PKG_DIR })
  const packJson = packJsonRun.status === 0 ? parsePackJson(packJsonRun.stdout) : null
  let packed = null
  if (Array.isArray(packJson) && packJson.length > 0) packed = packJson[0]
  else note('npm pack --dry-run --json 未返回可解析结果，packedBytes 为空')

  // ---- 3. 包内文件扫描 ----
  const files = (await walk(PKG_DIR)).sort()
  const sizes = {}
  let totalBytes = 0
  const userPathHits = []
  for (const relative of files) {
    const absolute = path.join(PKG_DIR, relative)
    const stat = await fs.stat(absolute)
    sizes[relative] = stat.size
    totalBytes += stat.size
    let text
    try {
      text = await fs.readFile(absolute, 'utf8')
    } catch {
      continue
    }
    text.split('\n').forEach((line, index) => {
      if (line.includes('/Users/')) userPathHits.push({ file: relative, line: index + 1, text: line.trim().slice(0, 240) })
    })
  }
  sizes.total = totalBytes

  const toolsIncluded = files.some((file) => file === 'tools' || file.startsWith('tools/'))
  const indexDirIncluded = files.some((file) => file === '.index' || file.startsWith('.index/'))
  const nodeModulesIncluded = files.some((file) => file.startsWith('node_modules/'))
  if (toolsIncluded) problem('发布包含 tools/ 文件')
  if (indexDirIncluded) problem('发布包含 .index/ 数据目录')
  if (nodeModulesIncluded) problem('发布包含 node_modules/')
  if (userPathHits.length > 0) {
    // 发布包不得携带任何本机绝对路径：这是硬门禁，不是提示。
    blocker('包内仍有 /Users/ 本机绝对路径 ' + userPathHits.length + ' 处：' +
      [...new Set(userPathHits.map((hit) => hit.file))].join(', ') + '（发布包必须清零）')
  }

  // ---- 4. package.json 校验 ----
  let manifest = null
  let manifestText = ''
  try {
    manifestText = await fs.readFile(path.join(PKG_DIR, 'package.json'), 'utf8')
    manifest = JSON.parse(manifestText)
  } catch (error) {
    problem('package.json 不是合法 JSON: ' + error.message)
  }

  const checks = {}
  if (manifest) {
    checks.name = manifest.name === 'dsh-artifacts-panel'
    checks.version = /^\d+\.\d+\.\d+$/.test(String(manifest.version))
    checks.description = typeof manifest.description === 'string' && manifest.description.length > 20
    checks.license = manifest.license === 'MIT'
    checks.author = typeof manifest.author === 'string' && manifest.author.trim() !== ''
    checks.keywords = Array.isArray(manifest.keywords) && manifest.keywords.length >= 5
    checks.repository = !!(manifest.repository && typeof manifest.repository.url === 'string')
    checks.homepage = typeof manifest.homepage === 'string' && manifest.homepage.startsWith('https://')
    checks.engines = !!(manifest.engines && manifest.engines.dsh === EXPECTED_DSH_RANGE)
    checks.files = Array.isArray(manifest.files) && !manifest.files.some((entry) => entry.startsWith('tools/'))
    checks.exports = !!(manifest.exports && manifest.exports['./client'])
    checks.dshBundlePatch = !!(manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch)
    checks.dshClient = !!(manifest.dsh && manifest.dsh.client && manifest.dsh.client.platform === 'web')

    for (const [key, ok] of Object.entries(checks)) {
      if (!ok) problem('package.json 校验失败: ' + key)
    }

    // dsh.bundle.patch 指向的文件必须真实存在
    const patchRelative = manifest.dsh && manifest.dsh.bundle ? String(manifest.dsh.bundle.patch) : ''
    const patchPath = path.join(PKG_DIR, patchRelative.replace(/^\.\//, ''))
    try {
      const patchText = await fs.readFile(patchPath, 'utf8')
      checks.patchFileExists = true
      checks.patchRowId = patchText.includes('id: dsh-artifacts-panel')
      checks.patchRowName = patchText.includes("name: 'dsh-artifacts-panel'")
      if (!checks.patchRowId) problem('cordis.patch.yml 的 row id 未同步为 dsh-artifacts-panel')
      if (!checks.patchRowName) problem("cordis.patch.yml 的 row name 未同步为 'dsh-artifacts-panel'")
    } catch (error) {
      checks.patchFileExists = false
      problem('dsh.bundle.patch 指向的文件不存在: ' + patchRelative + '（' + error.message + '）')
    }

    // dsh.client.inject 列表
    const inject = manifest.dsh && manifest.dsh.client ? manifest.dsh.client.inject : null
    checks.clientInject = Array.isArray(inject) && inject.length === 8
    if (checks.clientInject !== true) problem('dsh.client.inject 不是预期的 8 项列表（当前 ' + (Array.isArray(inject) ? inject.length : '缺失') + '）')

    // v10 发布门禁：包身份、可选 Host 服务、同源索引路由与依赖范围。
    const clientSource = await fs.readFile(path.join(PKG_DIR, 'client.js'), 'utf8')
    const readmeSource = await fs.readFile(path.join(PKG_DIR, 'README.md'), 'utf8')
    const shippedTexts = [manifestText, clientSource, indexSource, readmeSource]
    checks.noLegacyId = shippedTexts.every((text) => text.indexOf('@local/') === -1)
    checks.indexRoute = clientSource.indexOf("'/artifacts-panel'") !== -1 &&
      clientSource.indexOf('DEFAULT_INDEX_DIR') === -1 &&
      indexSource.indexOf("'/artifacts-panel'") !== -1
    checks.optionalInject = /export const inject = \[\]/.test(indexSource) && indexSource.indexOf('ctx.systemPrompt') === -1
    checks.schemasteryRange = !!(manifest.dependencies && manifest.dependencies['@deepseek-ai/schemastery'] === '^3.19.0')
    checks.promptGuidanceDoc = readmeSource.indexOf('promptGuidance') !== -1 && readmeSource.indexOf('约 80 字') !== -1
    for (const key of ['noLegacyId', 'indexRoute', 'optionalInject', 'schemasteryRange', 'promptGuidanceDoc']) {
      if (!checks[key]) problem('发布门禁校验失败: ' + key)
    }
  }

  const hasPrivate = !!(manifest && Object.prototype.hasOwnProperty.call(manifest, 'private'))

  // 占位字段（发布前必须替换，本任务只报告）
  const placeholders = []
  if (manifest) {
    if (/OWNER|your-org/i.test(String(manifest.repository && manifest.repository.url))) placeholders.push('repository.url')
    if (/OWNER|your-org/i.test(String(manifest.homepage))) placeholders.push('homepage')
    if (/contributors$/.test(String(manifest.author))) placeholders.push('author')
  }
  if (placeholders.length > 0) blocker('以下字段仍是占位值，publish 前必须替换: ' + placeholders.join(', '))

  // ---- 5. 汇总 ----
  const packFiles = packed && Array.isArray(packed.files) ? packed.files.map((entry) => entry.path).sort() : []
  if (packFiles.length > 0) {
    const shipped = files.map((file) => file.replace(/\\/g, '/')).sort()
    const missing = shipped.filter((file) => !packFiles.includes(file))
    const extra = packFiles.filter((file) => !shipped.includes(file))
    if (missing.length > 0) problem('npm 包缺少文件: ' + missing.join(', '))
    if (extra.length > 0) problem('npm 包含预期外文件: ' + extra.join(', '))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    package: manifest
      ? {
          name: manifest.name,
          version: manifest.version,
          tarball: packed ? packed.filename : null,
          fileCount: files.length,
          packedBytes: packed ? packed.size : null,
          unpackedBytes: packed ? packed.unpackedSize : totalBytes,
          shasum: packed ? packed.shasum : null,
          integrity: packed ? packed.integrity : null,
        }
      : null,
    files: files.map((file) => file.replace(/\\/g, '/')),
    sizes,
    engines: manifest && manifest.engines ? manifest.engines : null,
    hasPrivate,
    toolsIncluded,
    indexDirIncluded,
    nodeModulesIncluded,
    userPathHits,
    placeholders,
    checks,
    nodeCheck: {
      clientJs: clientCheck.status,
      indexJsModule: indexCheck.status,
    },
    npmPack: {
      dryRunExit: packHuman.status,
      fileCount: packFiles.length,
      files: packFiles,
    },
    problems,
    blockers,
    notes,
    ok: problems.length === 0,
    publishReady: problems.length === 0 && blockers.length === 0 && userPathHits.length === 0,
  }

  await fs.writeFile(path.join(VERIFY_DIR, 'check.json'), JSON.stringify(report, null, 2) + '\n')

  log('文件数: ' + files.length + '（npm pack 清单 ' + packFiles.length + '）')
  log('打包含工具脚本: ' + String(toolsIncluded) + ' / 含 .index: ' + String(indexDirIncluded) +
    ' / 含 node_modules: ' + String(nodeModulesIncluded) + ' / private: ' + String(hasPrivate))
  log('/Users/ 命中: ' + userPathHits.length + (userPathHits.length > 0 ? '（' + [...new Set(userPathHits.map((hit) => hit.file))].join(', ') + '）' : ''))
  log('engines: ' + JSON.stringify(report.engines))
  log('check.json → ' + path.join(VERIFY_DIR, 'check.json'))
  if (problems.length > 0) {
    process.stderr.write('[verify] 校验未通过，共 ' + problems.length + ' 项结构问题\n')
    process.exit(1)
  }
  if (blockers.length > 0) {
    process.stdout.write('[verify] 结构校验通过；仍有 ' + blockers.length + ' 项发布阻塞（见 check.json 的 blockers）\n')
  } else {
    process.stdout.write('[verify] 全部校验通过，可以打包发布\n')
  }
}

function note(message) {
  notes.push(message)
  process.stdout.write('[verify][note] ' + message + '\n')
}

main().catch((error) => {
  process.stderr.write('[verify][error] ' + (error && error.stack ? error.stack : String(error)) + '\n')
  process.exit(1)
})

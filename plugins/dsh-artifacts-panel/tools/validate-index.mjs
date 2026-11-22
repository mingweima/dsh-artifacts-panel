#!/usr/bin/env node
/**
 * Validate the private cross-session artifact index.
 *
 * Checks:
 * - `.index/index.json` structurally (version, mode, totals, every session meta);
 * - every referenced `sessions/<sid>.json` against the strict row validator;
 * - meta.c matches the stored row count and totals add up;
 * - reports orphan session files (warning only).
 *
 * Exit codes: 0 valid (or index not initialized), 1 invalid, 2 usage/read error.
 *
 * Usage:
 *   node tools/validate-index.mjs [dir]
 *   node tools/validate-index.mjs --json
 *   node tools/validate-index.mjs --self-test
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateIndexDocument, validateSessionDocument } from '../index.js'

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// New location first (profile data dir); the legacy in-package `.index/` stays
// the fallback so this tool still works while migrating.
const DEFAULT_DIR = process.env.DSH_HOME && path.isAbsolute(process.env.DSH_HOME)
  ? path.join(process.env.DSH_HOME, 'artifacts-panel', 'index')
  : path.join(pluginDir, '.index')

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

export async function validateIndexDir(dir) {
  const target = path.resolve(dir)
  const issues = []
  const warnings = []
  const summary = { dir: target, sessions: 0, files: 0, turns: 0, rowsChecked: 0, generatedAt: 0, mode: null }
  let doc
  try {
    doc = await readJson(path.join(target, 'index.json'))
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, initialized: false, summary, issues, warnings }
    }
    issues.push('index.json is unreadable: ' + (error && error.message ? error.message : String(error)))
    return { ok: false, initialized: true, summary, issues, warnings }
  }
  try {
    validateIndexDocument(doc)
  } catch (error) {
    issues.push('index.json: ' + (error && error.message ? error.message : String(error)))
    return { ok: false, initialized: true, summary, issues, warnings }
  }
  summary.generatedAt = doc.generatedAt
  summary.mode = doc.mode
  const ids = Object.keys(doc.sessions)
  summary.sessions = ids.length
  let files = 0
  let turns = 0
  const referenced = new Set()
  for (const sid of ids) {
    referenced.add(sid + '.json')
    const meta = doc.sessions[sid]
    turns += meta.t
    let sessionDoc
    try {
      sessionDoc = await readJson(path.join(target, 'sessions', sid + '.json'))
    } catch (error) {
      issues.push('sessions/' + sid + '.json is unreadable: ' + (error && error.message ? error.message : String(error)))
      continue
    }
    try {
      validateSessionDocument(sessionDoc, sid)
    } catch (error) {
      issues.push('sessions/' + sid + '.json: ' + (error && error.message ? error.message : String(error)))
      continue
    }
    summary.rowsChecked += sessionDoc.rows.length
    if (sessionDoc.rows.length !== meta.c) {
      issues.push('sessions/' + sid + '.json has ' + sessionDoc.rows.length + ' rows but index.json says c=' + meta.c)
    }
    files += sessionDoc.rows.length
  }
  if (doc.totals.sessions !== ids.length) {
    issues.push('totals.sessions=' + doc.totals.sessions + ' but index has ' + ids.length + ' sessions')
  }
  if (doc.totals.files !== files) {
    issues.push('totals.files=' + doc.totals.files + ' but session files hold ' + files + ' rows')
  }
  if (doc.totals.turns !== turns) {
    issues.push('totals.turns=' + doc.totals.turns + ' but session meta sums to ' + turns)
  }
  let entries = []
  try {
    entries = await fs.readdir(path.join(target, 'sessions'))
  } catch (error) {
    if (!error || error.code !== 'ENOENT') warnings.push('sessions/ directory is unreadable')
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    if (!referenced.has(name)) warnings.push('orphan session file not referenced by index.json: ' + name)
  }
  summary.files = files
  summary.turns = turns
  return { ok: issues.length === 0, initialized: true, summary, issues, warnings }
}

async function selfTest() {
  const os = await import('node:os')
  const dir = path.join(os.tmpdir(), 'dsh-artifacts-index-selftest-' + process.pid)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(path.join(dir, 'sessions'), { recursive: true })
  const now = Date.now()
  await fs.writeFile(path.join(dir, 'sessions', 'aaa.json'), JSON.stringify({
    v: 1,
    sid: 'aaa',
    rows: [['/workspace/report.md', 1, 'presented', 'doc']],
  }), 'utf8')
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({
    v: 1,
    mode: 'persistent',
    generatedAt: now,
    totals: { sessions: 1, files: 1, turns: 1 },
    backfill: { running: false, done: 1, total: 1 },
    sessions: { aaa: { t: 1, u: now, c: 1, n: 4, a: now, upd: now, w: '/workspace' } },
  }), 'utf8')
  const good = await validateIndexDir(dir)
  await fs.writeFile(path.join(dir, 'sessions', 'aaa.json'), JSON.stringify({ v: 1, sid: 'aaa', rows: [['relative.md', 1, 'presented', 'doc']] }), 'utf8')
  const bad = await validateIndexDir(dir)
  await fs.rm(dir, { recursive: true, force: true })
  console.log('self-test sample dir: ' + dir)
  console.log('good sample ok=' + good.ok + ' issues=' + JSON.stringify(good.issues))
  console.log('bad sample ok=' + bad.ok + ' issues=' + JSON.stringify(bad.issues))
  if (good.ok && !bad.ok) return 0
  return 1
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) {
    process.exitCode = await selfTest()
    return
  }
  const json = argv.includes('--json')
  const filtered = argv.filter(function (arg) { return arg !== '--json' })
  const dir = filtered[0] ? path.resolve(filtered[0]) : DEFAULT_DIR
  const result = await validateIndexDir(dir)
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('artifact index: ' + result.summary.dir)
    if (!result.initialized) {
      console.log('status: not initialized (no .index/index.json yet)')
    } else {
      console.log('status: ' + (result.ok ? 'valid' : 'INVALID'))
      console.log('mode: ' + result.summary.mode + ' · sessions: ' + result.summary.sessions + ' · rows: ' + result.summary.rowsChecked + ' · turns: ' + result.summary.turns)
    }
    for (const issue of result.issues) console.log('issue: ' + issue)
    for (const warning of result.warnings) console.log('warning: ' + warning)
  }
  process.exitCode = result.ok ? 0 : 1
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch(function (error) {
    console.error('[validate-index] ' + (error && error.message ? error.message : String(error)))
    process.exitCode = 2
  })
}

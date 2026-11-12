/**
 * Host half of the artifacts panel bundle.
 *
 * Two independent duties:
 * 1. Prompt guidance (v1): one small system-prompt section, switchable in config.
 *    The `systemPrompt` service is optional: a host without it still loads this
 *    plugin and only skips the guidance.
 * 2. Cross-session artifact index (v2b): a host-only session projection plus a
 *    private reference index under the DSH profile data directory.
 *
 * Privacy contract (cloud review):
 * - Only DSH sessions produced by this Host are read, through the
 *   `sessionPersistence` service. No Cursor / Grok agent data is touched.
 * - The index stores REFERENCES only: session id, absolute file path, turn,
 *   source, kind and optionally size/sha. No reply text, no description, no
 *   file content is ever stored.
 * - Session logs only arrive through the persistence service; the index itself
 *   lives under `$DSH_HOME/artifacts-panel/index` (or an OS temp directory when
 *   `DSH_HOME` is not set), never inside the installed package directory.
 */
import z from '@deepseek-ai/schemastery'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * No hard-injected Host service. `systemPrompt` (prompt guidance), `webServer`
 * and `connection` (index HTTP route) are all consumed optionally through
 * `ctx.inject([...])` / `ctx.get(...)`, so a host that lacks any of them can
 * still load the plugin instead of failing the whole fiber.
 */
export const inject = []

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
/** Directory used by versions <= 0.2.0; only read once for migration. */
export const LEGACY_INDEX_DIR = path.join(PLUGIN_DIR, '.index')
/** Same-origin prefix of the read-only index routes served by this Host. */
export const INDEX_ROUTE_PREFIX = '/artifacts-panel'
export const INDEX_ROUTE_INDEX = INDEX_ROUTE_PREFIX + '/index.json'
export const INDEX_ROUTE_SESSIONS = INDEX_ROUTE_PREFIX + '/sessions/'
export const INDEX_ROUTE_REBUILD = INDEX_ROUTE_PREFIX + '/rebuild'
const MAX_ROUTE_BYTES = 2 * 1024 * 1024

/**
 * Resolve the profile-scoped index directory. `DSH_HOME` is the Host's own
 * profile root; when it is missing we fall back to an OS temp directory so a
 * read-only install never tries to write inside the package. The caller logs
 * which branch was taken.
 */
export function resolveDefaultIndexDir(env = process.env) {
  const raw = env && typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  if (raw !== '' && path.isAbsolute(raw)) return path.join(raw, 'artifacts-panel', 'index')
  return path.join(os.tmpdir(), 'dsh-artifacts-panel', 'index')
}

/** Computed once at load; exported for diagnostics and tests. */
export const DEFAULT_INDEX_DIR = resolveDefaultIndexDir()

/** Plugin config. */
export const Config = z.object({
  promptGuidance: z.boolean().default(true),
  crossSessionIndex: z.boolean().default(true),
})

//#region constants
const INDEX_FORMAT_VERSION = 1
const SESSION_FORMAT_VERSION = 1
const MAX_SESSIONS = 300
const MAX_ROWS_PER_SESSION = 300
const MAX_ROWS_IN_STATE = 1000
const MAX_INDEX_BYTES = 512 * 1024
const MAX_SESSION_BYTES = 256 * 1024
const MAX_PATH_LENGTH = 4096
const WRITE_DELAY_MS = 2000
const BACKFILL_CONCURRENCY = 2
const BACKFILL_YIELD_EVERY = 20
const BACKFILL_MAX_BYTES = 32 * 1024 * 1024
const BACKFILL_DELAY_MS = 2500
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/
const SHA_PATTERN = /^[a-f0-9]{64}$/i
const MODES = new Set(['persistent', 'projection'])
const SOURCES = new Set(['presented', 'produced'])
const KINDS = new Set(['doc', 'image', 'file'])
//#endregion

//#region small pure helpers
function isAbsolutePath(value) {
  return typeof value === 'string' && (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value))
}

function normalizeArtifactPath(value) {
  if (typeof value !== 'string') return ''
  const cleaned = value.trim().replace(/\\/g, '/')
  if (cleaned === '' || cleaned.length > MAX_PATH_LENGTH) return ''
  if (/[\u0000-\u001f\u007f]/.test(cleaned)) return ''
  return cleaned
}

function basenameOf(value) {
  const text = String(value)
  const at = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return at === -1 ? text : text.slice(at + 1)
}

function extensionOf(value) {
  const name = basenameOf(value).toLowerCase()
  const at = name.lastIndexOf('.')
  return at === -1 ? '' : name.slice(at + 1)
}

const DOC_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'txt', 'json', 'jsonl', 'yaml', 'yml', 'csv', 'tsv', 'toml', 'ini', 'xml', 'html', 'htm', 'rst', 'tex', 'text'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif', 'ico', 'heic'])

function kindOf(path) {
  const ext = extensionOf(path)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (DOC_EXTENSIONS.has(ext)) return 'doc'
  return 'file'
}

/** Same noise rules as the browser half, plus an explicit `~/.dsh` guard. */
export function isExcludedArtifactPath(value) {
  const lower = String(value).toLowerCase()
  if (lower === '/tmp' || lower.startsWith('/tmp/') || lower.startsWith('/private/tmp/') || lower.startsWith('/var/folders/')) return true
  if (lower.includes('/.dsh/') || lower.endsWith('/.dsh')) return true
  if (lower.includes('/.index/') || lower.endsWith('/.index')) return true
  if (lower.includes('/.git/') || lower.startsWith('.git/')) return true
  if (/(^|\/)(node_modules|dist|build|\.next)\//.test(lower)) return true
  const name = basenameOf(lower)
  if (name.startsWith('.')) return true
  if (name.endsWith('.log')) return true
  return false
}

function isSafeSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value) && value !== '.' && value !== '..'
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function toRowObject(row) {
  return {
    path: row[0],
    turn: row[1],
    source: row[2],
    kind: row[3],
    ...(row[4] === undefined || row[4] === null ? {} : { size: row[4] }),
    ...(row[5] === undefined ? {} : { sha: row[5] }),
  }
}

function toRowArray(row) {
  const result = [row.path, row.turn, row.source, row.kind]
  if (finiteNumber(row.size)) result.push(row.size)
  else if (typeof row.sha === 'string' && row.sha !== '') result.push(null)
  if (typeof row.sha === 'string' && row.sha !== '') result.push(row.sha)
  return result
}
//#endregion

//#region profile data directory + legacy migration
function serviceOf(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name)
  } catch (error) {
    return undefined
  }
  return undefined
}

function loggerOf(ctx) {
  const logger = ctx && ctx.logger ? ctx.logger : null
  function write(level, message, error) {
    const method = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null
    if (!method) return
    try {
      if (error === undefined) method('[artifacts-index] ' + message)
      else method('[artifacts-index] ' + message, error)
    } catch (ignored) { /* logging must never break the plugin */ }
  }
  return {
    info: function (message) { write('info', message) },
    warn: function (message, error) { write('warn', message, error) },
    error: function (message, error) { write('error', message, error) },
  }
}

function isSafeIndexFileName(name) {
  if (typeof name !== 'string' || !name.endsWith('.json')) return false
  const sid = name.slice(0, -5)
  return isSafeSessionId(sid)
}

/**
 * One-shot copy of the old in-package `.index/` into the new profile data
 * directory. It never deletes or moves the legacy directory: if anything goes
 * wrong the old data stays where it was, and a second start simply skips the
 * migration because the destination already has an index.json.
 *
 * @returns {Promise<{migrated: boolean, reason?: string, copied?: number}>}
 */
export async function migrateLegacyIndex(legacyDir, targetDir, logger) {
  const legacy = path.resolve(String(legacyDir))
  const target = path.resolve(String(targetDir))
  if (legacy === target) return { migrated: false, reason: 'same-directory' }
  let legacyStat
  try {
    legacyStat = await fs.stat(path.join(legacy, 'index.json'))
  } catch (error) {
    return { migrated: false, reason: 'no-legacy-index' }
  }
  if (!legacyStat.isFile()) return { migrated: false, reason: 'legacy-index-not-file' }
  try {
    const targetStat = await fs.stat(path.join(target, 'index.json'))
    if (targetStat.isFile()) return { migrated: false, reason: 'target-already-exists' }
  } catch (error) {
    // ENOENT is the expected case: the destination has not been created yet.
    if (error && error.code !== 'ENOENT') return { migrated: false, reason: 'target-unreadable' }
  }
  try {
    await fs.mkdir(path.join(target, 'sessions'), { recursive: true })
    await fs.copyFile(path.join(legacy, 'index.json'), path.join(target, 'index.json'))
  } catch (error) {
    if (logger && typeof logger.warn === 'function') logger.warn('legacy index migration could not copy index.json', error)
    return { migrated: false, reason: 'copy-failed' }
  }
  let copied = 0
  let failed = 0
  let names = []
  try {
    names = await fs.readdir(path.join(legacy, 'sessions'))
  } catch (error) {
    names = []
  }
  for (const name of names) {
    if (!isSafeIndexFileName(name)) continue
    try {
      await fs.copyFile(path.join(legacy, 'sessions', name), path.join(target, 'sessions', name))
      copied += 1
    } catch (error) {
      failed += 1
      if (logger && typeof logger.warn === 'function') logger.warn('legacy index migration skipped ' + name, error)
    }
  }
  // A partial copy must not leave an index.json that references missing rows:
  // the next start retries from the intact legacy directory instead.
  if (failed > 0) {
    try { await fs.unlink(path.join(target, 'index.json')) } catch (error) { /* already gone */ }
    if (logger && typeof logger.warn === 'function') {
      logger.warn('legacy index migration was partial (' + failed + ' session file(s) failed); destination left for a retry')
    }
    return { migrated: false, reason: 'partial-copy' }
  }
  if (logger && typeof logger.info === 'function') {
    logger.info('migrated legacy index from ' + legacy + ' to ' + target + ' (' + copied + ' session files copied, old directory kept)')
  }
  return { migrated: true, copied }
}
//#endregion

//#region validators (hand-written; the linked profile may not expose zod)
export function validateArtifactState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('artifact state must be an object')
  }
  if (!Array.isArray(value.rows)) throw new Error('artifact state.rows must be an array')
  if (value.rows.length > MAX_ROWS_IN_STATE * 2) throw new Error('artifact state.rows is too large')
  for (const row of value.rows) {
    if (row === null || typeof row !== 'object') throw new Error('artifact state row must be an object')
    if (!isAbsolutePath(row.path)) throw new Error('artifact state row.path must be absolute')
    if (!finiteNumber(row.turn)) throw new Error('artifact state row.turn must be a number')
    if (!SOURCES.has(row.source)) throw new Error('artifact state row.source is invalid')
    if (!KINDS.has(row.kind)) throw new Error('artifact state row.kind is invalid')
  }
  if (!finiteNumber(value.turns)) throw new Error('artifact state.turns must be a number')
  if (!finiteNumber(value.updatedAt)) throw new Error('artifact state.updatedAt must be a number')
  return value
}

/** The projection service only needs `.parse()`; a hand-written validator is enough. */
const ARTIFACT_STATE_SCHEMA = {
  parse(value) {
    return validateArtifactState(value)
  },
}

export function validateIndexDocument(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('index must be an object')
  if (value.v !== INDEX_FORMAT_VERSION) throw new Error('index.v must be ' + INDEX_FORMAT_VERSION)
  if (!MODES.has(value.mode)) throw new Error('index.mode is invalid')
  if (!finiteNumber(value.generatedAt)) throw new Error('index.generatedAt must be a number')
  if (value.totals === null || typeof value.totals !== 'object' || Array.isArray(value.totals)) throw new Error('index.totals must be an object')
  for (const key of ['sessions', 'files', 'turns']) {
    if (!finiteNumber(value.totals[key]) || value.totals[key] < 0) throw new Error('index.totals.' + key + ' must be a non-negative number')
  }
  if (value.backfill !== undefined) {
    const backfill = value.backfill
    if (backfill === null || typeof backfill !== 'object' || Array.isArray(backfill)) throw new Error('index.backfill must be an object')
    if (typeof backfill.running !== 'boolean') throw new Error('index.backfill.running must be a boolean')
    if (!finiteNumber(backfill.done) || !finiteNumber(backfill.total)) throw new Error('index.backfill counters must be numbers')
  }
  const sessions = value.sessions
  if (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions)) throw new Error('index.sessions must be an object')
  const ids = Object.keys(sessions)
  if (ids.length > MAX_SESSIONS * 2) throw new Error('index.sessions is too large')
  for (const sid of ids) {
    if (!isSafeSessionId(sid)) throw new Error('index.sessions contains an invalid session id: ' + JSON.stringify(sid))
    const meta = sessions[sid]
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('index.sessions[' + sid + '] must be an object')
    for (const key of ['t', 'u', 'c', 'n', 'a', 'upd']) {
      if (!finiteNumber(meta[key]) || meta[key] < 0) throw new Error('index.sessions[' + sid + '].' + key + ' must be a non-negative number')
    }
    if (meta.w !== undefined && typeof meta.w !== 'string') throw new Error('index.sessions[' + sid + '].w must be a string')
    if (meta.p !== undefined && typeof meta.p !== 'string') throw new Error('index.sessions[' + sid + '].p must be a string')
    if (meta.p !== undefined && meta.p !== '' && !isSafeSessionId(meta.p)) throw new Error('index.sessions[' + sid + '].p is an invalid session id')
  }
  return value
}

export function validateSessionDocument(value, sessionId) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('session document must be an object')
  if (value.v !== SESSION_FORMAT_VERSION) throw new Error('session document.v must be ' + SESSION_FORMAT_VERSION)
  if (value.sid !== sessionId) throw new Error('session document.sid does not match its file name')
  if (!Array.isArray(value.rows)) throw new Error('session document.rows must be an array')
  if (value.rows.length > MAX_ROWS_PER_SESSION * 2) throw new Error('session document.rows is too large')
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length < 4 || row.length > 6) throw new Error('session row must be a 4-6 element array')
    const [rowPath, turn, source, kind] = row
    if (typeof rowPath !== 'string' || !isAbsolutePath(rowPath) || rowPath.length > MAX_PATH_LENGTH) throw new Error('session row path is invalid')
    if (/[\u0000-\u001f\u007f]/.test(rowPath)) throw new Error('session row path contains control characters')
    if (!finiteNumber(turn) || turn < 0) throw new Error('session row turn is invalid')
    if (!SOURCES.has(source)) throw new Error('session row source is invalid')
    if (!KINDS.has(kind)) throw new Error('session row kind is invalid')
    if (row[4] !== undefined && row[4] !== null && (!finiteNumber(row[4]) || row[4] < 0)) throw new Error('session row size is invalid')
    if (row[5] !== undefined && (typeof row[5] !== 'string' || !SHA_PATTERN.test(row[5]))) throw new Error('session row sha is invalid')
  }
  return value
}
//#endregion

//#region fold
/** Empty fold state. `cwd` resolves relative tool paths. */
export function createEmptyState(cwd) {
  return { cwd: typeof cwd === 'string' ? cwd : '', rows: [], turns: 0, updatedAt: 0, calls: {} }
}

function resolveArtifactPath(cwd, value) {
  const cleaned = normalizeArtifactPath(value)
  if (cleaned === '') return ''
  if (isAbsolutePath(cleaned)) return cleaned
  if (!cwd) return ''
  return String(cwd).replace(/[/\\]+$/, '') + '/' + cleaned.replace(/^(?:\.?[/\\])+/, '')
}

function mutationPathOf(name, argsRaw) {
  if (typeof argsRaw !== 'string') return ''
  let args
  try {
    args = JSON.parse(argsRaw)
  } catch (error) {
    return ''
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return ''
  if (name === 'write' || name === 'edit') {
    return typeof args.file_path === 'string' ? args.file_path : ''
  }
  if (name === 'str_replace_editor') {
    if (args.command === 'view' || args.command === 'undo_edit') return ''
    return typeof args.path === 'string' ? args.path : ''
  }
  return ''
}

function addRowToState(state, rowPath, turn, options) {
  const cleaned = normalizeArtifactPath(rowPath)
  if (cleaned === '' || !isAbsolutePath(cleaned)) return state
  if (isExcludedArtifactPath(cleaned)) return state
  const source = options && options.source === 'presented' ? 'presented' : 'produced'
  const kind = kindOf(cleaned)
  const size = options && finiteNumber(options.size) && options.size >= 0 ? options.size : undefined
  const sha = options && typeof options.sha === 'string' && SHA_PATTERN.test(options.sha) ? options.sha.toLowerCase() : undefined
  const rows = state.rows.slice()
  const existing = rows.findIndex(function (row) { return row.path === cleaned })
  if (existing !== -1) {
    const previous = rows[existing]
    if (previous.source !== 'presented' && source === 'presented') rows[existing] = Object.assign({}, previous, { source: 'presented' })
    return Object.assign({}, state, { rows })
  }
  rows.push({
    path: cleaned,
    turn: finiteNumber(turn) && turn >= 0 ? turn : 0,
    source,
    kind,
    ...(size === undefined ? {} : { size }),
    ...(sha === undefined ? {} : { sha }),
  })
  if (rows.length > MAX_ROWS_IN_STATE) rows.splice(0, rows.length - MAX_ROWS_IN_STATE)
  return Object.assign({}, state, { rows })
}

/**
 * Pure fold step shared by the live projection, the fallback event listener and
 * the backfill reader. Returns the same reference when an event cannot change
 * the index, so projector change detection stays cheap.
 */
export function foldArtifactState(state, event) {
  const base = state && typeof state === 'object' ? state : createEmptyState()
  if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return base
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  const time = finiteNumber(event.time) ? event.time : 0
  if (event.type === 'deliverables/presented') {
    const files = Array.isArray(data.files) ? data.files : []
    let next = base
    for (const file of files) {
      if (!file || typeof file.path !== 'string') continue
      next = addRowToState(next, resolveArtifactPath(base.cwd, file.path), data.turn, {
        source: 'presented',
        size: finiteNumber(file.size) ? file.size : undefined,
        sha: typeof file.sha === 'string' ? file.sha : (typeof file.sha256 === 'string' ? file.sha256 : undefined),
      })
    }
    if (next !== base) next = Object.assign({}, next, { updatedAt: Math.max(next.updatedAt || 0, time) })
    return next
  }
  if (event.type === 'tool/call') {
    const callId = data.callId === undefined ? '' : String(data.callId)
    if (callId === '') return base
    const callPath = mutationPathOf(data.name, data.arguments)
    if (callPath === '') return base
    const calls = Object.assign({}, base.calls || {})
    calls[callId] = { turn: finiteNumber(data.turn) ? data.turn : 0, path: callPath, seq: finiteNumber(event.seq) ? event.seq : 0 }
    const keys = Object.keys(calls)
    if (keys.length > 400) {
      for (const key of keys.slice(0, keys.length - 400)) delete calls[key]
    }
    return Object.assign({}, base, { calls })
  }
  if (event.type === 'tool/result') {
    const message = data.message && typeof data.message === 'object' ? data.message : {}
    if (message.isError === true || data.error !== undefined) return base
    const callId = message.source && message.source.callId !== undefined ? String(message.source.callId) : ''
    const call = callId !== '' ? (base.calls || {})[callId] : undefined
    if (!call || !call.path) return base
    const meta = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? data.meta : {}
    const metaPath = typeof meta.path === 'string' ? meta.path : ''
    const candidate = isAbsolutePath(metaPath) ? metaPath : call.path
    const turn = finiteNumber(data.turn) ? data.turn : (call ? call.turn : 0)
    const size = finiteNumber(meta.size) ? meta.size : (finiteNumber(meta.bytes) ? meta.bytes : undefined)
    const sha = typeof meta.sha === 'string' ? meta.sha : (typeof meta.sha256 === 'string' ? meta.sha256 : undefined)
    let next = addRowToState(base, resolveArtifactPath(base.cwd, candidate), turn, { source: 'produced', size, sha })
    if (next !== base && call) {
      const calls = Object.assign({}, next.calls || {})
      delete calls[callId]
      next = Object.assign({}, next, { calls })
    }
    if (next !== base) next = Object.assign({}, next, { updatedAt: Math.max(next.updatedAt || 0, time) })
    return next
  }
  if (event.type === 'turn/end') {
    return Object.assign({}, base, {
      turns: (finiteNumber(base.turns) ? base.turns : 0) + 1,
      updatedAt: Math.max(finiteNumber(base.updatedAt) ? base.updatedAt : 0, time),
    })
  }
  return base
}

function trimRows(rows, limit) {
  if (!Array.isArray(rows) || rows.length <= limit) return Array.isArray(rows) ? rows.slice() : []
  return rows.slice(rows.length - limit)
}

function trimRowsToBytes(rows, sid, maxBytes) {
  let working = rows.slice()
  while (working.length > 0) {
    const text = JSON.stringify({ v: SESSION_FORMAT_VERSION, sid, rows: working.map(toRowArray) })
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) return working
    const drop = Math.max(1, Math.ceil(working.length * 0.1))
    working = working.slice(drop)
  }
  return working
}
//#endregion

//#region index document helpers
function emptyIndexDocument() {
  return {
    v: INDEX_FORMAT_VERSION,
    mode: 'persistent',
    generatedAt: 0,
    totals: { sessions: 0, files: 0, turns: 0 },
    backfill: { running: false, done: 0, total: 0 },
    sessions: {},
  }
}

function recomputeTotals(doc) {
  let files = 0
  let turns = 0
  const ids = Object.keys(doc.sessions)
  for (const sid of ids) {
    const meta = doc.sessions[sid]
    files += finiteNumber(meta.c) ? meta.c : 0
    turns += finiteNumber(meta.t) ? meta.t : 0
  }
  doc.totals = { sessions: ids.length, files, turns }
  return doc
}

function serializedIndex(doc) {
  return JSON.stringify(doc)
}

async function writeAtomic(filePath, text) {
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  try {
    await fs.writeFile(tmp, text, 'utf8')
    await fs.rename(tmp, filePath)
  } catch (error) {
    try { await fs.unlink(tmp) } catch (cleanupError) { /* best effort */ }
    throw error
  }
}

async function quarantineFile(filePath) {
  const target = filePath + '.bad.' + Date.now().toString(36)
  try {
    await fs.rename(filePath, target)
    return target
  } catch (error) {
    try { await fs.unlink(filePath) } catch (cleanupError) { /* best effort */ }
    return target
  }
}

function yieldToEventLoop() {
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}
//#endregion

//#region indexer
/**
 * Build one indexer bound to a Cordis context. The factory is exported so
 * `tools/test-v2b.mjs` can drive it with a mock context and a temp directory.
 *
 * @param {object} ctx Cordis host context (uses `get`, `logger`).
 * @param {object} [options] Test seams: indexDir, logger, now, writeDelay,
 *   autoBackfill, maxSessions, maxRowsPerSession, backfillDelayMs.
 */
export function createArtifactIndexer(ctx, options = {}) {
  const indexDir = options.indexDir || DEFAULT_INDEX_DIR
  const sessionsDir = path.join(indexDir, 'sessions')
  const indexPath = path.join(indexDir, 'index.json')
  const logger = options.logger || (ctx && ctx.logger) || null
  const now = typeof options.now === 'function' ? options.now : Date.now
  const writeDelay = finiteNumber(options.writeDelay) ? options.writeDelay : WRITE_DELAY_MS
  const autoBackfill = options.autoBackfill !== false
  const backfillDelayMs = finiteNumber(options.backfillDelayMs) ? options.backfillDelayMs : BACKFILL_DELAY_MS
  const maxSessions = finiteNumber(options.maxSessions) && options.maxSessions > 0 ? Math.floor(options.maxSessions) : MAX_SESSIONS
  const maxRowsPerSession = finiteNumber(options.maxRowsPerSession) && options.maxRowsPerSession > 0 ? Math.floor(options.maxRowsPerSession) : MAX_ROWS_PER_SESSION
  const maxIndexBytes = finiteNumber(options.maxIndexBytes) && options.maxIndexBytes > 0 ? options.maxIndexBytes : MAX_INDEX_BYTES
  const maxSessionBytes = finiteNumber(options.maxSessionBytes) && options.maxSessionBytes > 0 ? options.maxSessionBytes : MAX_SESSION_BYTES
  const migrateLegacy = options.migrateLegacy !== false

  let doc = emptyIndexDocument()
  const rowsBySid = new Map()
  const dirty = new Set()
  const pendingUnlink = new Set()
  const liveStates = new Map()
  const pendingEvents = []
  let timer = null
  let backfillTimer = null
  let writable = false
  let started = false
  let ready = false
  let disposed = false
  let projectionHandle = null
  let backfillPromise = null
  let loggedProjectionFailure = false

  function log(level, message, error) {
    const method = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null
    if (!method) return
    try {
      if (error === undefined) method('[artifacts-index] ' + message)
      else method('[artifacts-index] ' + message, error)
    } catch (ignored) { /* logging must never break indexing */ }
  }

  function getService(name) {
    try {
      if (ctx && typeof ctx.get === 'function') return ctx.get(name)
    } catch (error) {
      return undefined
    }
    return undefined
  }

  function refreshTotals() {
    recomputeTotals(doc)
  }

  async function probeWritable() {
    try {
      await fs.mkdir(sessionsDir, { recursive: true })
      const probe = path.join(indexDir, '.probe-' + process.pid + '-' + Math.random().toString(36).slice(2, 8))
      await fs.writeFile(probe, 'ok', 'utf8')
      await fs.unlink(probe)
      return true
    } catch (error) {
      log('warn', 'index directory is not writable; falling back to in-memory mode', error)
      return false
    }
  }

  async function loadIndex() {
    let raw
    try {
      raw = await fs.readFile(indexPath, 'utf8')
    } catch (error) {
      if (error && error.code !== 'ENOENT') log('warn', 'could not read index.json', error)
      doc = emptyIndexDocument()
      return
    }
    try {
      const parsed = JSON.parse(raw)
      validateIndexDocument(parsed)
      doc = parsed
    } catch (error) {
      log('warn', 'index.json failed validation; quarantining it', error)
      const quarantined = await quarantineFile(indexPath)
      log('info', 'quarantined broken index at ' + quarantined)
      doc = emptyIndexDocument()
    }
  }

  async function removeOrphanSessionFiles() {
    let names
    try {
      names = await fs.readdir(sessionsDir)
    } catch (error) {
      return
    }
    const referenced = new Set(Object.keys(doc.sessions).map(function (sid) { return sid + '.json' }))
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      if (referenced.has(name)) continue
      try {
        await fs.unlink(path.join(sessionsDir, name))
        log('info', 'removed orphan session index file ' + name)
      } catch (error) {
        log('warn', 'could not remove orphan session index file ' + name, error)
      }
    }
  }

  function sortSessionsByUpdatedAt() {
    return Object.keys(doc.sessions).sort(function (left, right) {
      const a = doc.sessions[left]
      const b = doc.sessions[right]
      return (a.u || a.a || 0) - (b.u || b.a || 0) || left.localeCompare(right)
    })
  }

  function evictOldSessions(keep) {
    const ids = sortSessionsByUpdatedAt()
    const excess = Math.max(0, ids.length - keep)
    for (let index = 0; index < excess; index += 1) {
      const sid = ids[index]
      delete doc.sessions[sid]
      rowsBySid.delete(sid)
      liveStates.delete(sid)
      pendingUnlink.add(sid)
      log('info', 'evicted old session from index: ' + sid)
    }
    if (excess > 0) refreshTotals()
    return excess
  }

  function enforceIndexSize() {
    let guard = 0
    while (Buffer.byteLength(serializedIndex(doc), 'utf8') > maxIndexBytes && Object.keys(doc.sessions).length > 1 && guard < 2000) {
      const ids = sortSessionsByUpdatedAt()
      const sid = ids[0]
      delete doc.sessions[sid]
      rowsBySid.delete(sid)
      liveStates.delete(sid)
      pendingUnlink.add(sid)
      log('info', 'evicted session to keep index.json under ' + maxIndexBytes + ' bytes: ' + sid)
      refreshTotals()
      guard += 1
    }
    return guard
  }

  async function loadSessionRows(sid) {
    const filePath = path.join(sessionsDir, sid + '.json')
    let raw
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (error && error.code !== 'ENOENT') log('warn', 'could not read session index for ' + sid, error)
      return null
    }
    try {
      const parsed = JSON.parse(raw)
      validateSessionDocument(parsed, sid)
      return parsed.rows.map(toRowObject)
    } catch (error) {
      log('warn', 'session index for ' + sid + ' failed validation; quarantining it', error)
      await quarantineFile(filePath)
      return null
    }
  }

  function serializeSession(sid, rows) {
    const trimmed = trimRowsToBytes(rows, sid, maxSessionBytes)
    return { text: JSON.stringify({ v: SESSION_FORMAT_VERSION, sid, rows: trimmed.map(toRowArray) }), rows: trimmed }
  }

  async function writeSessionFile(sid, rows) {
    const { text, rows: kept } = serializeSession(sid, rows)
    const filePath = path.join(sessionsDir, sid + '.json')
    await writeAtomic(filePath, text)
    return kept
  }

  async function writeIndexDocument() {
    refreshTotals()
    enforceIndexSize()
    doc.mode = writable ? 'persistent' : 'projection'
    doc.generatedAt = now()
    const text = serializedIndex(doc)
    if (Buffer.byteLength(text, 'utf8') > maxIndexBytes) {
      log('warn', 'index.json is still over the size cap after trimming old sessions')
    }
    await writeAtomic(indexPath, text)
    for (const sid of Array.from(pendingUnlink)) {
      pendingUnlink.delete(sid)
      try {
        await fs.unlink(path.join(sessionsDir, sid + '.json'))
      } catch (error) {
        if (!error || error.code !== 'ENOENT') log('warn', 'could not remove evicted session index file ' + sid, error)
      }
    }
  }

  async function flushNow() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!writable) return
    const ids = Array.from(dirty)
    dirty.clear()
    if (ids.length === 0 && !backfillRunning()) return
    try {
      await fs.mkdir(sessionsDir, { recursive: true })
      for (const sid of ids) {
        const rows = rowsBySid.get(sid)
        if (!rows) continue
        const meta = doc.sessions[sid]
        if (!meta) continue
        const kept = await writeSessionFile(sid, rows)
        rowsBySid.set(sid, kept)
        meta.c = kept.length
        meta.upd = now()
      }
      await writeIndexDocument()
    } catch (error) {
      for (const sid of ids) dirty.add(sid)
      log('error', 'failed to write the artifact index', error)
      if (error && (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EROFS' || error.code === 'ENOSPC')) {
        writable = false
        doc.mode = 'projection'
        log('warn', 'switched the artifact index to in-memory mode after a write failure')
        // Best effort: if only a session file was unwritable, this marker still
        // tells the browser that persistence is degraded.
        try {
          refreshTotals()
          await writeAtomic(indexPath, serializedIndex(Object.assign({}, doc, { mode: 'projection', generatedAt: now() })))
        } catch (markerError) {
          log('warn', 'could not write the persistence-degraded marker', markerError)
        }
      }
    }
  }

  function scheduleWrite() {
    if (!writable || disposed) return
    if (timer !== null) return
    timer = setTimeout(function () {
      timer = null
      void flushNow()
    }, writeDelay)
    if (timer && typeof timer.unref === 'function') timer.unref()
  }

  function markDirty(sid) {
    if (!sid) return
    dirty.add(sid)
    scheduleWrite()
  }

  function backfillRunning() {
    return doc.backfill && doc.backfill.running === true
  }

  async function registerProjection() {
    const service = getService('sessionProjections')
    if (!service || typeof service.register !== 'function') {
      log('info', 'sessionProjections is unavailable; live index falls back to session/event folding')
      return
    }
    try {
      const registration = service.register({
        key: 'artifactIndex',
        stateSchema: ARTIFACT_STATE_SCHEMA,
        init: function (header) { return createEmptyState(header && header.cwd ? header.cwd : '') },
        apply: foldArtifactState,
        stateVersion: 1,
      })
      Promise.resolve(registration).then(function (handle) {
        projectionHandle = handle
      }).catch(function (error) {
        if (loggedProjectionFailure) return
        loggedProjectionFailure = true
        log('warn', 'host-only artifactIndex projection could not register; live index falls back to session/event folding', error)
      })
    } catch (error) {
      if (!loggedProjectionFailure) {
        loggedProjectionFailure = true
        log('warn', 'host-only artifactIndex projection could not register; live index falls back to session/event folding', error)
      }
    }
  }

  function metaForSession(header, state, eventCount) {
    const cwd = header && typeof header.cwd === 'string' ? header.cwd : (state && state.cwd) || ''
    const parent = header && header.parentSession ? String(header.parentSession) : ''
    const createdAt = header && finiteNumber(header.createdAt) ? header.createdAt : 0
    const updatedAt = Math.max(
      finiteNumber(state.updatedAt) ? state.updatedAt : 0,
      createdAt,
      finiteNumber(state.lastTime) ? state.lastTime : 0,
    )
    return {
      t: finiteNumber(state.turns) ? state.turns : 0,
      u: updatedAt,
      c: Array.isArray(state.rows) ? state.rows.length : 0,
      n: finiteNumber(eventCount) ? eventCount : 0,
      a: createdAt,
      upd: now(),
      ...(cwd === '' ? {} : { w: cwd }),
      ...(parent === '' ? {} : { p: parent }),
    }
  }

  function applyLiveState(sid, state, header, eventCount) {
    if (!isSafeSessionId(sid) || !state) return
    const rows = trimRows(state.rows, maxRowsPerSession)
    rowsBySid.set(sid, rows)
    doc.sessions[sid] = metaForSession(header, Object.assign({}, state, { rows }), eventCount)
    refreshTotals()
  }

  function onSessionEvent(session, event) {
    if (disposed || !event || typeof event.type !== 'string') return
    if (!ready) {
      if (pendingEvents.length < 1000) pendingEvents.push([session, event])
      return
    }
    const sid = session && session.id ? String(session.id) : ''
    if (!sid || !isSafeSessionId(sid)) return
    const relevant = event.type === 'deliverables/presented' || event.type === 'tool/result' || event.type === 'turn/end'
    if (!relevant) return
    let state = null
    if (projectionHandle) {
      if (event.type === 'turn/end') {
        try {
          state = projectionHandle.stateOf(session)
        } catch (error) {
          state = null
        }
      }
    } else {
      const previous = liveStates.get(sid) || createEmptyState(session.header && session.header.cwd)
      state = foldArtifactState(previous, event)
      liveStates.set(sid, state)
      if (event.type !== 'turn/end' && state === previous) return
    }
    if (event.type === 'turn/end') {
      if (!state) {
        try {
          state = projectionHandle ? projectionHandle.stateOf(session) : null
        } catch (error) {
          state = null
        }
      }
      if (!state) {
        const previous = liveStates.get(sid) || createEmptyState(session.header && session.header.cwd)
        state = foldArtifactState(previous, event)
        liveStates.set(sid, state)
      }
      applyLiveState(sid, state, session.header, finiteNumber(event.seq) ? event.seq + 1 : 0)
      markDirty(sid)
    }
  }

  function onSessionDisposed(session) {
    if (disposed) return
    const sid = session && session.id ? String(session.id) : ''
    if (!sid) return
    liveStates.delete(sid)
    markDirty(sid)
  }

  function replayPending() {
    const list = pendingEvents.splice(0, pendingEvents.length)
    for (const entry of list) onSessionEvent(entry[0], entry[1])
  }

  function indexableSnapshot(snapshot) {
    if (!snapshot || !snapshot.header) return false
    const sid = snapshot.header.id
    if (!isSafeSessionId(sid ? String(sid) : '')) return false
    if (snapshot.formatStatus && snapshot.formatStatus !== 'current') return false
    if (finiteNumber(snapshot.sizeBytes) && snapshot.sizeBytes > BACKFILL_MAX_BYTES) return false
    return true
  }

  async function indexOneSession(persistence, snapshot) {
    const sid = String(snapshot.header.id)
    const total = finiteNumber(snapshot.eventCount) ? snapshot.eventCount : undefined
    const previous = doc.sessions[sid]
    if (previous && total !== undefined && previous.n === total) return
    let startOffset = 0
    let baseRows = []
    let baseTurns = 0
    let baseUpdated = snapshot.header.createdAt || 0
    if (previous && finiteNumber(previous.n) && previous.n > 0 && total !== undefined && previous.n <= total) {
      const cachedRows = await loadSessionRows(sid)
      if (cachedRows) {
        startOffset = previous.n
        baseRows = cachedRows
        baseTurns = previous.t || 0
        baseUpdated = previous.u || baseUpdated
      }
    }
    const handle = await persistence.open(sid, 'read')
    try {
      const page = await handle.read(startOffset, Number.MAX_SAFE_INTEGER)
      const events = page && Array.isArray(page.events) ? page.events : []
      const header = (handle && handle.header) || snapshot.header
      let state = createEmptyState(header && header.cwd)
      state = Object.assign({}, state, { rows: baseRows, turns: baseTurns, updatedAt: baseUpdated })
      for (const event of events) state = foldArtifactState(state, event)
      if (finiteNumber(events[events.length - 1] && events[events.length - 1].time)) {
        state = Object.assign({}, state, { updatedAt: Math.max(state.updatedAt, events[events.length - 1].time) })
      }
      const rows = trimRows(state.rows, maxRowsPerSession)
      rowsBySid.set(sid, rows)
      doc.sessions[sid] = metaForSession(header, Object.assign({}, state, { rows }), startOffset + events.length)
      refreshTotals()
      markDirty(sid)
    } finally {
      try { await handle.close() } catch (error) { /* already closed */ }
    }
  }

  async function backfill() {
    if (backfillPromise) return backfillPromise
    if (!started) await start()
    if (disposed) return
    const persistence = getService('sessionPersistence')
    if (!persistence || typeof persistence.list !== 'function') {
      log('warn', 'sessionPersistence is unavailable; cross-session backfill is skipped')
      return
    }
    backfillPromise = (async function () {
      doc.backfill = { running: true, done: 0, total: 0, startedAt: now() }
      let snapshots = []
      try {
        const listed = await persistence.list()
        snapshots = (Array.isArray(listed) ? listed : []).filter(indexableSnapshot)
      } catch (error) {
        log('error', 'could not list persisted sessions for backfill', error)
        doc.backfill = { running: false, done: 0, total: 0, finishedAt: now() }
        return
      }
      snapshots.sort(function (left, right) {
        const a = finiteNumber(left.sizeBytes) ? left.sizeBytes : (finiteNumber(left.eventCount) ? left.eventCount : 0)
        const b = finiteNumber(right.sizeBytes) ? right.sizeBytes : (finiteNumber(right.eventCount) ? right.eventCount : 0)
        return a - b
      })
      doc.backfill.total = snapshots.length
      doc.backfill.done = 0
      await flushNow()
      const queue = snapshots.slice()
      const seen = new Set(snapshots.map(function (snapshot) { return String(snapshot.header.id) }))
      let completed = 0
      let yieldCounter = 0
      async function worker() {
        while (queue.length > 0 && !disposed) {
          const snapshot = queue.shift()
          try {
            await indexOneSession(persistence, snapshot)
          } catch (error) {
            log('warn', 'backfill skipped session ' + String(snapshot.header.id) + ': ' + (error && error.message ? error.message : String(error)))
          }
          completed += 1
          yieldCounter += 1
          doc.backfill.done = completed
          if (yieldCounter >= BACKFILL_YIELD_EVERY) {
            yieldCounter = 0
            await flushNow()
            await yieldToEventLoop()
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(BACKFILL_CONCURRENCY, Math.max(1, snapshots.length)) }, worker))
      // Drop entries whose session no longer exists, but never wipe a corpus
      // because a backend returned an empty listing.
      if (snapshots.length > 0) {
        for (const sid of Object.keys(doc.sessions)) {
          if (seen.has(sid) || liveStates.has(sid)) continue
          delete doc.sessions[sid]
          rowsBySid.delete(sid)
          pendingUnlink.add(sid)
          log('info', 'removed vanished session from index: ' + sid)
        }
      }
      evictOldSessions(maxSessions)
      refreshTotals()
      doc.backfill = { running: false, done: completed, total: snapshots.length, finishedAt: now() }
      await flushNow()
      log('info', 'artifact index backfill finished: ' + completed + '/' + snapshots.length + ' sessions')
    })().finally(function () {
      backfillPromise = null
    })
    return backfillPromise
  }

  async function start() {
    if (started) return
    started = true
    log('info', 'artifact index directory: ' + indexDir)
    // Listen immediately so events committed while index.json is loading are replayed.
    try {
      if (ctx && typeof ctx.on === 'function') {
        ctx.on('session/event', onSessionEvent)
        ctx.on('session/disposed', onSessionDisposed)
      }
    } catch (error) {
      log('warn', 'could not subscribe to session lifecycle events', error)
    }
    writable = await probeWritable()
    if (writable && migrateLegacy) {
      // One-shot copy from the old in-package `.index/`; the legacy directory
      // is intentionally kept as a safety net.
      const migration = await migrateLegacyIndex(LEGACY_INDEX_DIR, indexDir, logger || {
        info: function (message) { log('info', message) },
        warn: function (message, error) { log('warn', message, error) },
      })
      if (migration.migrated) {
        log('info', 'legacy index migrated: ' + String(migration.copied) + ' session file(s)')
      } else if (migration.reason !== 'no-legacy-index' && migration.reason !== 'same-directory') {
        log('info', 'legacy index migration skipped: ' + String(migration.reason))
      }
    }
    await loadIndex()
    if (!writable) {
      doc.mode = 'projection'
      log('warn', 'artifact index runs in memory only; the UI will show the persistence fallback')
    } else {
      doc.mode = 'persistent'
    }
    if (doc.sessions && Object.keys(doc.sessions).length > 0) {
      evictOldSessions(maxSessions)
    }
    await removeOrphanSessionFiles()
    await registerProjection()
    ready = true
    replayPending()
    // Backfill even in memory-only mode: the panel can still serve the freshly
    // folded index through the route while persistence is degraded.
    if (autoBackfill) {
      backfillTimer = setTimeout(function () {
        backfillTimer = null
        if (!disposed) void backfill()
      }, backfillDelayMs)
      if (backfillTimer && typeof backfillTimer.unref === 'function') backfillTimer.unref()
    }
  }

  /**
   * Rebuild the index from scratch: drop the in-memory rows and the persisted
   * session files, then run a full backfill. Also works in memory-only mode,
   * where it simply re-folds every readable session.
   */
  async function rebuild() {
    if (disposed) return { rebuilt: false, sessions: 0 }
    if (!started) await start()
    if (backfillPromise) {
      try { await backfillPromise } catch (error) { /* the fresh rebuild below replaces it */ }
    }
    doc = emptyIndexDocument()
    rowsBySid.clear()
    liveStates.clear()
    dirty.clear()
    pendingUnlink.clear()
    if (writable) {
      try { await removeOrphanSessionFiles() } catch (error) { log('warn', 'could not remove old session index files', error) }
      try { await writeIndexDocument() } catch (error) { log('warn', 'could not write the cleared index', error) }
    }
    await backfill()
    return { rebuilt: true, sessions: doc.totals && finiteNumber(doc.totals.sessions) ? doc.totals.sessions : 0 }
  }

  /** Serialized live index document for the HTTP route; null before start() finishes. */
  function readIndexText() {
    if (!ready) return null
    refreshTotals()
    const totals = doc.totals || { sessions: 0, files: 0 }
    return {
      text: serializedIndex(doc),
      version: String(doc.generatedAt || 0) + '-' + String(totals.sessions || 0) + '-' + String(totals.files || 0),
    }
  }

  /** Serialized rows for one session, or null when the rows are not loaded yet. */
  function readSessionText(sid) {
    if (!ready || !isSafeSessionId(sid)) return null
    const rows = rowsBySid.get(sid)
    if (!rows) return null
    const meta = doc.sessions[sid]
    return {
      text: serializeSession(sid, rows).text,
      version: String(meta && meta.upd ? meta.upd : 0) + '-' + String(rows.length),
    }
  }

  function getIndexDir() {
    return indexDir
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (backfillTimer !== null) {
      clearTimeout(backfillTimer)
      backfillTimer = null
    }
    pendingEvents.length = 0
    if (writable && dirty.size > 0) void flushNow()
  }

  return {
    start,
    backfill,
    rebuild,
    flushNow,
    dispose,
    readIndexText,
    readSessionText,
    getIndexDir,
    /** Test/diagnostics only. */
    inspect() {
      return {
        started,
        ready,
        writable,
        mode: doc.mode,
        indexDir,
        document: doc,
        rowsBySid,
        dirty: Array.from(dirty),
        projection: projectionHandle !== null,
        liveStates,
      }
    },
  }
}
//#endregion

//#region optional prompt guidance
const GUIDANCE_TEXT = '交付有价值产物时，优先用 present 工具显式交付（路径+说明），最终回复写清产物名称和路径；产物会集中显示在「产物」面板。不要把临时文件、日志、缓存当作产物。'

export function promptGuidanceEnabled(config) {
  return config === undefined || config === null || config.promptGuidance !== false
}

/** Attach the prompt section when the host actually provides `systemPrompt`. */
export function installPromptGuidance(ctx) {
  const service = serviceOf(ctx, 'systemPrompt')
  if (!service || typeof service.section !== 'function') return false
  try {
    ctx.effect(() => service.section({
      name: 'artifacts-panel-guidance',
      order: 60,
      text: GUIDANCE_TEXT,
    }), 'artifacts-panel: prompt guidance')
    return true
  } catch (error) {
    return false
  }
}
//#endregion

//#region optional index HTTP route
function routeLog(ctx) {
  return loggerOf(ctx)
}

async function readIndexFileText(filePath) {
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) return null
  if (stat.size > MAX_ROUTE_BYTES) return { tooLarge: true }
  return {
    text: await fs.readFile(filePath, 'utf8'),
    version: String(Math.round(stat.mtimeMs)) + '-' + String(stat.size),
  }
}

function sendRouteJson(res, status, text, version, headOnly) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  if (typeof version === 'string' && version !== '') headers.etag = '"' + version.replace(/"/g, '') + '"'
  res.writeHead(status, headers)
  if (headOnly) res.end()
  else res.end(text)
}

/**
 * Build the raw handler used for the read-only index route. Authentication is
 * delegated to the Connection service's browser fence (the same check DSH's own
 * `/api` route uses); every filesystem path comes from the indexer, never from
 * the request, and session ids are validated before they reach `path.join`.
 */
export function createIndexRouteHandler(ctx, indexer) {
  const log = routeLog(ctx)
  return async function indexRouteHandler(req, res) {
    const connection = serviceOf(ctx, 'connection')
    if (!connection || typeof connection.requestRejection !== 'function') {
      sendRouteJson(res, 503, '{"error":"ARTIFACTS_INDEX_UNAVAILABLE"}', '', false)
      return
    }
    let rejection
    try {
      rejection = connection.requestRejection(req)
    } catch (error) {
      log.warn('index route admission failed', error)
      sendRouteJson(res, 503, '{"error":"ARTIFACTS_INDEX_UNAVAILABLE"}', '', false)
      return
    }
    if (rejection !== undefined) {
      res.writeHead(rejection)
      res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }

    const url = new URL(req.url || '/', 'http://artifacts-panel.invalid')
    const pathname = url.pathname
    const headOnly = req.method === 'HEAD'

    if (req.method === 'POST' && pathname === INDEX_ROUTE_REBUILD) {
      void indexer.rebuild().then(function (result) {
        log.info('artifact index rebuild finished: ' + String(result && result.sessions) + ' sessions')
      }).catch(function (error) {
        log.error('artifact index rebuild failed', error)
      })
      sendRouteJson(res, 202, '{"ok":true,"rebuilding":true}', '', false)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD, POST' })
      res.end()
      return
    }

    try {
      if (pathname === INDEX_ROUTE_INDEX) {
        const live = indexer.readIndexText()
        if (!live) {
          sendRouteJson(res, 404, '{"error":"ARTIFACTS_INDEX_MISSING"}', '', headOnly)
          return
        }
        sendRouteJson(res, 200, live.text, live.version, headOnly)
        return
      }
      if (pathname.startsWith(INDEX_ROUTE_SESSIONS) && pathname.endsWith('.json')) {
        let sid = pathname.slice(INDEX_ROUTE_SESSIONS.length, -'.json'.length)
        try { sid = decodeURIComponent(sid) } catch (error) { sid = '' }
        if (!isSafeSessionId(sid)) {
          sendRouteJson(res, 404, '{"error":"ARTIFACTS_INDEX_MISSING"}', '', headOnly)
          return
        }
        let result = indexer.readSessionText(sid)
        if (!result) {
          const filePath = path.join(indexer.getIndexDir(), 'sessions', sid + '.json')
          result = await readIndexFileText(filePath).catch(function (error) {
            if (error && error.code === 'ENOENT') return null
            throw error
          })
        }
        if (!result) {
          sendRouteJson(res, 404, '{"error":"ARTIFACTS_INDEX_MISSING"}', '', headOnly)
          return
        }
        if (result.tooLarge) {
          sendRouteJson(res, 413, '{"error":"ARTIFACTS_INDEX_TOO_LARGE"}', '', headOnly)
          return
        }
        sendRouteJson(res, 200, result.text, result.version, headOnly)
        return
      }
      sendRouteJson(res, 404, '{"error":"ARTIFACTS_INDEX_MISSING"}', '', headOnly)
    } catch (error) {
      if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
        sendRouteJson(res, 403, '{"error":"ARTIFACTS_INDEX_DENIED"}', '', headOnly)
      } else {
        log.warn('index route read failed', error)
        sendRouteJson(res, 500, '{"error":"ARTIFACTS_INDEX_ERROR"}', '', headOnly)
      }
    }
  }
}

/**
 * Register the same-origin GET routes used by the client. Requires the browser
 * HTTP carrier plus its Connection admission fence; without either one the
 * client falls back to the manual `indexDir` override and shows the normal
 * degraded state instead of exposing an unauthenticated file route.
 */
export function registerIndexRoutes(ctx, indexer) {
  const webServer = serviceOf(ctx, 'webServer')
  const connection = serviceOf(ctx, 'connection')
  if (!webServer || typeof webServer.register !== 'function') return false
  if (!connection || typeof connection.requestRejection !== 'function') return false
  const route = {
    kind: 'prefix',
    path: INDEX_ROUTE_PREFIX,
    handler: createIndexRouteHandler(ctx, indexer),
  }
  try {
    ctx.effect(() => webServer.register(route), 'artifacts-panel: index HTTP route')
    return true
  } catch (error) {
    loggerOf(ctx).warn('could not register the index HTTP route', error)
    return false
  }
}
//#endregion

export function apply(ctx, config) {
  if (promptGuidanceEnabled(config)) {
    // `systemPrompt` is optional: a host without it keeps the plugin loaded and
    // only loses the extra guidance section.
    if (typeof ctx.inject === 'function') {
      try {
        ctx.inject(['systemPrompt'], function (promptCtx) {
          installPromptGuidance(promptCtx)
        })
      } catch (error) {
        installPromptGuidance(ctx)
      }
    } else {
      installPromptGuidance(ctx)
    }
  }
  const indexEnabled = config === undefined || config === null || config.crossSessionIndex !== false
  if (!indexEnabled) return
  let indexer = null
  try {
    indexer = createArtifactIndexer(ctx)
    ctx.effect(() => () => {
      if (indexer) indexer.dispose()
    }, 'artifacts-panel: cross-session index lifetime')
    if (typeof ctx.inject === 'function') {
      try {
        ctx.inject(['webServer', 'connection'], function (routeCtx) {
          registerIndexRoutes(routeCtx, indexer)
        })
      } catch (error) {
        registerIndexRoutes(ctx, indexer)
      }
    } else {
      registerIndexRoutes(ctx, indexer)
    }
    void indexer.start().catch(function (error) {
      if (ctx.logger && typeof ctx.logger.error === 'function') {
        ctx.logger.error('[artifacts-index] cross-session index failed to start', error)
      }
    })
  } catch (error) {
    if (ctx.logger && typeof ctx.logger.error === 'function') {
      ctx.logger.error('[artifacts-index] could not start the cross-session index', error)
    }
  }
}

#!/usr/bin/env node
/**
 * Offline unit tests for the v2b cross-session artifact index host half.
 *
 * Covers:
 * 1. fold: presented files, successful write/edit tool results, error results,
 *    excluded paths, turn counting;
 * 2. backfill: size-ordered listing, resume from the stored event count,
 *    out-of-range snapshots skipped, per-session failure isolation;
 * 3. capacity: oldest-session eviction, per-session row trimming, file cleanup;
 * 4. validators: reject broken index/session documents, accept good ones;
 * 5. atomic writes and on-disk shape (index.json + sessions/<sid>.json).
 *
 * Everything is written to an OS temp directory and removed before exit.
 *
 * Usage: node tools/test-v2b.mjs
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  apply,
  createArtifactIndexer,
  createEmptyState,
  createIndexRouteHandler,
  foldArtifactState,
  inject,
  migrateLegacyIndex,
  registerIndexRoutes,
  resolveDefaultIndexDir,
  validateIndexDocument,
  validateSessionDocument,
} from '../index.js'

let passed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log('PASS ' + name)
  } catch (error) {
    failures.push({ name, error })
    console.log('FAIL ' + name + ': ' + (error && error.message ? error.message : String(error)))
  }
}

function event(type, seq, time, data) {
  return { type, seq, time, data }
}

function presented(seq, time, turn, paths) {
  return event('deliverables/presented', seq, time, { turn, files: paths.map(function (p) { return { path: p } }) })
}

function writeCall(seq, time, turn, callId, filePath) {
  return event('tool/call', seq, time, { turn, step: 0, callId, name: 'write', arguments: JSON.stringify({ file_path: filePath }) })
}

function writeResult(seq, time, turn, callId, meta) {
  return event('tool/result', seq, time, { turn, step: 0, message: { role: 'tool', source: { kind: 'tool', callId } }, meta })
}

function failedResult(seq, time, turn, callId) {
  return event('tool/result', seq, time, { turn, step: 0, message: { role: 'tool', source: { kind: 'tool', callId }, isError: true } })
}

function end(seq, time, turn) {
  return event('turn/end', seq, time, { turn, reason: { kind: 'completed' } })
}

function sessionHeader(id, cwd, createdAt, parentSession) {
  return { version: 1, id, createdAt, cwd, isSeeded: false, ...(parentSession ? { parentSession } : {}) }
}

function mockLogger() {
  const lines = []
  const push = function (level) { return function (message) { lines.push(level + ' ' + message) } }
  return { lines, info: push('info'), warn: push('warn'), error: push('error') }
}

function mockContext(services, logger) {
  const listeners = {}
  return {
    logger,
    listeners,
    get(name) { return services[name] },
    on(name, fn) { listeners[name] = fn; return function () {} },
    effect(fn) { return fn() },
  }
}

function mockPersistence(sessions, options = {}) {
  const state = { opens: [], reads: [], failOpen: new Set(options.failOpen || []) }
  const byId = new Map(sessions.map(function (session) { return [session.header.id, session] }))
  return {
    state,
    async list() {
      return sessions.map(function (session) {
        return {
          header: session.header,
          eventCount: session.events.length,
          sizeBytes: session.sizeBytes,
          formatStatus: session.formatStatus || 'current',
        }
      })
    },
    async open(id, access) {
      state.opens.push({ id, access })
      if (state.failOpen.has(id)) throw new Error('simulated unreadable log: ' + id)
      const session = byId.get(id)
      if (!session) throw new Error('not found: ' + id)
      return {
        header: session.header,
        async read(offset = 0, length = Number.MAX_SAFE_INTEGER) {
          state.reads.push({ id, offset, length })
          return { eventState: 'detached', events: session.events.slice(offset, offset + length) }
        },
        async close() {},
      }
    },
  }
}

async function tempDir(label) {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dsh-artifacts-v2b-' + label + '-'))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

// ---------------------------------------------------------------------------
// 1. fold
// ---------------------------------------------------------------------------
await test('fold adds presented/tool rows and ignores errors, exclusions and noise', async function () {
  let state = createEmptyState('/workspace/project')
  state = foldArtifactState(state, presented(0, 1000, 1, ['/workspace/project/report.md', '/tmp/ignored.md']))
  assert.equal(state.rows.length, 1, 'only the real presented file is indexed')
  assert.equal(state.rows[0].path, '/workspace/project/report.md')
  assert.equal(state.rows[0].source, 'presented')
  assert.equal(state.rows[0].kind, 'doc')

  state = foldArtifactState(state, writeCall(1, 1100, 1, 'call-1', 'src/out.json'))
  state = foldArtifactState(state, writeResult(2, 1200, 1, 'call-1', { path: '/workspace/project/src/out.json' }))
  assert.equal(state.rows.length, 2)
  const produced = state.rows.find(function (row) { return row.path.endsWith('/src/out.json') })
  assert.equal(produced.source, 'produced')
  assert.equal(produced.kind, 'doc')

  state = foldArtifactState(state, writeCall(3, 1300, 1, 'call-2', 'src/failed.json'))
  state = foldArtifactState(state, failedResult(4, 1400, 1, 'call-2'))
  assert.equal(state.rows.length, 2, 'failed tool results never become artifacts')

  state = foldArtifactState(state, event('tool/call', 5, 1500, { turn: 1, step: 0, callId: 'call-3', name: 'str_replace_editor', arguments: JSON.stringify({ command: 'view', path: 'src/read-only.md' }) }))
  state = foldArtifactState(state, writeResult(6, 1600, 1, 'call-3', { path: '/workspace/project/src/read-only.md' }))
  assert.equal(state.rows.length, 2, 'str_replace_editor view is not a write')

  state = foldArtifactState(state, end(7, 1700, 1))
  assert.equal(state.turns, 1)
  assert.equal(state.updatedAt, 1700)
  const same = foldArtifactState(state, event('step/start', 8, 1800, { turn: 1, step: 1 }))
  assert.equal(same, state, 'irrelevant events keep the same state reference')
})

// ---------------------------------------------------------------------------
// 2. backfill + resume
// ---------------------------------------------------------------------------
await test('backfill indexes sessions in size order and resumes from the stored event count', async function () {
  const dir = await tempDir('resume')
  const logger = mockLogger()
  const sessionA = {
    header: sessionHeader('session-a', '/workspace/a', 1000),
    sizeBytes: 100,
    events: [
      presented(0, 1100, 1, ['/workspace/a/a-report.md']),
      end(1, 1200, 1),
    ],
  }
  const sessionB = {
    header: sessionHeader('session-b', '/workspace/b', 2000, 'session-a'),
    sizeBytes: 200,
    events: [
      writeCall(0, 2100, 1, 'b-call', 'b-out.csv'),
      writeResult(1, 2200, 1, 'b-call', { path: '/workspace/b/b-out.csv' }),
      end(2, 2300, 1),
    ],
  }
  const persistence = mockPersistence([sessionB, sessionA])
  const services = { sessionPersistence: persistence }
  const indexer = createArtifactIndexer(mockContext(services, logger), { indexDir: dir, autoBackfill: false, migrateLegacy: false })
  await indexer.start()
  await indexer.backfill()

  const doc = indexer.inspect().document
  assert.deepEqual(persistence.state.reads.map(function (read) { return read.id }), ['session-a', 'session-b'], 'listing is ordered by sizeBytes')
  assert.equal(doc.sessions['session-a'].n, 2)
  assert.equal(doc.sessions['session-b'].n, 3)
  assert.equal(doc.sessions['session-b'].p, 'session-a')
  assert.equal(doc.totals.sessions, 2)
  assert.equal(doc.totals.files, 2)
  const disk = await readJson(path.join(dir, 'index.json'))
  validateIndexDocument(disk)
  const aRows = await readJson(path.join(dir, 'sessions', 'session-a.json'))
  validateSessionDocument(aRows, 'session-a')
  assert.equal(aRows.rows.length, 1)
  assert.deepEqual(aRows.rows[0], ['/workspace/a/a-report.md', 1, 'presented', 'doc'])

  // Two new events for A; B unchanged and must not be opened again.
  sessionA.events.push(presented(2, 1300, 2, ['/workspace/a/a-final.png']))
  sessionA.events.push(end(3, 1400, 2))
  sessionA.sizeBytes = 120
  persistence.state.reads.length = 0
  persistence.state.opens.length = 0

  const resumed = createArtifactIndexer(mockContext(services, logger), { indexDir: dir, autoBackfill: false, migrateLegacy: false })
  await resumed.start()
  await resumed.backfill()
  assert.deepEqual(persistence.state.opens.map(function (open) { return open.id }), ['session-a'], 'unchanged sessions are skipped')
  assert.equal(persistence.state.reads[0].offset, 2, 'resume reads only the tail events')
  const resumedDoc = resumed.inspect().document
  assert.equal(resumedDoc.sessions['session-a'].n, 4)
  assert.equal(resumedDoc.sessions['session-a'].c, 2)
  const resumedRows = await readJson(path.join(dir, 'sessions', 'session-a.json'))
  assert.equal(resumedRows.rows.length, 2)
  await fs.rm(dir, { recursive: true, force: true })
})

await test('backfill skips out-of-range snapshots and isolates per-session read failures', async function () {
  const dir = await tempDir('isolate')
  const logger = mockLogger()
  const good = { header: sessionHeader('good-session', '/workspace/good', 1000), sizeBytes: 100, events: [presented(0, 1100, 1, ['/workspace/good/ok.md']), end(1, 1200, 1)] }
  const migration = { header: sessionHeader('legacy-session', '/workspace/legacy', 1000), sizeBytes: 50, formatStatus: 'migration-required', events: [] }
  const broken = { header: sessionHeader('broken-session', '/workspace/broken', 1000), sizeBytes: 60, events: [presented(0, 1100, 1, ['/workspace/broken/nope.md'])] }
  const persistence = mockPersistence([broken, migration, good], { failOpen: ['broken-session'] })
  const indexer = createArtifactIndexer(mockContext({ sessionPersistence: persistence }, logger), { indexDir: dir, autoBackfill: false, migrateLegacy: false })
  await indexer.start()
  await indexer.backfill()
  const doc = indexer.inspect().document
  assert.equal(doc.sessions['good-session'].c, 1)
  assert.equal(doc.sessions['legacy-session'], undefined, 'migration-required session is skipped')
  assert.equal(doc.sessions['broken-session'], undefined, 'unreadable session is isolated')
  assert.ok(logger.lines.some(function (line) { return line.indexOf('skipped session broken-session') !== -1 }))
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 3. live projection / fallback
// ---------------------------------------------------------------------------
await test('live turn/end uses the projection state and falls back without sessionProjections', async function () {
  async function runLive(withProjection) {
    const dir = await tempDir(withProjection ? 'projection' : 'fallback')
    const logger = mockLogger()
    let definition = null
    const states = new Map()
    const services = {}
    if (withProjection) {
      services.sessionProjections = {
        register(value) {
          definition = value
          return Promise.resolve({
            stateOf(session) { return states.get(String(session.id)) },
            dispose() { return Promise.resolve() },
          })
        },
      }
    }
    const context = mockContext(services, logger)
    const indexer = createArtifactIndexer(context, { indexDir: dir, autoBackfill: false, migrateLegacy: false })
    await indexer.start()
    await Promise.resolve()
    const session = { id: 'live-session', header: sessionHeader('live-session', '/workspace/live', 5000) }
    function emit(value) {
      if (definition) {
        const previous = states.get('live-session') || definition.init(session.header, 0)
        states.set('live-session', definition.apply(previous, value))
      }
      context.listeners['session/event'](session, value)
    }
    emit(presented(0, 5100, 1, ['/workspace/live/live-report.md']))
    emit(end(1, 5200, 1))
    await indexer.flushNow()
    const doc = indexer.inspect().document
    assert.equal(indexer.inspect().projection, withProjection)
    assert.equal(doc.sessions['live-session'].c, 1, 'live turn/end persisted one row')
    assert.equal(doc.sessions['live-session'].n, 2)
    const disk = await readJson(path.join(dir, 'sessions', 'live-session.json'))
    validateSessionDocument(disk, 'live-session')
    assert.equal(disk.rows[0][0], '/workspace/live/live-report.md')
    await fs.rm(dir, { recursive: true, force: true })
  }
  await runLive(true)
  await runLive(false)
})

// ---------------------------------------------------------------------------
// 4. capacity
// ---------------------------------------------------------------------------
await test('capacity trims oldest sessions and per-session rows, deleting evicted files', async function () {
  const dir = await tempDir('capacity')
  const logger = mockLogger()
  const sessions = []
  for (let index = 1; index <= 3; index += 1) {
    const id = 'capacity-session-' + index
    sessions.push({
      header: sessionHeader(id, '/workspace/cap', index * 1000),
      sizeBytes: 100 + index,
      events: [
        presented(0, index * 1000 + 1, 1, ['/workspace/cap/file-' + index + '-a.md']),
        end(1, index * 1000 + 2, 1),
        presented(2, index * 1000 + 3, 2, ['/workspace/cap/file-' + index + '-b.md']),
        end(3, index * 1000 + 4, 2),
        presented(4, index * 1000 + 5, 3, ['/workspace/cap/file-' + index + '-c.md']),
        end(5, index * 1000 + 6, 3),
      ],
    })
  }
  const persistence = mockPersistence(sessions)
  const indexer = createArtifactIndexer(mockContext({ sessionPersistence: persistence }, logger), {
    indexDir: dir,
    autoBackfill: false,
    maxSessions: 2,
    maxRowsPerSession: 2,
  })
  await indexer.start()
  await indexer.backfill()
  const doc = indexer.inspect().document
  assert.deepEqual(Object.keys(doc.sessions).sort(), ['capacity-session-2', 'capacity-session-3'], 'oldest session is evicted')
  assert.equal(doc.totals.sessions, 2)
  for (const sid of Object.keys(doc.sessions)) {
    assert.equal(doc.sessions[sid].c, 2, 'rows are trimmed to maxRowsPerSession')
  }
  const evictedPath = path.join(dir, 'sessions', 'capacity-session-1.json')
  await assert.rejects(fs.access(evictedPath), 'evicted session file is removed')
  const disk = await readJson(path.join(dir, 'index.json'))
  validateIndexDocument(disk)
  assert.deepEqual(Object.keys(disk.sessions).sort(), ['capacity-session-2', 'capacity-session-3'])
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 4. validators
// ---------------------------------------------------------------------------
await test('validators accept good documents and reject broken ones', async function () {
  const now = Date.now()
  const goodIndex = {
    v: 1,
    mode: 'persistent',
    generatedAt: now,
    totals: { sessions: 1, files: 1, turns: 1 },
    backfill: { running: false, done: 1, total: 1 },
    sessions: { abc: { t: 1, u: now, c: 1, n: 2, a: now, upd: now, w: '/workspace', p: '' } },
  }
  assert.doesNotThrow(function () { validateIndexDocument(goodIndex) })
  assert.throws(function () { validateIndexDocument(Object.assign({}, goodIndex, { v: 2 })) }, /v must be 1/)
  assert.throws(function () { validateIndexDocument(Object.assign({}, goodIndex, { sessions: { '../escape': goodIndex.sessions.abc } })) }, /invalid session id/)
  assert.throws(function () { validateIndexDocument(Object.assign({}, goodIndex, { totals: { sessions: -1, files: 0, turns: 0 } })) }, /totals.sessions/)
  assert.throws(function () { validateIndexDocument(Object.assign({}, goodIndex, { mode: 'memory' })) }, /mode is invalid/)

  const goodSession = { v: 1, sid: 'abc', rows: [['/workspace/report.md', 1, 'presented', 'doc', 120, 'a'.repeat(64)]] }
  assert.doesNotThrow(function () { validateSessionDocument(goodSession, 'abc') })
  assert.throws(function () { validateSessionDocument(goodSession, 'other') }, /sid does not match/)
  assert.throws(function () { validateSessionDocument({ v: 1, sid: 'abc', rows: [['relative.md', 1, 'presented', 'doc']] }, 'abc') }, /path is invalid/)
  assert.throws(function () { validateSessionDocument({ v: 1, sid: 'abc', rows: [['/workspace/x.md', 1, 'imported', 'doc']] }, 'abc') }, /source is invalid/)
  assert.throws(function () { validateSessionDocument({ v: 1, sid: 'abc', rows: [['/workspace/x.md', 1, 'presented', 'doc', -5]] }, 'abc') }, /size is invalid/)
  assert.throws(function () { validateSessionDocument({ v: 1, sid: 'abc', rows: [['/workspace/x.md', 1, 'presented', 'doc', 10, 'nope']] }, 'abc') }, /sha is invalid/)
  await Promise.resolve()
})

// ---------------------------------------------------------------------------
// 5. profile data directory + optional Host services
// ---------------------------------------------------------------------------
await test('default index directory follows DSH_HOME and falls back to the OS temp directory', async function () {
  assert.equal(resolveDefaultIndexDir({ DSH_HOME: '/tmp/dsh-home' }), path.join('/tmp/dsh-home', 'artifacts-panel', 'index'))
  assert.equal(resolveDefaultIndexDir({}), path.join(os.tmpdir(), 'dsh-artifacts-panel', 'index'))
  assert.equal(resolveDefaultIndexDir({ DSH_HOME: 'relative/home' }), path.join(os.tmpdir(), 'dsh-artifacts-panel', 'index'))
  assert.equal(resolveDefaultIndexDir({ DSH_HOME: '' }), path.join(os.tmpdir(), 'dsh-artifacts-panel', 'index'))
  await Promise.resolve()
})

await test('host inject is optional: a host without systemPrompt still loads the plugin', async function () {
  assert.deepEqual(inject, [])
  const logger = mockLogger()
  const bare = {
    logger,
    get() { return undefined },
    effect(fn) { return fn() },
    on() { return function () {} },
  }
  assert.doesNotThrow(function () { apply(bare, { crossSessionIndex: false }) })

  const sections = []
  const withPrompt = mockContext({
    systemPrompt: { section(definition) { sections.push(definition); return function () {} } },
  }, logger)
  apply(withPrompt, { crossSessionIndex: false })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'artifacts-panel-guidance')
  assert.ok(sections[0].text.indexOf('present') !== -1)
  apply(withPrompt, { crossSessionIndex: false, promptGuidance: false })
  assert.equal(sections.length, 1, 'promptGuidance:false skips the section')

  // Real Host contexts expose services lazily through ctx.inject; the apply
  // path must use it without requiring a hard dependency.
  const injectedSections = []
  const injectedCtx = {
    logger,
    get() { return undefined },
    effect(fn) { return fn() },
    on() { return function () {} },
    inject(deps, callback) {
      assert.ok(deps.indexOf('systemPrompt') !== -1)
      callback({ get(name) { return name === 'systemPrompt' ? { section(definition) { injectedSections.push(definition); return function () {} } } : undefined }, effect(fn) { return fn() } })
    },
  }
  assert.doesNotThrow(function () { apply(injectedCtx, { crossSessionIndex: false }) })
  assert.equal(injectedSections.length, 1, 'ctx.inject path attaches the optional prompt section')
})

await test('legacy .index is copied once into the new data directory and kept', async function () {
  const legacy = await tempDir('legacy')
  const target = path.join(await tempDir('target'), 'nested')
  await fs.mkdir(path.join(legacy, 'sessions'), { recursive: true })
  await fs.writeFile(path.join(legacy, 'index.json'), JSON.stringify({ v: 1, sessions: { abc: {} } }))
  await fs.writeFile(path.join(legacy, 'sessions', 'abc.json'), JSON.stringify({ v: 1, sid: 'abc', rows: [] }))
  await fs.writeFile(path.join(legacy, 'sessions', '../escape.json'), 'ignored')
  const result = await migrateLegacyIndex(legacy, target, mockLogger())
  assert.equal(result.migrated, true)
  assert.equal(result.copied, 1, 'only safe session file names are copied')
  assert.ok(await fs.stat(path.join(legacy, 'index.json')), 'legacy index.json is kept')
  assert.ok(await fs.stat(path.join(legacy, 'sessions', 'abc.json')), 'legacy session file is kept')
  assert.ok(await fs.stat(path.join(target, 'index.json')))
  assert.ok(await fs.stat(path.join(target, 'sessions', 'abc.json')))
  const again = await migrateLegacyIndex(legacy, target, mockLogger())
  assert.equal(again.migrated, false)
  assert.equal(again.reason, 'target-already-exists')
  const none = await migrateLegacyIndex(path.join(legacy, 'missing'), target, mockLogger())
  assert.equal(none.reason, 'no-legacy-index')
  await fs.rm(legacy, { recursive: true, force: true })
  await fs.rm(path.dirname(target), { recursive: true, force: true })
})

await test('memory-only mode still backfills and serves the live index', async function () {
  const root = await tempDir('readonly')
  const dir = path.join(root, 'locked')
  await fs.mkdir(dir)
  await fs.chmod(dir, 0o500)
  const logger = mockLogger()
  const session = {
    header: sessionHeader('memory-session', '/workspace/m', 1000),
    sizeBytes: 80,
    events: [presented(0, 1100, 1, ['/workspace/m/memory.md']), end(1, 1200, 1)],
  }
  const persistence = mockPersistence([session])
  let indexer
  try {
    indexer = createArtifactIndexer(mockContext({ sessionPersistence: persistence }, logger), { indexDir: dir, autoBackfill: false, migrateLegacy: false })
    await indexer.start()
    assert.equal(indexer.inspect().writable, false, 'the read-only directory degrades to memory mode')
    await indexer.backfill()
    const live = indexer.readIndexText()
    assert.ok(live && live.text.indexOf('memory-session') !== -1, 'memory backfill feeds the route document')
    const rows = indexer.readSessionText('memory-session')
    assert.ok(rows && rows.text.indexOf('memory.md') !== -1, 'memory rows are readable')
  } finally {
    await fs.chmod(dir, 0o700)
    await fs.rm(root, { recursive: true, force: true })
  }
})

await test('index HTTP route serves the index and session documents with typed 404s', async function () {
  const dir = await tempDir('route')
  const logger = mockLogger()
  const indexer = createArtifactIndexer(mockContext({}, logger), { indexDir: dir, autoBackfill: false, migrateLegacy: false })
  await indexer.start()
  const registrations = []
  const ctx = mockContext({
    webServer: { register(route) { registrations.push(route); return function () {} } },
    connection: { requestRejection() { return undefined } },
  }, logger)
  assert.equal(registerIndexRoutes(ctx, indexer), true)
  assert.equal(registrations.length, 1)
  const route = registrations[0]
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/artifacts-panel')

  async function call(handler, method, url) {
    const req = { method, url, headers: {} }
    const res = {
      status: 0,
      headers: null,
      body: '',
      writeHead(status, headers) { this.status = status; this.headers = headers },
      end(body) { this.body = body === undefined ? '' : String(body) },
    }
    await handler(req, res)
    return res
  }

  const indexRes = await call(route.handler, 'GET', '/artifacts-panel/index.json')
  assert.equal(indexRes.status, 200)
  assert.ok(indexRes.headers['content-type'].indexOf('application/json') !== -1)
  assert.equal(indexRes.headers['cache-control'], 'no-store')
  assert.ok(indexRes.headers.etag, 'route responses carry an ETag')
  const doc = JSON.parse(indexRes.body)
  assert.equal(doc.v, 1)

  const missing = await call(route.handler, 'GET', '/artifacts-panel/sessions/does-not-exist.json')
  assert.equal(missing.status, 404)
  assert.ok(missing.body.indexOf('ARTIFACTS_INDEX_MISSING') !== -1)

  const unsafe = await call(route.handler, 'GET', '/artifacts-panel/sessions/..%2Fescape.json')
  assert.equal(unsafe.status, 404, 'path traversal never reaches path.join')

  const method = await call(route.handler, 'DELETE', '/artifacts-panel/index.json')
  assert.equal(method.status, 405)

  const rebuild = await call(route.handler, 'POST', '/artifacts-panel/rebuild')
  assert.equal(rebuild.status, 202)
  await new Promise(function (resolve) { setTimeout(resolve, 300) })

  const deniedCtx = mockContext({
    webServer: { register() { return function () {} } },
    connection: { requestRejection() { return 401 } },
  }, logger)
  const deniedHandler = createIndexRouteHandler(deniedCtx, indexer)
  const denied = await call(deniedHandler, 'GET', '/artifacts-panel/index.json')
  assert.equal(denied.status, 401)

  const noRouteCtx = mockContext({}, logger)
  assert.equal(registerIndexRoutes(noRouteCtx, indexer), false, 'route registration needs webServer + connection')
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
console.log('')
console.log('v2b host tests: ' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure.name)
    console.error(failure.error && failure.error.stack ? failure.error.stack : failure.error)
  }
  process.exitCode = 1
}

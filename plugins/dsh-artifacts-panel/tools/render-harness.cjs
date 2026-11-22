#!/usr/bin/env node
/*
 * Static verification harness for client.js (no browser required).
 *
 * It loads the real module loader entry with a tiny React stand-in, calls the
 * plugin's apply() against a mock Cordis context, asserts the slot
 * registrations, renders:
 *   - conversation.view  -> default filtering (noise turns hidden), default
 *     font 15px, default 20-turn pagination, reply/doc/image/file cards
 *   - settings.section   -> every setting row and its default
 *   - sidebar.right.pane.tab -> compact mode, same filtering, menu actions
 *
 * v6 adds the color-theme checks (settings defaults/migration, three mode
 * buttons, six accent swatches, per-root --ap-* overrides, dark lightbox).
 *
 * v8 adds the cross-session index service fallback (inject list, typed
 * rejection when remote.workspaceFiles throws, three failure-class renders).
 * v9 adds the UI P0 checks (toolbar zones, card ARIA, path ellipsis/copy,
 * contrast floor, reduced motion, empty states, one-time onboarding).
 *
 * v3 adds the pure data layer tests: __testing.foldSession/buildGroups/
 * resolveDimension run against three fixtures (turns only, team tasks, workflow
 * run) plus two live render checks for auto dimension selection, task
 * attribution, owner/writeScope chips, the unassigned bucket, subagent badges,
 * drill-down labels and lazy child loading (no fetch before a click).
 *
 * The hook stand-in intentionally does not run effects: this checks the first
 * committed render and the registration contract, not live data loading.
 *
 * Usage: node tools/render-harness.cjs
 */
const fs = require('fs')
const path = require('path')

const panelDir = path.resolve(__dirname, '..')
const clientPath = path.join(panelDir, 'client.js')

// client.js is written for the browser module loader and the package is ESM,
// so load it through a CJS copy to keep Node's module rules out of the way.
const loadingPath = path.join(require('os').tmpdir(), 'dsh-artifacts-panel-harness.cjs')
fs.writeFileSync(loadingPath, fs.readFileSync(clientPath, 'utf8'))

let definition = null
// useState returns this object instead of the component default when set, so
// the same component can be rendered against the v3 fixtures.
const state = { mockData: null }
global.window = {
  __ModuleLoader__: { load(def) { definition = def } },
  localStorage: (function () {
    const store = new Map()
    return {
      getItem(key) { return store.has(key) ? store.get(key) : null },
      setItem(key, value) { store.set(key, String(value)) },
      removeItem(key) { store.delete(key) },
    }
  })(),
  setInterval() { return 1 },
  clearInterval() {},
  setTimeout() { return 1 },
}
global.navigator = { language: 'zh-CN', clipboard: { writeText() { return Promise.resolve() } } }
global.document = {
  baseURI: 'http://127.0.0.1:51732/',
  visibilityState: 'visible',
  createElement() { return { click() {} } },
}

// ---------------------------------------------------------------------------
// Legacy turn fixture: default artifact turns 1..25, one artifact each.
// ---------------------------------------------------------------------------
const turns = []
for (let n = 1; n <= 25; n += 1) {
  const kind = n % 3 === 0 ? 'file' : (n % 3 === 1 ? 'doc' : 'image')
  const ext = kind === 'doc' ? 'md' : (kind === 'image' ? 'png' : 'xlsx')
  turns.push({
    turn: n,
    startTime: 1762880000000 + n * 60000,
    endTime: 1762880000000 + n * 60000 + 30000,
    reason: 'normal',
    reply: '第 ' + n + ' 轮完成，产出 report-' + n + '。',
    files: [{ path: '/workspace/out/report-' + n + '.' + ext, name: 'report-' + n + '.' + ext, kind: kind, source: 'produced', description: '', time: 1762880000000 + n * 60000 }],
  })
}
// Noise turns from the boss's screenshot: short bus-check replies, no artifacts.
for (let n = 185; n <= 192; n += 1) {
  turns.push({ turn: n, startTime: 1762900000000 + n * 1000, endTime: 1762900000000 + n * 1000, reason: 'normal', reply: '总线无新消息，已处理到 #6401', files: [] })
}
// Short reply without artifacts: hidden by the short-reply rule.
turns.push({ turn: 30, startTime: 1762910000000, endTime: 1762910000000, reason: 'normal', reply: '收到。', files: [] })
// Short reply WITH an artifact: must never be hidden as noise.
turns.push({ turn: 31, startTime: 1762920000000, endTime: 1762920000000, reason: 'normal', reply: '好', files: [
  { path: '/workspace/out/final-report.md', name: 'final-report.md', kind: 'doc', source: 'presented', description: '最终报告', time: 1762920000000 },
] })

const noop = function () {}
const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter(c => c !== undefined && c !== null && c !== false) }
  },
  useState(initial) {
    if (typeof initial === 'function') initial = initial()
    if (initial && typeof initial === 'object' && typeof initial.status === 'string') {
      if (state.mockData) return [state.mockData, noop]
      return [{
        status: 'ready',
        turns: turns,
        team: { tasks: [], members: [] },
        runs: [],
        children: [],
        sessions: {},
        error: null,
        updatedAt: 1762930000000,
      }, noop]
    }
    return [initial, noop]
  },
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
  useRef(value) { return { current: value } },
  useEffect() {},
}

require(loadingPath)
if (!definition) throw new Error('client module did not call window.__ModuleLoader__.load')
if (definition.id !== '@local/dsh-artifacts-panel') throw new Error('wrong module id: ' + definition.id)
const plugin = definition.factory(name => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
if (!plugin || typeof plugin.apply !== 'function' || !Array.isArray(plugin.inject)) throw new Error('factory contract mismatch')
if (!plugin.__testing || typeof plugin.__testing.foldSession !== 'function' || typeof plugin.__testing.buildGroups !== 'function' || typeof plugin.__testing.resolveDimension !== 'function') {
  throw new Error('__testing helpers missing')
}

const registrations = {}
const openTabCalls = []
const openTabOptions = []
const sidebarCalls = []
let sidebarExpanded = false
let activeSidebarTab
let tabType = null
let localeEntry = null
const services = {
  'uiWorkspace': {
    selection: {
      getSnapshot() { return { sessionId: 'session-test' } },
      subscribe() { return () => {} },
    },
  },
  'sidebarRightTabs': {
    get(kind) { return kind === 'changes-review' ? { id: 'ui-deliverables', kind: 'changes-review' } : undefined },
  },
}
const ctx = {
  effect(fn) { return { dispose: fn() } },
  get(name) { return services[name] },
  locale: {
    register(ns, dicts) { localeEntry = { ns, dicts }; return () => {} },
    bind() {
      return (key, params) => {
        let text = (localeEntry.dicts.zh && localeEntry.dicts.zh[key]) || key
        if (params) text = text.replace(/\{(\w+)\}/g, (m, k) => params[k] !== undefined ? String(params[k]) : m)
        return text
      }
    },
  },
  sessions: { list: { getSnapshot() { return { byId: {} } } } },
  slots: {
    inject(_owner, callback) { callback() },
    register(options, component) { registrations[options.name] = { options, component }; return () => {} },
  },
  // Simulates the real Cordis failure mode: accessing the un-injected
  // `remote.workspaceFiles` service throws at property-read time.
  remote: new Proxy({
    session: {
      events() { return Promise.resolve({ records: [], hasMore: false, cursor: 0 }) },
      canOpenWorkspacePath() { return Promise.resolve({ ok: true, value: true }) },
      openWorkspacePath() { return Promise.resolve({ ok: true, value: { opened: true } }) },
    },
  }, {
    get(target, prop) {
      if (prop === 'workspaceFiles') throw new Error('cannot get property "remote.workspaceFiles" without inject')
      return target[prop]
    },
  }),
  sidebarRight: {
    openResource() {},
    openTab(kind, options) { openTabCalls.push(kind); openTabOptions.push(options) },
    isExpanded() { return sidebarExpanded },
    toggleExpanded() { sidebarCalls.push('toggleExpanded'); sidebarExpanded = false },
    active() { return activeSidebarTab },
    float(tabId) { sidebarCalls.push('float:' + tabId) },
    commandTarget() { return { sessionId: 'session-test', paneId: 'pane1' } },
    toggleFullscreen(target) { sidebarCalls.push('fullscreen:' + target.paneId) },
    split(paneId) { sidebarCalls.push('split:' + paneId); return 'pane2' },
  },
  sidebarRightTabs: { register(definition) { tabType = definition; return () => {} } },
}
plugin.apply(ctx)
if (!localeEntry || localeEntry.ns !== 'artifacts' || !localeEntry.dicts.zh || !localeEntry.dicts.en) throw new Error('locale not registered')

const view = registrations['conversation.view']
const settingsSection = registrations['settings.section']
const sidebarBody = registrations['sidebar.right.pane.tab']
const overlay = registrations['shell.overlay']
if (!view) throw new Error('conversation.view registration missing')
if (!settingsSection) throw new Error('settings.section registration missing')
if (!sidebarBody) throw new Error('sidebar.right.pane.tab registration missing')
if (!tabType) throw new Error('sidebarRightTabs.register was not called')
if (view.options.id !== 'artifacts' || view.options.order !== 45) throw new Error('conversation.view registration mismatch')
if (view.options.label() !== '产物') throw new Error('view label mismatch: ' + view.options.label())
if (settingsSection.options.id !== '@local/dsh-artifacts-panel' || settingsSection.options.order !== 60) throw new Error('settings.section registration mismatch')
if (settingsSection.options.label() !== '产物面板') throw new Error('settings label mismatch: ' + settingsSection.options.label())
if (tabType.id !== '@local/dsh-artifacts-panel/sidebar' || tabType.kind !== 'artifacts') throw new Error('sidebar tab type mismatch')
if (!tabType.guide || tabType.guide.length !== 1 || tabType.guide[0].id !== 'artifacts') throw new Error('sidebar guide entry mismatch')
if (sidebarBody.options.key !== '@local/dsh-artifacts-panel/sidebar') throw new Error('sidebar body key mismatch')
const injected = view.options.inject('session-test')
if (injected.sessionId !== 'session-test' || typeof injected.loadArtifacts !== 'function' || typeof injected.openArtifact !== 'function') throw new Error('inject contract mismatch')
if (typeof injected.openSidebar !== 'function') throw new Error('conversation.view inject lacks openSidebar')
if (typeof injected.openSession !== 'function') throw new Error('conversation.view inject lacks openSession')
injected.openSidebar()
if (openTabCalls.length !== 1 || openTabCalls[0] !== 'artifacts') throw new Error('openSidebar did not call openTab(artifacts)')

const text = []
let sawSidebarClass = false
function collect(node) {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') { text.push(String(node)); return }
  if (Array.isArray(node)) { for (const child of node) collect(child); return }
  if (typeof node.type === 'function') {
    collect(node.type(Object.assign({}, node.props, { children: node.children })))
    return
  }
  if (node.props && typeof node.props.className === 'string' && node.props.className.includes('ap-page-sidebar')) sawSidebarClass = true
  if (node.children) for (const child of node.children) collect(child)
  if (node.props && node.props.dangerouslySetInnerHTML && typeof node.props.dangerouslySetInnerHTML.__html === 'string') text.push(node.props.dangerouslySetInnerHTML.__html)
  if (node.props) for (const key of ['title', 'aria-label', 'placeholder', 'download', 'value', 'min', 'max', 'step', 'src', 'alt']) if (typeof node.props[key] === 'string') text.push(node.props[key])
}

function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  if (typeof node !== 'object') return
  visit(node)
  if (node.children) walk(node.children, visit)
}

// Like walk(), but expands function components (group/row wrappers) so the
// visitor also sees deep controls such as the accent swatches.
function walkDeep(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { for (const child of node) walkDeep(child, visit); return }
  if (typeof node !== 'object') return
  visit(node)
  if (typeof node.type === 'function') {
    walkDeep(node.type(Object.assign({}, node.props, { children: node.children })), visit)
    return
  }
  if (node.children) walkDeep(node.children, visit)
}

// Same expansion as walkDeep, but stops at the first matching node.
function findNodeDeep(node, predicate) {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeDeep(child, predicate)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object') return null
  if (predicate(node)) return node
  if (typeof node.type === 'function') {
    return findNodeDeep(node.type(Object.assign({}, node.props, { children: node.children })), predicate)
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeDeep(child, predicate)
      if (found) return found
    }
  }
  return null
}

const t = ctx.locale.bind('artifacts')
const viewProps = Object.assign({}, injected, { t: t })
function renderView(data, extra) {
  state.mockData = data || null
  text.length = 0
  const tree = view.component(Object.assign({}, viewProps, extra || {}))
  collect(tree)
  state.mockData = null
  return { tree: tree, text: text.join('\n') }
}

text.length = 0
const viewTree = view.component(viewProps)
collect(viewTree)
const viewText = text.join('\n')
text.length = 0
const settingsTree = settingsSection.component({ t: t })
collect(settingsTree)
const settingsText = text.join('\n')
let themeSwatchCount = 0
walkDeep(settingsTree, function (node) {
  const className = node.props && node.props.className
  if (typeof className === 'string' && className.split(' ').indexOf('ap-theme-swatch') !== -1) themeSwatchCount += 1
})
const sidebarInjected = sidebarBody.options.inject('session-test')
if (!sidebarInjected.sidebarActions || typeof sidebarInjected.sidebarActions.float !== 'function' || typeof sidebarInjected.sidebarActions.fullscreen !== 'function' || typeof sidebarInjected.sidebarActions.split !== 'function') throw new Error('sidebarActions injection mismatch')
sidebarInjected.sidebarActions.float('tab1')
sidebarInjected.sidebarActions.fullscreen()
sidebarInjected.sidebarActions.split('pane1')
const tabInfo = { sidebar: { expanded: true }, panel: { id: 'pane1' }, tab: { actions: { openResource() {} } } }
text.length = 0
const sidebarTree = sidebarBody.component(Object.assign({}, sidebarInjected, { t: t, useTabInfo: () => tabInfo }))
collect(sidebarTree)
const sidebarText = text.join('\n')

// ---------------------------------------------------------------------------
// v3 fixtures for the pure data layer.
// ---------------------------------------------------------------------------
function ev(seq, type, time, data) {
  return { event: { seq: seq, type: type, time: time, data: data } }
}
const testSettings = { showReplies: true, showDocs: true, showImages: true, showFiles: true }

const turnRecords = [
  ev(1, 'turn/start', 1000, { turn: 1 }),
  ev(2, 'assistant/message', 1100, { turn: 1, message: { content: [{ type: 'text', text: '第一轮完成，产出 a.md' }] } }),
  ev(3, 'deliverables/presented', 1200, { turn: 1, files: [{ path: '/ws/out/a.md', description: '报告 A' }] }),
  ev(4, 'turn/end', 1300, { turn: 1, reason: { kind: 'normal' } }),
  ev(5, 'turn/start', 2000, { turn: 2 }),
  ev(6, 'tool/call', 2100, { turn: 2, callId: 'c1', name: 'write', arguments: JSON.stringify({ file_path: '/ws/out/b.png' }) }),
  ev(7, 'tool/result', 2200, { turn: 2, message: { isError: false, source: { callId: 'c1' } } }),
  ev(8, 'assistant/message', 2300, { turn: 2, message: { content: [{ type: 'text', text: '第二轮完成' }] } }),
  ev(9, 'turn/end', 2400, { turn: 2, reason: { kind: 'normal' } }),
  ev(10, 'workspace/changes', 2500, { turn: 2 }),
]

// 真实 wire 形状：DSH 0.2.2-rc.x 的 team/* payload 是 {version, teamId, task|member}，
// 不是扁平字段。夹具必须照它写，否则「解包错」这类回归测不出来。
const taskRecords = [
  ev(1, 'team/member', 1000, { version: 2, teamId: 'team-1', member: { id: 'm-1', name: '阿蓝', phase: 'build' } }),
  ev(2, 'team/task', 1100, { version: 2, teamId: 'team-1', task: { id: 't-1', revision: 1, subject: '写数据层', status: 'running', ownerId: 'm-1', writeScopes: ['/ws/a'] } }),
  ev(3, 'team/task', 1200, { version: 2, teamId: 'team-1', task: { id: 't-2', revision: 1, subject: '补测试', status: 'pending', ownerId: '', writeScopes: ['/ws/b'] } }),
  ev(4, 'team/task', 1300, { version: 2, teamId: 'team-1', task: { id: 't-1', revision: 2, subject: '写数据层', status: 'completed', ownerId: 'm-1', writeScopes: ['/ws/a'] } }),
  ev(4.5, 'team/task', 1350, { version: 2, teamId: 'team-1', task: { id: 't-3', revision: 1, subject: '已删除的任务', status: 'deleted', ownerId: '', writeScopes: [] } }),
  ev(4.6, 'subagent/catalog', 1360, { childId: 'c-9', mode: 'research', label: '一次性侦察', version: 1 }),
  ev(5, 'turn/start', 1400, { turn: 1 }),
  ev(6, 'deliverables/presented', 1500, { turn: 1, files: [{ path: '/ws/a/client.js' }, { path: '/ws/b/harness.cjs' }, { path: '/ws/misc/notes.md' }] }),
  ev(7, 'turn/end', 1600, { turn: 1, reason: { kind: 'normal' } }),
]
const taskChildRows = {
  'm-1': [{ path: '/ws/a/child-report.md', name: 'child-report.md', kind: 'doc', source: 'produced', description: '子代理报告', time: 1700, turn: 1 }],
}

const runRecords = [
  ev(1, 'tool-workflow/run-start', 1000, { runId: 'r-1', name: '迁移' }),
  ev(2, 'tool-workflow/agent-start', 1100, { runId: 'r-1', childId: 'c-1', label: '侦察', phase: 'scan', seq: 2 }),
  ev(3, 'tool-workflow/agent-start', 1200, { runId: 'r-1', childId: 'c-2', label: '施工', phase: 'build', seq: 3 }),
  ev(4, 'tool-workflow/agent-end', 1300, { runId: 'r-1', seq: 2, outcome: 'ok' }),
  ev(5, 'tool-workflow/agent-end', 1400, { runId: 'r-1', seq: 3, outcome: 'ok' }),
  ev(6, 'tool-workflow/run-end', 1500, { runId: 'r-1', stopReason: 'completed' }),
]
const runChildRows = {
  'c-1': [{ path: '/ws/run/scan-report.md', name: 'scan-report.md', kind: 'doc', source: 'produced', description: '', time: 1600, turn: 1 }],
  'c-2': [{ path: '/ws/run/build-report.md', name: 'build-report.md', kind: 'doc', source: 'produced', description: '', time: 1700, turn: 1 }],
}

const testing = plugin.__testing
const turnFold = testing.foldSession(turnRecords, '/ws')
const taskFold = testing.foldSession(taskRecords, '/ws')
const runFold = testing.foldSession(runRecords, '/ws')

function groupOptions(dimension, fold, childRows) {
  return {
    dimension: dimension,
    turns: fold.turns,
    team: fold.team,
    runs: fold.runs,
    children: fold.children,
    settings: testSettings,
    hiddenSet: new Set(),
    filter: 'all',
    query: '',
    showHidden: false,
    showSubagents: true,
    showUnassigned: true,
    childRows: childRows || {},
    labels: { unassigned: '未归属' },
  }
}
const taskGroups = testing.buildGroups(groupOptions('tasks', taskFold, taskChildRows))
const runGroups = testing.buildGroups(groupOptions('runs', runFold, runChildRows))
const turnGroups = testing.buildGroups(groupOptions('turns', taskFold, taskChildRows))
const byKey = {}
for (const group of taskGroups) byKey[group.key] = group
function groupPaths(group) { return (group.rows || []).map(row => row.path) }

// ---------------------------------------------------------------------------
// v2b: cross-session index pure data layer + degradation render.
// ---------------------------------------------------------------------------
const v2bPayload = {
  v: 1,
  mode: 'persistent',
  generatedAt: 1762940000000,
  totals: { sessions: 4, files: 5, turns: 4 },
  backfill: { running: false, done: 4, total: 4 },
  sessions: {
    'root-a': { t: 1, u: 3000, c: 2, n: 4, a: 1000, w: '/ws/a' },
    'child-a': { t: 1, u: 2000, c: 1, n: 2, a: 1100, w: '/ws/a', p: 'root-a' },
    'root-b': { t: 1, u: 1000, c: 1, n: 2, a: 900, w: '/ws/b' },
    'arch-root': { t: 1, u: 500, c: 1, n: 2, a: 800, w: '/ws/a' },
  },
}
const v2bIndex = testing.normalizeIndexPayload(JSON.stringify(v2bPayload))
const v2bCache = new Map([
  ['root-a', { rows: [{ path: '/ws/a/report.md', name: 'report.md', kind: 'doc', source: 'presented', turn: 1 }], at: Date.now() }],
  ['child-a', { rows: [{ path: '/ws/a/child.md', name: 'child.md', kind: 'doc', source: 'produced', turn: 1 }], at: Date.now() }],
  ['root-b', { rows: [{ path: '/ws/b/other.png', name: 'other.png', kind: 'image', source: 'produced', turn: 1 }], at: Date.now() }],
])
function v2bTree(extra) {
  return testing.buildAllSessionTree(v2bIndex, Object.assign({
    query: '', filter: 'all', settings: testSettings, hiddenSet: new Set(),
    includeArchived: false, includeSubagents: true, cache: v2bCache,
    isArchived: id => id === 'arch-root',
  }, extra || {}))
}
function collectNodeIds(tree) {
  const ids = []
  function visit(node) { ids.push(node.id); for (const child of node.children) visit(child) }
  for (const workspace of tree.workspaces) for (const node of workspace.sessions) visit(node)
  return ids
}
const v2bBaseTree = v2bTree()
const v2bReportTree = v2bTree({ query: 'report' })
const v2bChildTree = v2bTree({ query: 'child' })
const v2bArchiveTree = v2bTree({ includeArchived: true })
const v2bMissingProps = { t: t, index: null, status: 'missing', settings: testSettings, hiddenSet: new Set(), sessionId: 'root-a', query: '', filter: 'all' }
const v2bMissingTree = testing.AllSessionsView(v2bMissingProps)
text.length = 0
collect(v2bMissingTree)
const v2bMissingText = text.join('\n')
const v2bReadyProps = { t: t, index: v2bIndex, status: 'ready', settings: testSettings, hiddenSet: new Set(), sessionId: 'root-a', query: '', filter: 'all', isArchived: id => id === 'arch-root' }
const v2bReadyTree = testing.AllSessionsView(v2bReadyProps)
text.length = 0
collect(v2bReadyTree)
const v2bReadyText = text.join('\n')
let v2bBadRejected = false
try {
  testing.normalizeIndexPayload(JSON.stringify({ v: 2, sessions: {} }))
} catch (error) {
  v2bBadRejected = true
}

function readyData(fold) {
  return {
    status: 'ready',
    turns: fold.turns,
    team: fold.team,
    runs: fold.runs,
    children: fold.children,
    sessions: {},
    error: null,
    updatedAt: 1762930000000,
  }
}
const taskRender = renderView(readyData(taskFold), { initialChildRows: taskChildRows, loadChildArtifacts: function () { return Promise.resolve([]) } })
const runRender = renderView(readyData(runFold), { initialChildRows: runChildRows, loadChildArtifacts: function () { return Promise.resolve([]) } })

// v5: reply-only turns (no file artifact) stay visible by default. The panel
// only collects three artifact sources, so a long reply with no file must not
// disappear; the toolbar toggle "只看有产物" is the opt-in filter.
const replyOnlyTurns = [
  {
    turn: 1, startTime: 1, endTime: 2, reason: 'normal', files: [],
    reply: '这一轮只讨论方案，没有落盘文件，但回复本身有信息量：确认了默认过滤、工具栏开关与「无产物」徽标三处改动，并把验证命令全部跑了一遍，结论记录在收尾说明里，后续可以按这份清单复核。',
  },
  { turn: 2, startTime: 3, endTime: 4, reason: 'normal', files: [], reply: '收到。' },
  {
    turn: 3, startTime: 5, endTime: 6, reason: 'normal', files: [],
    reply: '第一行内容\n第二行内容\n第三行内容\n第四行内容\n第五行内容\n第六行内容\n第七行内容\n第八行内容\n第九行内容\n第十行内容',
  },
]
const replyOnlyRender = renderView({
  status: 'ready',
  turns: replyOnlyTurns,
  team: { tasks: [], members: [] },
  runs: [],
  children: [],
  sessions: {},
  error: null,
  updatedAt: 1762950000000,
})
const replyOnlyDefault = testing.selectVisibleTurns(replyOnlyTurns, { settings: testSettings })
const replyOnlyFiltered = testing.selectVisibleTurns(replyOnlyTurns, {
  settings: Object.assign({}, testSettings, { hideTurnsWithoutArtifacts: true }),
})

// The narrow right-sidebar pane uses the same component with compact=true:
// group headers only (collapsed by default), owner/detail chips hidden.
state.mockData = readyData(taskFold)
text.length = 0
const sidebarTaskTree = sidebarBody.component(Object.assign({}, sidebarInjected, {
  t: t,
  useTabInfo: function () { return tabInfo },
  initialChildRows: taskChildRows,
}))
collect(sidebarTaskTree)
state.mockData = null
const sidebarTaskText = text.join('\n')

// Lazy child loading: first render must not fetch; clicking the group's load
// button must fetch exactly the owned child session.
const childCalls = []
const lazyRender = renderView(readyData(taskFold), {
  loadChildArtifacts: function (childId) { childCalls.push(childId); return Promise.resolve([]) },
})
let loadButton = null
walk(lazyRender.tree, function (node) {
  if (!loadButton && node.props && typeof node.props.className === 'string' && node.props.className.indexOf('ap-group-load') !== -1) loadButton = node
})

const checks = {
  // registration and defaults
  viewSlot: view.options.name === 'conversation.view',
  settingsSlot: settingsSection.options.name === 'settings.section',
  defaultFontScale: viewTree && viewTree.props && viewTree.props.style && viewTree.props.style.fontSize === 'calc(1.5 * 1em)',
  settingsDefaultScale: settingsText.includes('1.5×') && settingsText.includes('字号倍率'),
  settingsScaleSlider: settingsText.includes('0.8') && settingsText.includes('2.5') && settingsText.includes('0.1'),
  settingsScalePresets: ['1.0×', '1.25×', '1.5×', '1.75×', '2.0×', '2.5×'].every(label => settingsText.includes(label)),
  settingsActualPx: settingsText.includes('当前实际字号 ≈ 24px'),
  // default noise filtering: the boss's bus-check turns and short no-artifact turn are hidden
  hidesBusTurns: !viewText.includes('总线无新消息') && !viewText.includes('第 185 轮'),
  hidesShortNoArtifactTurn: !viewText.includes('第 30 轮'),
  keepsShortArtifactTurn: viewText.includes('第 31 轮') && viewText.includes('final-report.md'),
  // default pagination: 20 newest of 26 artifact turns, with a load-earlier control
  defaultPage20: !viewText.includes('第 1 轮') && viewText.includes('第 25 轮') && viewText.includes('加载更早（还剩 6 轮）'),
  statsFiltered: viewText.includes('26 轮') && viewText.includes('26 个产物'),
  // content defaults: docs, images and files all render
  showsDocs: viewText.includes('report-1.md') || viewText.includes('final-report.md'),
  showsImages: viewText.includes('report-8.png'),
  showsFiles: viewText.includes('report-9.xlsx'),
  // settings page rows and defaults
  settingsHeading: settingsText.includes('产物面板') && settingsText.includes('字号与密度'),
  settingsFontRow: settingsText.includes('字号倍率') && settingsText.includes('当前实际字号'),
  settingsDensityRow: settingsText.includes('行距 / 密度') && settingsText.includes('紧凑') && settingsText.includes('宽松'),
  settingsContentRows: settingsText.includes('收录内容') && settingsText.includes('每轮最终回复') && settingsText.includes('文档（md / txt / json 等）') && settingsText.includes('图片') && settingsText.includes('其他文件'),
  settingsNoiseRows: settingsText.includes('过滤噪音') && settingsText.includes('隐藏没有产物的轮次') && settingsText.includes('短回复阈值') && settingsText.includes('忽略轮次关键词'),
  settingsKeywordDefault: settingsText.includes('总线无新消息,已处理到'),
  settingsPaginationRow: settingsText.includes('分页') && settingsText.includes('20 轮') && settingsText.includes('全部'),
  settingsGroupingRows: settingsText.includes('分组与子代理') && settingsText.includes('默认分组维度') && settingsText.includes('自动') && settingsText.includes('显示子代理产物') && settingsText.includes('显示未归属产物'),
  settingsReset: settingsText.includes('恢复默认设置'),
  // existing toolbar survives, v3 dimension switch included
  viewToolbar: ['本会话', '全部会话', '轮次', '任务', '运行', '全部', '文档', '图片', '文件', '搜索文件名、路径或描述', '刷新', '设置', '在右侧栏打开', '更多面板操作', '筛选'].every(label => viewText.includes(label)),
  viewToolbarZones: ['ap-toolbar-identity', 'ap-toolbar-filter', 'ap-toolbar-actions'].every(function (cls) {
    return Boolean(findNodeDeep(viewTree, function (node) {
      return node.props && typeof node.props.className === 'string' && node.props.className.split(' ').indexOf(cls) !== -1
    }))
  }),
  viewEyesMovedOutOfToolbar: !viewText.includes('只看有产物') && !viewText.includes('显示全部轮次'),
  // v2b: scope switch, index parsing, tree and degradation states
  v2bScopeButtons: viewText.includes('本会话') && viewText.includes('全部会话'),
  v2bBadPayloadRejected: v2bBadRejected,
  v2bNormalize: v2bIndex.sessions['root-a'].c === 2 && v2bIndex.sessions['child-a'].p === 'root-a' && v2bIndex.mode === 'persistent',
  v2bTreeWorkspaces: v2bBaseTree.workspaces.length === 2 && v2bBaseTree.total === 3,
  v2bTreeNesting: (() => {
    const wsA = v2bBaseTree.workspaces.filter(workspace => workspace.root === '/ws/a')[0]
    return Boolean(wsA) && wsA.sessions.length === 1 && wsA.sessions[0].id === 'root-a' && wsA.sessions[0].children.length === 1 && wsA.sessions[0].children[0].id === 'child-a'
  })(),
  v2bTreeArchiveHidden: !collectNodeIds(v2bBaseTree).includes('arch-root'),
  v2bTreeArchiveShown: collectNodeIds(v2bArchiveTree).includes('arch-root'),
  v2bTreePathSearch: v2bReportTree.workspaces.length === 1 && collectNodeIds(v2bReportTree).join(',') === 'root-a',
  v2bTreeChildSearchKeepsParent: collectNodeIds(v2bChildTree).sort().join(',') === 'child-a,root-a',
  v2bMissingRender: v2bMissingText.includes('索引准备中（需 DSH 下次启动生效）') && v2bMissingText.includes('重试读取'),
  v2bReadyRender: v2bReadyText.includes('root-a') && v2bReadyText.includes('/ws/a') && v2bReadyText.includes('含归档') && v2bReadyText.includes('含子代理'),
  v2bSettingsRows: settingsText.includes('跨会话索引') && settingsText.includes('启用「全部会话」视图') && settingsText.includes('最多 300 个会话'),
  sidebarRegistered: sidebarBody.options.name === 'sidebar.right.pane.tab' && tabType.title() === '产物' && tabType.guide[0].title() === '产物' && tabType.guide[0].description() === '本会话全部产物',
  sidebarCompact: sawSidebarClass,
  sidebarContent: sidebarText.includes('产物') && sidebarText.includes('第 25 轮') && sidebarText.includes('加载更早'),
  sidebarNoSubtitle: !sidebarText.includes('这个会话的最终回复与产出文件'),
  sidebarSameFiltering: !sidebarText.includes('总线无新消息') && !sidebarText.includes('第 185 轮'),
  sidebarMenu: sidebarText.includes('页面操作'),
  sidebarActions: sidebarCalls.join(',') === 'float:tab1,fullscreen:pane1,split:pane1',
}

const v3 = {
  exposesTesting: typeof testing.foldSession === 'function' && typeof testing.buildGroups === 'function' && typeof testing.resolveDimension === 'function',
  // fixture 1: pure turns -> auto picks turns, two turns folded
  turnsFoldCount: turnFold.turns.length === 2,
  turnsFoldFiles: turnFold.turns[0].files.length === 1 && turnFold.turns[0].files[0].path === '/ws/out/a.md' && turnFold.turns[1].files[0].path === '/ws/out/b.png',
  turnsTeamEmpty: turnFold.team.tasks.length === 0 && turnFold.team.members.length === 0 && turnFold.runs.length === 0,
  turnsAutoDimension: testing.resolveDimension(turnFold.team, turnFold.runs, 'auto') === 'turns',
  turnsGroupsEmpty: turnGroups.length === 0,
  turnsPinnedDimension: testing.resolveDimension(turnFold.team, turnFold.runs, 'tasks') === 'tasks',
  // fixture 2: one teammate, two tasks (latest revision), unassigned fallback
  taskMember: taskFold.team.members.length === 1 && taskFold.team.members[0].name === '阿蓝',
  taskRevisionLatest: taskFold.team.tasks.length === 2 && taskFold.team.tasks.filter(task => task.id === 't-1')[0].status === 'completed',
  taskChild: taskFold.children.some(child => child.id === 'm-1' && child.kind === 'member' && child.name === '阿蓝'),
  tasksAutoDimension: testing.resolveDimension(taskFold.team, taskFold.runs, 'auto') === 'tasks',
  tasksGroupCount: taskGroups.length === 3,
  taskOneOwned: Boolean(byKey['task:t-1']) && byKey['task:t-1'].owner === '阿蓝' && byKey['task:t-1'].title === '写数据层',
  taskOneRows: Boolean(byKey['task:t-1']) && groupPaths(byKey['task:t-1']).includes('/ws/a/client.js') && groupPaths(byKey['task:t-1']).includes('/ws/a/child-report.md'),
  taskOneChildId: Boolean(byKey['task:t-1']) && byKey['task:t-1'].childIds.length === 1 && byKey['task:t-1'].childIds[0] === 'm-1',
  taskTwoRows: Boolean(byKey['task:t-2']) && groupPaths(byKey['task:t-2']).includes('/ws/b/harness.cjs'),
  taskUnassigned: Boolean(byKey.unassigned) && groupPaths(byKey.unassigned).includes('/ws/misc/notes.md') && !groupPaths(byKey.unassigned).includes('/ws/a/client.js'),
  taskChildRowBadge: Boolean(byKey['task:t-1']) && byKey['task:t-1'].rows.some(row => row.childId === 'm-1' && row.path === '/ws/a/child-report.md'),
  // 嵌套 payload 必须能解开；deleted 任务要剔掉；一次性 subagent 要能进目录并落到未归属组
  taskNestedPayload: taskFold.team.tasks.length === 2 && taskFold.team.members.length === 1,
  taskDeletedFiltered: !taskFold.team.tasks.some(task => task.id === 't-3'),
  catalogChildFolded: taskFold.children.some(child => child.id === 'c-9' && child.kind === 'catalog' && child.name === '一次性侦察'),
  catalogInUnassigned: Boolean(byKey.unassigned) && byKey.unassigned.childIds.indexOf('c-9') !== -1,
  // fixture 3: one workflow run with two phases
  runFold: runFold.runs.length === 1 && runFold.runs[0].status === 'completed' && runFold.runs[0].phases.length === 2,
  runAgents: runFold.runs[0].agents.length === 2 && runFold.runs[0].agents[0].outcome === 'ok' && runFold.runs[0].agents[1].outcome === 'ok',
  runsAutoDimension: testing.resolveDimension({ tasks: [] }, runFold.runs, 'auto') === 'runs' && testing.resolveDimension({ tasks: [] }, runFold.runs, 'turns') === 'turns',
  runsGroupCount: runGroups.length === 2,
  runPhaseScan: Boolean(runGroups[0]) && runGroups[0].key === 'run:r-1:scan' && runGroups[0].title === '迁移' && runGroups[0].subtitle === 'scan',
  runPhaseBuild: Boolean(runGroups[1]) && runGroups[1].key === 'run:r-1:build' && runGroups[1].members[0] === '施工',
  runScanRows: Boolean(runGroups[0]) && groupPaths(runGroups[0]).includes('/ws/run/scan-report.md'),
  runBuildRows: Boolean(runGroups[1]) && groupPaths(runGroups[1]).includes('/ws/run/build-report.md'),
  // live renders: auto dimension and attribution reach the UI
  renderTaskStats: taskRender.text.includes('3 组 · 4 个产物'),
  renderTaskOwner: taskRender.text.includes('写数据层') && taskRender.text.includes('负责人：阿蓝'),
  renderTaskScopes: taskRender.text.includes('/ws/a'),
  renderTaskUnassigned: taskRender.text.includes('未归属') && taskRender.text.includes('无法精确匹配到任务或运行的产物'),
  renderTaskStatus: taskRender.text.includes('已完成') && taskRender.text.includes('待处理'),
  renderTaskSubagent: taskRender.text.includes('子代理') && taskRender.text.includes('child-report.md'),
  renderTaskDrilldown: testing.artifactMenuModel(t, { caps: {}, absolutePath: false, download: false, changeIndex: -1, prefs: { starred: false, hidden: false }, canOpenChild: true }).map(item => item.id).join(',') === 'star,copy,openChild,hide',
  renderRunStats: runRender.text.includes('2 组 · 2 个产物'),
  renderRunPhases: runRender.text.includes('迁移') && runRender.text.includes('scan') && runRender.text.includes('侦察'),
  renderRunMembers: runRender.text.includes('1 个成员'),
  renderRunChildren: runRender.text.includes('scan-report.md') && runRender.text.includes('build-report.md'),
  sidebarTaskGroups: sidebarTaskText.includes('3 组') && sidebarTaskText.includes('写数据层') && sidebarTaskText.includes('补测试') && sidebarTaskText.includes('未归属'),
  sidebarTaskCompact: !sidebarTaskText.includes('负责人：') && !sidebarTaskText.includes('child-report.md') && sidebarTaskText.includes('2 个产物'),
  // laziness: no fetch during render, one click on the load button fetches the child
  lazyNoFetchOnMount: childCalls.length === 0,
  lazyLoadButton: Boolean(loadButton),
}

// ---------------------------------------------------------------------------
// v4 (batch 2): diff deep link, file actions, export upgrade, gallery, dock.
// ---------------------------------------------------------------------------
const galleryFixture = [
  { file: { path: '/ws/out/a.png', name: 'a.png', kind: 'image' }, turn: 1 },
  { file: { path: '/ws/out/b.png', name: 'b.png', kind: 'image' }, turn: 2 },
]
text.length = 0
collect(testing.ImageGallery({
  t: t,
  items: galleryFixture,
  src: function (file) { return 'api/file?path=' + encodeURIComponent(file.path) },
  onOpen: function () {},
}))
const galleryText = text.join('\n')
text.length = 0
collect(testing.GalleryLightbox({
  t: t,
  items: galleryFixture,
  index: 1,
  src: function (file) { return 'api/file?path=' + encodeURIComponent(file.path) },
  onClose: function () {},
  onStep: function () {},
}))
const lightboxText = text.join('\n')
const overlayInjected = overlay ? overlay.options.inject() : null
const overlayTree = overlay && overlayInjected ? overlay.component(Object.assign({}, overlayInjected, { t: t })) : null
text.length = 0
if (overlayTree) collect(overlayTree)
const overlayText = text.join('\n')
const changesRender = renderView(readyData(turnFold), {
  capabilities: { changesReview: true, fileActions: false, workspacePath: false, saveAs: false, sessionLogDownload: false },
})
const linkedManifest = testing.manifestText(t, 's-1', [{
  turn: 1, startTime: 1, endTime: 2, reply: 'hi',
  files: [{ path: '/ws/a.md', name: 'a.md', kind: 'doc', description: '' }],
}], { links: true, fileUrl: function () { return 'api/file?path=%2Fws%2Fa.md' } })

const v4 = {
  exposesBatch2: typeof testing.artifactMenuModel === 'function' && typeof testing.exportMenuModel === 'function' && typeof testing.manifestText === 'function' && typeof testing.ImageGallery === 'function' && typeof testing.FloatingBar === 'function' && typeof testing.changesReviewAddress === 'function',
  deepLink: testing.changesReviewAddress('session-test', 12, 3) === 'dsh-resource://changes-review/session/session-test/12/3',
  deepLinkEncoded: testing.changesReviewAddress('a b/c', 7, 2) === 'dsh-resource://changes-review/session/a%20b%2Fc/7/2',
  changesFold: turnFold.turns.length === 2 && Array.isArray(turnFold.turns[1].changes) && turnFold.turns[1].changes.length === 1 && turnFold.turns[1].changes[0].seq === 10,
  summaryRoute: testing.changesSummaryRoute('s-1', 9) === 'api/changes.summary?sessionId=s-1&seq=9',
  markdownRoute: testing.sessionMarkdownRoute('s-1') === 'api/session.markdown?sessionId=s-1',
  menuCapabilityFull: testing.artifactMenuModel(t, { caps: { workspacePath: true, desktop: true, saveAs: true }, absolutePath: true, download: true, changeIndex: 2 }).map(item => item.id).join(',') === 'reveal,open,copy,download,saveAs,changes',
  menuCapabilityBare: testing.artifactMenuModel(t, { caps: {}, absolutePath: false, download: false, changeIndex: -1 }).map(item => item.id).join(',') === 'copy',
  exportFull: (() => { const model = testing.exportMenuModel(t, { sessionLogDownload: true, markdown: true }); return model.items.map(item => item.id).join(',') === 'manifest,bundle,copyMarkdown' && model.degraded === false })(),
  exportDegraded: (() => { const model = testing.exportMenuModel(t, { sessionLogDownload: false, markdown: false }); return model.items.map(item => item.id).join(',') === 'manifest,degradedManifest' && model.degraded === true })(),
  manifestLinks: linkedManifest.includes('](api/file?path=%2Fws%2Fa.md)') && linkedManifest.includes('文档') && linkedManifest.includes('/ws/a.md'),
  viewExportInMoreMenu: !viewText.includes('导出清单') && !findNodeDeep(viewTree, function (node) { return node.props && node.props['data-export-action'] }),
  viewMoreMenuButton: viewText.includes('更多操作'),
  viewCardMenuButton: viewText.includes('更多操作'),
  viewNoFakeReveal: !viewText.includes('在 Finder 中显示'),
  changesEntry: changesRender.text.includes('看改动'),
  changesEntryHiddenWithoutCapability: !viewText.includes('看改动'),
  galleryRender: galleryText.includes('图片画廊 · 2') && galleryText.includes('a.png') && galleryText.includes('api/file?path=%2Fws%2Fout%2Fa.png'),
  lightboxRender: lightboxText.includes('2 / 2') && lightboxText.includes('b.png') && lightboxText.includes('关闭'),
  galleryItemsOnlyImages: testing.galleryItems([{ turn: 1, files: [{ path: '/a.png', kind: 'image' }, { path: '/a.md', kind: 'doc' }] }]).length === 1,
  settingsViewRows: settingsText.includes('视图与悬浮条') && settingsText.includes('图片默认视图') && settingsText.includes('显示产物悬浮条') && settingsText.includes('画廊') && settingsText.includes('列表'),
  overlayRegistered: Boolean(overlay) && overlay.options.name === 'shell.overlay' && overlay.options.id === '@local/dsh-artifacts-panel/floating-bar',
  overlayInjectedContract: Boolean(overlayInjected) && typeof overlayInjected.useSelection === 'function' && typeof overlayInjected.openPanel === 'function' && typeof overlayInjected.loadCount === 'function',
  overlayRender: overlayText.includes('产物') && overlayText.includes('关闭悬浮条') && overlayText.includes('打开产物面板'),
}

const v5 = {
  // 1. the default flipped: turns without artifacts are shown unless asked otherwise
  defaultShowsReplyOnlyTurns: testing.DEFAULT_SETTINGS.hideTurnsWithoutArtifacts === false,
  // 2. a reply-only turn renders its header, final reply and the light badge
  replyOnlyTurnRenders: replyOnlyRender.text.includes('第 1 轮') &&
    replyOnlyRender.text.includes('确认了默认过滤') &&
    replyOnlyRender.text.includes('无产物'),
  // 3. the long reply folds to the ~8-line clamp and offers the expand control
  replyOnlyLongFoldable: replyOnlyRender.text.includes('展开全文'),
  // 4. short reply without artifacts still filtered by the 30-char noise rule
  replyOnlyShortHidden: !replyOnlyRender.text.includes('第 2 轮') && !replyOnlyRender.text.includes('收到。'),
  // 5. "只看有产物" (hideTurnsWithoutArtifacts) filters the same reply-only turn
  onlyArtifactsFiltersReplyOnly: replyOnlyFiltered.length === 0 && replyOnlyDefault.length === 2 &&
    replyOnlyDefault.every(turn => turn.noArtifacts === true),
  // 6. the toolbar exposes the toggle, matching the settings-page row
  toolbarFilterButton: viewText.includes('筛选') && testing.DEFAULT_SETTINGS.hideTurnsWithoutArtifacts === false,
  // 7. settings copy: default off + the documented three-source limitation
  settingsHideNoArtifactsOff: settingsText.includes('默认关') && settingsText.includes('打开后只显示有产物的轮次'),
  settingsSourceLimit: settingsText.includes('bash') && settingsText.includes('暂不自动收录') && settingsText.includes('present'),
  // 8. legacy localStorage payloads migrate to the new "show" default; an
  // explicit v2 choice is still respected.
  legacySettingsMigration: (function () {
    const legacy = testing.normalizeSettings({ fontScale: 1.5, hideTurnsWithoutArtifacts: true })
    const explicit = testing.normalizeSettings({ settingsVersion: 2, hideTurnsWithoutArtifacts: true })
    return legacy.hideTurnsWithoutArtifacts === false && legacy.settingsVersion === 2 && explicit.hideTurnsWithoutArtifacts === true
  })(),
}

// ---------------------------------------------------------------------------
// v6: color theme (mode + accent) reaches every plugin root container.
// ---------------------------------------------------------------------------
const v6 = {}
;(function themeChecks() {
  function findStyle(tree, classNamePart) {
    let found = null
    // Like collect(), expand function components so wrappers such as
    // SidebarArtifacts -> ArtifactsView are walked too.
    function visit(node) {
      if (found || node === null || node === undefined || node === false) return
      if (typeof node !== 'object') return
      if (Array.isArray(node)) { for (const child of node) visit(child); return }
      const className = node.props && node.props.className
      if (typeof className === 'string' && className.split(' ').indexOf(classNamePart) !== -1) {
        found = node.props.style || {}
        return
      }
      if (typeof node.type === 'function') {
        visit(node.type(Object.assign({}, node.props, { children: node.children })))
        return
      }
      if (node.children) for (const child of node.children) visit(child)
    }
    visit(tree)
    return found
  }
  function relativeLuminance(color) {
    const hex = String(color).replace('#', '')
    const channels = [0, 2, 4].map(function (offset) {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  function contrast(a, b) {
    const first = relativeLuminance(a)
    const second = relativeLuminance(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }
  function aa(fg, bg) { return contrast(fg, bg) >= 4.5 }
  const darkTokens = testing.THEME_TOKENS.dark
  const lightTokens = testing.THEME_TOKENS.light
  v6.darkBodyContrast = aa(darkTokens.text, darkTokens.surface) && aa(darkTokens.muted, darkTokens.surface) && aa(darkTokens.subtle, darkTokens.surface)
  v6.lightBodyContrast = aa(lightTokens.text, lightTokens.surface) && aa(lightTokens.muted, lightTokens.surface) && aa(lightTokens.subtle, lightTokens.surface)
  v6.accentContrast = Object.keys(testing.ACCENT_PRESETS).every(function (id) {
    return aa(testing.ACCENT_PRESETS[id].dark.accent, darkTokens.surface) && aa(testing.ACCENT_PRESETS[id].light.accent, lightTokens.surface)
  })

  const defaults = testing.normalizeSettings({})
  const legacy = testing.normalizeSettings({ settingsVersion: 1, fontScale: 1.5 })
  const invalid = testing.normalizeSettings({ themeMode: 'neon', accentColor: 'pink' })
  v6.defaults = defaults.themeMode === 'inherit' && defaults.accentColor === 'default'
  v6.legacyDefaults = legacy.themeMode === 'inherit' && legacy.accentColor === 'default'
  v6.invalidFallsBack = invalid.themeMode === 'inherit' && invalid.accentColor === 'default'
  v6.settingsGroup = settingsText.includes('配色主题') && settingsText.includes('主题模式') && settingsText.includes('强调色')
  v6.modeLabels = ['跟随 DSH', '深色', '浅色'].every(function (label) { return settingsText.includes(label) })
  v6.swatchCount = themeSwatchCount === 6
  v6.preview = settingsText.includes('产物面板预览') && settingsText.includes('主按钮') && settingsText.includes('正文与说明文字')
  v6.inheritKeepsHostTokens = findStyle(viewTree, 'ap-page')['--ap-bg'] === undefined && findStyle(viewTree, 'ap-page')['--ap-accent'] === undefined

  testing.setSettings({ themeMode: 'dark', accentColor: 'default' })
  const darkStyle = findStyle(renderView(null).tree, 'ap-page')
  v6.darkOverride = darkStyle['--ap-bg'] === testing.THEME_TOKENS.dark.bg && darkStyle['--ap-text'] === testing.THEME_TOKENS.dark.text && darkStyle['--ap-surface'] === testing.THEME_TOKENS.dark.surface
  const darkSidebarStyle = findStyle(sidebarBody.component(Object.assign({}, sidebarInjected, { t: t, useTabInfo: () => tabInfo })), 'ap-page')
  v6.darkSidebarOverride = darkSidebarStyle['--ap-bg'] === testing.THEME_TOKENS.dark.bg
  const darkDock = testing.FloatingBar({
    t: t,
    useSelection: function () { return { sessionId: 'session-test' } },
    loadCount: function () { return Promise.resolve({ count: 0 }) },
    openPanel: function () {},
  })
  v6.darkDockOverride = findStyle(darkDock, 'ap-dock')['--ap-bg'] === testing.THEME_TOKENS.dark.bg
  const darkSettingsStyle = findStyle(settingsSection.component({ t: t }), 'ap-settings')
  v6.darkSettingsOverride = darkSettingsStyle['--ap-bg'] === testing.THEME_TOKENS.dark.bg

  testing.setSettings({ themeMode: 'light', accentColor: 'blue' })
  const lightStyle = findStyle(renderView(null).tree, 'ap-page')
  v6.lightOverride = lightStyle['--ap-bg'] === testing.THEME_TOKENS.light.bg && lightStyle['--ap-text'] === testing.THEME_TOKENS.light.text
  v6.accentVariable = lightStyle['--ap-accent'] === testing.ACCENT_PRESETS.blue.light.accent && lightStyle['--ap-accent-fg'] === testing.ACCENT_PRESETS.blue.light.fg
  const lightSettingsTree = settingsSection.component({ t: t })
  const lightSettingsStyle = findStyle(lightSettingsTree, 'ap-settings')
  v6.lightSettingsForced = lightSettingsStyle['--ap-bg'] === testing.THEME_TOKENS.light.bg
  v6.lightSettingsClass = (function () {
    let found = false
    walkDeep(lightSettingsTree, function (node) {
      const className = node.props && node.props.className
      if (typeof className === 'string' && className.indexOf('ap-settings-forced') !== -1) found = true
    })
    return found
  })()

  testing.setSettings({ themeMode: 'dark', accentColor: 'rose' })
  const roseStyle = findStyle(renderView(null).tree, 'ap-page')
  v6.darkAccentVariant = roseStyle['--ap-accent'] === testing.ACCENT_PRESETS.rose.dark.accent

  const lightboxStyle = findStyle(testing.GalleryLightbox({
    t: t,
    items: galleryFixture,
    index: 0,
    src: function (file) { return 'api/file?path=' + encodeURIComponent(file.path) },
    onClose: function () {},
    onStep: function () {},
  }), 'ap-lightbox')
  v6.lightboxStaysDark = lightboxStyle['--ap-bg'] === testing.THEME_TOKENS.dark.bg && lightboxStyle['--ap-mask'] === 'rgba(0,0,0,.62)'

  testing.resetSettings()
})()

// ---------------------------------------------------------------------------
// v7: right-sidebar dock enhancements — auto-open setting, width-adaptive
// layout, state-aware toolbar entry and the floating-bar click chain.
// ---------------------------------------------------------------------------
const v7 = {}
;(function sidebarDockChecks() {
  v7.exposesEnhancements = typeof testing.SidebarArtifacts === 'function' && typeof testing.ShellOverlay === 'function' &&
    typeof testing.AutoOpenSidebar === 'function' && typeof testing.sidebarLayoutForWidth === 'function'
  v7.defaultAutoOpenOff = testing.DEFAULT_SETTINGS.autoOpenSidebar === false && testing.normalizeSettings({}).autoOpenSidebar === false
  v7.autoOpenPersists = testing.normalizeSettings({ settingsVersion: 2, autoOpenSidebar: true }).autoOpenSidebar === true
  v7.autoOpenSettingsRow = settingsText.includes('打开会话时自动展开产物标签页') && settingsText.includes('默认关')
  v7.layoutBreakpoints = testing.sidebarLayoutForWidth(0) === 'single' &&
    testing.sidebarLayoutForWidth(479) === 'single' &&
    testing.sidebarLayoutForWidth(480) === 'two-column' &&
    testing.sidebarLayoutForWidth(719) === 'two-column' &&
    testing.sidebarLayoutForWidth(720) === 'split' &&
    testing.sidebarLayoutForWidth(1200) === 'split'
  v7.layoutWidthsExported = testing.SIDEBAR_TWO_COLUMN_WIDTH === 480 && testing.SIDEBAR_SPLIT_WIDTH === 720

  function sidebarRoot(width) {
    const tree = sidebarBody.component(Object.assign({}, sidebarInjected, {
      t: t,
      useTabInfo: function () { return tabInfo },
      measureWidth: function () { return width },
    }))
    return findNodeDeep(tree, function (node) {
      const className = node.props && node.props.className
      return typeof className === 'string' && className.split(' ').indexOf('ap-page') !== -1
    })
  }
  const narrowRoot = sidebarRoot(0)
  const twoColumnRoot = sidebarRoot(520)
  const splitRoot = sidebarRoot(760)
  v7.layoutSingleDefault = Boolean(narrowRoot) && narrowRoot.props['data-layout'] === 'single' &&
    String(narrowRoot.props.className).indexOf('ap-layout-single') !== -1
  v7.layoutTwoColumnRender = Boolean(twoColumnRoot) && twoColumnRoot.props['data-layout'] === 'two-column' &&
    String(twoColumnRoot.props.className).indexOf('ap-layout-two-column') !== -1
  v7.layoutSplitRender = Boolean(splitRoot) && splitRoot.props['data-layout'] === 'split' &&
    String(splitRoot.props.className).indexOf('ap-layout-split') !== -1
  let turnBody = false
  walkDeep(splitRoot, function (node) {
    const className = node.props && node.props.className
    if (typeof className === 'string' && className.indexOf('ap-turn-body') !== -1) turnBody = true
  })
  v7.layoutTurnBody = turnBody
  v7.layoutCss = viewText.includes('.ap-page-sidebar.ap-layout-two-column .ap-grid') &&
    viewText.includes('.ap-page-sidebar.ap-layout-split .ap-turn-body')

  // Toolbar entry: the default render says "open in the sidebar"; a probe that
  // reports the expanded artifact tab flips the same button to "collapse".
  const collapseProbeRender = renderView(null, {
    probeSidebar: function () { return { expanded: true, artifactsActive: true } },
  })
  v7.toolbarOpenDefault = viewText.includes('在右侧栏打开') && !viewText.includes('收起右栏')
  v7.toolbarCollapseState = collapseProbeRender.text.includes('收起右栏') && !collapseProbeRender.text.includes('在右侧栏打开')
  v7.toolbarCollapsePressed = collapseProbeRender.tree && (function () {
    const button = findNodeDeep(collapseProbeRender.tree, function (node) {
      return node.props && node.props['data-sidebar-state'] === 'collapse'
    })
    return Boolean(button) && button.props['aria-pressed'] === 'true'
  })()

  // Auto-open host call: only while collapsed, and it reveals an already open
  // artifacts tab instead of opening a duplicate.
  sidebarExpanded = false
  const autoOpenBefore = openTabCalls.length
  const ensureResult = overlayInjected.ensureArtifactsSidebar()
  const autoOpenOption = openTabOptions[openTabOptions.length - 1]
  v7.autoOpenCallsOpenTab = ensureResult === true && openTabCalls.length === autoOpenBefore + 1 &&
    openTabCalls[openTabCalls.length - 1] === 'artifacts' &&
    Boolean(autoOpenOption) && autoOpenOption.revealIfOpened === true
  sidebarExpanded = true
  const autoOpenSkipped = openTabCalls.length
  const ignored = overlayInjected.ensureArtifactsSidebar()
  v7.autoOpenSkipsExpanded = ignored === false && openTabCalls.length === autoOpenSkipped

  // Floating bar: openTab('artifacts') first, then toggleExpanded while the
  // column is still collapsed.
  sidebarExpanded = false
  const dockButton = findNodeDeep(overlayTree, function (node) {
    return node.props && node.props.className === 'ap-dock-main'
  })
  const dockTabsBefore = openTabCalls.length
  const dockTogglesBefore = sidebarCalls.filter(item => item === 'toggleExpanded').length
  if (dockButton && typeof dockButton.props.onClick === 'function') dockButton.props.onClick()
  v7.dockClickChain = Boolean(dockButton) &&
    openTabCalls.length === dockTabsBefore + 1 &&
    openTabCalls[openTabCalls.length - 1] === 'artifacts' &&
    sidebarCalls.filter(item => item === 'toggleExpanded').length === dockTogglesBefore + 1
  // A host whose openTab already expands must not be toggled back closed: the
  // expanded flag is set before the call, modelling the post-openTab state.
  sidebarExpanded = true
  const openPanelTabsBefore = openTabCalls.length
  const openPanelTogglesBefore = sidebarCalls.filter(item => item === 'toggleExpanded').length
  overlayInjected.openPanel()
  v7.dockNoDoubleToggle = openTabCalls.length === openPanelTabsBefore + 1 &&
    sidebarCalls.filter(item => item === 'toggleExpanded').length === openPanelTogglesBefore
  sidebarExpanded = false
})()

// ---------------------------------------------------------------------------
// v8: cross-session index service fallback (inject + three failure classes).
// ---------------------------------------------------------------------------
const v8 = {}
let readIndexRejection = ''
;(function indexServiceChecks() {
  v8.injectWorkspaceFiles = plugin.inject.indexOf('remote.workspaceFiles') !== -1
  v8.injectMinimal = plugin.inject.every(name => ['slots', 'locale', 'sessions', 'uiWorkspace', 'remote', 'remote.session', 'remote.workspaceFiles', 'sidebarRight', 'sidebarRightTabs'].indexOf(name) !== -1)
  v8.classifiesUnavailable = testing.classifyIndexError(new Error('cannot get property "remote.workspaceFiles" without inject')) === 'unavailable' &&
    testing.classifyIndexError(new Error('WORKSPACE_FILES_UNAVAILABLE')) === 'unavailable' &&
    testing.classifyIndexError(new Error('workspaceFiles remote is unavailable')) === 'unavailable'
  v8.classifiesDenied = testing.classifyIndexError(new Error('EACCES: permission denied, open index.json')) === 'denied'
  v8.classifiesMissing = testing.classifyIndexError(new Error('ENOENT: no such file or directory')) === 'missing'
  // The mocked ctx has no remote.workspaceFiles: the reader must reject with a
  // typed code instead of throwing the raw Cordis injection error.
  try {
    injected.readIndexFile('/tmp/index.json').then(function () { readIndexRejection = 'RESOLVED' }, function (error) {
      readIndexRejection = error && error.message ? String(error.message) : String(error)
    })
  } catch (error) {
    readIndexRejection = 'THREW:' + (error && error.message ? error.message : String(error))
  }
  const rawMissingService = 'cannot get property "remote.workspaceFiles" without inject'
  const unavailableTree = testing.AllSessionsView(Object.assign({}, v2bMissingProps, { status: 'unavailable', error: rawMissingService }))
  text.length = 0
  collect(unavailableTree)
  const unavailableText = text.join('\n')
  const deniedTree = testing.AllSessionsView(Object.assign({}, v2bMissingProps, { status: 'denied', error: 'EACCES: permission denied, open .index/index.json' }))
  text.length = 0
  collect(deniedTree)
  const deniedText = text.join('\n')
  let unavailableDetails = null
  walk(unavailableTree, function (node) { if (!unavailableDetails && node.type === 'details') unavailableDetails = node })
  v8.unavailableCopy = unavailableText.includes('跨会话索引服务不可用') && unavailableText.includes('remote.workspaceFiles') && unavailableText.includes('原始错误')
  v8.unavailableRawFolded = Boolean(unavailableDetails) && JSON.stringify(unavailableDetails).includes('without inject')
  v8.deniedCopy = deniedText.includes('没有读取索引的权限') && deniedText.includes('EACCES: permission denied')
  v8.missingCopy = v2bMissingText.includes('索引准备中（需 DSH 下次启动生效）')
  // v10: the browser never carries a package path. The Host serves the index
  // over same-origin routes and the client only knows the route prefix.
  // 发布门禁（无 /Users/、无 @local/）归 release/verify.mjs 对 release/pkg 校验，
  // 开发包本身可以带 @local/ 身份，故不在此断言。
  v8.classifiesRouteUnavailable = testing.classifyIndexError(new Error('INDEX_ROUTE_UNAVAILABLE')) === 'unavailable' &&
    testing.classifyIndexError(new Error('Failed to fetch')) === 'unavailable'
  v8.classifiesRouteDenied = testing.classifyIndexError(new Error('INDEX_DENIED')) === 'denied'
  v8.classifiesRouteMissing = testing.classifyIndexError(new Error('INDEX_MISSING')) === 'missing'
  v8.indexPathDefaultsToRoute = testing.indexFilePath() === testing.INDEX_ROUTE_PREFIX + '/index.json' &&
    testing.sessionIndexFilePath('abc') === testing.INDEX_ROUTE_PREFIX + '/sessions/abc.json'
  testing.writeIndexDirOverride('/tmp/artifacts-index-custom')
  v8.indexPathOverride = testing.indexFilePath() === '/tmp/artifacts-index-custom/index.json' &&
    testing.sessionIndexFilePath('abc') === '/tmp/artifacts-index-custom/sessions/abc.json'
  testing.writeIndexDirOverride('')
  v8.indexOverrideCleared = testing.indexFilePath() === testing.INDEX_ROUTE_PREFIX + '/index.json' &&
    testing.readIndexDirOverride() === ''
})()

// ---------------------------------------------------------------------------
// v9: UI P0 (toolbar, cards, keyboard, paths, contrast, empty states, onboarding).
// ---------------------------------------------------------------------------
const v9 = {}
;(function uiP0Checks() {
  function contrast(a, b) {
    function lum(value) {
      const raw = String(value).replace('#', '')
      const channels = [0, 2, 4].map(function (offset) {
        const v = parseInt(raw.slice(offset, offset + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const first = lum(a)
    const second = lum(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }
  function classNodes(tree, cls) {
    const found = []
    walkDeep(tree, function (node) {
      const className = node.props && node.props.className
      if (typeof className === 'string' && className.split(' ').indexOf(cls) !== -1) found.push(node)
    })
    return found
  }
  function nestedButton(node, inside) {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) return node.some(function (child) { return nestedButton(child, inside) })
    if (node.type === 'button' && inside) return true
    return nestedButton(node.children, inside || node.type === 'button')
  }

  // P0-1: filter popover entry, settings gear, single ⋯ export entry.
  const gear = findNodeDeep(viewTree, function (node) { return node.props && node.props['data-settings-open'] === 'true' })
  v9.settingsGear = Boolean(gear) && gear.type === 'button' && gear.props['aria-label'] === '设置'
  const filterBtn = findNodeDeep(viewTree, function (node) { return node.props && node.props['data-filter-open'] !== undefined })
  v9.filterPopoverEntry = Boolean(filterBtn) && filterBtn.props['aria-haspopup'] === 'dialog' && filterBtn.props['aria-expanded'] === 'false'
  v9.moreMenuEntry = Boolean(findNodeDeep(viewTree, function (node) {
    return node.props && node.props['aria-label'] === '更多面板操作' && node.props['aria-haspopup'] === 'menu'
  }))
  v9.exportOnlyInMore = !findNodeDeep(viewTree, function (node) { return node.props && node.props['data-export-action'] })

  // P0-4: plain card container + transparent hit button, no nested buttons.
  const cards = classNodes(viewTree, 'ap-card')
  v9.cardsRendered = cards.length > 0
  v9.cardNoRoleButton = cards.every(function (card) { return card.props.role === undefined && card.props.tabIndex === undefined })
  v9.cardHitOverlay = cards.every(function (card) {
    return (card.children || []).some(function (child) {
      return child && child.props && String(child.props.className || '').split(' ').indexOf('ap-card-hit') !== -1
    })
  })
  v9.cardNoNestedButtons = cards.every(function (card) { return !nestedButton(card.children, false) })
  v9.cardStarAndMore = cards.every(function (card) {
    const actions = (card.children || []).filter(function (child) { return child && child.props && String(child.props.className || '').indexOf('ap-card-actions') !== -1 })[0]
    const buttons = actions ? (actions.children || []).filter(function (child) { return child && child.type === 'button' }) : []
    return buttons.length === 2 && buttons.some(function (b) { return String(b.props.className).indexOf('ap-card-star') !== -1 })
  })

  // P0-6: middle ellipsis keeps the file name; path is a copy button.
  const pathButton = findNodeDeep(viewTree, function (node) {
    return node.type === 'button' && node.props && node.props.className === 'ap-card-path'
  })
  v9.pathCopyButton = Boolean(pathButton) && String(pathButton.props.title).endsWith('.md') && pathButton.props['aria-label'].indexOf('复制路径') !== -1
  const ellipsed = testing.middleEllipsis('/Users/me/Documents/very/deep/folder/ui-design.md', 30)
  v9.middleEllipsis = ellipsed.indexOf('…') !== -1 && ellipsed.length <= 30 && ellipsed.endsWith('ui-design.md')
  v9.shortPathUntouched = testing.middleEllipsis('a.md', 30) === 'a.md'
  v9.sortFiles = testing.sortFiles([{ path: 'b.md', name: 'b.md', time: 1 }, { path: 'a.md', name: 'a.md', time: 2 }], 'time')[0].name === 'a.md'

  // P0-5: segmented controls expose aria-pressed.
  const segButtons = classNodes(viewTree, 'ap-seg-btn')
  v9.segAriaPressed = segButtons.length > 0 && segButtons.every(function (button) {
    return button.props['aria-pressed'] === 'true' || button.props['aria-pressed'] === 'false'
  })

  // P0-7: contrast floor, motion and type-size floors.
  const inheritVars = testing.themeVariables({ themeMode: 'inherit', accentColor: 'default' })
  const darkTokens = testing.THEME_TOKENS.dark
  v9.inheritSubtleContrast = typeof inheritVars['--ap-subtle'] === 'string' &&
    contrast(inheritVars['--ap-subtle'], darkTokens.surface) >= 4.5 &&
    contrast(inheritVars['--ap-muted'], darkTokens.surface) >= 4.5
  v9.reducedMotion = viewText.includes('@media (prefers-reduced-motion: reduce)')
  v9.hiddenOpacity = viewText.includes('.ap-card[data-hidden="true"]{opacity:.72')
  v9.minFontFloor = viewText.includes('max(11px,.82em)') && viewText.indexOf('font-size:.82em') === -1
  v9.actionsDiscoverable = viewText.includes('.ap-card-actions{') && viewText.indexOf('opacity:.4') !== -1

  // P0-3: the three states are structurally distinct and each has its actions.
  text.length = 0
  const emptyNewTree = testing.EmptyNew({ t: t, onSettings: function () {} })
  collect(emptyNewTree)
  const newText = text.join('\n')
  text.length = 0
  const emptyFilteredTree = testing.EmptyFiltered({
    t: t, chips: [{ key: 'filter', label: '类型：文档', onRemove: function () {} }],
    onClear: function () {}, onShowAll: function () {},
  })
  collect(emptyFilteredTree)
  const filteredText = text.join('\n')
  text.length = 0
  const errorStateTree = testing.ErrorState({
    t: t, title: '读取会话产物失败', body: '产物列表暂时读不到。', code: 'NO_SESSION',
    diagnostics: 'diag', onRetry: function () {},
  })
  collect(errorStateTree)
  const errorStateText = text.join('\n')
  v9.emptyNew = emptyNewTree.props['data-state'] === 'new' && newText.includes('这里会自动收集本轮产物') && newText.includes('看看会收集什么')
  v9.emptyFiltered = emptyFilteredTree.props['data-state'] === 'filtered' && filteredText.includes('当前筛选下没有产物') && filteredText.includes('类型：文档') && filteredText.includes('清空全部筛选')
  v9.chipRemovable = Boolean(findNodeDeep(emptyFilteredTree, function (node) {
    return node.type === 'button' && node.props && node.props.className === 'ap-chip-remove' && String(node.props['aria-label']).indexOf('移除筛选') !== -1
  }))
  v9.emptyError = errorStateTree.props['data-state'] === 'error' && errorStateText.includes('复制诊断信息') && errorStateText.includes('技术细节') && errorStateText.includes('错误码：NO_SESSION')
  const diag = testing.diagnosticsText({ fontScale: 1.5 }, 'NO_SESSION')
  v9.diagnosticsNoPaths = diag.indexOf('/Users') === -1 && diag.indexOf('/workspace') === -1 && diag.indexOf('.md') === -1 && diag.indexOf('NO_SESSION') !== -1

  // P0-8: first-run guide shows once and is remembered; settings has six groups.
  testing.setOnboardingSeen(false)
  const firstRun = renderView(null, {})
  testing.setOnboardingSeen(true)
  const secondRun = renderView(null, {})
  v9.onboardingFirstRun = firstRun.text.includes('第一次用产物面板？') && firstRun.text.includes('知道了') && firstRun.text.includes('去设置')
  v9.onboardingOnce = !secondRun.text.includes('第一次用产物面板？')
  v9.onboardingKey = testing.ONBOARDING_KEY === 'dsh-artifacts-panel.onboarded.v1' && testing.readOnboardingSeen() === true
  const groupTitles = ['字号与密度', '收录内容', '过滤噪音', '分组与子代理', '视图与悬浮条', '跨会话索引']
  v9.settingsSixGroups = classNodes(settingsTree, 'ap-settings-group').length === 6 &&
    classNodes(settingsTree, 'ap-settings-group-help').length >= 6 &&
    groupTitles.every(function (label) { return settingsText.includes(label) })
  v9.settingsSubheadings = settingsText.includes('配色主题') && settingsText.includes('分页')
  v9.settingsIndexDirRow = settingsText.includes('索引目录（可选）') && settingsText.includes('留空自动')
  v9.settingsRebuildRow = settingsText.includes('重建索引') && settingsText.includes('立即重建')
  v9.settingsPromptGuidanceNote = settingsText.includes('promptGuidance') && settingsText.includes('约 80 字')
  v9.settingsOnboardingRow = settingsText.includes('首次引导') && settingsText.includes('重新显示引导')
})()

// ---------------------------------------------------------------------------
// v11: final-reply Markdown (pure functions + real view, escape-first).
// ---------------------------------------------------------------------------
const v11 = {}
;(function markdownChecks() {
  const md = testing.renderMarkdownHtml
  const esc = testing.escapeHtml
  const longReply = '## 结论\n**粗体**、`code` 与 *斜体*，以及一段足够长的正文，避免被短回复过滤规则隐藏。'
  const html = md('## 结论\n\n**粗体**、*斜体*、~~删除~~ 与 `code`\n\n- 一\n- 二\n  - 嵌套\n\n1. 甲\n2. 乙\n\n> 引用\n\n[官网](https://example.com)\n\n---\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')
  v11.heading = html.indexOf('<h2 class="ap-md-h2">结论</h2>') !== -1 && html.indexOf('## ') === -1
  v11.emphasis = html.indexOf('<strong>粗体</strong>') !== -1 &&
    html.indexOf('<em>斜体</em>') !== -1 && html.indexOf('<del>删除</del>') !== -1
  v11.inlineCode = html.indexOf('<code class="ap-md-inline">code</code>') !== -1
  v11.unorderedList = html.indexOf('<ul class="ap-md-list"><li>一</li><li>二<ul class="ap-md-sublist"><li>嵌套</li></ul></li></ul>') !== -1
  v11.orderedList = html.indexOf('<ol class="ap-md-list"><li>甲</li><li>乙</li></ol>') !== -1
  v11.quote = html.indexOf('<blockquote class="ap-md-quote">') !== -1 && html.indexOf('引用') !== -1
  v11.link = html.indexOf('<a href="https://example.com" target="_blank" rel="noopener noreferrer">官网</a>') !== -1
  const bare = md('见 https://example.com。')
  v11.bareLink = bare.indexOf('<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>。') !== -1
  v11.hr = html.indexOf('<hr class="ap-md-hr">') !== -1
  v11.table = html.indexOf('<table class="ap-md-table">') !== -1 &&
    html.indexOf('<th class="ap-md-th">A</th>') !== -1 &&
    html.indexOf('<td class="ap-md-td">1</td>') !== -1
  v11.paragraphs = md('第一段\n\n第二段').split('<p class="ap-md-p">').length === 3
  const fence = md('```js\n<script>alert(1)</script>\n**不粗**\n```')
  v11.fencePreserved = fence.indexOf('<span class="ap-md-lang">js</span>') !== -1 &&
    fence.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') !== -1 &&
    fence.indexOf('**不粗**') !== -1 &&
    fence.indexOf('<strong>') === -1 && fence.indexOf('<script>') === -1
  const img = md('<img src=x onerror=alert(1)>')
  v11.xssTagNeutralized = img.indexOf('<img') === -1 &&
    img.indexOf('&lt;img src=x onerror=alert(1)&gt;') !== -1
  const badLink = md('[点我](javascript:alert(1))')
  v11.xssSchemeNeutralized = badLink.indexOf('<a ') === -1 && badLink.indexOf('href=') === -1 &&
    badLink.indexOf('javascript:') === -1 && badLink.indexOf('点我') !== -1
  const escaped = md('a < b & c "q"')
  v11.escapeOnce = escaped.indexOf('a &lt; b &amp; c &quot;q&quot;') !== -1 && escaped.indexOf('&amp;lt;') === -1
  v11.escapeHtmlPure = esc('<img onerror="x">') === '&lt;img onerror=&quot;x&quot;&gt;'
  v11.emptySafe = md('') === '' && md(null) === ''
  v11.settingsDefaultOn = testing.DEFAULT_SETTINGS.renderMarkdown === true
  v11.settingsLegacyOn = testing.normalizeSettings({ settingsVersion: 2, fontScale: 1.5 }).renderMarkdown === true
  v11.settingsOffHonored = testing.normalizeSettings({ settingsVersion: 2, renderMarkdown: false }).renderMarkdown === false
  v11.settingsVersionKept = testing.normalizeSettings({ settingsVersion: 2 }).settingsVersion === 2
  v11.manifestKeepsRaw = (function () {
    const out = testing.manifestText(t, 'session-x', [{ turn: 1, reply: '## 结论\n**粗体**', files: [] }], {})
    return out.indexOf('## 结论') !== -1 && out.indexOf('<h2') === -1
  })()
  const markdownFixture = {
    status: 'ready',
    turns: [{ turn: 1, startTime: 1, endTime: 2, reason: 'normal', files: [], reply: longReply }],
    team: { tasks: [], members: [] }, runs: [], children: [], sessions: {}, error: null, updatedAt: 1762960000000,
  }
  testing.setSettings({ renderMarkdown: false })
  const offRender = renderView(markdownFixture)
  const offNode = findNodeDeep(offRender.tree, function (node) {
    return node && node.props && String(node.props.className || '').indexOf('ap-reply-text') !== -1
  })
  v11.plainWhenOff = Boolean(offNode) && !offNode.props.dangerouslySetInnerHTML &&
    offRender.text.indexOf('## 结论') !== -1
  testing.resetSettings()
  const onRender = renderView(markdownFixture)
  const onNode = findNodeDeep(onRender.tree, function (node) {
    return node && node.props && String(node.props.className || '').indexOf('ap-reply-text') !== -1
  })
  v11.markdownWhenOn = Boolean(onNode) && Boolean(onNode.props.dangerouslySetInnerHTML) &&
    onNode.props.dangerouslySetInnerHTML.__html.indexOf('<h2 class="ap-md-h2">结论</h2>') !== -1 &&
    onNode.props.className.indexOf('ap-md') !== -1
})()

// ---------------------------------------------------------------------------
// v12: panel polish — adaptive content column, six-line clamp, and the
// "hidden by noise filters" explainer behind the top-bar count.
// ---------------------------------------------------------------------------
const v12 = {}
;(function polishChecks() {
  function classNodes(tree, cls) {
    const found = []
    walkDeep(tree, function (node) {
      const className = node.props && node.props.className
      if (typeof className === 'string' && className.split(' ').indexOf(cls) !== -1) found.push(node)
    })
    return found
  }
  function contrast(a, b) {
    function lum(value) {
      const raw = String(value).replace('#', '')
      const channels = [0, 2, 4].map(function (offset) {
        const v = parseInt(raw.slice(offset, offset + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const first = lum(a)
    const second = lum(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }
  const darkTokens = testing.THEME_TOKENS.dark
  const lightTokens = testing.THEME_TOKENS.light

  // 1. 内容列：48px 总边距、1040px 上限，1600 宽窗口不再只占左半屏。
  v12.contentWidthMath = testing.contentColumnWidth(1600) === 1040 &&
    testing.contentColumnWidth(1400) === 1040 &&
    testing.contentColumnWidth(900) === 852 &&
    testing.contentColumnWidth(500) === 452 &&
    testing.contentColumnWidth(20) === 0
  v12.contentWidthCss = viewText.includes('max-width:min(calc(100% - 48px),1040px)')
  v12.singleColumnGrid = viewText.includes('.ap-grid{display:grid;grid-template-columns:minmax(0,1fr)')

  // 2. 卡片四段网格（图标 / 正文 / 元信息 / 操作），正文限读 72ch。
  const cards = classNodes(viewTree, 'ap-card')
  v12.cardSegments = cards.length > 0 && cards.every(function (card) {
    const classes = (card.children || []).filter(function (child) { return child && child.props }).map(function (child) { return String(child.props.className || '') })
    return classes.some(function (name) { return name.indexOf('ap-card-icon') !== -1 }) &&
      classes.some(function (name) { return name.indexOf('ap-card-main') !== -1 }) &&
      classes.some(function (name) { return name.indexOf('ap-card-meta') !== -1 }) &&
      classes.some(function (name) { return name.indexOf('ap-card-actions') !== -1 })
  })
  v12.cardBodyReadable = viewText.includes('.ap-card-main{') && viewText.includes('max-width:72ch')
  v12.stickyTurnHead = viewText.includes('.ap-turn-head{position:sticky;top:0')

  // 3. 收起态：6 行 line-clamp，按钮在头部右侧，不再有渐隐遮罩。
  v12.replyClampCss = testing.REPLY_CLAMP_LINES === 6 &&
    viewText.includes('-webkit-line-clamp:var(--ap-reply-clamp,6)') &&
    viewText.indexOf('mask-image:linear-gradient(180deg,#000 72%') === -1
  const replyToggle = findNodeDeep(replyOnlyRender.tree, function (node) {
    return node.props && node.props['data-reply-toggle'] === 'true'
  })
  v12.replyToggleHeader = Boolean(replyToggle) && replyToggle.type === 'button' &&
    replyToggle.props['aria-expanded'] === 'false' &&
    String(replyToggle.props.className).indexOf('ap-reply-toggle') !== -1
  const clampedNode = findNodeDeep(replyOnlyRender.tree, function (node) {
    return node.props && node.props['data-clamped'] === 'true'
  })
  v12.replyClampAttr = Boolean(clampedNode) && clampedNode.props['data-clamp-lines'] === '6'

  // 4. 筛选说明：三类隐藏项各一组，逐条可恢复，恢复后计数归零。
  const hiddenTurns = [
    { turn: 41, reply: '收到。', files: [] },
    { turn: 42, reply: '总线无新消息，已处理到 #6401', files: [] },
    { turn: 43, reply: '这一轮只讨论方案，没有落盘文件，但回复本身足够长，不会被短回复规则命中。', files: [] },
  ]
  const hiddenSettings = {
    showReplies: true, showDocs: true, showImages: true, showFiles: true,
    hideShortReplies: true, shortReplyThreshold: 30,
    ignoreKeywords: '总线无新消息', hideTurnsWithoutArtifacts: true,
  }
  const hiddenSummary = testing.collectHiddenTurns(hiddenTurns, { settings: hiddenSettings })
  v12.hiddenThreeGroups = hiddenSummary.total === 3 &&
    hiddenSummary.groups.shortReply.length === 1 &&
    hiddenSummary.groups.keyword.length === 1 &&
    hiddenSummary.groups.noArtifacts.length === 1
  text.length = 0
  const popoverTree = testing.HiddenPopover({
    t: t, summary: hiddenSummary,
    onRestore: function () {}, onClear: function () {},
  })
  collect(popoverTree)
  const popoverText = text.join('\n')
  text.length = 0
  v12.hiddenPopoverGroups = ['短回复阈值', '关键字过滤', '无产物轮次'].every(function (label) {
    return popoverText.indexOf(label) !== -1
  }) && popoverText.indexOf('收到。') !== -1 && popoverText.indexOf('总线无新消息') !== -1 &&
    popoverText.indexOf('这一轮只讨论方案') !== -1 && popoverText.indexOf('恢复显示') !== -1
  const restoreButtons = classNodes(popoverTree, 'ap-hidden-restore')
  v12.hiddenPopoverRestore = restoreButtons.length === 3 && restoreButtons.every(function (button) {
    return button.type === 'button' && typeof button.props['data-hidden-restore'] === 'string'
  })
  const oneHidden = testing.collectHiddenTurns([hiddenTurns[0]], { settings: hiddenSettings })
  const restored = testing.collectHiddenTurns([hiddenTurns[0]], {
    settings: hiddenSettings, revealedTurns: new Set([41]),
  })
  v12.hiddenRestoreZero = oneHidden.total === 1 && oneHidden.groups.shortReply.length === 1 && restored.total === 0
  const hiddenEntry = findNodeDeep(viewTree, function (node) {
    return node.props && node.props['data-hidden-open'] !== undefined
  })
  v12.hiddenEntryButton = Boolean(hiddenEntry) && hiddenEntry.type === 'button' &&
    hiddenEntry.props['aria-haspopup'] === 'dialog' &&
    hiddenEntry.props['aria-expanded'] === 'false' &&
    hiddenEntry.props['aria-label'].indexOf('已筛选') !== -1
  v12.hiddenSnippet = testing.hiddenSnippet('a'.repeat(25), 20) === 'aaaaaaaaaaaaaaaaaaaa…' &&
    testing.hiddenSnippet('## 标题\n第二行', 20) === '标题'

  // 5. 深浅主题对比度（正文 ≥7:1，次要 ≥4.5:1）与键盘可达态。
  v12.contrastBody = contrast(darkTokens.text, darkTokens.bg) >= 7 &&
    contrast(darkTokens.text, darkTokens.surface) >= 7 &&
    contrast(lightTokens.text, lightTokens.bg) >= 7 &&
    contrast(lightTokens.text, lightTokens.surface) >= 7
  v12.contrastSecondary = contrast(darkTokens.muted, darkTokens.surface3) >= 4.5 &&
    contrast(darkTokens.subtle, darkTokens.surface3) >= 4.5 &&
    contrast(lightTokens.muted, lightTokens.surface3) >= 4.5 &&
    contrast(lightTokens.subtle, lightTokens.surface3) >= 4.5
  v12.focusVisible = viewText.includes('.ap-pop-row:focus-visible') &&
    viewText.includes('.ap-hidden-btn:focus-visible') &&
    viewText.includes('.ap-card-path:focus-visible')
  v12.spacingScale = viewText.includes('--ap-s1:.25em') &&
    viewText.includes('--ap-s3:.75em') &&
    viewText.includes('--ap-s6:1.5em')

  // 6. 骨架 / 无产物 / 筛选为空 / 索引失败四种文案各自独立，不共用“暂无”。
  const loadingRender = renderView({
    status: 'loading', turns: [], team: { tasks: [], members: [] }, runs: [],
    children: [], sessions: {}, error: null, updatedAt: 0,
  })
  v12.loadingCopy = loadingRender.text.indexOf('正在读取会话产物…') !== -1
  text.length = 0
  collect(testing.EmptyNew({ t: t, onSettings: function () {} }))
  const emptyNewCopy = text.join('\n')
  text.length = 0
  collect(testing.EmptyFiltered({ t: t, chips: [], onClear: function () {} }))
  const emptyFilteredCopy = text.join('\n')
  text.length = 0
  collect(testing.ErrorState({ t: t, title: '读取会话产物失败', body: '读不到。', code: 'NO_SESSION', diagnostics: '', onRetry: function () {} }))
  const emptyErrorCopy = text.join('\n')
  text.length = 0
  v12.emptyStateCopy = emptyNewCopy.indexOf('这里会自动收集本轮产物') !== -1 &&
    emptyFilteredCopy.indexOf('当前筛选下没有产物') !== -1 &&
    emptyErrorCopy.indexOf('读取会话产物失败') !== -1
})()

let lazyOk = false
if (loadButton) loadButton.props.onClick()
setImmediate(function () {
  v3.lazyFetchOnClick = Boolean(loadButton) && childCalls.length === 1 && childCalls[0] === 'm-1'
  v8.readIndexTypedRejection = readIndexRejection === 'WORKSPACE_FILES_UNAVAILABLE'
  // v10: the same-origin route reader parses JSON + ETag and maps the Host's
  // 404 marker to the typed missing state (never to a raw parse error).
  global.fetch = function (url) {
    if (String(url).indexOf('/missing') !== -1) {
      return Promise.resolve({
        status: 404, ok: false,
        headers: { get: function () { return 'application/json; charset=utf-8' } },
        text: function () { return Promise.resolve('{"error":"ARTIFACTS_INDEX_MISSING"}') },
      })
    }
    return Promise.resolve({
      status: 200, ok: true,
      headers: { get: function (name) {
        if (name === 'content-type') return 'application/json; charset=utf-8'
        if (name === 'etag') return '"v1"'
        return ''
      } },
      text: function () { return Promise.resolve('{"v":1,"sessions":{},"totals":{"sessions":0,"files":0,"turns":0}}') },
    })
  }
  Promise.all([
    testing.fetchIndexResource(testing.INDEX_ROUTE_PREFIX + '/index.json'),
    testing.fetchIndexResource(testing.INDEX_ROUTE_PREFIX + '/missing').then(function () { return 'RESOLVED' }, function (error) { return error && error.message ? String(error.message) : String(error) }),
  ]).then(function (results) {
    v8.routeFetch = Boolean(results[0]) && results[0].version === 'v1' && results[0].text.indexOf('"v":1') !== -1
    v8.routeMissing = results[1] === 'INDEX_MISSING'
  }, function () {
    v8.routeFetch = false
    v8.routeMissing = false
  }).then(finish, finish)
})

function finish() {
  const allChecks = Object.assign({}, checks, v3, v4, v5, v6, v7, v8, v9, v11, v12)
  const failures = Object.keys(allChecks).filter(key => !allChecks[key])
  console.log(JSON.stringify({
    moduleId: definition.id,
    inject: plugin.inject,
    registrations: Object.keys(registrations),
    viewSlot: { id: view.options.id, order: view.options.order, label: view.options.label() },
    settingsSlot: { id: settingsSection.options.id, order: settingsSection.options.order, label: settingsSection.options.label() },
    defaultFont: viewTree.props.style.fontSize,
    fontScale: 1.5,
    visibleTurns: 26,
    renderedTurns: 20,
    batch2: { checks: Object.keys(v4).length, overlaySlot: Boolean(overlay), galleryItems: galleryFixture.length },
    replyOnly: { checks: Object.keys(v5).length, visible: replyOnlyDefault.length, filtered: replyOnlyFiltered.length },
    theme: { checks: Object.keys(v6).length, modes: testing.THEME_MODES, accents: testing.ACCENT_CHOICES, hostMode: testing.hostThemeMode() },
    sidebarDock: {
      checks: Object.keys(v7).length,
      breakpoints: {
        twoColumn: testing.SIDEBAR_TWO_COLUMN_WIDTH,
        split: testing.SIDEBAR_SPLIT_WIDTH,
      },
      layouts: {
        narrow: testing.sidebarLayoutForWidth(400),
        wide: testing.sidebarLayoutForWidth(600),
        split: testing.sidebarLayoutForWidth(900),
      },
      autoOpenDefault: testing.DEFAULT_SETTINGS.autoOpenSidebar,
    },
    v3: {
      folds: { turns: turnFold.turns.length, tasks: taskFold.team.tasks.length, members: taskFold.team.members.length, runs: runFold.runs.length },
      dimensions: {
        turns: testing.resolveDimension(turnFold.team, turnFold.runs, 'auto'),
        tasks: testing.resolveDimension(taskFold.team, taskFold.runs, 'auto'),
        runs: testing.resolveDimension({ tasks: [] }, runFold.runs, 'auto'),
      },
      taskGroups: taskGroups.map(group => ({ key: group.key, rows: group.rows.length, childIds: group.childIds.length })),
      runGroups: runGroups.map(group => ({ key: group.key, rows: group.rows.length, members: group.members })),
      lazyChildCalls: childCalls,
    },
    indexService: { checks: Object.keys(v8).length, inject: plugin.inject },
    uiP0: { checks: Object.keys(v9).length, groups: 6 },
    markdown: { checks: Object.keys(v11).length, defaultOn: testing.DEFAULT_SETTINGS.renderMarkdown },
    polish: { checks: Object.keys(v12).length },
    checks: allChecks,
    failures,
  }, null, 2))
  if (failures.length > 0) process.exit(1)
}

#!/usr/bin/env node
/*
 * Interactive smoke test for the batch-2 client features (no browser required).
 *
 * tools/render-harness.cjs checks the first committed render and pure models.
 * It now also drives the UI P0 paths: filter popover, settings drawer, empty
 * state chips, copy-path toast and the one-time onboarding card.
 *
 * This sibling drives clicks with a minimal hook runtime: it opens the per-card
 * ⋯ menu, follows the official diff deep link with the matched file index,
 * calls reveal through the mocked Session Remote, switches to the image gallery,
 * opens and closes the lightbox, runs both export paths and clicks the floating
 * bar. Every external host call is mocked and asserted.
 *
 * Usage: node tools/interactive-harness.cjs
 * Prints INTERACTIVE_OK and exits 0 when every assertion passes.
 */
const fs = require('fs')
const path = require('path')
const panelDir = path.resolve(__dirname, '..')
const loadingPath = path.join(require('os').tmpdir(), 'dsh-artifacts-panel-interactive.cjs')
fs.writeFileSync(loadingPath, fs.readFileSync(path.join(panelDir, 'client.js'), 'utf8'))

let definition = null
const downloads = []
const openedResources = []
const openTabs = []
const openTabOptions = []
let sidebarExpanded = false
let activeSidebarTab
const toggleCalls = []
const hostCalls = []
const saveCalls = []
const clipboardWrites = []
global.Blob = class Blob { constructor(parts, opts) { this.parts = parts; this.type = (opts && opts.type) || '' } }
const URLImpl = global.URL
URLImpl.createObjectURL = function () { return 'blob:test/' + downloads.length }
URLImpl.revokeObjectURL = function () {}
global.URL = URLImpl
global.fetch = async function (input) {
  const url = String(input)
  if (url.indexOf('api/changes.summary') === 0) {
    return { ok: true, status: 200, json: async () => ({ turn: 2, total: 1, added: 3, deleted: 1, files: [{ path: '/ws/out/b.png', display: 'out/b.png', added: 3, deleted: 1 }] }) }
  }
  if (url.indexOf('api/session.markdown') === 0) {
    return { ok: true, status: 200, body: { cancel() { return Promise.resolve() } }, text: async () => '# full markdown' }
  }
  return { ok: false, status: 404, text: async () => '', json: async () => ({}) }
}
const state = { dirty: false, frames: new Map(), current: null, effectQueue: [], sequences: null }
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
  setTimeout(fn) { return 1 },
  addEventListener() {},
  removeEventListener() {},
}
global.navigator = { language: 'zh-CN', clipboard: { writeText(text) { clipboardWrites.push(String(text)); return Promise.resolve() }, write() { return Promise.resolve() } } }
global.document = {
  baseURI: 'http://127.0.0.1:51732/',
  visibilityState: 'visible',
  createElement(tag) { return { tag: tag, href: '', download: '', click() { downloads.push({ href: this.href, download: this.download }) } } },
}

function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(Infinity).filter(c => c !== undefined && c !== null && c !== false) }
}
function frameFor(key, type) {
  let frame = state.frames.get(key)
  if (!frame) {
    frame = { key: key, type: type, states: [], effects: [], index: 0, lastRun: [], childCount: 0 }
    state.frames.set(key, frame)
  }
  return frame
}
function topFrame() { return state.current }
function useState(initial) {
  const frame = topFrame()
  const index = frame.index++
  if (!frame.states[index]) {
    frame.states[index] = { value: typeof initial === 'function' ? initial() : initial }
  }
  const slot = frame.states[index]
  const setter = function (next) {
    const value = typeof next === 'function' ? next(slot.value) : next
    if (Object.is(value, slot.value)) return
    slot.value = value
    state.dirty = true
  }
  return [slot.value, setter]
}
function useMemo(fn, deps) { return fn() }
function useRef(value) {
  const frame = topFrame()
  const index = frame.index++
  if (!frame.refs) frame.refs = []
  if (!frame.refs[index]) frame.refs[index] = { current: value }
  return frame.refs[index]
}
function useCallback(fn) { return fn }
function useEffect(fn, deps) {
  const frame = topFrame()
  const index = frame.index++
  const previous = frame.effects[index]
  const changed = !previous || !deps || !previous.deps || deps.some((d, i) => !Object.is(d, previous.deps[i])) || deps.length !== previous.deps.length
  frame.effects[index] = { fn: fn, deps: deps, cleanup: changed && previous ? previous.cleanup : (previous ? previous.cleanup : undefined) }
  if (changed) state.effectQueue.push({ frame: frame, index: index, fn: fn })
}
const React = { createElement, useState, useMemo, useRef, useCallback, useEffect }
function renderNode(node, parentFrame) {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) return node.map(child => renderNode(child, parentFrame))
  if (typeof node === 'string' || typeof node === 'number') return node
  const typeName = typeof node.type === 'function' ? (node.type.name || 'anon') : String(node.type)
  if (typeof node.type === 'function') {
    const branch = parentFrame ? parentFrame.key : 'root'
    const key = branch + '/' + typeName + '#' + (parentFrame ? parentFrame.childCount++ : 0)
    const childFrame = frameFor(key, node.type)
    childFrame.index = 0
    childFrame.childCount = 0
    const parent = state.current
    state.current = childFrame
    const rendered = node.type(Object.assign({}, node.props, { children: node.children }))
    state.current = parent
    return { __frame: childFrame, node: renderNode(rendered, childFrame) }
  }
  return { type: node.type, props: node.props, children: (node.children || []).map(child => renderNode(child, parentFrame)) }
}
function runEffects() {
  const queue = state.effectQueue
  state.effectQueue = []
  for (const entry of queue) {
    const previous = entry.frame.lastRun[entry.index]
    if (previous && typeof previous.cleanup === 'function') previous.cleanup()
    const cleanup = entry.fn()
    entry.frame.lastRun[entry.index] = { cleanup: cleanup }
  }
}
function flatten(tree, out) {
  if (tree === null || tree === undefined || tree === false) return
  if (Array.isArray(tree)) { tree.forEach(child => flatten(child, out)); return }
  if (typeof tree !== 'object') return
  if (tree.__frame) { out.push(tree); flatten(tree.node, out); return }
  out.push(tree)
  if (tree.children) tree.children.forEach(child => flatten(child, out))
}
async function mount(makeTree) {
  let guard = 0
  while (guard < 60) {
    guard += 1
    state.dirty = false
    state.effectQueue = []
    const rootFrame = frameFor('root', null)
    rootFrame.index = 0
    rootFrame.childCount = 0
    state.current = rootFrame
    const tree = makeTree()
    const rendered = renderNode(tree, rootFrame)
    runEffects()
    // let promise-based effects settle, then rerender if they set state
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))
    state.tree = rendered
    if (!state.dirty) break
  }
  return state.tree
}
function nodes(pred) {
  const out = []
  flatten(state.tree, out)
  return out.filter(node => node.props && pred(node.props, node))
}
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.__frame) return textOf(node.node)
  // Markdown replies render into dangerouslySetInnerHTML; include their HTML
  // so text assertions keep seeing the reply copy.
  if (node.props && node.props.dangerouslySetInnerHTML && typeof node.props.dangerouslySetInnerHTML.__html === 'string') {
    return node.props.dangerouslySetInnerHTML.__html
  }
  if (node.children) return node.children.map(textOf).join('')
  if (node.props && node.props.children) return textOf(node.props.children)
  return ''
}
function descendants(node, out) {
  out = out || []
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { node.forEach(child => descendants(child, out)); return out }
  if (typeof node !== 'object') return out
  if (node.__frame) return descendants(node.node, out)
  out.push(node)
  if (node.children) node.children.forEach(child => descendants(child, out))
  return out
}
function clickNode(node) {
  if (!node || !node.props || typeof node.props.onClick !== 'function') throw new Error('node has no onClick')
  node.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: node, target: node })
}
async function flush(makeTree) { return mount(makeTree) }

require(loadingPath)
const plugin = definition.factory(name => { if (name === 'react') return React; throw new Error('require ' + name) })
const testing = plugin.__testing

const registrations = {}
const mockCtx = {
  effect(fn) { return { dispose: fn() } },
  get(name) { return mockCtx.services[name] },
  services: {
    uiWorkspace: { selection: { getSnapshot() { return { sessionId: 'session-test' } }, subscribe() { return () => {} } } },
    sidebarRightTabs: { get(kind) { return kind === 'changes-review' ? { kind: 'changes-review' } : undefined } },
    fileActions: { canSaveAs: true, save(source, mode) { saveCalls.push({ mode: mode, source: source }); return Promise.resolve({ status: 'requested' }) } },
    sessionLogDownload: { download(sessionId) { hostCalls.push(['zip', sessionId]); return Promise.resolve() } },
  },
  locale: {
    register(ns, dicts) { mockCtx.dicts = dicts; return () => {} },
    bind() { return (key, params) => { let text = (mockCtx.dicts.zh && mockCtx.dicts.zh[key]) || key; if (params) text = text.replace(/\{(\w+)\}/g, (m, k) => params[k] !== undefined ? String(params[k]) : m); return text } },
  },
  sessions: { list: { getSnapshot() { return { byId: {} } } } },
  slots: { inject(_owner, callback) { callback() }, register(options, component) { registrations[options.name] = { options, component }; return () => {} } },
  remote: {
    session: {
      events(request) {
        return Promise.resolve({ records: FIXTURE_RECORDS, hasMore: false, cursor: 0 })
      },
      canOpenWorkspacePath() { return Promise.resolve({ ok: true, value: true }) },
      openWorkspacePath(request) { hostCalls.push(['openPath', request]); return Promise.resolve({ ok: true, value: { opened: true } }) },
    },
    workspaceFiles: { readBytes() { return Promise.resolve({ ok: true, value: { data: [1, 2, 3] } }) } },
  },
  sidebarRight: {
    openResource(address, options) { openedResources.push({ address: address, options: options }) },
    openTab(kind, options) { openTabs.push(kind); openTabOptions.push(options) },
    isExpanded() { return sidebarExpanded },
    toggleExpanded() { toggleCalls.push('toggleExpanded'); sidebarExpanded = !sidebarExpanded },
    active() { return activeSidebarTab },
    float() {}, commandTarget() { return null }, toggleFullscreen() {}, split() { return 'p2' },
  },
  sidebarRightTabs: { register(def) { mockCtx.tabType = def; return () => {} } },
  uiWorkspace: { openSession() {} },
}
const cwd = '/ws'
function ev(seq, type, time, data) { return { event: { seq: seq, type: type, time: time, data: data } } }
const FIXTURE_RECORDS = [
  ev(1, 'turn/start', 1000, { turn: 1 }),
  ev(2, 'deliverables/presented', 1100, { turn: 1, files: [{ path: '/ws/out/a.png', description: '图 A' }] }),
  ev(3, 'assistant/message', 1200, { turn: 1, message: { content: [{ type: 'text', text: '第一轮完成' }] } }),
  ev(4, 'turn/end', 1300, { turn: 1, reason: { kind: 'normal' } }),
  ev(5, 'turn/start', 2000, { turn: 2 }),
  ev(6, 'deliverables/presented', 2100, { turn: 2, files: [{ path: '/ws/out/b.png', description: '图 B' }] }),
  ev(7, 'assistant/message', 2200, { turn: 2, message: { content: [{ type: 'text', text: '第二轮完成' }] } }),
  ev(8, 'turn/end', 2300, { turn: 2, reason: { kind: 'normal' } }),
  ev(9, 'workspace/changes', 2400, { turn: 2 }),
  ev(10, 'turn/start', 3000, { turn: 3 }),
  ev(11, 'deliverables/presented', 3100, { turn: 3, files: [{ path: '/ws/out/report.md', description: '报告' }] }),
  ev(12, 'turn/end', 3200, { turn: 3, reason: { kind: 'normal' } }),
  // Reply-only turn: a final reply with no file artifact. It must stay visible
  // by default and disappear only when "只看有产物" is switched on.
  ev(13, 'turn/start', 4000, { turn: 4 }),
  ev(14, 'assistant/message', 4100, { turn: 4, message: { content: [{ type: 'text', text: '第四轮只写结论，没有落盘文件；这类只有回复的轮次默认也要显示出来。' }] } }),
  ev(15, 'turn/end', 4200, { turn: 4, reason: { kind: 'normal' } }),
]
plugin.apply(mockCtx)
const t = mockCtx.locale.bind('artifacts')
const view = registrations['conversation.view']
const overlay = registrations['shell.overlay']
const viewInjected = view.options.inject('session-test')
const baseProps = Object.assign({}, viewInjected, { t: t })

async function main() {
  let tree = await mount(() => view.component(baseProps))
  // Reply-only turns: visible by default with the "无产物" badge, filtered only
  // after the toolbar toggle "只看有产物" is switched on.
  if (textOf(tree).indexOf('第 4 轮') === -1) throw new Error('reply-only turn missing by default')
  if (textOf(tree).indexOf('无产物') === -1) throw new Error('no-artifact badge missing by default')
  // The old eye toggle moved into the filter popover (UI P0-1).
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  await mount(() => view.component(baseProps))
  function onlyArtifactsRow() {
    return nodes((props, node) => props.className === 'ap-pop-row' && textOf(node).indexOf('只看有产物') !== -1)[0]
  }
  const onlyArtifacts = onlyArtifactsRow()
  if (!onlyArtifacts) throw new Error('only-artifacts row missing')
  clickNode(onlyArtifacts)
  tree = await mount(() => view.component(baseProps))
  if (textOf(tree).indexOf('第 4 轮') !== -1) throw new Error('only-artifacts toggle did not filter the reply-only turn')
  // The top-bar count is now an explainable entry: one hidden turn, grouped by
  // the no-artifact rule, restorable on its own.
  const hiddenCountBtn = nodes(props => props['data-hidden-open'] !== undefined)[0]
  if (!hiddenCountBtn || textOf(hiddenCountBtn).indexOf('已筛选 1 项') === -1) throw new Error('hidden count button missing')
  clickNode(hiddenCountBtn)
  tree = await mount(() => view.component(baseProps))
  if (!nodes(props => props['data-hidden-pop'] === 'true')[0]) throw new Error('hidden popover did not open')
  if (textOf(tree).indexOf('无产物轮次') === -1) throw new Error('hidden popover did not group the no-artifact turn')
  const hiddenRestore = nodes(props => props['data-hidden-restore'] !== undefined)[0]
  if (!hiddenRestore) throw new Error('hidden popover restore button missing')
  clickNode(hiddenRestore)
  tree = await mount(() => view.component(baseProps))
  if (nodes(props => props['data-hidden-open'] !== undefined).length !== 0) throw new Error('hidden count did not clear after restoring the only item')
  if (textOf(tree).indexOf('第 4 轮') === -1) throw new Error('restoring a hidden turn did not show it')
  // Reopen the filter popover for the existing toggle-off step.
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  tree = await mount(() => view.component(baseProps))
  clickNode(onlyArtifactsRow())
  tree = await mount(() => view.component(baseProps))
  if (textOf(tree).indexOf('第 4 轮') === -1) throw new Error('only-artifacts toggle did not restore the reply-only turn')
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  tree = await mount(() => view.component(baseProps))
  if (nodes(props => props.className === 'ap-pop').length !== 0) throw new Error('filter popover did not close after the early toggle test')
  console.log('reply-only toggle: ok')
  const menuButtons = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-card-more') !== -1)
  console.log('card menu buttons:', menuButtons.length)
  if (menuButtons.length === 0) throw new Error('no card menu button')
  function cardMenuButton(path) {
    const card = nodes(props => typeof props.className === 'string' && props.className.split(' ').indexOf('ap-card') !== -1 && props.title === path)[0]
    if (!card) throw new Error('card not found: ' + path)
    const all = descendants(card)
    return all.filter(node => node.props && typeof node.props.className === 'string' && node.props.className.indexOf('ap-card-more') !== -1)[0]
  }
  clickNode(cardMenuButton('/ws/out/b.png'))
  await mount(() => view.component(baseProps))
  let labels = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-card-menu-item') !== -1)
  console.log('menu items after open:', labels.map(textOf))
  if (labels.length < 2) throw new Error('menu items missing')
  const changeItem = labels.filter(node => textOf(node).indexOf('看改动') !== -1)[0]
  if (!changeItem) throw new Error('changes entry missing from menu')
  clickNode(changeItem)
  await mount(() => view.component(baseProps))
  console.log('opened resources:', JSON.stringify(openedResources))
  const review = openedResources.filter(item => item.address.indexOf('changes-review') !== -1)[0]
  if (!review || review.address !== 'dsh-resource://changes-review/session/session-test/9/2' || !review.options || !review.options.params || review.options.params.index !== 0) {
    throw new Error('deep link mismatch')
  }
  // reveal via menu
  await mount(() => view.component(baseProps))
  clickNode(cardMenuButton('/ws/out/b.png'))
  await mount(() => view.component(baseProps))
  labels = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-card-menu-item') !== -1)
  const revealItem = labels.filter(node => textOf(node).indexOf('Finder') !== -1)[0]
  if (!revealItem) throw new Error('reveal entry missing')
  clickNode(revealItem)
  await mount(() => view.component(baseProps))
  console.log('host calls:', JSON.stringify(hostCalls))
  if (!hostCalls.some(call => call[0] === 'openPath' && call[1].action === 'reveal')) throw new Error('reveal not called')
  // download and save-as through the same menu
  clickNode(cardMenuButton('/ws/out/b.png'))
  await mount(() => view.component(baseProps))
  labels = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-card-menu-item') !== -1)
  clickNode(labels.filter(node => textOf(node) === '下载')[0])
  await mount(() => view.component(baseProps))
  console.log('save calls:', JSON.stringify(saveCalls.map(call => call.mode)))
  if (!saveCalls.some(call => call.mode === 'download' && typeof call.source.read === 'function')) throw new Error('download action missing')
  clickNode(cardMenuButton('/ws/out/b.png'))
  await mount(() => view.component(baseProps))
  labels = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-card-menu-item') !== -1)
  clickNode(labels.filter(node => textOf(node) === '另存为…')[0])
  await mount(() => view.component(baseProps))
  if (!saveCalls.some(call => call.mode === 'saveAs')) throw new Error('save-as action missing')
  // gallery: filter images then switch view
  const imageSeg = nodes((props, node) => typeof props.className === 'string' && props.className.indexOf('ap-seg-btn') !== -1 && textOf(node).indexOf('图片') === 0)[0]
  if (!imageSeg) throw new Error('image filter missing')
  clickNode(imageSeg)
  await mount(() => view.component(baseProps))
  // the list/gallery switch moved into the filter popover (UI P0-1)
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  await mount(() => view.component(baseProps))
  const gallerySeg = nodes((props, node) => typeof props.className === 'string' && props.className.indexOf('ap-seg-btn') !== -1 && textOf(node) === '画廊')[0]
  if (!gallerySeg) throw new Error('gallery toggle missing')
  clickNode(gallerySeg)
  await mount(() => view.component(baseProps))
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  await mount(() => view.component(baseProps))
  const thumbs = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-thumb') !== -1 && props.className.indexOf('ap-thumb-name') === -1)
  console.log('thumbs:', thumbs.length, 'imgs:', nodes(props => props.src && String(props.src).indexOf('api/file') !== -1).length)
  if (thumbs.length !== 2) throw new Error('gallery thumb count ' + thumbs.length)
  clickNode(thumbs[0])
  await mount(() => view.component(baseProps))
  const lightbox = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-lightbox') !== -1 && props.className.indexOf('ap-lightbox-') === -1)
  if (lightbox.length !== 1) throw new Error('lightbox missing')
  const next = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-lightbox-next') !== -1)[0]
  clickNode(next)
  await mount(() => view.component(baseProps))
  const caption = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-lightbox-caption') !== -1)[0]
  console.log('lightbox caption:', caption && textOf(caption))
  const closeBtn = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-lightbox-close') !== -1)[0]
  clickNode(closeBtn)
  await mount(() => view.component(baseProps))
  if (nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-lightbox') !== -1).length !== 0) throw new Error('lightbox did not close')
  // export entries live in the toolbar ⋯ menu now (single entry point)
  const moreToggle = nodes(props => props['aria-label'] === '更多面板操作')[0]
  if (!moreToggle) throw new Error('more menu toggle missing')
  clickNode(moreToggle)
  await mount(() => view.component(baseProps))
  const exportItems = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-menu-item') !== -1)
  console.log('export items:', exportItems.map(textOf).join(' | '))
  const zipItem = exportItems.filter(node => textOf(node).indexOf('ZIP') !== -1)[0]
  if (!zipItem) throw new Error('zip item missing')
  clickNode(zipItem)
  await mount(() => view.component(baseProps))
  console.log('zip calls:', JSON.stringify(hostCalls.filter(call => call[0] === 'zip')))
  if (!hostCalls.some(call => call[0] === 'zip' && call[1] === 'session-test')) throw new Error('zip not requested')
  // copy full markdown through the same ⋯ menu
  clickNode(nodes(props => props['aria-label'] === '更多面板操作')[0])
  await mount(() => view.component(baseProps))
  const copyItem = nodes(props => typeof props.className === 'string' && props.className.indexOf('ap-menu-item') !== -1).filter(node => textOf(node).indexOf('复制全文 Markdown') !== -1)[0]
  if (!copyItem) throw new Error('copy markdown item missing')
  clickNode(copyItem)
  await mount(() => view.component(baseProps))
  console.log('clipboard writes:', clipboardWrites.length, JSON.stringify(clipboardWrites[0]))
  if (clipboardWrites[0] !== '# full markdown') throw new Error('copy markdown did not write the transcript')
  // settings entry is in the same menu and opens the embedded drawer
  clickNode(nodes(props => props['aria-label'] === '更多面板操作')[0])
  await mount(() => view.component(baseProps))
  clickNode(nodes(props => props.className === 'ap-menu-item' && props['data-more-action'] === 'settings')[0])
  await mount(() => view.component(baseProps))
  if (!nodes(props => props.className === 'ap-drawer')[0]) throw new Error('settings drawer missing')
  // floating bar
  // Auto-open (setting on) opens the artifacts tab only once per conversation
  // and only while the column is collapsed.
  testing.setSettings({ autoOpenSidebar: true })
  sidebarExpanded = false
  const tabsBeforeAuto = openTabs.length
  await mount(() => overlay.component(Object.assign({}, overlay.options.inject(), { t: t })))
  console.log('auto-open tabs:', openTabs.slice(tabsBeforeAuto), JSON.stringify(openTabOptions[openTabOptions.length - 1]))
  if (openTabs.length !== tabsBeforeAuto + 1 || openTabs[openTabs.length - 1] !== 'artifacts') throw new Error('auto-open did not open the artifacts tab once')
  if (!openTabOptions[openTabOptions.length - 1] || openTabOptions[openTabOptions.length - 1].revealIfOpened !== true) throw new Error('auto-open did not reveal an already-open artifacts tab')
  await mount(() => overlay.component(Object.assign({}, overlay.options.inject(), { t: t })))
  if (openTabs.length !== tabsBeforeAuto + 1) throw new Error('auto-open repeated for the same conversation')
  testing.setSettings({ autoOpenSidebar: false })
  await mount(() => overlay.component(Object.assign({}, overlay.options.inject(), { t: t })))
  const dockMain = nodes(props => typeof props.className === 'string' && props.className === 'ap-dock-main')[0]
  if (!dockMain) throw new Error('dock missing')
  sidebarExpanded = false
  const togglesBeforeDock = toggleCalls.length
  clickNode(dockMain)
  await mount(() => overlay.component(Object.assign({}, overlay.options.inject(), { t: t })))
  console.log('open tabs:', JSON.stringify(openTabs))
  if (openTabs[openTabs.length - 1] !== 'artifacts') throw new Error('dock openTab wrong')
  if (toggleCalls.length !== togglesBeforeDock + 1) throw new Error('dock did not expand the collapsed column')
  clickNode(nodes(props => typeof props.className === 'string' && props.className === 'ap-dock-close')[0])
  await mount(() => overlay.component(Object.assign({}, overlay.options.inject(), { t: t })))
  if (nodes(props => typeof props.className === 'string' && props.className === 'ap-dock').length !== 0) throw new Error('dock did not close')
  // toolbar entry: "open in sidebar" flips to "collapse" while the artifacts
  // tab is the expanded pane, and clicking it collapses the column.
  sidebarExpanded = true
  activeSidebarTab = { id: 'tab-artifacts', kind: 'artifacts' }
  const twoStateProps = Object.assign({}, baseProps, {
    probeSidebar: function () { return { expanded: sidebarExpanded, artifactsActive: Boolean(activeSidebarTab && activeSidebarTab.kind === 'artifacts') } },
  })
  tree = await mount(() => view.component(twoStateProps))
  if (textOf(tree).indexOf('收起右栏') === -1) throw new Error('toolbar did not switch to the collapse label')
  const collapseBtn = nodes(props => props['aria-label'] === '收起右栏')[0]
  if (!collapseBtn) throw new Error('collapse button missing')
  clickNode(collapseBtn)
  if (sidebarExpanded !== false) throw new Error('collapse button did not toggle the column')
  tree = await mount(() => view.component(twoStateProps))
  if (textOf(tree).indexOf('在右侧栏打开') === -1) throw new Error('toolbar did not return to the open label')
  console.log('toolbar two-state: ok')
  activeSidebarTab = undefined
  // ------------------------------------------------------------------
  // UI P0 interaction checks
  // ------------------------------------------------------------------
  if (!nodes(props => props.className === 'ap-drawer')[0]) throw new Error('settings drawer missing after menu entry')
  if (textOf(tree).indexOf('字号与密度') === -1) throw new Error('settings drawer content missing')
  clickNode(nodes(props => props.className === 'ap-iconbtn ap-drawer-close')[0])
  tree = await mount(() => view.component(baseProps))
  if (nodes(props => props.className === 'ap-drawer').length !== 0) throw new Error('drawer close button did not close')
  // gear opens the same drawer; the backdrop click closes it
  clickNode(nodes(props => props['data-settings-open'] === 'true')[0])
  tree = await mount(() => view.component(baseProps))
  if (!nodes(props => props.className === 'ap-drawer')[0]) throw new Error('gear did not open the drawer')
  clickNode(nodes(props => props.className === 'ap-drawer-backdrop')[0])
  tree = await mount(() => view.component(baseProps))
  if (nodes(props => props.className === 'ap-drawer').length !== 0) throw new Error('drawer backdrop did not close')
  console.log('settings drawer: ok')

  // filter popover: opens from the toolbar, hides reply-only turns via the
  // merged "只看有产物" row, and closes again from the same button.
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  tree = await mount(() => view.component(baseProps))
  if (textOf(tree).indexOf('筛选与视图') === -1) throw new Error('filter popover missing')
  const filterRows = nodes((props, node) => props.className === 'ap-pop-row' && textOf(node).indexOf('只看有产物') !== -1)
  if (!filterRows[0]) throw new Error('only-artifacts row missing from popover')
  clickNode(filterRows[0])
  tree = await mount(() => view.component(baseProps))
  if (textOf(tree).indexOf('第 4 轮') !== -1) throw new Error('popover toggle did not filter the reply-only turn')
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  tree = await mount(() => view.component(baseProps))
  if (nodes(props => props.className === 'ap-pop').length !== 0) throw new Error('filter popover did not close')
  console.log('filter popover: ok')

  // empty-filtered state: an unmatched search renders the removable chip and
  // removing it restores the list.
  clickNode(nodes(props => props['data-filter-open'] !== undefined)[0])
  tree = await mount(() => view.component(baseProps))
  const onlyArtifactsRowAgain = nodes((props, node) => props.className === 'ap-pop-row' && textOf(node).indexOf('只看有产物') !== -1)[0]
  clickNode(onlyArtifactsRowAgain)
  tree = await mount(() => view.component(baseProps))
  const searchInput = nodes(props => props.type === 'search')[0]
  searchInput.props.onChange({ target: { value: 'zzzz-no-match' } })
  tree = await mount(() => view.component(baseProps))
  if (!nodes(props => props['data-state'] === 'filtered')[0]) throw new Error('EmptyFiltered state missing')
  if (textOf(tree).indexOf('搜索：zzzz-no-match') === -1) throw new Error('empty-filtered chip missing')
  // Remove every active chip (the earlier gallery test left the image filter
  // on), then the list must come back.
  let chipGuard = 0
  while (nodes(props => props.className === 'ap-chip-remove').length > 0 && chipGuard < 6) {
    clickNode(nodes(props => props.className === 'ap-chip-remove')[0])
    tree = await mount(() => view.component(baseProps))
    chipGuard += 1
  }
  if (nodes(props => props['data-state'] === 'filtered').length !== 0) throw new Error('chip removal did not clear the filter')
  if (textOf(tree).indexOf('第 1 轮') === -1) throw new Error('chip removal did not restore the list')
  console.log('empty filtered chips: ok')

  // copy path: clicking the card path copies the full path and toasts.
  const pathButton = nodes(props => props.className === 'ap-card-path')[0]
  if (!pathButton) throw new Error('card path button missing')
  const fullPath = pathButton.props.title
  const copiedBefore = clipboardWrites.length
  clickNode(pathButton)
  tree = await mount(() => view.component(baseProps))
  if (clipboardWrites.length !== copiedBefore + 1 || clipboardWrites[clipboardWrites.length - 1] !== fullPath) throw new Error('path copy did not write the full path')
  if (textOf(tree).indexOf('路径已复制') === -1) throw new Error('path copy toast missing')
  console.log('copy path: ok')

  // first-run guide: shown on a fresh machine, dismissed once, then gone.
  if (textOf(tree).indexOf('第一次用产物面板？') === -1) throw new Error('first-run guide missing')
  clickNode(nodes(props => props['data-onboarding-action'] === 'dismiss')[0])
  tree = await mount(() => view.component(baseProps))
  if (textOf(tree).indexOf('第一次用产物面板？') !== -1) throw new Error('first-run guide did not stay dismissed')
  console.log('onboarding once: ok')

  console.log('INTERACTIVE_OK')
}
main().catch(error => { console.error('FAILED', error && error.stack || error); process.exit(1) })

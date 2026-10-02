import { readFileSync } from 'node:fs'
import { React, ReactDOMServer } from './support.mjs'

const ready = {
  status: 'ready',
  error: null,
  knowledge: [{ filePath: '/home/.dsh/knowledge/2026-10.md', month: '2026-10', messageId: 'k1', title: '已提升的结论', time: '2026-10-01 10:43', line: 3 }],
  groups: [{
    id: 'ws1', title: 'DeepseekHarness', path: '/Users/xiangyingpang/Documents/DeepseekHarness',
    sessions: [{
      sessionId: 'session-x', title: '对话收藏与侧栏展示功能',
      filePath: '/Users/xiangyingpang/Documents/DeepseekHarness/.dsh-favorites/对话收藏与侧栏展示功能.md',
      items: [{ messageId: 'm1', name: '1. 对话收藏功能方案建议', time: '2026-09-30 16:09', tokens: { input: 1500, output: 18, total: 1518 }, pinned: true, inKnowledge: true, knowledgeFile: '/home/.dsh/knowledge/2026-10.md', line: 6 }],
    }],
  }],
}
// The fixture is chosen by each hook's own initial value, so adding a useState
// anywhere in the component can never shift the mapping (the old positional
// preset silently did exactly that).
function presetFor(initial) {
  if (initial instanceof Set) return new Set()
  if (typeof initial === 'string') return ''
  if (typeof initial === 'number') return 0
  if (initial === null || initial === false || initial === undefined) return initial
  if (typeof initial === 'object') {
    if ('groups' in initial) return ready
    if ('text' in initial) return { status: 'idle', text: '', error: null }
    if ('hits' in initial) return { status: 'idle', hits: [], error: null }
    if ('knowledge' in initial) return ready
  }
  return initial
}
const ReactShim = {
  ...React,
  useEffect: () => {},
  useLayoutEffect: () => {},
  // Values beyond the preset fall back to the hook's own initial state, so a
  // new useState anywhere in the component cannot silently shift the mapping.
  useState: (initial) => [presetFor(typeof initial === 'function' ? initial() : initial), () => {}],
  useSyncExternalStore: (_s, get) => get(),
}
let factory = null
globalThis.window = { __ModuleLoader__: { load: (r) => { factory = r.factory } } }
globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/document')
  ? { ok: true, markdown: '## 1. 演示小节 · 2026-09-30 16:09\n\n### User\n\n> 你好\n' }
  : { ok: true, workspaces: [] }) })
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } }
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', source)(globalThis.window, globalThis.document, globalThis.navigator)
const exports_ = factory((spec) => spec === 'react' ? ReactShim : {})
const registrations = []
const ctx = {
  get: (name) => ({ locale: { register: () => () => {}, getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
    sidebarRight: { mounted: { getSnapshot: () => 'session-x' }, openResource: (a, o) => console.log('openResource', a, JSON.stringify(o)) },
    uiWorkspace: { openSession: (id) => console.log('openSession', id) } })[name],
  effect: (cb) => { cb(); return () => {} },
  slots: { inject: (n, cb) => { registrations.push([n, cb()]); return () => {} }, register: (r, c) => ({ registration: r, component: c }) },
}
exports_.apply(ctx)
const panel = registrations.find(([slot]) => slot === 'main')[1].component
const html = ReactDOMServer.renderToStaticMarkup(React.createElement(panel, {}))
console.log(html)

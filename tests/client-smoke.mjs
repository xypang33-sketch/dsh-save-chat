// Smoke test: evaluate the browser bundle in Node, apply it against a stub
// client context, and server-render every registered component.
import { readFileSync } from 'node:fs'
import { React, ReactDOMServer } from './support.mjs'


// SSR cannot run effects and has no server snapshot; both stand in for the
// browser behavior this smoke test only needs structurally.
const ReactShim = {
  ...React,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let factory = null
globalThis.window = {
  __ModuleLoader__: { load: ({ id, factory: f }) => { if (id !== 'dsh-save-chat') throw new Error('bad id ' + id); factory = f } },
  location: { reload() {} },
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } }
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, messageIds: [], workspaces: [] }) })

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', source)(globalThis.window, globalThis.document, globalThis.navigator)
if (factory === null) throw new Error('bundle did not register a factory')

const exports_ = factory((spec) => {
  if (spec === 'react') return ReactShim
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: ({ children }) => children }
  throw new Error('unexpected module request: ' + spec)
})
if (typeof exports_.apply !== 'function') throw new Error('factory returned no apply')
console.log('exports:', Object.keys(exports_), 'inject:', JSON.stringify(exports_.inject))

const registrations = []
const cleanups = []
const services = {
  locale: { register: () => () => {}, getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
  sidebarRight: { mounted: { getSnapshot: () => undefined }, openResource: () => {} },
  uiWorkspace: { openSession: () => {} },
}
const ctx = {
  get: (name) => services[name],
  effect: (cb) => { const dispose = cb(); cleanups.push(dispose); return () => {} },
  slots: {
    inject: (name, cb) => { registrations.push([name, cb()]); return () => {} },
    register: (registration, component) => ({ registration, component }),
  },
}
exports_.apply(ctx)
console.log('registrations:', registrations.map(([slot, entry]) => `${slot}:${entry.registration.id ?? entry.registration.key}`).join(', '))

for (const [slot, entry] of registrations) {
  const component = entry.component
  const props = slot === 'conversation.chat.assistant-actions'
    ? { messageId: 'm1', sessionId: 'session-test' }
    : { size: 18 }
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(component, props))
  console.log(`--- ${slot} (${entry.registration.id ?? entry.registration.key}) rendered ${html.length} chars`)
  console.log(html.slice(0, 260))
}
console.log('cleanups returned:', cleanups.filter(Boolean).length)

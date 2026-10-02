import { readFileSync } from 'node:fs'
import { React, ReactDOM, JSDOM } from './support.mjs'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://127.0.0.1:19387/' })
const { window } = dom
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'MouseEvent', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  globalThis[key] = window[key] ?? window
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false

const errors = []
window.addEventListener('error', (event) => errors.push(`window error: ${event.message}`))
const originalError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args) }

const catalog = { ok: true, workspaces: [{ id: 'ws', title: '演示工作区', path: '/w', sessions: [{ sessionId: 's', title: '会话', filePath: '/w/.dsh-favorites/a.md', items: [{ messageId: 'm1', name: '1. 条目', time: '2026-10-01 00:00', tokens: { input: 10, output: 2, total: 12 }, pinned: false, line: 5 }] }] }] }
globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/document') ? { ok: true, markdown: '## 1. 条目' } : catalog) })

let factory = null
globalThis.window.__ModuleLoader__ = { load: (registration) => { factory = registration.factory } }
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', source)(window, window.document, window.navigator)

const exports_ = factory((spec) => {
  if (spec === 'react') return React
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: ({ children }) => children, MarkdownText: ({ text }) => React.createElement('div', null, text) }
  throw new Error('unexpected ' + spec)
})
const registrations = []
const ctx = {
  get: () => undefined,
  effect: (cb) => { cb(); return () => {} },
  slots: { inject: (name, cb) => { registrations.push([name, cb()]); return () => {} }, register: (r, c) => ({ registration: r, component: c }) },
}
exports_.apply(ctx)
const panel = registrations.find(([slot]) => slot === 'main')[1].component

const root = ReactDOM.createRoot(window.document.getElementById('root'))
root.render(React.createElement(panel, {}))
await new Promise((resolve) => setTimeout(resolve, 60))
const button = window.document.querySelector('.dshfav-item')
console.log('document 类型:', typeof globalThis.document, '| addEventListener:', typeof (globalThis.document && globalThis.document.addEventListener), '| window.document 同源:', globalThis.document === window.document)
console.log('找到条目按钮:', button !== null)
button.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await new Promise((resolve) => setTimeout(resolve, 50))
const menu = window.document.querySelector('.dshfav-menu')
console.log('菜单已渲染:', menu !== null)
console.log('菜单项:', [...window.document.querySelectorAll('.dshfav-menu-item')].map((el) => el.textContent))
console.log('--- 捕获到的错误 ---')
for (const error of errors.slice(0, 6)) console.log(error.slice(0, 600))

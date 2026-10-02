// Real-DOM test for the heart action — the plugin's primary entry point. It
// lives in the conversation action row, so the panel harness never renders it.
import { readFileSync } from 'node:fs'
import { React, ReactDOM, JSDOM } from './support.mjs'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://127.0.0.1:19387/' })
const { window } = dom
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'MouseEvent', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  globalThis[key] = window[key] ?? window
}
const errors = []
window.addEventListener('error', (event) => errors.push(`window error: ${event.message}`))
const originalError = console.error
console.error = (...args) => { const text = args.map(String).join(' '); if (!text.includes('not wrapped in act') && !text.includes('attachEvent')) errors.push(text); originalError(...args) }

const calls = []
let mode = 'ok'   // ok | stale-host
globalThis.fetch = async (url, init) => {
  const path = String(url).replace('http://127.0.0.1:19387', '')
  calls.push(`${init && init.method ? init.method : 'GET'} ${path} ${init && init.body ? init.body : ''}`)
  if (mode === 'stale-host') return { ok: false, status: 405, json: async () => ({}), text: async () => 'method not allowed' }
  const body = path.endsWith('/state') ? { messageIds: [], filePath: null } : { ok: true, favorited: true, filePath: '/w/.dsh-favorites/a.md' }
  return { ok: true, status: 200, json: async () => body }
}
let factory = null
window.__ModuleLoader__ = { load: (registration) => { factory = registration.factory } }
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', source)(window, window.document, window.navigator)
const exports_ = factory((spec) => {
  if (spec === 'react') return React
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: ({ children }) => children, MarkdownText: ({ text }) => React.createElement('div', { 'data-md': '1' }, text) }
  throw new Error('unexpected ' + spec)
})
const registrations = []
exports_.apply({
  get: () => undefined,
  effect: (cb) => { cb(); return () => {} },
  slots: { inject: (name, cb) => { registrations.push([name, cb()]); return () => {} }, register: (r, c) => ({ registration: r, component: c }) },
})
const entry = registrations.find(([slot]) => slot === 'conversation.chat.assistant-actions')
console.log('心形注册槽位:', entry ? entry[0] : '（缺失！）', '| id:', entry[1].registration.id, '| order:', entry[1].registration.order)
const Action = entry[1].component
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const root = ReactDOM.createRoot(window.document.getElementById('root'))
root.render(React.createElement(Action, { sessionId: 's', messageId: 'm1' }))
await tick()

const button = () => window.document.querySelector('.dshfav-action')
console.log('初始渲染:', button() !== null, '| aria-pressed:', button().getAttribute('aria-pressed'), '| 载入请求:', calls.filter((c) => c.includes('/state')).length)

// 1) 正常收藏
button().click()
await tick(80)
console.log('点击后 aria-pressed:', button().getAttribute('aria-pressed'))
console.log('收藏请求体:', calls.filter((c) => c.includes('/toggle')).slice(-1))

// 2) 宿主半未加载（页面还是旧版）：应给出提示，而不是裸 HTTP 码
mode = 'stale-host'
button().click()
await tick(80)
const failure = window.document.querySelector('.dshfav-failure')
console.log('405 时的提示:', failure ? failure.textContent : '（没有提示）')
// 失败后应回到点击前的状态（此前已成功收藏，所以仍是已收藏）
console.log('失败后回到点击前状态:', button().getAttribute('aria-pressed') === 'true')
const ok = window.document.querySelector('.dshfav-failure').textContent.includes('reload the page first')
console.log('提示是否为可操作信息:', ok)
console.log('--- 错误 ---', errors.length === 0 ? '无' : errors.slice(0, 2))

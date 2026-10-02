// Real-DOM smoke test: mount the panel, right-click a row, and exercise the
// menu actions. Effects run here, which SSR-only smoke tests never do.
import { readFileSync } from 'node:fs'
import { React, ReactDOM, JSDOM, loadModule } from './support.mjs'
const TL = loadModule('@testing-library/react')

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
console.error = (...args) => { const text = args.map(String).join(' '); if (!text.includes('not wrapped in act') && !text.includes('attachEvent') && !text.includes('confirm() method')) errors.push(text); originalError(...args) }

const calls = []
globalThis.fetch = async (url, init) => {
  calls.push(`${init && init.method ? init.method : 'GET'} ${String(url).replace('http://127.0.0.1:19387', '')} ${init && init.body ? init.body : ''}`)
  const body = String(url).endsWith('/document') ? { ok: true, markdown: '## 1. 条目' } : {
    ok: true,
    workspaces: [{ id: 'ws', title: '演示工作区', path: '/w', sessions: [{ sessionId: 's', title: '会话', filePath: '/w/.dsh-favorites/a.md', items: [
      { messageId: 'm1', name: '1. 条目一', time: '2026-10-01 00:00', tokens: { input: 10, output: 2, total: 12 }, pinned: false, line: 5 },
      { messageId: 'm2', name: '2. 条目二', time: '2026-10-01 00:05', tokens: null, pinned: true, line: 20 },
    ] }] }],
  }
  return { ok: true, status: 200, json: async () => body }
}
window.confirm = () => true

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
const pathCalls = []
const remote = { session: {
  canOpenWorkspacePath: async () => ({ ok: true, value: true }),
  openWorkspacePath: async (request) => { pathCalls.push(`${request.action} ${request.path}`); return { ok: true, value: { opened: true } } },
} }
exports_.apply({
  get: (name) => (name === 'remote' ? remote : undefined),
  effect: (cb) => { cb(); return () => {} },
  slots: { inject: (name, cb) => { registrations.push([name, cb()]); return () => {} }, register: (r, c) => ({ registration: r, component: c }) },
})
const panel = registrations.find(([slot]) => slot === 'main')[1].component
// Deliberately malformed catalog: sessions must be an array, so rendering throws.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, workspaces: [{ id: 'ws', title: '坏数据', path: '/w', sessions: null }] }) })
const root = ReactDOM.createRoot(window.document.getElementById('root'))
root.render(React.createElement(panel, {}))
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
await tick()

const rows = () => [...window.document.querySelectorAll('.dshfav-item')]
console.log('条目渲染:', rows().map((el) => el.textContent.trim()))
console.log('置顶标记:', window.document.querySelectorAll('.dshfav-pin').length)

console.log('边界内联错误行:', (window.document.querySelector('.dshfav-notice') || {}).textContent)
console.log('面板仍挂载:', window.document.querySelector('.dshfav-page') !== null)
process.exit(0)
rows()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
const menuItems = () => [...window.document.querySelectorAll('.dshfav-menu-item')]
console.log('菜单:', menuItems().map((el) => el.textContent))
console.log('组件仍在:', window.document.querySelector('.dshfav-page') !== null)

menuItems()[1].click()   // 重命名
await tick()
console.log('重命名输入框:', window.document.querySelector('.dshfav-rename') !== null)
const input = window.document.querySelector('.dshfav-rename')
TL.fireEvent.change(input, { target: { value: '改过的标题' } })
TL.fireEvent.keyDown(input, { key: 'Enter' })
await tick()
console.log('发送的请求:', calls.filter((call) => call.includes('/favorite')))

window.document.querySelectorAll('.dshfav-item')[1].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
console.log('已置顶项菜单:', menuItems().map((el) => el.textContent))
rows()[0].click()   // select the row: the reader (and its controls) appear only then
await tick()
console.log('右侧阅读区:', window.document.querySelector('.dshfav-reader') !== null, '| 整篇 md 已渲染:', window.document.querySelector('[data-md]') !== null)
const reveal = window.document.querySelector('.dshfav-reveal')
console.log('在文件夹中显示按钮:', reveal !== null, reveal ? reveal.textContent : '')
if (reveal !== null) { reveal.click(); await tick() }
console.log('路径操作:', pathCalls)

window.document.querySelectorAll('.dshfav-item')[1].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
menuItems()[2].click()   // 删除
await tick()
console.log('删除请求:', calls.filter((call) => call.includes('/favorite')).slice(-1))

await tick()
console.log('--- 错误 ---', errors.length === 0 ? '无' : errors.slice(0, 3))

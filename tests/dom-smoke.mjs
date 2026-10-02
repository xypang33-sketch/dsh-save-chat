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
  const body = String(url).endsWith('/search')
    ? { ok: true, hits: [{ id: 'cid1', messageId: 'm1', scope: 'knowledge', title: '沙箱结论', time: '2026-10-01 10:43', source: '/home/.dsh/knowledge/2026-10.md', lines: '4-22', snippet: '沙箱用的是 macOS seatbelt…', matches: 3, score: 2.4 }] }
    : String(url).endsWith('/reveal') ? { ok: true, revealed: true }
    : String(url).endsWith('/document') ? { ok: true, markdown: '## 1. 条目' } : {
    ok: true,
    knowledge: [
      { filePath: '/home/.dsh/knowledge/2026-10.md', month: '2026-10', messageId: 'k1', title: '十月的结论', time: '2026-10-01 10:43', line: 3 },
      { filePath: '/home/.dsh/knowledge/2026-10.md', month: '2026-10', messageId: 'k2', title: '十月第二条', time: '2026-10-01 11:00', line: 40 },
      { filePath: '/home/.dsh/knowledge/2026-09.md', month: '2026-09', messageId: 'k3', title: '九月的结论', time: '2026-09-20 09:00', line: 3 },
    ],
    workspaces: [{ id: 'ws', title: '演示工作区', path: '/w', sessions: [{ sessionId: 's', title: '会话', filePath: '/w/.dsh-favorites/a.md', items: [
      { messageId: 'm1', name: '1. 条目一', time: '2026-10-01 00:00', tokens: { input: 10, output: 2, total: 12 }, pinned: false, line: 5 },
      { messageId: 'm2', name: '2. 条目二', time: '2026-10-01 00:05', tokens: null, pinned: true, inKnowledge: true, knowledgeFile: '/home/.dsh/knowledge/2026-10.md', line: 20 },
    ] }] }],
  }
  return { ok: true, status: 200, json: async () => body }
}
window.confirm = () => true
const clipboard = []
Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (text) => { clipboard.push(text) } }, configurable: true })

let factory = null
window.__ModuleLoader__ = { load: (registration) => { factory = registration.factory } }
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'navigator', source)(window, window.document, window.navigator)
const exports_ = factory((spec) => {
  if (spec === 'react') return React
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: ({ children }) => children, MarkdownText: (props) => { globalThis.__mdProps = props; return React.createElement('div', { 'data-md': '1' }, props.text) } }
  throw new Error('unexpected ' + spec)
})
const registrations = []
const pathCalls = []
const remote = { session: {
  canOpenWorkspacePath: async () => ({ ok: true, value: true }),
  openWorkspacePath: async (request) => { pathCalls.push(`${request.action} ${request.path}`); return { ok: true, value: { opened: true } } },
} }
exports_.apply({
  get: (name) => (name === 'remote' ? (globalThis.__remote || remote) : undefined),
  effect: (cb) => { cb(); return () => {} },
  slots: { inject: (name, cb) => { registrations.push([name, cb()]); return () => {} }, register: (r, c) => ({ registration: r, component: c }) },
})
const panel = registrations.find(([slot]) => slot === 'main')[1].component
const root = ReactDOM.createRoot(window.document.getElementById('root'))
root.render(React.createElement(panel, {}))
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
await tick()

const rows = () => [...window.document.querySelectorAll('.dshfav-item')]
const menuItems = () => [...window.document.querySelectorAll('.dshfav-menu-item')]
const revealButton = () => [...window.document.querySelectorAll('.dshfav-reveal')].find((el) => el.textContent.includes('Reveal'))
const scopeButton = () => [...window.document.querySelectorAll('.dshfav-reveal')].find((el) => !el.textContent.includes('Reveal'))
const documents = () => calls.filter((call) => call.includes('/document')).slice(-1)

console.log('条目渲染:', rows().map((el) => el.textContent.trim()))
console.log('置顶标记:', window.document.querySelectorAll('.dshfav-pin').length)

// 1. right-click -> menu, panel must survive
rows()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
console.log('菜单:', menuItems().map((el) => el.textContent))
console.log('组件仍在:', window.document.querySelector('.dshfav-page') !== null)

// 2. rename entry point opens an inline editor
menuItems().find((el) => /Rename/.test(el.textContent)).click()
await tick()
console.log('重命名输入框:', window.document.querySelector('.dshfav-rename') !== null)

// 2b. a session row collapses its own list
const caret = () => window.document.querySelector('.dshfav-caret')
console.log('会话折叠加号:', caret() ? caret().textContent : '（缺）', '| 条目可见:', rows().length)
caret().click()
await tick()
console.log('收起后条目数:', rows().length, '| 加号:', caret().textContent)
caret().click()
await tick()
console.log('再展开条目数:', rows().length)

// 2c. knowledge base action from the menu
rows()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
console.log('菜单（未入知识库）:', menuItems().map((el) => el.textContent))
menuItems().find((el) => /knowledge base/.test(el.textContent)).click()
await tick()
console.log('加入知识库请求:', calls.filter((call) => call.includes('/knowledge')).slice(-1))
console.log('知识库星标数:', window.document.querySelectorAll('.dshfav-star').length)

// 2d. 复制引用（走 DSH 的 @path 语法）
rows()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
console.log('菜单含复制引用:', menuItems().map((el) => el.textContent))
menuItems().find((el) => /Copy reference/.test(el.textContent)).click()
await new Promise((resolve) => setTimeout(resolve, 40))
console.log('剪贴板内容:', clipboard)
console.log('提示文案:', (window.document.querySelector('.dshfav-flash') || {}).textContent)

// 3. select a row: reader + toolbar appear, default scope is the section
rows()[0].click()
await tick()
console.log('阅读区:', window.document.querySelector('.dshfav-reader') !== null, '| md 已渲染:', window.document.querySelector('[data-md]') !== null)
console.log('工具条:', [...window.document.querySelectorAll('.dshfav-reveal')].map((el) => el.textContent.trim()))
console.log('默认取小节:', documents())

// 3b. 关闭按钮：阅读区消失、列表回到整宽
window.document.querySelector('.dshfav-close').click()
await tick()
console.log('关闭后阅读区:', window.document.querySelector('.dshfav-reader') !== null, '| 列表整宽:', window.document.querySelector('.dshfav-tree-wide') !== null)
rows()[0].click()
await tick()

// 3c. 阅读区必须把本地图片路径交给 DSH 的文件媒体路由
const resolver = globalThis.__mdProps && globalThis.__mdProps.pathImages
console.log('pathImages 解析器存在:', typeof (resolver && resolver.resolve) === 'function')
console.log('相对路径不解析:', resolver.resolve('assets/x.png') === undefined)
console.log('绝对路径 ->', resolver.resolve('/w/.dsh-favorites/assets/ab.webp'))

// 4. expand to the whole document, then back
scopeButton().click()
await tick()
console.log('展开全文取整篇:', documents())
console.log('切换后工具条:', [...window.document.querySelectorAll('.dshfav-reveal')].map((el) => el.textContent.trim()))
scopeButton().click()
await tick()
console.log('收回只看该节:', documents())

// 5. reveal works
revealButton().click()
await tick()
console.log('路径操作:', calls.filter((call) => call.includes('/reveal')).slice(-1))

// 6. reveal failure surfaces a line, without losing the panel
// the host refuses this time: the toolbar must say so
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init) => (String(url).endsWith('/reveal')
  ? { ok: false, status: 502, json: async () => ({ ok: false, code: 'reveal-failed', error: 'no desktop' }) }
  : originalFetch(url, init))
revealButton().click()
await tick(120)
console.log('失败提示:', (window.document.querySelector('.dshfav-reveal-error') || {}).textContent)

// 6b. a Session row reads the whole file and keeps the scope control, disabled
window.document.querySelector('.dshfav-row').click()
await tick()
console.log('会话行选中 -> 工具条:', [...window.document.querySelectorAll('.dshfav-reveal')].map((el) => `${el.textContent.trim()}${el.disabled ? '(disabled)' : ''}`))
console.log('会话行取整篇:', documents())
console.log('会话行提示:', (window.document.querySelector('.dshfav-reveal[disabled]') || {}).title)

// 6c. the search box queries the host and opens a hit in the reader
const input = window.document.querySelector('.dshfav-search')
console.log('搜索框存在:', input !== null, '| 类型:', input && input.type)
const propsKey = Object.keys(input).find((key) => key.startsWith('__reactProps$'))
console.log('React props 键:', propsKey, '| onChange 存在:', propsKey ? typeof input[propsKey].onChange : 'n/a')
await TL.act(async () => {
  // jsdom + React 18 do not deliver a synthetic change from a dispatched input
  // event here, so drive the handler React actually installed.
  input[propsKey].onChange({ target: { value: '沙箱' } })
  await new Promise((resolve) => setTimeout(resolve, 1500))
})
console.log('面板文本:', (window.document.querySelector('.dshfav-page') || {}).textContent?.slice(0, 60))
console.log('搜索请求:', calls.filter((call) => call.includes('/search')).slice(-1))
console.log('命中条目:', [...window.document.querySelectorAll('.dshfav-hit')].map((el) => el.textContent.slice(0, 36)))
console.log('同节处数标记:', (window.document.querySelector('.dshfav-hit-matches') || {}).textContent)
console.log('作用域标签已移除:', window.document.querySelector('.dshfav-hit-scope') === null)
window.document.querySelector('.dshfav-hit').click()
await tick()
console.log('点击命中后文档请求:', calls.filter((call) => call.includes('/document')).slice(-1))

// clear the box: the tree must come back so the rest of the flow can run
await TL.act(async () => {
  window.document.querySelector('.dshfav-search')[Object.keys(window.document.querySelector('.dshfav-search')).find((key) => key.startsWith('__reactProps$'))].onChange({ target: { value: '' } })
  await new Promise((resolve) => setTimeout(resolve, 60))
})
console.log('清空后回到目录:', window.document.querySelectorAll('.dshfav-item').length)

// 6d. 视图切换：收藏 / 知识库，搜索范围随之改变
const switchButtons = () => [...window.document.querySelectorAll('.dshfav-switch-btn')]
console.log('视图按钮:', switchButtons().map((el) => el.textContent))
switchButtons().find((el) => /Knowledge/.test(el.textContent)).click()
await tick()
console.log('月份分组:', [...window.document.querySelectorAll('.dshfav-month-title')].map((el) => el.textContent))
console.log('AI 提示:', (window.document.querySelector('.dshfav-kb-hint') || {}).textContent)
console.log('知识库视图行:', [...window.document.querySelectorAll('.dshfav-item')].map((el) => el.textContent.trim()))
console.log('搜索占位符:', window.document.querySelector('.dshfav-search').placeholder)
await TL.act(async () => {
  const box = window.document.querySelector('.dshfav-search')
  box[Object.keys(box).find((key) => key.startsWith('__reactProps$'))].onChange({ target: { value: '已提升' } })
  await new Promise((resolve) => setTimeout(resolve, 120))
})
console.log('知识库视图的搜索范围:', calls.filter((call) => call.includes('/search')).slice(-1))
await TL.act(async () => {
  const box = window.document.querySelector('.dshfav-search')
  box[Object.keys(box).find((key) => key.startsWith('__reactProps$'))].onChange({ target: { value: '' } })
  await new Promise((resolve) => setTimeout(resolve, 120))
})
// 月份分组可折叠
window.document.querySelectorAll('.dshfav-month-head')[0].click()
await tick()
console.log('折叠十月后可见行:', [...window.document.querySelectorAll('.dshfav-item')].map((el) => el.textContent.trim()))
window.document.querySelectorAll('.dshfav-month-head')[0].click()
await tick()

// 知识库行的右键菜单
window.document.querySelector('.dshfav-item').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }))
await tick()
console.log('知识库行菜单:', menuItems().map((el) => el.textContent))
menuItems().find((el) => /Remove from knowledge/.test(el.textContent)).click()
await tick()
console.log('知识库移除请求:', calls.filter((call) => call.includes('save-chat/knowledge')).slice(-1))
switchButtons().find((el) => /Collections/.test(el.textContent)).click()
await tick()
console.log('回到收藏视图行数:', window.document.querySelectorAll('.dshfav-item').length, '| 占位符:', window.document.querySelector('.dshfav-search').placeholder)

// 7. pinned row offers Unpin, and Delete reaches the host
rows()[1].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
await tick()
console.log('已置顶项菜单:', menuItems().map((el) => el.textContent))
console.log('星标 tooltip:', (window.document.querySelector('.dshfav-star') || {}).title)
menuItems().find((el) => /Delete/.test(el.textContent)).click()
await tick()
console.log('删除请求:', calls.filter((call) => call.includes('/favorite')).slice(-1))
console.log('删除后组件仍在:', window.document.querySelector('.dshfav-page') !== null)
console.log('--- 错误 ---', errors.length === 0 ? '无' : errors.slice(0, 3))

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoriteState } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws3')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })

const imageTurn = [
  { type: 'turn/start', seq: 40, data: { turn: 4 } },
  { type: 'user/message', seq: 41, time: 4000, data: { role: 'user', source: { kind: 'user' }, content: [
    { type: 'text', text: '看看这张图' },
    { type: 'image', attachment: { attachmentId: 'sha256:7e9140cc97be9c360dc2a348ce102d00f15019446638e48c19e768a45290f706', mediaType: 'image/webp', width: 706, height: 94, bytes: 5418, name: 'image.png' } },
  ] } },
  { type: 'assistant/message', seq: 42, time: 4005, data: { turn: 4, message: { id: 'img1', role: 'assistant', content: [{ type: 'text', text: '收到，图里是工具栏。' }] } } },
]
const events = [
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我看一下\n\n## 我的小标题\n\n还有别的' }] } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '结论如下\n\n## 1. 名称冲突\n\n冲突说明\n\n```md\n## 这是代码块里的标题, 不该被改\n```\n\n### 细节\n\n更多' }] } } },
  ...imageTurn,
  { type: 'session/title', seq: 4, data: { title: '格式演示' } },
]
const ctx = {
  get: (name) => name === 'sessionQuery'
    ? { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    : undefined,
}
const out = await toggleFavorite(ctx, 's', 'm1')
console.log('created:', path.basename(out.filePath), '| title:', out.heading)
console.log('================ FILE ================')
console.log(fs.readFileSync(out.filePath, 'utf8'))
await toggleFavorite(ctx, 's', 'img1')
const file = fs.readFileSync(out.filePath, 'utf8')
console.log('================ 附件占位 ================')
for (const line of file.split('\n')) if (line.startsWith('_[')) console.log(line)
console.log('图片块是否被保留:', /_\[图片：image\.png · 706×94 · 5\.3 KB · image\/webp · sha256:7e9140cc…\]_/.test(file))
console.log('================ state ================', await favoriteState(ctx, 's'))

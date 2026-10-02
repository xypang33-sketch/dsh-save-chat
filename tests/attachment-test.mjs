// 附件保真：收藏时必须把图片字节复制到收藏目录，并在 md 里留下可显示的图片行
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, clearFavoritesCache } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws-attach')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex')
const SHA = 'ab'.repeat(32)
const attachment = { attachmentId: `sha256:${SHA}`, mediaType: 'image/png', width: 1, height: 1, bytes: PNG.length, name: 'shot.png' }

const events = [
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '看看这张图' }, { type: 'image', attachment }] } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '收到了。' }, { type: 'image', attachment }] } } },
  { type: 'session/title', seq: 4, data: { title: '附件演示' } },
]
let readImageCalls = 0
const ctx = {
  get: (name) => {
    if (name === 'sessionQuery') return { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    if (name === 'attachments') return {
      readImage: async (ref) => { readImageCalls += 1; return { ref, data: new Uint8Array(PNG) } },
      fileHostPath: () => undefined,
    }
    return undefined
  },
}
clearFavoritesCache()
const out = await toggleFavorite(ctx, 's', 'm1')
const file = fs.readFileSync(out.filePath, 'utf8')
const assets = path.join(cwd, '.dsh-favorites', 'assets')
const copied = fs.existsSync(assets) ? fs.readdirSync(assets) : []
console.log('图片字节调用次数:', readImageCalls)
console.log('复制出的资源:', copied)
console.log('资源字节与源一致:', copied.length === 1 && Buffer.compare(fs.readFileSync(path.join(assets, copied[0])), PNG) === 0)
console.log('md 里的图片行（用户侧与助手侧都应有）:')
for (const line of file.split('\n')) if (line.trim().startsWith('![')) console.log('   ', line.trim().slice(0, 90) + '…')
console.log('复制成功后不再有说明行:', !/图片：shot\.png/.test(file))
console.log('图片行用了绝对路径:', file.includes(path.join(assets, `${SHA}.png`)))

// 没有 attachments 服务时必须退化为只留说明，不能报错、不能丢信息（用另一轮，避免 toggle 语义干扰）
const events2 = [
  { type: 'turn/start', seq: 10, data: { turn: 2 } },
  { type: 'user/message', seq: 11, time: 2000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第二张图' }, { type: 'image', attachment }] } },
  { type: 'assistant/message', seq: 12, time: 2003, data: { turn: 2, message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: '好的。' }] } } },
]
const bareCwd = path.join(TMP, 'ws-attach-bare')
fs.rmSync(bareCwd, { recursive: true, force: true })
fs.mkdirSync(bareCwd, { recursive: true })
const bare = { get: (name) => (name === 'sessionQuery' ? { readSession: async () => ({ session: { id: 's2', cwd: bareCwd }, events: events2 }), listSessions: async () => [] } : undefined) }
const second = await toggleFavorite(bare, 's2', 'm2')
const secondText = fs.readFileSync(second.filePath, 'utf8')
console.log('无服务时退化为说明行:', !secondText.includes('![') && /图片：shot\.png/.test(secondText))
console.log('无服务时说明行含尺寸与 sha:', /1×1 · \d+ B · image\/png · sha256:abababab…/.test(secondText))
console.log('无服务时不复制字节:', !fs.existsSync(path.join(bareCwd, '.dsh-favorites', 'assets')))

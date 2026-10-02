// 加入知识库时必须：复制图片副本到知识库自己的 assets、改写路径、并写一段可见的图片摘要
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, addToKnowledge, knowledgeEntries, searchKnowledge, clearFavoritesCache } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws-kb-asset')
const home = path.join(TMP, 'home-kb-asset')
fs.rmSync(cwd, { recursive: true, force: true })
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
fs.mkdirSync(home, { recursive: true })

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex')
const SHA = 'cd'.repeat(32)
const attachment = { attachmentId: `sha256:${SHA}`, mediaType: 'image/png', width: 1, height: 1, bytes: PNG.length, name: 'toolbar.png' }

const events = [
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '这张图是什么' }, { type: 'image', attachment }] } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '是工具条。' }] } } },
  { type: 'request/header', seq: 4, data: { header: { config: { provider: 'p', model: 'm' } } } },
]
let visionCalls = 0
const ctx = {
  get: (name) => {
    if (name === 'sessionQuery') return { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [] }
    if (name === 'attachments') return { readImage: async (ref) => ({ ref, data: new Uint8Array(PNG) }), fileHostPath: () => undefined }
    if (name === 'llm') return {
      stream: async function* (request) {
        const parts = request.messages[0].content
        if (parts.some((part) => part.type === 'image')) visionCalls += 1
        console.log('   视觉调用内容块:', parts.map((part) => part.type).join('+'), '| 图片引用:', parts.find((p) => p.type === 'image').attachment.attachmentId.slice(0, 12))
        yield { type: 'text-delta', text: '一张 DSH 收藏面板的截图，右上角有「展开全文」与「在文件夹中显示」两个按钮。' }
        yield { type: 'usage', usage: { inputTokens: 1200, outputTokens: 30 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    return undefined
  },
}
clearFavoritesCache()
const collected = await toggleFavorite(ctx, 's', 'm1')
const kbDir = path.join(home, 'knowledge')
console.log('0) 收藏时的资源:', fs.readdirSync(path.join(cwd, '.dsh-favorites', 'assets')))
console.log('\n1) 加入知识库 ->', (await addToKnowledge(ctx, collected.filePath, 'm1', kbDir, Date.UTC(2026, 9, 3))).added)
console.log('   知识库自己的资源:', fs.readdirSync(path.join(kbDir, 'assets')))
console.log('   字节与收藏副本一致:', Buffer.compare(fs.readFileSync(path.join(kbDir, 'assets', `${SHA}.png`)), PNG) === 0)
const kbText = fs.readFileSync(path.join(kbDir, '2026-10.md'), 'utf8')
console.log('\n2) 知识库里的图片段落:')
const start = kbText.indexOf('![')
console.log(kbText.slice(start, start + 320).split('\n').map((l) => '   ' + l).join('\n'))
console.log('\n3) 摘要是可见正文（不是标记行）:', /\*图片摘要：一张 DSH 收藏面板的截图/.test(kbText))
console.log('4) 图片路径已改写为知识库副本:', kbText.includes(path.join(kbDir, 'assets', `${SHA}.png`)) && !kbText.includes(path.join(cwd, '.dsh-favorites', 'assets')))
console.log('5) 标记记录了摘要次数:', /summaries=1/.test(kbText))
console.log('6) 视觉调用次数:', visionCalls)

// 摘要让图片内容变得可检索
const byContent = searchKnowledge(ctx, '展开全文 按钮 截图', { scope: 'knowledge', limit: 3 }, kbDir)
const byName = searchKnowledge(ctx, 'toolbar.png', { scope: 'knowledge', limit: 3 }, kbDir)
const byHash = searchKnowledge(ctx, SHA.slice(0, 8), { scope: 'knowledge', limit: 3 }, kbDir)
const probe = searchKnowledge(ctx, 'toolbar', { scope: 'knowledge', limit: 3 }, kbDir)
console.log('\n[调试] 索引块数:', probe.total, '| 命中:', probe.hits.length, '| 说明:', probe.note ?? '-')
console.log('\n7) 按图片内容检索:', byContent.hits.length, '条 |', byContent.hits[0] ? byContent.hits[0].snippet.replace(/\n/g, ' ').slice(0, 46) : '-')
console.log('8) 按文件名检索:', byName.hits.length, '条 | 按哈希前缀:', byHash.hits.length, '条')

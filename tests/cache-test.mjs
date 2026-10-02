import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { favoritesCatalog, clearFavoritesCache, knowledgeEntries } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws-cache')
const dir = path.join(cwd, '.dsh-favorites')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })

// 60 个集合文件，各 2 条收藏
for (let index = 0; index < 60; index += 1) {
  const id = `s${index}`
  const body = [1, 2].map((n) => [
    `[//]: # "dsh-favorite:start ${id}-m${n} tokens=100+10"`,
    `## ${n}. 第 ${index} 个会话的第 ${n} 条`, `*2026-10-0${n} 10:0${n}*`, '',
    '### User', '', `> 问题 ${index}-${n}`, '', '### assistant', '', `回答 ${index}-${n}`, '',
    '[//]: # "dsh-favorite:end"',
  ].join('\n')).join('\n\n')
  fs.writeFileSync(path.join(dir, `${id}.md`), `# 会话 ${index}\n\n[//]: # "dsh-favorites:session=session-${index}"\n\n${body}\n`, 'utf8')
}
const ctx = { get: (name) => (name === 'workspaceRegistry' ? { list: () => [{ id: 'ws', title: '缓存演示', path: cwd }] } : undefined) }

clearFavoritesCache()
const coldStart = performance.now()
const cold = favoritesCatalog(ctx)
const coldMs = performance.now() - coldStart

const warmStart = performance.now()
const warm = favoritesCatalog(ctx)
const warmMs = performance.now() - warmStart

console.log('冷读:', coldMs.toFixed(1), 'ms | 热读:', warmMs.toFixed(1), 'ms | 提速', (coldMs / Math.max(warmMs, 0.01)).toFixed(1), 'x')
console.log('结果一致:', JSON.stringify(cold) === JSON.stringify(warm))
console.log('会话数 / 条目数:', cold[0].sessions.length, '/', cold[0].sessions.reduce((sum, s) => sum + s.items.length, 0))

// 内容变了必须失效（mtime/大小都会变）
fs.appendFileSync(path.join(dir, 's5.md'), '\n[//]: # "dsh-favorite:start s5-m3 tokens=1+1"\n## 3. 新加的一条\n*2026-10-09 09:09*\n\n### User\n\n> 新问题\n\n### assistant\n\n新回答\n\n[//]: # "dsh-favorite:end"\n')
const afterEdit = favoritesCatalog(ctx)
const edited = afterEdit[0].sessions.find((s) => s.sessionId === 'session-5')
console.log('改动后重新读到:', edited.items.length, '条 ->', edited.items.map((i) => i.name).join(' / '))

// 缓存不能被污染：重复标记知识库状态
const first = favoritesCatalog(ctx, path.join(TMP, 'no-such-kb'))
const second = favoritesCatalog(ctx, path.join(TMP, 'no-such-kb'))
console.log('两次调用都没有 inKnowledge:', first[0].sessions.every((s) => s.items.every((i) => i.inKnowledge === undefined)))

// 删除文件后不再出现
fs.rmSync(path.join(dir, 's7.md'))
console.log('删除后会话数:', favoritesCatalog(ctx)[0].sessions.length)
console.log('知识库空目录:', knowledgeEntries(path.join(TMP, 'no-such-kb')).length, '条')

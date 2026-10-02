import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoritesCatalog, addToKnowledge, removeFromKnowledge, resolveKnowledgeDir, knowledgeEntries, renameKnowledge } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws8')
const home = path.join(TMP, 'home')
fs.rmSync(cwd, { recursive: true, force: true })
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
fs.mkdirSync(home, { recursive: true })
const dir = resolveKnowledgeDir({ knowledgeDir: path.join(home, 'knowledge') })
console.log('知识库目录:', dir)
console.log('默认目录（无配置）:', resolveKnowledgeDir(undefined))

const turn = (n, id) => [
  { type: 'turn/start', seq: n * 10, data: { turn: n } },
  { type: 'user/message', seq: n * 10 + 1, time: 1000 * n, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `问题${n}` }] } },
  { type: 'assistant/message', seq: n * 10 + 2, time: 1000 * n + 5, data: { turn: n, message: { id, role: 'assistant', content: [{ type: 'text', text: `回答${n}\n\n## 小节\n\n内容` }] } } },
]
const events = [...turn(1, 'm1'), ...turn(2, 'm2'), { type: 'session/title', seq: 99, data: { title: '知识库演示' } }]
const ctx = {
  get: (name) => name === 'sessionQuery'
    ? { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    : name === 'workspaceRegistry' ? { list: () => [{ id: 'ws', title: '演示', path: cwd }] } : undefined,
}
await toggleFavorite(ctx, 's', 'm1')
await toggleFavorite(ctx, 's', 'm2')
const file = (await favoritesCatalog(ctx, dir))[0].sessions[0].filePath
const before = fs.readFileSync(file, 'utf8')

console.log('\n1) 加入知识库 m1 ->', await addToKnowledge(ctx, file, 'm1', dir, Date.UTC(2026, 9, 2)))
console.log('2) 再加一次（幂等）->', await addToKnowledge(ctx, file, 'm1', dir, Date.UTC(2026, 9, 2)))
const kbFile = path.join(dir, '2026-10.md')
console.log('\n--- 知识库文件 ---')
console.log(fs.readFileSync(kbFile, 'utf8'))

console.log('3) catalog 标记 ->', JSON.stringify(favoritesCatalog(ctx, dir)[0].sessions[0].items.map(i => [i.name, i.inKnowledge === true, i.knowledgeFile ? path.basename(i.knowledgeFile) : null])))
console.log('4) 收藏文件未被改动 ->', fs.readFileSync(file, 'utf8') === before)

await addToKnowledge(ctx, file, 'm2', dir, Date.UTC(2026, 9, 3))
console.log('5) 两条后小节编号 ->', fs.readFileSync(kbFile, 'utf8').split('\n').filter(l => l.startsWith('## ')))
console.log('6) 移除 m1 ->', removeFromKnowledge('m1', dir))
console.log('   移除后小节 ->', fs.readFileSync(kbFile, 'utf8').split('\n').filter(l => l.startsWith('## ')))
console.log('   收藏仍在 ->', fs.readFileSync(file, 'utf8').includes('dsh-favorite:start m1 tokens') || fs.readFileSync(file, 'utf8').includes('dsh-favorite:start m1'))
console.log('6b) 知识库清单 ->', knowledgeEntries(dir).map((e) => `${e.title}@L${e.line}`))
console.log('6c) 重命名知识库条目 ->', renameKnowledge('m2', '我自己的新标题', dir))
console.log('    清单 ->', knowledgeEntries(dir).map((e) => e.title))
console.log('6d) 重命名后收藏文件未被改动 ->', fs.readFileSync(file, 'utf8') === before)
console.log('6e) 重命名空标题 ->', (() => { try { renameKnowledge('m2', '   ', dir) } catch (e) { return `${e.status} ${e.code}` } })())
console.log('6f) 重命名不存在的条目 ->', (() => { try { renameKnowledge('nope', 'x', dir) } catch (e) { return `${e.status} ${e.code}` } })())

console.log('7) 移除 m2（最后一条，文件应删除）->', removeFromKnowledge('m2', dir))
console.log('   知识库文件还在吗:', fs.existsSync(kbFile))
try { removeFromKnowledge('m9', dir) } catch (error) { console.log('8) 移除不存在的条目 ->', error.code, error.status) }

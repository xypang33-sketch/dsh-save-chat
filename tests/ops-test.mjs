import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { toggleFavorite, favoritesCatalog, renameTurn, setTurnPinned, removeTurn } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws7')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
const turn = (n, id) => [
  { type: 'turn/start', seq: n * 10, data: { turn: n } },
  { type: 'user/message', seq: n * 10 + 1, time: 1000 * n, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `问题${n}` }] } },
  { type: 'assistant/message', seq: n * 10 + 2, time: 1000 * n + 5, data: { turn: n, message: { id, role: 'assistant', content: [{ type: 'text', text: `回答${n}` }] } } },
]
const events = [...turn(1, 'm1'), ...turn(2, 'm2'), ...turn(3, 'm3'), { type: 'session/title', seq: 99, data: { title: '操作演示' } }]
const ctx = {
  get: (name) => name === 'sessionQuery'
    ? { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    : name === 'workspaceRegistry' ? { list: () => [{ id: 'ws', title: '演示', path: cwd }] } : undefined,
}
for (const id of ['m1', 'm2', 'm3']) await toggleFavorite(ctx, 's', id)
const file = (await favoritesCatalog(ctx))[0].sessions[0].filePath
const show = (label) => {
  const items = favoritesCatalog(ctx)[0].sessions[0].items
  console.log(label, items.map(i => `${i.name}${i.pinned ? ' [置顶]' : ''}`))
}
show('初始       ')
console.log('重命名 m2 ->', renameTurn(file, 'm2', '改过的标题').name)
console.log('置顶 m3   ->', setTurnPinned(file, 'm3', true))
show('置顶后     ')
console.log('取消置顶   ->', setTurnPinned(file, 'm3', false))
show('取消后     ')
console.log('删除 m1   ->', removeTurn(file, 'm1'))
show('删除后     ')
console.log('--- 文件 ---')
console.log(fs.readFileSync(file, 'utf8'))

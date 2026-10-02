import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoriteState, favoritesCatalog } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws5')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
const make = (n, id) => [
  { type: 'turn/start', seq: n * 10, data: { turn: n } },
  { type: 'user/message', seq: n * 10 + 1, time: 1000 * n, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `问题${n}` }] } },
  { type: 'assistant/message', seq: n * 10 + 2, time: 1000 * n + 5, data: { turn: n, message: { id, role: 'assistant', content: [{ type: 'text', text: `回答${n}` }] } } },
]
const events = [...make(1, 'm1'), ...make(2, 'm2'), ...make(3, 'm3'), { type: 'session/title', seq: 99, data: { title: '编号演示' } }]
const ctx = {
  get: (name) => {
    if (name === 'sessionQuery') return { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    if (name === 'workspaceRegistry') return { list: () => [{ id: 'ws', title: '演示', path: cwd }] }
    return undefined
  },
}
for (const id of ['m1', 'm2', 'm3']) await toggleFavorite(ctx, 's', id)
const file = (await favoriteState(ctx, 's')).filePath
const headings = () => fs.readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith('## '))
console.log('added 3 ->', headings())
console.log('state:', (await favoriteState(ctx, 's')).messageIds)
console.log('catalog items:', JSON.stringify(favoritesCatalog(ctx)[0].sessions[0].items.map(i => [i.name, i.time])))
await toggleFavorite(ctx, 's', 'm2')
console.log('after removing #2 ->', headings())
console.log('catalog after removal:', JSON.stringify(favoritesCatalog(ctx)[0].sessions[0].items.map(i => [i.name, i.time])))
await toggleFavorite(ctx, 's', 'm1')
console.log('after removing #1 ->', headings())
console.log('re-add m1 ->', (await toggleFavorite(ctx, 's', 'm1')).name)
console.log('final ->', headings())
console.log('--- file ---'); console.log(fs.readFileSync(file, 'utf8'))

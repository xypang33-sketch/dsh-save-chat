import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoriteState, favoritesCatalog } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'workspace')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })

const events = [
  { type: 'session', seq: -1 },
  { type: 'turn/start', seq: 0, time: 1000, data: { turn: 1 } },
  { type: 'user/message', seq: 1, time: 1001, data: { role: 'user', id: 'u1', content: [{ type: 'text', text: '你好，帮我看看\n第二行' }] } },
  { type: 'step/start', seq: 2, time: 1002, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, step: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'reasoning', text: '想一下' }, { type: 'text', text: '第一轮回复。' }] } } },
  { type: 'turn/end', seq: 4, time: 1004, data: { turn: 1 } },
  { type: 'turn/start', seq: 5, time: 2000, data: { turn: 2 } },
  { type: 'user/message', seq: 6, time: 2001, data: { role: 'user', id: 'u2', content: [{ type: 'text', text: '第二轮问题' }] } },
  { type: 'assistant/message', seq: 7, time: 2003, data: { turn: 2, step: 1, message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: '第二轮回复。' }] } } },
  { type: 'session/title', seq: 8, time: 2004, data: { title: '测试会话/标题:非法字符' } },
]

const ctx = {
  get(name) {
    if (name === 'sessionQuery') return {
      readSession: async (id) => (id === 'session-test' ? { session: { id, cwd }, events } : (() => { throw new Error('not found') })()),
      listSessions: async () => [{ header: { id: 'session-test', cwd } }],
    }
    if (name === 'workspaceRegistry') return { list: () => [{ id: 'ws1', title: '演示工作区', path: cwd }] }
    return undefined
  },
}

console.log('toggle m1 ->', await toggleFavorite(ctx, 'session-test', 'm1'))
console.log('state ->', await favoriteState(ctx, 'session-test'))
console.log('toggle m2 ->', await toggleFavorite(ctx, 'session-test', 'm2'))
console.log('toggle m1 again (idempotence check: still favorited) ->', (await favoriteState(ctx, 'session-test')).messageIds)
const dir = path.join(cwd, '.dsh-favorites')
const file = path.join(dir, fs.readdirSync(dir)[0])
console.log('--- file name:', path.basename(file))
console.log(fs.readFileSync(file, 'utf8'))
console.log('catalog ->', JSON.stringify(favoritesCatalog(ctx), null, 1).slice(0, 800))
console.log('toggle m1 -> remove:', await toggleFavorite(ctx, 'session-test', 'm1'))
console.log('state after remove ->', (await favoriteState(ctx, 'session-test')).messageIds)
console.log('toggle m1 -> re-add:', (await toggleFavorite(ctx, 'session-test', 'm1')).favorited)
console.log('final state ->', (await favoriteState(ctx, 'session-test')).messageIds)
console.log('--- final file ---')
console.log(fs.readFileSync(file, 'utf8'))

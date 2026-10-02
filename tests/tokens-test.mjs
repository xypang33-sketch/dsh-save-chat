import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoriteState, favoritesCatalog } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws6')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
const events = [
  { type: 'request/header', seq: 0, data: { header: { config: { provider: 'p', model: 'm' } } } },
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '问题' }] } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '回答' }] } } },
  { type: 'session/title', seq: 4, data: { title: '用量演示' } },
]
const llm = {
  stream() {
    return (async function* () {
      yield { type: 'text-delta', index: 0, text: '用量标题' }
      yield { type: 'usage', usage: { inputTokens: 1200, outputTokens: 18, cacheReadTokens: 300, cacheWriteTokens: 0 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}
const ctx = {
  get: (name) => name === 'sessionQuery'
    ? { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    : name === 'llm' ? llm
    : name === 'workspaceRegistry' ? { list: () => [{ id: 'ws', title: '演示', path: cwd }] }
    : undefined,
}
const out = await toggleFavorite(ctx, 's', 'm1')
console.log('toggle ->', out.name, out.tokens)
console.log(fs.readFileSync(out.filePath, 'utf8').split('\n').slice(4, 8).join('\n'))
console.log('catalog ->', JSON.stringify(favoritesCatalog(ctx)[0].sessions[0].items))
console.log('state ->', await favoriteState(ctx, 's'))

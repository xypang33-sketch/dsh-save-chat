import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws2')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })

const events = [
  { type: 'request/header', seq: 0, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } } },
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我给工作区加一个收藏功能' }] } },
  { type: 'assistant/message', seq: 3, time: 1003, data: { turn: 1, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '已实现心形收藏按钮。' }] } } },
  { type: 'session/title', seq: 4, data: { title: '收藏功能实现' } },
]

let captured = null
function makeCtx(llm) {
  return {
    get(name) {
      if (name === 'sessionQuery') return {
        readSession: async () => ({ session: { id: 'session-t', cwd }, events }),
        listSessions: async () => [{ header: { id: 'session-t', cwd } }],
      }
      if (name === 'workspaceRegistry') return { list: () => [{ id: 'ws', title: '演示', path: cwd }] }
      if (name === 'llm') return llm
      return undefined
    },
  }
}

const goodLlm = {
  stream(options) {
    captured = options
    return (async function* () {
      yield { type: 'text-delta', index: 0, text: '"对话收藏' }
      yield { type: 'text-delta', index: 0, text: '功能设计"' }
      yield { type: 'finish', reason: 'stop' }
    })()
  },
}

const first = await toggleFavorite(makeCtx(goodLlm), 'session-t', 'm1')
console.log('toggle with llm ->', first)
console.log('route used:', captured.provider, captured.model, '| purpose:', captured.purpose, '| maxTokens:', captured.maxTokens, '| sessionId:', captured.sessionId)
console.log('system:', captured.system.slice(0, 40) + '…')
console.log('prompt:', JSON.stringify(captured.messages[0].content[0].text.slice(0, 60)))
const file = first.filePath
console.log('--- file ---')
console.log(fs.readFileSync(file, 'utf8'))

// retract and re-add with a failing LLM: the fallback title must be the question
await toggleFavorite(makeCtx(goodLlm), 'session-t', 'm1')
const failing = { stream() { return (async function* () { throw new Error('provider down') })() } }
const second = await toggleFavorite(makeCtx(failing), 'session-t', 'm1')
console.log('fallback toggle ->', second)
console.log('--- file (fallback title) ---')
console.log(fs.readFileSync(file, 'utf8').split('\n').slice(5, 9).join('\n'))

// no llm service at all
await toggleFavorite(makeCtx(undefined), 'session-t', 'm1')
const third = await toggleFavorite(makeCtx(undefined), 'session-t', 'm1')
console.log('no-llm toggle ->', third)

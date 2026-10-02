import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, favoriteState, favoritesCatalog } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws4')
fs.rmSync(cwd, { recursive: true, force: true })
fs.mkdirSync(path.join(cwd, '.dsh-favorites'), { recursive: true })
const legacy = [
  '<!-- dsh-favorites:session=legacy-session -->',
  '# 旧格式会话',
  '',
  '> 本文件由 DSH「收藏此轮对话」维护：每段收藏由 HTML 注释标记，取消收藏会整段删除。',
  '',
  '<!-- dsh-favorite:start old-m1 -->',
  '## 旧的条目标题',
  '*第 1 轮 · 2026-09-01 10:00*',
  '',
  '**我**',
  '',
  '> 旧问题',
  '',
  '**助手**',
  '',
  '## 旧正文标题',
  '',
  '<!-- dsh-favorite:end -->',
  '',
].join('\n')
fs.writeFileSync(path.join(cwd, '.dsh-favorites', '旧格式会话.md'), legacy)
fs.writeFileSync(path.join(cwd, 'workspaces.json'), '')
const events = [
  { type: 'turn/start', seq: 1, data: { turn: 2 } },
  { type: 'user/message', seq: 2, time: 2000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '新问题' }] } },
  { type: 'assistant/message', seq: 3, time: 2003, data: { turn: 2, message: { id: 'new-m1', role: 'assistant', content: [{ type: 'text', text: '新回答\n\n## 新正文标题' }] } } },
  { type: 'session/title', seq: 4, data: { title: '旧格式会话' } },
]
const ctx = {
  get: (name) => {
    if (name === 'sessionQuery') return {
      readSession: async (id) => ({ session: { id, cwd }, events }),
      listSessions: async () => [{ header: { id: 'legacy-session', cwd } }],
    }
    if (name === 'workspaceRegistry') return { list: () => [{ id: 'ws', title: '旧工作区', path: cwd }] }
    return undefined
  },
}
console.log('legacy state (old markers must still be found):', await favoriteState(ctx, 'legacy-session'))
console.log('catalog:', JSON.stringify(favoritesCatalog(ctx)[0].sessions.map(s => ({ title: s.title, items: s.items.map(i => i.heading) }))))
const removed = await toggleFavorite(ctx, 'legacy-session', 'old-m1')
console.log('removed legacy block ->', removed.favorited, '| exists:', fs.existsSync(removed.filePath))
const added = await toggleFavorite(ctx, 'legacy-session', 'new-m1')
console.log('added new block ->', added.heading)
console.log('================ FILE ================')
console.log(fs.readFileSync(added.filePath, 'utf8'))

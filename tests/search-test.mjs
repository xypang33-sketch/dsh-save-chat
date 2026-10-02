import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toggleFavorite, addToKnowledge, searchKnowledge, readKnowledge } from '../src/index.js'
const TMP = path.join(os.tmpdir(), 'dsh-save-chat-tests')

const cwd = path.join(TMP, 'ws9')
const home = path.join(TMP, 'home9')
fs.rmSync(cwd, { recursive: true, force: true })
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(cwd, { recursive: true })
fs.mkdirSync(home, { recursive: true })

const answer = [
  '沙箱用的是 macOS seatbelt，路径判定在 processPathFromHostPath 里完成。',
  '',
  '```bash',
  'sandbox-exec -p "(version 1)(allow default)" /bin/ls',
  '```',
  '',
  '中文检索验证段落：收藏面板的折叠行为与知识库提升。',
].join('\n')
const turn = (n, id, text) => [
  { type: 'turn/start', seq: n * 10, data: { turn: n } },
  { type: 'user/message', seq: n * 10 + 1, time: 1000 * n, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `问题${n}：${text}` }] } },
  { type: 'assistant/message', seq: n * 10 + 2, time: 1000 * n + 5, data: { turn: n, message: { id, role: 'assistant', content: [{ type: 'text', text }] } } },
]
const events = [...turn(1, 'm1', answer), ...turn(2, 'm2', '完全无关的一段：今天天气不错，适合出门散步。'), { type: 'session/title', seq: 99, data: { title: '检索演示' } }]
const ctx = {
  get: (name) => name === 'sessionQuery'
    ? { readSession: async () => ({ session: { id: 's', cwd }, events }), listSessions: async () => [{ header: { id: 's', cwd } }] }
    : name === 'workspaceRegistry' ? { list: () => [{ id: 'ws', title: '演示', path: cwd }] } : undefined,
}
await toggleFavorite(ctx, 's', 'm1')
await toggleFavorite(ctx, 's', 'm2')
const collDir = path.join(cwd, '.dsh-favorites')
const file = path.join(collDir, fs.readdirSync(collDir)[0])
const kbDir = path.join(home, 'knowledge')
await addToKnowledge(ctx, file, 'm1', kbDir, Date.UTC(2026, 9, 2))

const show = (label, result) => {
  console.log(`\n${label}`)
  console.log('  命中数:', result.hits.length, '| 索引块:', result.total, '| 说明:', result.note ?? '-')
  for (const hit of result.hits) console.log(`  [${hit.scope}] ${hit.title} · ${hit.time} · ${path.basename(hit.source)}#L${hit.lines} · score ${hit.score}`)
  if (result.hits[0]) console.log('  片段:', result.hits[0].snippet.replace(/\n/g, ' ⏎ ').slice(0, 120))
}

show("1) 中文查询 scope='knowledge'（应只命中知识库）", searchKnowledge(ctx, '知识库提升', { scope: 'knowledge' }, kbDir))
show("2) 同一查询 scope='all'（知识库 + 收藏）", searchKnowledge(ctx, '知识库提升', { scope: 'all' }, kbDir))
show("3) 英文查询 seatbelt", searchKnowledge(ctx, 'seatbelt', { scope: 'all' }, kbDir))
show("4) 代码里的词 sandbox-exec", searchKnowledge(ctx, 'sandbox-exec', { scope: 'all' }, kbDir))
show("5) 无关查询（应无命中）", searchKnowledge(ctx, '量子纠缠', { scope: 'all' }, kbDir))
show("6) 空库（只有收藏，scope=knowledge）", searchKnowledge(ctx, '座位', { scope: 'knowledge' }, path.join(home, 'empty')))
show("7) limit 上限", searchKnowledge(ctx, '问题', { scope: 'all', limit: 999 }, kbDir))

// 两条内容完全相同、时间不同的条目 -> 相关度并列时，新的排前
const older = { type: 'assistant/message', seq: 900, time: 1700000000000, data: { turn: 9, message: { id: 'old', role: 'assistant', content: [{ type: 'text', text: '沙箱结论：允许读取。' }] } } }
const newer = { type: 'assistant/message', seq: 901, time: 1799999999000, data: { turn: 9, message: { id: 'new', role: 'assistant', content: [{ type: 'text', text: '沙箱结论：允许读取。' }] } } }
for (const [id, when, text] of [['old', '2026-09-16 20:31', '沙箱结论：允许读取。'], ['new', '2026-10-01 23:59', '沙箱结论：允许读取。']]) {
  const target = path.join(collDir, `${id}.md`)
  fs.writeFileSync(target, [
    `# 冲突演示`, '',
    `[//]: # "dsh-favorites:session=session-${id}"`, '',
    `[//]: # "dsh-favorite:start ${id} tokens=10+2"`,
    `## 1. 冲突条目 ${id}`, `*${when}*`, '', '### User', '', `> 问题`, '', '### assistant', '', text, '',
    `[//]: # "dsh-favorite:end"`, '',
  ].join('\n'), 'utf8')
}
const tie = searchKnowledge(ctx, '允许读取', { scope: 'saved', limit: 5 }, kbDir)
console.log('\n12) 并列裁决（应新的在前）:', tie.hits.map((h) => `${h.title}@${h.time}`).join(' | '))
const kbNote = fs.readFileSync(path.join(kbDir, '2026-10.md'), 'utf8').split('\n')[2]
console.log('13) 知识库文件头规则:', kbNote)

// 一个长小节里多处命中 -> 只出一条，并标注处数
const longBody = Array.from({ length: 6 }, (_value, index) => `第 ${index + 1} 段都在讲 fs-local 与沙箱的关系，` + '补充内容'.repeat(30)).join('\n\n')
const longFile = path.join(collDir, 'long.md')
fs.writeFileSync(longFile, [
  '# 长小节演示', '',
  `[//]: # "dsh-favorites:session=session-long"`, '',
  `[//]: # "dsh-favorite:start longsect tokens=10+2"`,
  `## 1. 一个很长的 fs-local 小节`, `*2026-10-01 12:00*`, '', '### User', '', '> 问题', '', '### assistant', '', longBody, '',
  `[//]: # "dsh-favorite:end"`, '',
].join('\n'), 'utf8')
const grouped = searchKnowledge(ctx, 'fs-local', { scope: 'saved', limit: 10 }, kbDir)
const longHits = grouped.hits.filter((hit) => hit.title.includes('很长的'))
console.log('\n14) 同节多处命中合并 ->', longHits.length, '条 | 处数:', longHits[0] && longHits[0].matches, '| 片段含命中词:', longHits[0] ? longHits[0].snippet.includes('fs-local') : false)
console.log('15) 合并后每节最多一条:', new Set(grouped.hits.map((hit) => hit.id)).size === grouped.hits.length)

const first = searchKnowledge(ctx, 'seatbelt', { scope: 'all' }, kbDir).hits[0]
const section = readKnowledge(ctx, first.id, kbDir)
console.log('\n8) readKnowledge ->', section.truncated ? '已截断' : '完整', '| 字数', section.text.length)
console.log('   首行:', section.text.split('\n')[0])
console.log('9) 伪造 id ->', (() => { try { readKnowledge(ctx, 'bm90LWEtcmVhbC1pZA', kbDir) } catch (error) { return `${error.status} ${error.code}` } })())
console.log('10) 片段是否含命中词:', first.snippet.includes('seatbelt'))
console.log('11) 代码块是否完整:', /```bash[\s\S]*```/.test(readKnowledge(ctx, searchKnowledge(ctx, 'sandbox-exec', { scope: 'all' }, kbDir).hits[0].id, kbDir).text))

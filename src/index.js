// dsh-save-chat - host half.
//
// Three loopback-only HTTP routes serve the browser half:
//
//   POST /dsh-save-chat/catalog  {}                       -> workspaces/sessions/items
//   POST /dsh-save-chat/state    { sessionId }            -> favorited message ids
//   POST /dsh-save-chat/toggle   { sessionId, messageId } -> add or remove one Turn
//
// Collection model: one markdown file per (workspace, Session), named after
// the Session, under `<session cwd>/.dsh-favorites/`. Every collected Turn is
// one section delimited by HTML comments that carry the assistant message id,
// so the file is the single source of truth: the heart's state is parsed back
// out of it, and no second index can drift. Removing a Turn cuts exactly its
// section, so the same Turn can never be recorded twice.
//
// Turn content comes from the canonical Session log through `sessionQuery`, so
// a collected Turn is the durable record rather than whatever the transcript
// happened to have rendered. The plugin imports nothing from the DSH SDK:
// every service is resolved through the cordis context at call time.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-save-chat'

const ROUTE_PREFIX = '/dsh-save-chat'
const DIR_NAME = '.dsh-favorites'
/** Marker name of the personal knowledge base's own sections. */
const KNOWLEDGE_MARKER = 'dsh-knowledge'
/** Directory name under the DSH home that holds the personal knowledge base. */
const KNOWLEDGE_DIR_NAME = 'knowledge'
// Bookkeeping lives in markdown link reference definitions: CommonMark
// consumes them, so the rendered document shows no plugin syntax, while the
// file stays the single source of truth for what is collected.
const NEW_SESSION_MARK_RE = /^\[\/\/\]:[ \t]*#[ \t]*"dsh-favorites:session=([^"\s]+)"[ \t]*$/m
// The format this plugin used before the marker change; read-only compatibility
// so an older file can still be listed, toggled off, and rewritten.
const OLD_SESSION_MARK_RE = /<!--\s*dsh-favorites:session=([^\s>]+)\s*-->/
const BLOCK_END_LINE = '[//]: # "dsh-favorite:end"'
const TITLE_RE = /^#\s+(.+)$/m
const HEADING_RE = /^##\s+(.+)$/m
/** Content headings never reach the collected entry's own `##` level; the `###` speaker labels bound them too. */
const CONTENT_HEADING_FLOOR = 4
/** Deadline for handing one path to the desktop. */
const REVEAL_TIMEOUT_MS = 10000
const ATX_HEADING_RE = /^( {0,3})(#{1,6})([ \t]+)/
const FENCE_RE = /^\s{0,3}(```+|~~~+)/

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// --- http helpers ------------------------------------------------------------

function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.')
}

function isLocalHostHeader(host) {
  if (typeof host !== 'string' || host.length === 0) return false
  const name = host.split(':')[0].replace(/^\[|\]$/g, '').toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1e6) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

// Local-only endpoint: loopback socket, loopback Host header, and a same-origin
// check when the browser sends Origin.
function guard(req, res) {
  if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'loopback only' })
    return false
  }
  const host = req.headers.host
  if (!isLocalHostHeader(host)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'unexpected host' })
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    let originHost = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (originHost !== host) {
      sendJson(res, 403, { ok: false, code: 'forbidden', error: 'cross-origin request' })
      return false
    }
  }
  return true
}

async function readJsonBody(req) {
  let body = {}
  try {
    const raw = await readBody(req)
    if (raw) body = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'invalid', 'malformed JSON body')
  }
  return body && typeof body === 'object' ? body : {}
}

// --- attachments -------------------------------------------------------------

/** Human-readable byte size, for an attachment placeholder. */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Describe one non-text content block, so an image or file a Turn carried is not
 * silently dropped from its record. Reasoning and tool bookkeeping stay out.
 * @param block - one content block.
 * @returns a placeholder line, or undefined for blocks that never belong in a record.
 */
function describeBlock(block) {
  if (block === null || typeof block !== 'object') return undefined
  if (block.type !== 'image' && block.type !== 'file' && block.type !== 'audio' && block.type !== 'video') return undefined
  const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment : {}
  const label = block.type === 'image' ? '图片' : '附件'
  const parts = []
  if (typeof attachment.name === 'string' && attachment.name !== '') parts.push(attachment.name)
  if (Number.isFinite(attachment.width) && Number.isFinite(attachment.height)) parts.push(`${attachment.width}×${attachment.height}`)
  const size = formatBytes(attachment.bytes)
  if (size !== '') parts.push(size)
  if (typeof attachment.mediaType === 'string' && attachment.mediaType !== '') parts.push(attachment.mediaType)
  const id = typeof attachment.attachmentId === 'string' ? attachment.attachmentId.replace(/^sha256:/, '').slice(0, 8) : ''
  if (id !== '') parts.push(`sha256:${id}…`)
  return `_[${label}：${parts.length === 0 ? '（无描述）' : parts.join(' · ')}]_`
}

/** File extension used for each media type this plugin copies. */
const ATTACHMENT_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Whether one block carries an attachment this plugin can preserve. */
function isAttachmentBlock(block) {
  return block !== null && typeof block === 'object'
    && (block.type === 'image' || block.type === 'file' || block.type === 'audio' || block.type === 'video')
}

/** The content-addressed identity of one attachment, without its scheme. */
function attachmentKey(block) {
  const attachment = block && block.attachment && typeof block.attachment === 'object' ? block.attachment : {}
  return typeof attachment.attachmentId === 'string' ? attachment.attachmentId.replace(/^sha256:/, '') : undefined
}

/**
 * Copy one attachment's bytes next to the collection, so the record survives the
 * attachment store and any project deletion. Bytes come from the Host attachment
 * service rather than its private store layout.
 * @param ctx - host context carrying the attachment service.
 * @param block - the image or file block.
 * @param assetsDir - directory that holds this collection's copies.
 * @returns where the copy landed, or undefined when it could not be preserved.
 */
async function copyAttachment(ctx, block, assetsDir) {
  const service = ctx.get('attachments')
  const key = attachmentKey(block)
  if (service === undefined || key === undefined) return undefined
  const attachment = block.attachment
  try {
    if (block.type === 'image' && typeof service.readImage === 'function') {
      const stored = await service.readImage(attachment)
      const mediaType = (stored && stored.ref && stored.ref.mediaType) || attachment.mediaType
      const extension = ATTACHMENT_EXTENSIONS[mediaType] ?? 'bin'
      fs.mkdirSync(assetsDir, { recursive: true })
      const file = path.join(assetsDir, `${key}.${extension}`)
      fs.writeFileSync(file, Buffer.from(stored.data))
      return { file, mediaType }
    }
    if (typeof service.fileHostPath === 'function') {
      const source = service.fileHostPath(attachment)
      if (typeof source !== 'string' || source === '') return undefined
      const extension = path.extname(typeof attachment.name === 'string' ? attachment.name : '')
      fs.mkdirSync(assetsDir, { recursive: true })
      const file = path.join(assetsDir, `${key}${extension}`)
      fs.copyFileSync(source, file)
      return { file, mediaType: attachment.mediaType }
    }
  } catch {
    // A missing or unreadable attachment leaves the caption-only placeholder.
    return undefined
  }
  return undefined
}

/**
 * Preserve every attachment one Turn carried.
 * @param ctx - host context carrying the attachment service.
 * @param blocks - every block of the Turn's messages.
 * @param assetsDir - directory that holds this collection's copies.
 * @returns copies keyed by attachment id.
 */
async function preserveAttachments(ctx, blocks, assetsDir) {
  const copies = new Map()
  const seen = new Set()
  for (const block of blocks) {
    if (!isAttachmentBlock(block)) continue
    const key = attachmentKey(block)
    if (key === undefined || seen.has(key)) continue
    seen.add(key)
    const copy = await copyAttachment(ctx, block, assetsDir)
    if (copy !== undefined) copies.set(key, copy)
  }
  return copies
}

/**
 * Render one message body as markdown: its text, plus a copied image or a link
 * for every attachment it carried. Without a copy the block still leaves its
 * caption, so the record never silently drops what the Turn contained.
 * @param blocks - the message content.
 * @param copies - preserved attachments, keyed by attachment id.
 * @returns the markdown, empty when there is nothing to record.
 */
function renderBlocks(blocks, copies) {
  const parts = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text') {
      if (typeof block.text === 'string' && block.text !== '') parts.push(block.text)
      continue
    }
    const described = describeBlock(block)
    const copy = isAttachmentBlock(block) && copies !== undefined ? copies.get(attachmentKey(block)) : undefined
    if (copy === undefined) {
      if (described !== undefined) parts.push(described)
      continue
    }
    const name = block.attachment && typeof block.attachment.name === 'string' ? block.attachment.name : ''
    // The copy is the record: its filename already carries the content hash, so
    // the caption line is only kept when the bytes could not be preserved.
    parts.push(block.type === 'image' ? `![${name}](${copy.file})` : `[${name || copy.file}](${copy.file})`)
  }
  return parts.join('\n\n').trim()
}

// --- session log -------------------------------------------------------------

function textOfBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n\n')
    .trim()
}

function timeLabel(ms) {
  const date = new Date(typeof ms === 'number' && Number.isFinite(ms) ? ms : Date.now())
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function quote(text) {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n')
}

function sessionQueryOf(ctx) {
  const query = ctx.get('sessionQuery')
  if (!query || typeof query.readSession !== 'function') {
    throw new HttpError(503, 'unavailable', 'sessionQuery service is unavailable')
  }
  return query
}

function titleOf(events, fallback) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event && event.type === 'session/title' && event.data && typeof event.data.title === 'string' && event.data.title.trim()) {
      return event.data.title.trim()
    }
  }
  for (const event of events) {
    if (event && event.type === 'user/message') {
      const text = textOfBlocks(event.data && event.data.content)
      if (text) return text.split('\n')[0].slice(0, 60)
    }
  }
  return fallback
}

async function readSession(ctx, sessionId) {
  const query = sessionQueryOf(ctx)
  let snapshot
  try {
    snapshot = await query.readSession(sessionId)
  } catch (error) {
    throw new HttpError(404, 'session-not-found', `session ${sessionId} could not be read: ${String((error && error.message) || error)}`)
  }
  const events = Array.isArray(snapshot.events) ? snapshot.events : []
  const header = snapshot.session && typeof snapshot.session === 'object' ? snapshot.session : {}
  return {
    events,
    cwd: typeof header.cwd === 'string' && header.cwd.length > 0 ? header.cwd : undefined,
    title: titleOf(events, sessionId),
  }
}

async function cwdOf(ctx, sessionId) {
  const query = ctx.get('sessionQuery')
  if (query && typeof query.listSessions === 'function') {
    try {
      const records = await query.listSessions()
      for (const record of records) {
        const header = record && record.header
        if (header && header.id === sessionId && typeof header.cwd === 'string' && header.cwd) return header.cwd
      }
    } catch {
      // the corpus listing is an optimization; the exact read below still answers
    }
  }
  const session = await readSession(ctx, sessionId)
  return session.cwd
}

// Harness bookkeeping shares the `user/message` event type with the human's own
// input: runtime and time snapshots, instruction and skill reminders, background
// job results, subagent settlements and teammate messages all arrive that way.
// A collected Turn records the human's words only, so this is a whitelist — an
// unknown source kind is context, not input.
const HUMAN_SOURCE_KINDS = new Set(['user', 'schedule'])

function isHumanInput(event) {
  const source = (event.data && event.data.source) || {}
  return typeof source.kind === 'string' && HUMAN_SOURCE_KINDS.has(source.kind)
}

/**
 * Unwrap a scheduled reminder into the text its author wrote. The schedule
 * plugin delivers a machine envelope (`reminders_json: [{ reminder_prompt … }]`)
 * as the turn's user message; only the reminder prompts are the human's words.
 */
function scheduleText(text) {
  const match = /reminders_json:\s*(\[[\s\S]*\])\s*$/.exec(text)
  if (match === null) return text
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed)) return text
    const prompts = parsed
      .map((entry) => (entry && typeof entry.reminder_prompt === 'string' ? entry.reminder_prompt.trim() : ''))
      .filter((prompt) => prompt.length > 0)
    return prompts.length > 0 ? prompts.join('\n\n') : text
  } catch {
    // An envelope this build cannot read stays as delivered.
    return text
  }
}

/** The text one recorded input contributes, in the human's own words. */
function humanText(event, copies) {
  const text = renderBlocks(event.data && event.data.content, copies)
  const source = (event.data && event.data.source) || {}
  return source.kind === 'schedule' ? scheduleText(text) : text
}

/**
 * Render one Turn: the user input of the Turn the assistant message belongs to,
 * plus that assistant message's own text.
 * @param session - the read Session log, header-derived cwd, and title.
 * @param messageId - the assistant message id the heart carried.
 * @returns the markdown section pieces for that Turn.
 */
function renderTurn(session, messageId) {
  const { events } = session
  let index = -1
  for (let cursor = 0; cursor < events.length; cursor += 1) {
    const event = events[cursor]
    if (event && event.type === 'assistant/message' && event.data && event.data.message && event.data.message.id === messageId) {
      index = cursor
      break
    }
  }
  if (index < 0) {
    throw new HttpError(404, 'message-not-found', `no assistant message ${messageId} in the Session log`)
  }
  const event = events[index]
  const data = event.data || {}
  const turn = typeof data.turn === 'number' ? data.turn : undefined
  let start = 0
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = events[cursor]
    if (candidate && candidate.type === 'turn/start' && candidate.data && candidate.data.turn === turn) {
      start = cursor
      break
    }
  }
  const userEvents = []
  for (let cursor = start; cursor < index; cursor += 1) {
    const candidate = events[cursor]
    if (candidate && candidate.type === 'user/message' && isHumanInput(candidate)) userEvents.push(candidate)
  }
  if (userEvents.length === 0) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = events[cursor]
      if (candidate && candidate.type === 'user/message') {
        userEvents.push(candidate)
        break
      }
    }
  }
  return {
    messageId,
    turn,
    time: typeof event.time === 'number' ? event.time : Date.now(),
    userEvents,
    assistantBlocks: Array.isArray(data.message && data.message.content) ? data.message.content : [],
  }
}

/**
 * Render a collected Turn's two sides once its attachments have been preserved.
 * @param turn - the Turn from `renderTurn`.
 * @param copies - preserved attachments, keyed by attachment id.
 * @returns the user text and the assistant text.
 */
function renderTurnText(turn, copies) {
  const userTexts = []
  for (const event of turn.userEvents) {
    const text = humanText(event, copies)
    if (text) userTexts.push(text)
  }
  return {
    userText: userTexts.join('\n\n'),
    assistantText: renderBlocks(turn.assistantBlocks, copies),
  }
}

// --- turn titles -------------------------------------------------------------

/** Model-visible instruction for one collected Turn's directory title. */
const TITLE_SYSTEM = [
  '为下面这段 AI 助手对话生成一个简短标题, 用于收藏目录的条目名。',
  '只输出一行纯文本标题, 不加引号、序号、前缀、解释或 Markdown 标记, 不要输出代码。',
  '使用对话本身的语言, 中文不超过 24 个字, 英文不超过 12 个词。',
].join(' ')

const TITLE_TIMEOUT_MS = 8000
const TITLE_MAX_TOKENS = 48
const TITLE_MAX_INPUT_CHARS = 4000
const TITLE_MAX_CHARS = 60
const FALLBACK_TITLE_CHARS = 40

/**
 * The model route the Session last requested with, used for the auxiliary
 * title call so a title needs no separate model configuration.
 */
function routeOf(events) {
  for (let cursor = events.length - 1; cursor >= 0; cursor -= 1) {
    const event = events[cursor]
    const config = event && event.type === 'request/header' && event.data && event.data.header && event.data.header.config
    if (config && typeof config.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model }
    }
  }
  return undefined
}

/** Reduce a model answer to one plain title line. */
function normalizeTitle(text) {
  const line = String(text || '')
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0)
  if (line === undefined) return ''
  return line
    .replace(/^[\s"'“”‘’#*\-–—]+/, '')
    .replace(/[\s"'“”‘’]+$/, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .slice(0, TITLE_MAX_CHARS)
    .trim()
}

/** The human's own first line, used whenever the model cannot answer. */
function fallbackTitle(text) {
  const line = String(text || '')
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0)
  return (line || '').slice(0, FALLBACK_TITLE_CHARS)
}

/**
 * Summarize one Turn with the Session's own model route. Every failure — no
 * route, no LLM service, refusal, timeout, provider error — yields undefined so
 * the caller falls back to the human's question.
 * @param ctx - host context carrying the LLM service.
 * @param sessionId - Session the Turn belongs to.
 * @param session - the read Session log.
 * @param turn - the rendered Turn awaiting a title.
 * @returns the title, or undefined when the model could not produce one.
 */
async function generateTurnTitle(ctx, sessionId, session, turn) {
  const llm = ctx.get('llm')
  const route = routeOf(session.events)
  if (!llm || typeof llm.stream !== 'function' || route === undefined) return { title: undefined, usage: undefined }
  const input = [
    turn.userText ? `用户:\n${turn.userText}` : '',
    turn.assistantText ? `助手:\n${turn.assistantText}` : '',
  ].filter((part) => part.length > 0).join('\n\n').slice(0, TITLE_MAX_INPUT_CHARS)
  if (input.length === 0) return { title: undefined, usage: undefined }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS)
  let usage
  try {
    let text = ''
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: TITLE_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
      maxTokens: TITLE_MAX_TOKENS,
      purpose: 'session-title',
      sessionId,
      signal: controller.signal,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      if (chunk.type === 'usage' && chunk.usage !== undefined) usage = chunk.usage
      // `FinishReason` is a discriminated object: only an aborted or failed
      // stream discards an otherwise usable title.
      if (chunk.type === 'finish') {
        const kind = chunk.reason && chunk.reason.kind
        if (kind === 'error' || kind === 'aborted') return undefined
      }
    }
    const title = normalizeTitle(text)
    return { title: title.length > 0 ? title : undefined, usage }
  } catch {
    // Any auxiliary failure degrades to the human's question.
    return { title: undefined, usage }
  } finally {
    clearTimeout(timer)
  }
}

/** Model-visible instruction for one promoted image's summary. */
const IMAGE_SUMMARY_SYSTEM = [
  '为下面这张图片写一句便于以后检索的摘要。',
  '只输出一句话，不加引号、前缀、解释或 Markdown 标记，不要输出代码。',
  '说明画面里是什么、有什么关键文字或界面元素；使用图片中内容的主要语言，中文不超过 60 字。',
].join(' ')

const IMAGE_SUMMARY_TIMEOUT_MS = 20000
const IMAGE_SUMMARY_MAX_TOKENS = 120
const IMAGE_SUMMARY_MAX_CHARS = 160

/**
 * Ask the session's model route to describe one image, so the promoted copy can
 * be found by what it shows rather than only by its filename.
 * @param ctx - host context carrying the model service.
 * @param sessionId - the Session the record came from.
 * @param route - provider and model the Session last used.
 * @param attachment - the durable image reference.
 * @returns the summary text and its usage, both optional.
 */
async function summarizeImage(ctx, sessionId, route, attachment) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.stream !== 'function' || route === undefined) return {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_SUMMARY_TIMEOUT_MS)
  let usage
  try {
    let text = ''
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: IMAGE_SUMMARY_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图片是什么？' },
          { type: 'image', attachment },
        ],
      }],
      maxTokens: IMAGE_SUMMARY_MAX_TOKENS,
      purpose: 'session-title',
      sessionId,
      signal: controller.signal,
    })) {
      if (!chunk) continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      if (chunk.type === 'usage' && chunk.usage !== undefined) usage = chunk.usage
      if (chunk.type === 'finish') {
        const kind = chunk.reason && chunk.reason.kind
        if (kind === 'error' || kind === 'aborted') return {}
      }
    }
    const summary = normalizeTitle(text).slice(0, IMAGE_SUMMARY_MAX_CHARS)
    return { summary: summary.length > 0 ? summary : undefined, usage }
  } catch (error) {
    // A summary is a bonus: the copy survives without one, but the reason is
    // worth a line in the host log.
    ctx.logger?.warn?.('dsh-save-chat: image summary failed: %s', String((error && error.message) || error))
    return {}
  } finally {
    clearTimeout(timer)
  }
}

/** The session marker line for one collection file. */
function sessionMarker(sessionId) {
  return `[//]: # "dsh-favorites:session=${sessionId}"`
}

/** The start marker line for one collected Turn, with the title call's token cost when it is known. */
function blockMarker(messageId, usage) {
  const recorded = usageField(usage)
  return `[//]: # "dsh-favorite:start ${messageId}${recorded}"`
}

/**
 * The billed token counts of one auxiliary title call, as ` tokens=<input>+<output>`.
 * Input is every prompt-side count the adapter reported (uncached, cache-read and
 * cache-write are disjoint), output is the generated tokens.
 * @param usage - the usage chunk the title call produced, if any.
 * @returns the marker field, or an empty string when nothing was reported.
 */
function usageField(usage) {
  if (usage === null || typeof usage !== 'object') return ''
  const input = (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
  const output = usage.outputTokens || 0
  if (!Number.isFinite(input) || !Number.isFinite(output) || input + output <= 0) return ''
  return ` tokens=${Math.max(0, Math.trunc(input))}+${Math.max(0, Math.trunc(output))}`
}

/** Read the marker's recorded token counts back. */
function tokensOf(blockText) {
  const match = /tokens=(\d+)\+(\d+)/.exec(blockText)
  if (match === null) return undefined
  const input = Number(match[1])
  const output = Number(match[2])
  return { input, output, total: input + output }
}

/** The Session id a collection file was written for, in either marker form. */
function sessionIdOf(content) {
  const current = NEW_SESSION_MARK_RE.exec(content)
  if (current !== null) return current[1]
  const previous = OLD_SESSION_MARK_RE.exec(content)
  return previous === null ? undefined : previous[1]
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every block pattern this plugin can read: the current form, then the previous one. */
function blockPatterns(messageId) {
  return markerPatterns('dsh-favorite', messageId)
}

/**
 * Every pattern one marker name appears in: the current link-reference form and
 * the HTML-comment form earlier revisions wrote. Both capture the message id
 * first and the section body second, so callers can read either form.
 * @param marker - marker name, without the `:start`/`:end` suffix.
 * @param messageId - one exact section to match, or undefined for every section.
 * @returns the patterns.
 */
function markerPatterns(marker, messageId) {
  const exact = messageId === undefined ? '([^"\\s]+)' : `(${escapeForRegExp(messageId)})`
  const legacyId = messageId === undefined ? '([^\\s>]+)' : `(${escapeForRegExp(messageId)})`
  return [
    new RegExp(`^\\[\\/\\/\\]:[ \\t]*#[ \\t]*"${marker}:start[ \\t]+${exact}(?:[^"]*)"[ \\t]*\\r?\\n([\\s\\S]*?)^\\[\\/\\/\\]:[ \\t]*#[ \\t]*"${marker}:end"[ \\t]*\\r?$`, 'gm'),
    new RegExp(`<!--\\s*${marker}:start\\s+${legacyId}[^>]*-->([\\s\\S]*?)<!--\\s*${marker}:end\\s*-->`, 'g'),
  ]
}

function hasBlock(content, messageId) {
  if (!content) return false
  return blockPatterns(messageId).some((pattern) => pattern.test(content))
}

function removeBlock(content, messageId) {
  let next = content
  for (const pattern of blockPatterns(messageId)) next = next.replace(pattern, '')
  return next
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s*$/, '\n')
}

/**
 * Push every ATX heading in quoted content below the section levels this file
 * owns: the shift moves the content's highest heading down to `floor`, so an
 * answer's own `##` can never render beside a collected entry's `##`.
 * @param text - the quoted user or assistant text.
 * @param floor - the lowest level content headings may use.
 * @returns the text with fenced code left untouched.
 */
function demoteHeadings(text, floor) {
  const source = String(text || '')
  const lines = source.split('\n')
  const levels = []
  let fence = null
  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const heading = ATX_HEADING_RE.exec(line)
    if (heading !== null) levels.push(heading[2].length)
  }
  if (levels.length === 0) return source
  const shift = Math.max(0, floor - Math.min(...levels))
  if (shift === 0) return source
  fence = null
  return lines.map((line) => {
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
      return line
    }
    if (fence !== null) return line
    const heading = ATX_HEADING_RE.exec(line)
    if (heading === null) return line
    const level = Math.min(6, heading[2].length + shift)
    return `${heading[1]}${'#'.repeat(level)}${heading[3]}${line.slice(heading[0].length)}`
  }).join('\n')
}

/** Whether a block's marker carries the pinned field. */
function isPinnedBlock(blockText) {
  return /dsh-favorite:start[^"]*\bpinned\b/.test(blockText)
}

/** Add or drop the pinned field on one block's marker line. */
function withPinned(blockText, pinned) {
  if (pinned) return blockText.replace(/(dsh-favorite:start[^"]*)"/, '$1 pinned"')
  return blockText.replace(/ pinned(?=[^"]*")/, '')
}

/** Read one of this plugin's collection files, or fail with the request's own code. */
/**
 * Whether a path is one of this plugin's own knowledge base files.
 * @param filePath - the path to test.
 * @param dir - the resolved knowledge base directory.
 * @returns true when the path sits inside that directory.
 */
export function isKnowledgeFile(filePath, dir) {
  if (typeof filePath !== 'string' || typeof dir !== 'string') return false
  const resolved = path.resolve(filePath)
  const relative = path.relative(path.resolve(dir), resolved)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && resolved.toLowerCase().endsWith('.md')
}

function readCollection(filePath) {
  if (!isCollectionFile(filePath)) {
    throw new HttpError(400, 'invalid', 'filePath is not a collection file')
  }
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new HttpError(404, 'not-found', `collection file could not be read: ${String((error && error.message) || error)}`)
  }
}

/** Locate one block by message id, whichever marker form the file uses. */
function findKnowledgeBlock(content, messageId) {
  for (const block of knowledgeBlocks(content)) {
    if (block.messageId === messageId) return block
  }
  return undefined
}

function findBlock(content, messageId) {
  for (const pattern of blockPatterns(messageId)) {
    pattern.lastIndex = 0
    const match = pattern.exec(content)
    if (match !== null) return { text: match[0], index: match.index, body: match[2] }
  }
  return undefined
}

function assertTitle(title) {
  const cleaned = String(title || '')
    // eslint-disable-next-line no-control-regex -- control characters cannot reach a heading
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length === 0) throw new HttpError(400, 'invalid', 'title required')
  if (cleaned.length > 200) throw new HttpError(400, 'invalid', 'title is longer than 200 characters')
  return cleaned
}

/** Rename one collected Turn's heading, keeping its ordinal and every other field. */
export function renameTurn(filePath, messageId, title) {
  const content = readCollection(filePath)
  const block = findBlock(content, messageId)
  if (block === undefined) throw new HttpError(404, 'not-found', `no collected Turn ${messageId} in that file`)
  const lines = block.body.split('\n')
  const index = lines.findIndex((line) => /^##[ \t]/.test(line))
  if (index === -1) throw new HttpError(409, 'malformed', 'the collected Turn has no heading line')
  const ordinal = /^##[ \t]+(\d+)\./.exec(lines[index])
  lines[index] = `## ${ordinal === null ? 1 : Number(ordinal[1])}. ${assertTitle(title)}`
  const renamed = block.text.replace(block.body, lines.join('\n'))
  const next = content.slice(0, block.index) + renamed + content.slice(block.index + block.text.length)
  fs.writeFileSync(filePath, normalizeBlocks(next), 'utf8')
  return { filePath, messageId, name: parseHeading(lines.join('\n')).name }
}

/**
 * Pin one collected Turn to the top of its file or release it. Pinning moves the
 * section above every other one and records the field in its own marker, so the
 * file alone still says what is pinned; releasing only clears the field.
 */
export function setTurnPinned(filePath, messageId, pinned) {
  const content = readCollection(filePath)
  const block = findBlock(content, messageId)
  if (block === undefined) throw new HttpError(404, 'not-found', `no collected Turn ${messageId} in that file`)
  const marked = withPinned(block.text, pinned)
  if (!pinned) {
    const next = content.slice(0, block.index) + marked + content.slice(block.index + block.text.length)
    fs.writeFileSync(filePath, normalizeBlocks(next), 'utf8')
    return { filePath, messageId, pinned: false }
  }
  const without = (content.slice(0, block.index) + content.slice(block.index + block.text.length))
    .replace(/\n{3,}/g, '\n\n')
  let insertAt = without.length
  for (const pattern of blockPatterns(undefined)) {
    pattern.lastIndex = 0
    const match = pattern.exec(without)
    if (match !== null) insertAt = Math.min(insertAt, match.index)
  }
  const head = without.slice(0, insertAt).replace(/\s*$/, '')
  const tail = without.slice(insertAt).replace(/^\s*/, '')
  const moved = tail === '' ? `${head}\n\n${marked.trim()}\n` : `${head}\n\n${marked.trim()}\n\n${tail}`
  fs.writeFileSync(filePath, normalizeBlocks(moved), 'utf8')
  return { filePath, messageId, pinned: true }
}

/** Drop one collected Turn from its file; the heart reads the same file, so it clears too. */
export function removeTurn(filePath, messageId) {
  const content = readCollection(filePath)
  if (findBlock(content, messageId) === undefined) {
    throw new HttpError(404, 'not-found', `no collected Turn ${messageId} in that file`)
  }
  fs.writeFileSync(filePath, normalizeBlocks(removeBlock(content, messageId)), 'utf8')
  return { filePath, messageId, removed: true }
}

// --- markdown collection file ------------------------------------------------

function favoritesDir(cwd) {
  return path.join(cwd, DIR_NAME)
}

function sanitizeFileName(title) {
  const cleaned = String(title || '')
    // eslint-disable-next-line no-control-regex -- control characters are illegal in file names
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim()
  return cleaned.length > 0 ? cleaned : '未命名会话'
}

function readTextIfPresent(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function findFileForSession(dir, sessionId) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return undefined
  }
  for (const entry of names) {
    if (!entry.toLowerCase().endsWith('.md')) continue
    const file = path.join(dir, entry)
    const content = readTextIfPresent(file)
    if (content.length === 0) continue
    if (sessionIdOf(content) === sessionId) return file
  }
  return undefined
}

function uniqueFileName(dir, base) {
  const candidate = `${base}.md`
  if (!fs.existsSync(path.join(dir, candidate))) return candidate
  for (let index = 2; index < 100; index += 1) {
    const next = `${base} (${index}).md`
    if (!fs.existsSync(path.join(dir, next))) return next
  }
  return `${base} (${Date.now()}).md`
}

/**
 * Split one section heading into its display name and time. The name keeps the
 * leading ordinal; the time follows the last ` · `. Headings written before the
 * inline time existed carry it on a following italic line instead.
 */
function parseHeading(body) {
  const heading = HEADING_RE.exec(body)
  const line = heading === null ? '' : heading[1].trim()
  const separator = line.lastIndexOf(' · ')
  if (separator !== -1) return { name: line.slice(0, separator).trim(), time: line.slice(separator + 3).trim() }
  const italic = /^\*([^*\n]+)\*[ \t]*$/m.exec(body)
  return { name: line, time: italic === null ? '' : italic[1].trim() }
}

function itemsOf(content) {
  const items = []
  for (const pattern of blockPatterns(undefined)) {
    let match = pattern.exec(content)
    while (match !== null) {
      const parsed = parseHeading(match[2])
      items.push({
        messageId: match[1],
        name: parsed.name,
        time: parsed.time,
        tokens: tokensOf(match[0]),
        pinned: isPinnedBlock(match[0]),
        // 1-based line of the section marker, so the preview can scroll to it.
        line: content.slice(0, match.index).split('\n').length,
      })
      match = pattern.exec(content)
    }
  }
  return items.sort((left, right) => left.line - right.line)
}

/**
 * Bring every section onto the current form: its 1-based position in the file
 * (so ordinals stay contiguous after a removal) as the heading, and the
 * collection time as the small line under that heading.
 */
function normalizeBlocks(content) {
  let ordinal = 0
  let next = content
  for (const pattern of blockPatterns(undefined)) {
    next = next.replace(pattern, (whole, messageId, body) => {
      ordinal += 1
      const lines = String(body).split('\n')
      const index = lines.findIndex((line) => /^##[ \t]/.test(line))
      if (index === -1) return whole
      const heading = lines[index].replace(/^##[ \t]+(?:\d+\.[ \t]*)?/, '')
      const separator = heading.lastIndexOf(' · ')
      const title = separator === -1 ? heading.trim() : heading.slice(0, separator).trim()
      const time = separator === -1 ? undefined : heading.slice(separator + 3).trim()
      lines[index] = `## ${ordinal}. ${title}`
      if (time !== undefined && time !== '') {
        const following = lines[index + 1]
        if (following !== undefined && /^\*[^*\n]+\*[ \t]*$/.test(following)) lines.splice(index + 1, 1)
        lines.splice(index + 1, 0, `*${time}*`)
      }
      return whole.replace(String(body), lines.join('\n'))
    })
  }
  return next
}

/** Explanatory lines written by earlier revisions; removed when such a file is next written. */
const RETIRED_NOTES = [
  '> 本文件由 DSH「收藏此轮对话」维护：每段收藏是一个 `## 小节`，取消收藏会整段删除该小节。',
  '> 本文件由 DSH「收藏此轮对话」维护：每段收藏由 HTML 注释标记，取消收藏会整段删除。',
]

/** The document header: the session title and its machine-readable marker. */
function fileHeader(sessionId, title) {
  return [
    `# ${title}`,
    '',
    sessionMarker(sessionId),
    '',
  ].join('\n')
}

/** Drop the explanatory lines earlier revisions wrote. */
function stripRetiredNotes(content) {
  let next = content
  for (const note of RETIRED_NOTES) next = next.split(`${note}\n`).join('').split(note).join('')
  return next.replace(/\n{3,}/g, '\n\n')
}

/** Bring an existing file onto the current marker form without touching its sections. */
function ensureHeader(content, sessionId, title) {
  if (content.length === 0) return fileHeader(sessionId, title)
  const cleaned = stripRetiredNotes(content)
  if (NEW_SESSION_MARK_RE.test(cleaned)) return cleaned
  if (OLD_SESSION_MARK_RE.test(cleaned)) return cleaned.replace(OLD_SESSION_MARK_RE, sessionMarker(sessionId))
  return `${fileHeader(sessionId, title)}\n${cleaned}`
}

/** One collected Turn: its ordinal, title, time, the two speaker sections, and the closing marker. */
function fileBlock(turn, title, ordinal, usage) {
  const meta = timeLabel(turn.time)
  const lines = [
    blockMarker(turn.messageId, usage),
    `## ${ordinal}. ${title || `第 ${turn.turn ?? 1} 轮`}`,
    `*${meta}*`,
    '',
    '### User',
    '',
    turn.userText
      ? quote(demoteHeadings(turn.userText, CONTENT_HEADING_FLOOR))
      : '_（本轮没有文本输入）_',
    '',
    '### assistant',
    '',
    demoteHeadings(turn.assistantText, CONTENT_HEADING_FLOOR) || '_（本条回复没有文本内容）_',
    '',
    BLOCK_END_LINE,
  ]
  return lines.join('\n')
}

/**
 * Add or remove one Turn's section, creating the Session's file on first use.
 * @param ctx - host context carrying the Session query service.
 * @param sessionId - owning Session.
 * @param messageId - assistant message id addressed by the heart.
 * @returns the resulting state and the file that holds it.
 */
export async function toggleFavorite(ctx, sessionId, messageId) {
  const session = await readSession(ctx, sessionId)
  if (session.cwd === undefined) {
    throw new HttpError(409, 'no-workspace', 'this Session records no working directory, so no collection file can be placed')
  }
  const dir = favoritesDir(session.cwd)
  const existing = findFileForSession(dir, sessionId)
  const content = existing === undefined ? '' : readTextIfPresent(existing)

  if (hasBlock(content, messageId)) {
    fs.writeFileSync(existing, normalizeBlocks(removeBlock(content, messageId)), 'utf8')
    return { favorited: false, filePath: existing, sessionId }
  }

  const turn = renderTurn(session, messageId)
  // Preserve the Turn's images and files beside the collection before the record
  // is written, so the markdown can point at a copy that outlives the attachment
  // store and the project itself.
  const allBlocks = [
    ...turn.userEvents.flatMap((event) => (Array.isArray(event.data && event.data.content) ? event.data.content : [])),
    ...turn.assistantBlocks,
  ]
  const copies = await preserveAttachments(ctx, allBlocks, path.join(dir, 'assets'))
  const text = renderTurnText(turn, copies)
  const turnText = { ...turn, ...text }
  const generated = await generateTurnTitle(ctx, sessionId, session, turnText)
  const title = generated.title || fallbackTitle(`${text.userText}\n${text.assistantText}`)
  fs.mkdirSync(dir, { recursive: true })
  const file = existing === undefined
    ? path.join(dir, uniqueFileName(dir, sanitizeFileName(session.title)))
    : existing
  const base = ensureHeader(content, sessionId, session.title).replace(/\s*$/, '\n')
  const ordinal = itemsOf(content).length + 1
  // Renumbering again after the append keeps ordinals contiguous and unique no
  // matter which sections the file held before.
  const next = normalizeBlocks(`${base.replace(/\s*$/, '')}\n\n${fileBlock(turnText, title, ordinal, generated.usage)}\n`)
  fs.writeFileSync(file, next, 'utf8')
  return {
    favorited: true,
    filePath: file,
    sessionId,
    name: `${ordinal}. ${title}`,
    ordinal,
    tokens: tokensOf(usageField(generated.usage)),
  }
}

/**
 * Whether a path is one of this plugin's collection files. The browser half
 * sends back a path the catalog gave it; this check keeps the document route
 * from becoming a read-anything endpoint.
 */
function isCollectionFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.md')) return false
  return filePath.split(/[\\/]/).includes(DIR_NAME)
}

/**
 * Read one collection file, or one collected Turn inside it, for the reader pane.
 * @param filePath - a path the catalog produced.
 * @param messageId - the Turn to return, or undefined for the whole document.
 * @returns the markdown the reader renders.
 */
export function readCollected(filePath, messageId, knowledgeDir) {
  const fromKnowledge = isKnowledgeFile(filePath, knowledgeDir)
  if (!fromKnowledge && !isCollectionFile(filePath)) {
    throw new HttpError(400, 'invalid', 'filePath is not a collection file')
  }
  let content
  try {
    content = fs.readFileSync(path.resolve(filePath), 'utf8')
  } catch (error) {
    throw new HttpError(404, 'not-found', `collection file could not be read: ${String((error && error.message) || error)}`)
  }
  if (messageId === undefined) return { markdown: content }
  const knowledge = findKnowledgeBlock(content, messageId)
  if (knowledge !== undefined) return { markdown: knowledge.body.trimEnd() }
  for (const pattern of blockPatterns(messageId)) {
    const match = pattern.exec(content)
    if (match !== null) return { markdown: match[2].trimEnd() }
  }
  throw new HttpError(404, 'not-found', `no collected Turn ${messageId} in that file`)
}

/**
 * Ask the host desktop to reveal one collection file in the file manager. The
 * host half calls the service directly, so this works while a global panel is on
 * screen and reports the host's own failure reason instead of a bare refusal.
 * @param ctx - host context carrying the session controller.
 * @param filePath - a path the catalog produced.
 * @returns the confirmed action.
 */
/**
 * Ask the host desktop to reveal one saved file in the file manager. The host
 * half calls the service directly, so this works while a global panel is on
 * screen and reports the host's own failure reason instead of a bare refusal.
 * @param ctx - host context carrying the session controller.
 * @param filePath - a collection or knowledge base path.
 * @param knowledgeDir - knowledge base directory, when configured.
 * @returns the confirmed action.
 */
export async function revealCollected(ctx, filePath, knowledgeDir) {
  if (!isCollectionFile(filePath) && !isKnowledgeFile(filePath, knowledgeDir)) {
    throw new HttpError(400, 'invalid', 'filePath is not a saved file this plugin owns')
  }
  const controller = ctx.get('sessionController')
  if (!controller || typeof controller.openWorkspacePath !== 'function') {
    throw new HttpError(503, 'unavailable', 'this profile has no desktop path opener')
  }
  try {
    await controller.openWorkspacePath({ path: filePath, action: 'reveal' }, AbortSignal.timeout(REVEAL_TIMEOUT_MS))
  } catch (error) {
    throw new HttpError(502, 'reveal-failed', String((error && error.message) || error))
  }
  return { filePath, revealed: true }
}

// --- personal knowledge base -------------------------------------------------

/** The DSH home directory, honouring the same override the rest of DSH uses. */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/**
 * Resolve the configured knowledge base directory.
 * @param config - the plugin's Loader config, if any.
 * @returns an absolute directory path.
 */
export function resolveKnowledgeDir(config) {
  const configured = config && typeof config.knowledgeDir === 'string' ? config.knowledgeDir.trim() : ''
  if (configured.length > 0) return path.resolve(configured)
  return path.join(dshHome(), KNOWLEDGE_DIR_NAME)
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayLabel(date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

/** Every knowledge base file, newest month first. */
function knowledgeFiles(dir) {
  let names
  try {
    names = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith('.md'))
  } catch {
    return []
  }
  return names.sort().reverse().map((entry) => path.join(dir, entry))
}

function knowledgeBlocks(content) {
  const blocks = []
  for (const pattern of markerPatterns(KNOWLEDGE_MARKER, undefined)) {
    let match = pattern.exec(content)
    while (match !== null) {
      blocks.push({ messageId: match[1], body: match[2], text: match[0], index: match.index })
      match = pattern.exec(content)
    }
  }
  return blocks.sort((left, right) => left.index - right.index)
}

function knowledgeHas(content, messageId) {
  return markerPatterns(KNOWLEDGE_MARKER, messageId).some((pattern) => pattern.test(content))
}

function knowledgeRemove(content, messageId) {
  let next = content
  for (const pattern of markerPatterns(KNOWLEDGE_MARKER, messageId)) next = next.replace(pattern, '')
  return next.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/\s*$/, '\n')
}

/** Give every knowledge section its 1-based position in its file. */
function renumberKnowledge(content) {
  let ordinal = 0
  let next = content
  for (const pattern of markerPatterns(KNOWLEDGE_MARKER, undefined)) {
    next = next.replace(pattern, (whole) => {
      ordinal += 1
      return whole.replace(/^##[ \t]+(?:\d+\.[ \t]*)?/m, `## ${ordinal}. `)
    })
  }
  return next
}

/**
 * Every promoted Turn, newest month first, for the panel's knowledge base view.
 * @param dir - knowledge base directory.
 * @returns one entry per section.
 */
export /** Parse one knowledge base file into its sections. */
function parseKnowledgeFile(content) {
  return knowledgeBlocks(content).map((block) => {
    const section = splitCollectedSection(block.body)
    const source = /source=([^"]*)/.exec(block.text)
    return {
      messageId: block.messageId,
      title: section.title,
      time: section.time,
      origin: source === null ? undefined : source[1].trim(),
      line: countLines(content.slice(0, block.index)) + 1,
    }
  })
}

export function knowledgeEntries(dir) {
  const entries = []
  for (const file of knowledgeFiles(dir)) {
    const parsed = readParsed(file, parseKnowledgeFile)
    if (parsed === undefined) continue
    const month = path.basename(file).replace(/\.md$/i, '')
    for (const entry of parsed) entries.push({ ...entry, filePath: file, month })
  }
  return entries
}

/**
 * Retitle one knowledge base section. The collection it came from is untouched:
 * the copy is the user's own, and they may want it worded differently.
 * @param messageId - the promoted Turn.
 * @param title - the new title.
 * @param dir - knowledge base directory.
 * @returns the file that changed.
 */
export function renameKnowledge(messageId, title, dir) {
  const clean = String(title === undefined || title === null ? '' : title).trim()
  if (clean === '') throw new HttpError(400, 'invalid', 'title must not be empty')
  for (const file of knowledgeFiles(dir)) {
    let content
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const block = findKnowledgeBlock(content, messageId)
    if (block === undefined) continue
    const replaced = block.text.replace(/^(##[ \t]+)(\d+\.)?[ \t]*.*$/m, `$1${/^##[ \t]+(\d+)\./m.exec(block.text) === null ? '' : `${/^##[ \t]+(\d+)\./m.exec(block.text)[1]}. `}${clean}`)
    const next = content.replace(block.text, replaced)
    fs.writeFileSync(file, renumberKnowledge(ensureKnowledgeNote(next)), 'utf8')
    return { renamed: true, filePath: file, messageId, title: clean }
  }
  throw new HttpError(404, 'not-in-knowledge', `no knowledge entry ${messageId}`)
}

/** Where one collected Turn already sits in the knowledge base, if anywhere. */
function knowledgeIndexOf(dir) {
  const index = new Map()
  for (const file of knowledgeFiles(dir)) {
    const parsed = readParsed(file, parseKnowledgeFile)
    if (parsed === undefined) continue
    for (const entry of parsed) {
      if (!index.has(entry.messageId)) index.set(entry.messageId, file)
    }
  }
  return index
}

/** Split a collected section into the parts the knowledge base re-labels. */
function splitCollectedSection(body) {
  const lines = String(body).split('\n')
  const headingIndex = lines.findIndex((line) => /^##[ \t]/.test(line))
  const title = headingIndex === -1
    ? ''
    : lines[headingIndex].replace(/^##[ \t]+(?:\d+\.[ \t]*)?/, '').trim()
  let cursor = headingIndex + 1
  let time = ''
  if (cursor < lines.length && /^\*[^*\n]+\*[ \t]*$/.test(lines[cursor])) {
    time = lines[cursor].slice(1, -1).trim()
    cursor += 1
  }
  while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1
  return { title, time, body: lines.slice(cursor).join('\n').trimEnd() }
}

/** The knowledge marker line, carrying where the copy came from. */
function knowledgeMarker(messageId, sessionId, source, promotedAt, extra) {
  const cleanSource = String(source).replace(/"/g, "'")
  const from = sessionId === undefined ? '-' : sessionId
  const suffix = extra === undefined || extra === '' ? '' : ` ${extra}`
  return `[//]: # "${KNOWLEDGE_MARKER}:start ${messageId} from=${from} at=${new Date(promotedAt).toISOString()} source=${cleanSource}${suffix}"`
}

/** The rule every reader of this library needs: the later Turn wins. */
const KNOWLEDGE_NOTE = '*同一主题若前后矛盾，以「原会话时间」较晚的一条为准。*'

function knowledgeHeader(month) {
  return `# 个人知识库 · ${month}\n\n${KNOWLEDGE_NOTE}\n`
}

/**
 * Add the contradiction rule to a file written before the note existed.
 * @param content - the file text.
 * @returns the text with the note present.
 */
function ensureKnowledgeNote(content) {
  if (content.includes(KNOWLEDGE_NOTE)) return content
  const lines = String(content).split('\n')
  const heading = lines.findIndex((line) => /^#[ \t]/.test(line))
  if (heading === -1) return `${KNOWLEDGE_NOTE}\n\n${content}`
  lines.splice(heading + 1, 0, '', KNOWLEDGE_NOTE)
  return lines.join('\n')
}

/**
 * Copy one collected Turn into the personal knowledge base, one file per month.
 * Adding the same Turn twice reports `already` instead of writing a second copy.
 * @param filePath - the collection file the Turn lives in.
 * @param messageId - the Turn to promote.
 * @param dir - knowledge base directory.
 * @param now - promotion instant, for tests.
 * @returns the file the copy lives in.
 */
/**
 * Copy the images and files one section references into the knowledge base, so a
 * promoted record keeps its pictures even after the project or the attachment
 * store is gone.
 * @param ctx - host context carrying the model service.
 * @param body - the section body being promoted.
 * @param sessionId - the Session the record came from.
 * @param dir - knowledge base directory.
 * @returns the rewritten body, plus how many images were summarised and the usage.
 */
async function preserveKnowledgeAttachments(ctx, body, sessionId, dir) {
  const assetsDir = path.join(dir, 'assets')
  const promotion = await sessionPromotionContext(ctx, sessionId)
  const route = promotion.route
  let rewritten = body
  let summaryUsage
  let summarised = 0
  // One pass per referenced local file: images get a copy plus a summary, other
  // attachments only a copy.
  const references = [...String(body).matchAll(/!?\[([^\]]*)\]\(([^)\s]+)\)/g)]
  const described = new Map()
  for (const match of references) {
    const [whole, label, destination] = match
    if (typeof destination !== 'string' || !path.isAbsolute(destination)) continue
    let copy
    try {
      fs.mkdirSync(assetsDir, { recursive: true })
      copy = path.join(assetsDir, path.basename(destination))
      if (!fs.existsSync(copy)) fs.copyFileSync(destination, copy)
    } catch {
      continue
    }
    const isImage = whole.startsWith('!')
    let replacement = whole.replace(destination, copy)
    if (isImage) {
      if (!described.has(copy)) {
        const attachment = attachmentForAsset(copy, promotion.images)
        described.set(copy, attachment === undefined ? {} : await summarizeImage(ctx, sessionId, route, attachment))
      }
      const summary = described.get(copy)
      if (summary !== undefined && summary.summary !== undefined) {
        summarised += 1
        if (summary.usage !== undefined) summaryUsage = summary.usage
        replacement = `${replacement}\n\n*图片摘要：${summary.summary}*`
      }
    }
    rewritten = rewritten.replace(whole, replacement)
  }
  return { body: rewritten, summarised, usage: summaryUsage }
}

/**
 * Read the Session once for everything a promotion needs: the model route it
 * last used, and the full durable reference of every image it carried. The
 * reference is taken from the log rather than rebuilt from a file name, because
 * the model call needs the complete record (dimensions included).
 * @param ctx - host context carrying the session query.
 * @param sessionId - the Session the promoted record came from.
 * @returns the route and image references keyed by content hash.
 */
async function sessionPromotionContext(ctx, sessionId) {
  const context = { route: undefined, images: new Map() }
  if (sessionId === undefined) return context
  try {
    const session = await readSession(ctx, sessionId)
    context.route = routeOf(session.events)
    for (const event of Array.isArray(session.events) ? session.events : []) {
      const data = event && event.data ? event.data : {}
      for (const blocks of [data.content, data.message && data.message.content]) {
        for (const block of Array.isArray(blocks) ? blocks : []) {
          if (block && block.type === 'image' && block.attachment && typeof block.attachment.attachmentId === 'string') {
            context.images.set(block.attachment.attachmentId.replace(/^sha256:/, ''), block.attachment)
          }
        }
      }
    }
  } catch {
    // Without the log, promotion still copies the picture but cannot describe it.
  }
  return context
}

/** The durable reference of a copied asset, keyed by its content hash. */
function attachmentForAsset(file, images) {
  const key = path.basename(file, path.extname(file)).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(key)) return undefined
  const known = images === undefined ? undefined : images.get(key)
  if (known !== undefined) return known
  const extension = path.extname(file).toLowerCase().replace('.', '')
  const mediaType = Object.entries(ATTACHMENT_EXTENSIONS).find(([, value]) => value === extension)
  return mediaType === undefined ? undefined : { attachmentId: `sha256:${key}`, mediaType: mediaType[0] }
}

export async function addToKnowledge(ctx, filePath, messageId, dir, now = Date.now()) {
  const existing = knowledgeIndexOf(dir).get(messageId)
  if (existing !== undefined) return { added: false, already: true, filePath: existing, messageId }
  const content = readCollection(filePath)
  const block = findBlock(content, messageId)
  if (block === undefined) {
    throw new HttpError(404, 'not-found', `no collected Turn ${messageId} in that file`)
  }
  const section = splitCollectedSection(block.body)
  const date = new Date(now)
  const file = path.join(dir, `${monthKey(date)}.md`)
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    text = ''
  }
  if (text.trim() === '') text = knowledgeHeader(monthKey(date))
  const ordinal = knowledgeBlocks(text).length + 1
  const sessionId = sessionIdOf(content) ?? undefined
  // The promoted copy owns its pictures: they are copied beside the knowledge
  // base and, for images, summarised so the record can be found by what it shows.
  const preserved = await preserveKnowledgeAttachments(ctx, section.body, sessionId, dir)
  const marker = knowledgeMarker(messageId, sessionId, filePath, now, preserved.summarised === 0 ? undefined : `summaries=${preserved.summarised}`)
  const lines = [
    marker,
    `## ${ordinal}. ${section.title || messageId}`,
    `*收录 ${dayLabel(date)} · 原会话 ${section.time || '未知时间'}*`,
    '',
    preserved.body,
    '',
    `[//]: # "${KNOWLEDGE_MARKER}:end"`,
  ]
  fs.mkdirSync(dir, { recursive: true })
  const next = `${ensureKnowledgeNote(text).replace(/\s*$/, '')}\n\n${lines.join('\n')}\n`
  fs.writeFileSync(file, renumberKnowledge(next), 'utf8')
  return { added: true, already: false, filePath: file, messageId }
}

/**
 * Drop one Turn's copy from the knowledge base. The collection it came from is
 * never touched; a file left with no sections is removed.
 * @param messageId - the Turn to drop.
 * @param dir - knowledge base directory.
 * @returns the file the copy lived in.
 */
export function removeFromKnowledge(messageId, dir) {
  for (const file of knowledgeFiles(dir)) {
    let content
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!knowledgeHas(content, messageId)) continue
    const next = renumberKnowledge(knowledgeRemove(content, messageId))
    if (knowledgeBlocks(next).length === 0) fs.rmSync(file, { force: true })
    else fs.writeFileSync(file, next, 'utf8')
    return { removed: true, filePath: file, messageId }
  }
  throw new HttpError(404, 'not-in-knowledge', `no knowledge entry ${messageId}`)
}

// --- search over everything the plugin saved --------------------------------

/** Most hits one search may return. */
const SEARCH_MAX_LIMIT = 10
/** Hits returned when the caller does not ask for a number. */
const SEARCH_DEFAULT_LIMIT = 5
/** Characters of context returned per hit. */
const SNIPPET_CHARS = 400
/** Target characters per indexed chunk. */
const CHUNK_CHARS = 400
/** Largest section `readKnowledge` returns before truncating. */
const READ_LIMIT_CHARS = 8192

/**
 * Split text into search terms: Latin/digit runs stay whole, CJK runs become
 * overlapping bigrams (a dictionary-free segmentation that still matches words).
 * @param text - any text.
 * @returns the terms, with repeats.
 */
function tokenize(text) {
  const terms = []
  for (const match of String(text).toLowerCase().matchAll(/[a-z0-9_]+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g)) {
    const piece = match[0]
    if (piece.length === 1 || /^[a-z0-9_]+$/.test(piece)) {
      terms.push(piece)
      continue
    }
    for (let index = 0; index + 1 < piece.length; index += 1) terms.push(piece.slice(index, index + 2))
  }
  return terms
}

/** Split one oversized paragraph without cutting inside a sentence if possible. */
function splitLongText(text, maxChars) {
  const parts = []
  let rest = text
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars)
    let cut = -1
    for (const mark of ['\n', '。', '！', '？', '；', '. ', '! ', '? ', '; ']) {
      const at = window.lastIndexOf(mark)
      if (at + mark.length > cut) cut = at + mark.length
    }
    if (cut < maxChars / 2) cut = maxChars
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut)
  }
  if (rest.trim() !== '') parts.push(rest.trim())
  return parts
}

/**
 * Split a section into paragraph-sized chunks. Blank lines separate blocks, a
 * fenced code block is never split, and a long paragraph breaks at a sentence.
 * @param text - the section body.
 * @param maxChars - target chunk size.
 * @returns chunks with their offset in the section.
 */
function chunkText(text, maxChars = CHUNK_CHARS) {
  const blocks = []
  let current = []
  let fence = false
  for (const line of String(text).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    current.push(line)
    if (!fence && line.trim() === '') {
      blocks.push(current.join('\n'))
      current = []
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  const chunks = []
  let buffer = ''
  let bufferOffset = 0
  let cursor = 0
  const flush = () => {
    if (buffer.trim() !== '') chunks.push({ text: buffer.trim(), offset: bufferOffset })
    buffer = ''
  }
  for (const block of blocks) {
    const piece = block.trim()
    const offset = cursor
    cursor += block.length + 1
    if (piece === '') continue
    if (buffer !== '' && buffer.length + piece.length + 2 > maxChars) flush()
    if (piece.length > maxChars) {
      flush()
      let inner = 0
      for (const part of splitLongText(piece, maxChars)) {
        chunks.push({ text: part, offset: offset + inner })
        inner += part.length
      }
      continue
    }
    if (buffer === '') bufferOffset = offset
    buffer = buffer === '' ? piece : `${buffer}\n\n${piece}`
  }
  flush()
  return chunks
}

/** How the model is told to look for saved work, and when not to. */
const SEARCH_TOOL_DESCRIPTION = [
  '搜索用户保存过的对话内容（个人知识库 + 会话收藏），用于复用过去的结论、避免重复调研。',
  'Search the user\'s saved conversation turns (personal knowledge base + per-session collections).',
  '何时使用：用户提到"上次 / 之前 / 我们讨论过 / 复用"，或你正准备重新调研一个可能已经做过的主题。',
  '何时不要用：普通知识问答、与用户历史无关的新问题——不要每个问题都调用。',
  "参数：query 必填；scope 默认 'knowledge'（只搜个人知识库），'all' 连会话收藏一起搜；limit 默认 5，最多 10。",
  '返回：最多 limit 条，每条含标题、时间、来源文件与行号、命中片段（不是全文）、以及可交给 read_knowledge 的 id。',
  '注意：这些是用户保存的记录，可能过时或有误；引用时必须注明来源与日期，不得当作已验证事实。',
  '若多条命中互相矛盾（或后一条推翻了前一条），以「原会话时间」较晚的一条为准，并说明你采用了较新的那条。',
].join('\n')

/** How the model is told to pull a whole section after a hit. */
const READ_TOOL_DESCRIPTION = [
  '按 id 读回 search_knowledge 命中的那一节完整内容（上限 8 KB，超出会截断并说明）。',
  'Read back one saved section in full by the id returned from search_knowledge.',
  '何时使用：命中片段不足以判断、或需要原文细节（命令、代码、路径）时。',
].join('\n')

const SEARCH_PARAMETERS = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '要查找的关键词或短语 / keywords to look for' },
    scope: {
      type: 'string',
      enum: ['knowledge', 'all'],
      description: "默认 'knowledge' 只搜个人知识库；'all' 连会话收藏一起搜",
    },
    limit: { type: 'number', description: '最多返回几条，默认 5，上限 10', minimum: 1, maximum: 10 },
  },
  required: ['query'],
  additionalProperties: false,
}

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    scope: { type: 'string' },
    limit: { type: 'number' },
    total: { type: 'number' },
    matched: { type: 'number' },
    note: { type: 'string' },
    hits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          messageId: { type: 'string' },
          scope: { type: 'string' },
          title: { type: 'string' },
          time: { type: 'string' },
          source: { type: 'string' },
          origin: { type: 'string' },
          lines: { type: 'string' },
          snippet: { type: 'string' },
          matches: { type: 'number' },
          score: { type: 'number' },
        },
        required: ['id', 'messageId', 'scope', 'title', 'source', 'snippet', 'matches'],
        additionalProperties: false,
      },
    },
  },
  required: ['query', 'scope', 'limit', 'hits'],
  additionalProperties: false,
}

const READ_PARAMETERS = {
  type: 'object',
  properties: { id: { type: 'string', description: 'search_knowledge 返回的 id' } },
  required: ['id'],
  additionalProperties: false,
}

const READ_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    scope: { type: 'string' },
    title: { type: 'string' },
    source: { type: 'string' },
    text: { type: 'string' },
    truncated: { type: 'boolean' },
  },
  required: ['id', 'scope', 'title', 'source', 'text', 'truncated'],
  additionalProperties: false,
}

/** Model-facing text for one search. */
function renderSearch(value) {
  const lines = []
  if (value.hits.length === 0) {
    lines.push(value.note === undefined
      ? `没有找到与「${value.query}」相关的内容（已索引 ${value.total} 块）。不要据此编造结论。`
      : `没有可搜索的内容（${value.note}）。不要据此编造结论。`)
    return lines.join('\n')
  }
  lines.push(`找到 ${value.hits.length} 个小节（索引 ${value.total} 块，命中 ${value.matched ?? value.hits.length} 个小节）：`)
  value.hits.forEach((hit, index) => {
    const where = hit.scope === 'knowledge' ? '知识库' : '收藏'
    lines.push('')
    const spread = hit.matches > 1 ? `（本节 ${hit.matches} 处命中，片段只是其中一处）` : ''
    lines.push(`${index + 1}. [${where}] ${hit.title}${hit.time === '' || hit.time === undefined ? '' : ` · ${hit.time}`}${spread}`)
    lines.push(`   来源：${hit.source}${hit.lines === undefined ? '' : `#L${hit.lines}`}`)
    if (hit.origin !== undefined) lines.push(`   原收藏：${hit.origin}`)
    lines.push(`   ${hit.snippet.replace(/\n+/g, ' ')}`)
    lines.push(`   id：${hit.id}`)
  })
  lines.push('')
  lines.push('提示：这些是用户保存的记录，可能过时或有误；引用时请注明来源与日期。')
  lines.push('若多条命中互相矛盾，以「原会话时间」较晚的一条为准。需要原文细节时用 read_knowledge 取回该节。')
  return lines.join('\n')
}

/** A stable, opaque handle for one chunk, so a model can ask for the section. */
function encodeChunkId(file, messageId, scope) {
  return Buffer.from(JSON.stringify({ f: file, m: messageId, s: scope }), 'utf8').toString('base64url')
}

function decodeChunkId(id) {
  try {
    const parsed = JSON.parse(Buffer.from(String(id), 'base64url').toString('utf8'))
    if (parsed && typeof parsed.f === 'string' && typeof parsed.m === 'string') return parsed
  } catch {
    // fall through to the error below
  }
  throw new HttpError(400, 'invalid', 'unknown chunk id')
}

/** Every saved section, from the knowledge base and/or the session collections. */
function savedSections(ctx, scope, knowledgeDir) {
  const sections = []
  if (knowledgeDir !== undefined && scope !== 'saved') {
    for (const file of knowledgeFiles(knowledgeDir)) {
      let content
      try {
        content = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }
      for (const block of knowledgeBlocks(content)) {
        const section = splitCollectedSection(block.body)
        const source = /source=([^"]*)/.exec(block.text)
        sections.push({
          scope: 'knowledge',
          file,
          messageId: block.messageId,
          title: section.title || block.messageId,
          time: section.time,
          origin: source === null ? undefined : source[1].trim(),
          body: section.body,
          startLine: countLines(content.slice(0, block.index)) + 1,
        })
      }
    }
  }
  if (scope !== 'knowledge') {
    const registry = ctx.get('workspaceRegistry')
    const workspaces = registry && typeof registry.list === 'function' ? registry.list() : []
    for (const workspace of workspaces) {
      if (!workspace || typeof workspace.path !== 'string') continue
      const dir = path.join(workspace.path, DIR_NAME)
      let names
      try {
        names = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith('.md'))
      } catch {
        continue
      }
      for (const name of names) {
        const file = path.join(dir, name)
        let content
        try {
          content = fs.readFileSync(file, 'utf8')
        } catch {
          continue
        }
        for (const pattern of blockPatterns(undefined)) {
          let match = pattern.exec(content)
          while (match !== null) {
            const section = splitCollectedSection(match[2])
            sections.push({
              scope: 'saved',
              file,
              messageId: match[1],
              title: section.title || match[1],
              time: section.time,
              body: section.body,
              startLine: countLines(content.slice(0, match.index)) + 1,
            })
            match = pattern.exec(content)
          }
        }
      }
    }
  }
  return sections
}

function countLines(text) {
  let lines = 0
  for (const character of String(text)) if (character === '\n') lines += 1
  return lines
}

/**
 * Read the turn time out of a section label. The knowledge base records
 * `收录 <date> · 原会话 <time>`, so the last date in the text is the turn's own.
 * @param label - the section's time label.
 * @returns epoch milliseconds, or 0 when the label has no date.
 */
function parseTurnTime(label) {
  const matches = String(label).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/g)
  if (matches === null || matches.length === 0) return 0
  const last = matches[matches.length - 1].replace('T', ' ').split(' ')
  const [year, month, day] = last[0].split('-').map(Number)
  const [hour, minute] = last[1].split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute).getTime()
}

/** The first window of text around the first matching term. */
function snippetOf(text, terms) {
  const lowered = text.toLowerCase()
  let at = -1
  for (const term of terms) {
    const found = lowered.indexOf(term)
    if (found !== -1 && (at === -1 || found < at)) at = found
  }
  if (text.length <= SNIPPET_CHARS) return text.trim()
  if (at === -1) return `${text.slice(0, SNIPPET_CHARS).trim()}…`
  const start = Math.max(0, Math.min(at - Math.floor(SNIPPET_CHARS / 3), text.length - SNIPPET_CHARS))
  const end = Math.min(text.length, start + SNIPPET_CHARS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Rank every saved chunk against a query with BM25 over the tokenizer above.
 * @param ctx - host context, for the workspace registry.
 * @param query - what to look for.
 * @param options - scope ('knowledge' | 'saved' | 'all') and limit.
 * @param knowledgeDir - knowledge base directory, when configured.
 * @returns hits, best first.
 */
export function searchKnowledge(ctx, query, options = {}, knowledgeDir) {
  const text = String(query === undefined || query === null ? '' : query).trim()
  const scope = options.scope === 'all' || options.scope === 'saved' ? options.scope : 'knowledge'
  const requested = Number.isFinite(options.limit) ? Math.trunc(options.limit) : SEARCH_DEFAULT_LIMIT
  const limit = Math.max(1, Math.min(SEARCH_MAX_LIMIT, requested))
  if (text === '') {
    return { query: text, scope, limit, hits: [], total: 0, note: 'no query given' }
  }
  const terms = tokenize(text)
  const sections = savedSections(ctx, scope, knowledgeDir)
  // With both scopes searched, a promoted Turn would otherwise appear twice with
  // identical text; the promoted copy is the one worth citing.
  const promoted = new Set(sections.filter((section) => section.scope === 'knowledge').map((section) => section.messageId))
  const chunks = []
  for (const section of sections) {
    if (scope === 'all' && section.scope === 'saved' && promoted.has(section.messageId)) continue
    for (const chunk of chunkText(section.body)) {
      chunks.push({
        ...section,
        stamp: parseTurnTime(section.time),
        text: chunk.text,
        lineStart: section.startLine + countLines(section.body.slice(0, chunk.offset)) + 1,
        lineEnd: section.startLine + countLines(section.body.slice(0, chunk.offset + chunk.text.length)) + 1,
      })
    }
  }
  if (chunks.length === 0) {
    return { query: text, scope, limit, hits: [], total: 0, note: 'nothing has been saved yet' }
  }
  const documentFrequency = new Map()
  const documents = chunks.map((chunk) => {
    const body = tokenize(chunk.text)
    const title = tokenize(chunk.title)
    const frequencies = new Map()
    for (const term of body) frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
    const titleFrequencies = new Map()
    for (const term of title) titleFrequencies.set(term, (titleFrequencies.get(term) ?? 0) + 1)
    for (const term of new Set([...body, ...title])) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    return { frequencies, titleFrequencies, length: Math.max(1, body.length) }
  })
  const total = documents.length
  const average = documents.reduce((sum, document) => sum + document.length, 0) / total
  const k1 = 1.2
  const b = 0.75
  const unique = [...new Set(terms)]
  const scored = []
  documents.forEach((document, index) => {
    let score = 0
    for (const term of unique) {
      const frequency = document.frequencies.get(term) ?? 0
      const titleFrequency = document.titleFrequencies.get(term) ?? 0
      if (frequency === 0 && titleFrequency === 0) continue
      const seen = documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (total - seen + 0.5) / (seen + 0.5))
      if (frequency > 0) {
        score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (document.length / average))))
      }
      if (titleFrequency > 0) score += idf * 2 * titleFrequency
    }
    if (score > 0) scored.push({ index, score })
  })
  // One section is one result: a long Turn is indexed as many paragraph chunks,
  // and returning each of them would repeat the same title and spend the whole
  // hit budget on one Turn. The best-scoring chunk represents the section; the
  // count tells the reader (and the model) that more of it matched.
  const bySection = new Map()
  for (const { index, score } of scored) {
    const key = `${chunks[index].file}\u0000${chunks[index].messageId}`
    const seen = bySection.get(key)
    if (seen === undefined) {
      bySection.set(key, { index, score, matches: 1 })
      continue
    }
    seen.matches += 1
    if (score > seen.score) {
      seen.score = score
      seen.index = index
    }
  }
  // Rank by relevance, then by how much of the section matched, then by the
  // later Turn — the rule the library states for contradictory entries.
  const ordered = [...bySection.values()].sort((left, right) => (
    right.score - left.score
    || right.matches - left.matches
    || chunks[right.index].stamp - chunks[left.index].stamp
    || left.index - right.index
  ))
  const hits = ordered.slice(0, limit).map(({ index, score, matches }) => {
    const chunk = chunks[index]
    const hit = {
      id: encodeChunkId(chunk.file, chunk.messageId, chunk.scope),
      messageId: chunk.messageId,
      scope: chunk.scope,
      title: chunk.title,
      time: chunk.time,
      source: chunk.file,
      origin: chunk.origin,
      lines: `${chunk.lineStart}-${chunk.lineEnd}`,
      snippet: snippetOf(chunk.text, unique),
      matches,
      score: Number(score.toFixed(3)),
    }
    return Object.fromEntries(Object.entries(hit).filter(([, entry]) => entry !== undefined))
  })
  return { query: text, scope, limit, hits, total: chunks.length, matched: ordered.length }
}

/**
 * Read one saved section back in full, for a model that needs more than a hit's
 * snippet. Output is capped so one call can never pull an unbounded section.
 * @param ctx - host context, for the workspace registry.
 * @param id - a chunk id from `searchKnowledge`.
 * @param knowledgeDir - knowledge base directory, when configured.
 * @returns the section text, possibly truncated.
 */
export function readKnowledge(ctx, id, knowledgeDir) {
  const target = decodeChunkId(id)
  const scope = target.s === 'knowledge' ? 'knowledge' : 'saved'
  const section = savedSections(ctx, scope, knowledgeDir)
    .find((entry) => entry.file === target.f && entry.messageId === target.m)
  if (section === undefined) {
    throw new HttpError(404, 'not-found', 'that saved section no longer exists')
  }
  const head = `## ${section.title}${section.time === '' ? '' : `\n*${section.time}*`}`
  const full = `${head}\n\n${section.body}`
  if (full.length <= READ_LIMIT_CHARS) {
    return { id, scope, title: section.title, source: section.file, text: full, truncated: false }
  }
  return {
    id,
    scope,
    title: section.title,
    source: section.file,
    text: `${full.slice(0, READ_LIMIT_CHARS)}\n\n…（已截断，原文更长的部分请直接读取该文件）`,
    truncated: true,
  }
}

/** Read the collected message ids of one Session from its file. */
export async function favoriteState(ctx, sessionId) {
  const cwd = await cwdOf(ctx, sessionId)
  if (cwd === undefined) return { messageIds: [], filePath: null }
  const file = findFileForSession(favoritesDir(cwd), sessionId)
  if (file === undefined) return { messageIds: [], filePath: null }
  return { messageIds: itemsOf(readTextIfPresent(file)).map((item) => item.messageId), filePath: file }
}

/**
 * Parse cache. Opening a collection re-reads every markdown file, and the panel
 * does that on mount, after each edit, and on every view switch; a file whose
 * size and mtime are unchanged cannot have different contents, so its parse is
 * reused. Entries are keyed by absolute path and replaced in place, so the map
 * only ever holds one record per file that has been seen.
 */
const FILE_CACHE = new Map()

/** Drop every cached parse — used by tests and after an external rewrite. */
export function clearFavoritesCache() {
  FILE_CACHE.clear()
}

/**
 * Read one file through the parse cache.
 * @param file - absolute path.
 * @param parse - turns file contents into the cached value.
 * @returns the parsed value, or undefined when the file cannot be read.
 */
function readParsed(file, parse) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    FILE_CACHE.delete(file)
    return undefined
  }
  const hit = FILE_CACHE.get(file)
  if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.parsed
  let content
  try {
    content = fs.readFileSync(file, 'utf8')
  } catch {
    FILE_CACHE.delete(file)
    return undefined
  }
  const parsed = parse(content)
  FILE_CACHE.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, parsed })
  return parsed
}

/** Parse one collection file into its Session identity and collected Turns. */
function parseCollection(content) {
  const items = itemsOf(content)
  if (items.length === 0) return undefined
  const title = TITLE_RE.exec(content)
  return {
    sessionId: sessionIdOf(content) ?? null,
    title: title === null ? null : title[1].trim(),
    items,
  }
}

function scanWorkspace(workspace) {
  const dir = favoritesDir(workspace.path)
  let names
  try {
    names = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith('.md')).sort()
  } catch {
    return undefined
  }
  const sessions = []
  for (const entry of names) {
    const file = path.join(dir, entry)
    const parsed = readParsed(file, parseCollection)
    if (parsed === undefined) continue
    sessions.push({
      sessionId: parsed.sessionId,
      title: parsed.title === null ? entry.replace(/\.md$/i, '') : parsed.title,
      filePath: file,
      // Copies, because the catalog decorates items with knowledge base state and
      // the cached parse must stay untouched.
      items: parsed.items.map((item) => ({ ...item })),
    })
  }
  if (sessions.length === 0) return undefined
  return { id: workspace.id, title: workspace.title, path: workspace.path, sessions }
}

/** Collect every workspace's Session collections for the sidebar panel. */
export function favoritesCatalog(ctx, knowledgeDir) {
  const registry = ctx.get('workspaceRegistry')
  let workspaces = []
  if (registry && typeof registry.list === 'function') {
    try {
      workspaces = registry.list()
    } catch {
      workspaces = []
    }
  }
  const groups = []
  for (const workspace of workspaces) {
    if (!workspace || typeof workspace.path !== 'string') continue
    const group = scanWorkspace(workspace)
    if (group !== undefined) groups.push(group)
  }
  if (knowledgeDir !== undefined) {
    const index = knowledgeIndexOf(knowledgeDir)
    for (const group of groups) {
      for (const session of group.sessions) {
        for (const item of session.items) {
          const file = index.get(item.messageId)
          if (file !== undefined) {
            item.inKnowledge = true
            item.knowledgeFile = file
          }
        }
      }
    }
  }
  return groups
}

// --- plugin ------------------------------------------------------------------

function routeHandler(ctx, run) {
  return async (req, res) => {
    if (!guard(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'method', error: 'POST only' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const value = await run(body)
      sendJson(res, 200, { ok: true, ...value })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const code = error instanceof HttpError ? error.code : 'internal'
      sendJson(res, status, { ok: false, code, error: String((error && error.message) || error) })
    }
  }
}

function requireString(body, key) {
  const value = typeof body[key] === 'string' ? body[key].trim() : ''
  if (!value) throw new HttpError(400, 'invalid', `${key} required`)
  return value
}

/** Register the three local routes once a web surface exists. */
export function apply(ctx, config) {
  // Resolving the knowledge directory must never take the host half down: a bad
  // setting degrades that one feature, and the collection keeps working.
  let knowledgeDir
  try {
    knowledgeDir = resolveKnowledgeDir(config)
  } catch (error) {
    knowledgeDir = undefined
    ctx.logger?.warn?.('dsh-save-chat: knowledge directory unavailable: %s', String((error && error.message) || error))
  }
  const registerRoutes = (webServer, fiber) => {
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/catalog`,
      handler: routeHandler(ctx, async () => ({
        workspaces: favoritesCatalog(ctx, knowledgeDir),
        knowledgeDir,
        knowledge: knowledgeDir === undefined ? [] : knowledgeEntries(knowledgeDir),
      })),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/state`,
      handler: routeHandler(ctx, async (body) => {
        const sessionId = requireString(body, 'sessionId')
        return favoriteState(ctx, sessionId)
      }),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/knowledge`,
      handler: routeHandler(ctx, async (body) => {
        if (knowledgeDir === undefined) {
          throw new HttpError(503, 'unavailable', 'the knowledge base directory could not be resolved')
        }
        const action = requireString(body, 'action')
        const messageId = requireString(body, 'messageId')
        if (action === 'add') {
          return addToKnowledge(ctx, requireString(body, 'filePath'), messageId, knowledgeDir)
        }
        if (action === 'remove') return removeFromKnowledge(messageId, knowledgeDir)
        if (action === 'rename') return renameKnowledge(messageId, body.title, knowledgeDir)
        throw new HttpError(400, 'invalid', `unknown action "${action}"`)
      }),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/reveal`,
      handler: routeHandler(ctx, async (body) => revealCollected(ctx, requireString(body, 'filePath'), knowledgeDir)),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/favorite`,
      handler: routeHandler(ctx, async (body) => {
        const action = requireString(body, 'action')
        const filePath = requireString(body, 'filePath')
        const messageId = requireString(body, 'messageId')
        switch (action) {
          case 'rename': return renameTurn(filePath, messageId, body.title)
          case 'pin': return setTurnPinned(filePath, messageId, body.pinned !== false)
          case 'unpin': return setTurnPinned(filePath, messageId, false)
          case 'remove': return removeTurn(filePath, messageId)
          default: throw new HttpError(400, 'invalid', `unknown action "${action}"`)
        }
      }),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/document`,
      handler: routeHandler(ctx, async (body) => {
        const filePath = requireString(body, 'filePath')
        const messageId = typeof body.messageId === 'string' && body.messageId.trim() !== '' ? body.messageId.trim() : undefined
        return readCollected(filePath, messageId, knowledgeDir)
      }),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/search`,
      handler: routeHandler(ctx, async (body) => searchKnowledge(ctx, requireString(body, 'query'), {
        scope: typeof body.scope === 'string' ? body.scope : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      }, knowledgeDir)),
    }))
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/toggle`,
      handler: routeHandler(ctx, async (body) => {
        const sessionId = requireString(body, 'sessionId')
        const messageId = requireString(body, 'messageId')
        return toggleFavorite(ctx, sessionId, messageId)
      }),
    }))
  }

  // The model reaches the same search the panel does, but only when it asks:
  // nothing here is injected into a prompt, so an unused library costs nothing.
  const registerTools = (tools, fiber) => {
    if (!tools || typeof tools.register !== 'function') return
    fiber.effect(() => tools.register({
      name: 'search_knowledge',
      description: SEARCH_TOOL_DESCRIPTION,
      parameters: SEARCH_PARAMETERS,
      output: {
        schema: SEARCH_OUTPUT_SCHEMA,
        render: (args, value) => [{ type: 'text', text: renderSearch(value) }],
      },
      async execute(args) {
        return searchKnowledge(ctx, args.query, { scope: args.scope, limit: args.limit }, knowledgeDir)
      },
    }))
    fiber.effect(() => tools.register({
      name: 'read_knowledge',
      description: READ_TOOL_DESCRIPTION,
      parameters: READ_PARAMETERS,
      output: {
        schema: READ_OUTPUT_SCHEMA,
        render: (args, value) => [{ type: 'text', text: `来源：${value.source}\n\n${value.text}` }],
      },
      async execute(args) {
        return readKnowledge(ctx, args.id, knowledgeDir)
      },
    }))
  }

  const webServer = ctx.get('webServer')
  if (webServer) {
    registerRoutes(webServer, ctx)
  } else {
    // A terminal-only profile never provides a web surface; register once one appears.
    ctx.inject(['webServer'], (sub) => registerRoutes(sub.webServer, sub))
  }

  const tools = ctx.get('tools')
  if (tools) {
    registerTools(tools, ctx)
  } else {
    // Profiles without a tool registry simply do not offer the model this tool.
    ctx.inject(['tools'], (sub) => registerTools(sub.tools, sub))
  }
}


// reload probe 1790873576

// reload probe 1790948354

// probe 2 1790948361

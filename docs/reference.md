# Reference

> The full reference for `dsh-save-chat`: file format, routes, design notes, and limitations.
> For the quick start, see the [README](../README.md).

---

Favorite any turn of a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) conversation. A heart in the assistant action row collects the turn into a real Markdown file inside the session's workspace, and a sidebar panel browses every collected turn across workspaces and sessions, with the collected section rendered beside the list.

[中文说明](README.zh.md)

## What it adds

| Where | DSH extension point | Behavior |
|---|---|---|
| Heart button in an assistant message's action row | `conversation.chat.assistant-actions` slot | Hollow grey = not collected, filled red = collected. The heart flips immediately and the write lands in the background; clicking again retracts the turn, so the same turn can never be recorded twice. |
| "Favorites" entry in the left sidebar | `sidebar.panellist` entry + `main` panel | A folder row per workspace (chevron + folder icon + name, click to collapse), one row per session under it (its own chevron collapses that session's list), and one row per collected turn under the session, each with its ordinal, title, and collection time. The page keeps the whole width until something is clicked. Right-clicking a collected turn opens Pin to top / Rename / Delete. |
| Reader beside the list | the product's `MarkdownText` renderer over text this plugin's host half serves | Clicking a collected turn shows exactly that section; **Show full document** in the toolbar switches to the whole file scrolled to that section, and **Show this turn only** narrows it back. Clicking a session always reads the whole file from the top, and the scope control stays visible there in a disabled state that explains itself. **Reveal in folder** hands the file's path to the host file manager. The list stays on screen and nothing navigates, so browsing never leaves the collection. |

## Requirements

- A DSH Web/GUI profile (the plugin registers into the browser surface and one loopback HTTP route set).
- The profile provides `sessionQuery`, `workspaceRegistry`, `webServer`, and the client services `slots` and `locale` — shipped Web profiles (`dsh-web-app`) provide all of them. Reveal in folder is served by this plugin's own host half (`POST /reveal` on the routes below), which hands the path to the session controller's desktop opener; the toolbar reports the host's own failure reason when a reveal cannot be performed.
- Optional: an `llm` provider route. Without one, collected turns are named with your own question instead of a model summary.

## Install

From the DSH Plugins page, from an agent session through the `plugin_manager` tool, or from the CLI:

```sh
# npm package
plugin_manager install_bundle "dsh-save-chat"

# or a local checkout
plugin_manager install_bundle "/absolute/path/to/dsh-save-chat"
```

The package declares `dsh.bundle.patch`, so installation inserts one loader row into the current profile; `exports["./client"]` supplies the browser half, and there is no build step. Reload the page once after installing so the shell picks up the new client bundle.

## Where favorites are stored

One Markdown file per session, named after the session, under the session's working directory:

```
<session cwd>/.dsh-favorites/<session title>.md
```

The first collected turn creates the file; later ones append a section; retracting a turn deletes exactly that section. The file is the single source of truth — the heart's state and the panel's contents are both parsed back out of it, so no second index can drift. A typical file:

```markdown
# 创建并运行临时 Cordis 浮窗计数器插件

[//]: # "dsh-favorites:session=session-ce020ac1-a133-460e-bd37-6e3883385c13"

[//]: # "dsh-favorite:start 61ed3cd4-d01f-4cee-b59f-5fafe807eda9"
## 1. add_compare 名称冲突及动态插件受限分析
*2026-09-17 00:22*

### User

> 请创建并运行一个临时动态 Host 插件…

### assistant

我按你的要求先检查了工具注册接口和已有工具名，结论如下。

#### 1. 名称冲突：`add_compare` 已存在

…

[//]: # "dsh-favorite:end"
```

Document levels are fixed: `#` the session title, `##` one collected turn, `### User` / `### assistant` the two speakers, and `####` or deeper for headings the answer itself wrote. A turn's heading carries its 1-based ordinal (`## 2. …`) and the collection time sits on the small italic line under it — Markdown cannot mix text sizes inside one heading, so that line is the only place the time can stay small. Ordinals stay contiguous, so removing a turn renumbers the ones after it. Reply headings are demoted automatically so an answer can never render beside the entry that contains it, and fenced code blocks are never rewritten.

Bookkeeping rides Markdown **link reference definitions** (`[//]: # "…"`). CommonMark consumes those, so the rendered document shows no plugin syntax at all while the file keeps everything the plugin needs. Sections written by earlier revisions of this package (HTML-comment markers, a note line under the title, a separate italic time line, unnumbered headings) are still read and deleted; the next write to that file migrates it to the current form.

## Turn titles

When a turn is collected, the host half asks the model route the session last used (`request/header` in the session log) for a short title, which becomes the directory entry and the `##` heading:

- Input is the turn's user input plus the assistant text, truncated to 4000 characters; output is capped at 48 tokens with an 8-second timeout (`purpose: 'session-title'`).
- Any failure — no route, no `llm` service, refusal, timeout, provider error — falls back to the first line of your own message (40 characters), so an entry always has a name.
- The title is generated once, when you click the heart. Opening or refreshing the panel never calls a model. Retract and collect again to regenerate it.

## Row actions

Right-clicking a collected turn offers three actions, and all three rewrite that turn's own Markdown section — there is no second store to drift:

- **Pin to top** moves the section above every other one in the file and records a `pinned` field in its marker (`[//]: # "dsh-favorite:start <messageId> … pinned"`), so the file alone says what is pinned. The menu then offers **Unpin**, which clears the field without moving the section; later collections append below the pinned ones.
- **Rename** replaces the section heading's title (the ordinal and every other field stay).
- **Delete** removes the section. The heart in the transcript reads the same file, so that turn shows as uncollected again.

## Search — for you and for the model

One search backend backs two surfaces, so what you find by hand is exactly what the model can find.

- **In the panel**: the header carries a **Collections / Knowledge base** switch instead of a refresh button (entering a view re-reads the files, which is also how a hand-edited collection shows up). The search box covers the list in front of you — collections in one view, the knowledge base in the other. A hit shows its title, time, `file#lines`, and a snippet; its path already says where it lives, so no badge is needed. Clicking a hit opens that section in the reader beside the list.
- **Copy reference** on any row puts `@<file>` (DSH's own mention grammar, quoted when the path has spaces) on the clipboard, so pasting it into a later conversation hands that saved record to the model.
- **Images and attachments are not dropped**: a recorded Turn keeps a placeholder line such as `_[图片：image.png · 706×94 · 5.3 KB · image/webp · sha256:7e9140cc…]_` where the attachment sat. Reasoning and tool bookkeeping stay out of the record.
- **Parses are cached by size and mtime**, so opening the panel after the first read re-uses unchanged files instead of re-parsing them (60 collection files: 2.5 ms cold, 0.3 ms warm). An edit changes size or mtime and is picked up immediately; the cache is dropped for a file that disappears.
- **The knowledge base is yours to edit**: its own view lists every promoted Turn **grouped by month** (the file it came from), where a right-click renames (the copy only — the collection keeps its own title) or **removes** it. That is also the only way to drop a copy whose original project is gone, since the collection row no longer exists. The view states plainly — emphasised — that the AI can search knowledge base content on demand and that nothing is injected automatically. The reader pane has a close button that puts the list back to full width.
- **As a tool**: the model gets `search_knowledge` (query, `scope` = `knowledge` | `all`, `limit`) plus `read_knowledge` (the id of a hit) to pull one section back in full. Both are **on demand**: nothing is injected into a prompt, so a library nobody asks about costs nothing. The tool description says when to use it (the user refers back to earlier work) and when not to (unrelated questions), states that hits are the user's own saved records that may be stale, and requires citing source and date.
- Chunks are **paragraph-sized** (a fenced code block is never split), which keeps ranking precise, but **one section is one hit**: a query matching several places in the same turn returns a single result with a match count (the panel shows `本节 N 处命中`), so the hit budget is spent on distinct turns. Each hit carries a ~400-character snippet rather than the whole section, and `read_knowledge` refuses to return more than 8 KB at once — one retrieval can never flood the context.
- Ranking is plain **BM25** over a built-in tokenizer (Latin words whole, CJK as overlapping bigrams), **no dependencies, no vector store, no index file on disk** — the library stays plain markdown that you can read, edit, and grep yourself.
- A turn that was also promoted to the knowledge base is reported once, as the promoted copy.

## Personal knowledge base

The library states one rule where every reader sees it — in the file header, in the search results, and in the tool description: **when two entries contradict each other, the one with the later original conversation time wins.** Relevance decides the order of hits; a tie between equally relevant chunks is broken by recency.

Right-clicking a collected turn can also **Add to knowledge base**, which copies that section into a personal, cross-project store — the counterpart to the per-session collection: the collection is the project's raw record, the knowledge base is what you decided to keep for good.

- Location: `~/.dsh/knowledge/<YYYY-MM>.md`, one file per month, overridable per profile:

  ```yaml
  - id: dsh-save-chat
    name: dsh-save-chat
    config:
      knowledgeDir: /absolute/path/to/your/notes/knowledge
  ```

- Each copy keeps its provenance in its own marker — `[//]: # "dsh-knowledge:start <messageId> from=<sessionId> at=<ISO> source=<collection file>"` — plus a `*收录 <date> · 原会话 <time>*` line, so a copy can always be traced back (or found again if the project is gone).
- The section is copied whole (original words, `User` / `assistant`, demoted headings).
- **Pictures come along**: every image or file the section references is copied into `~/.dsh/knowledge/assets/`, the markdown is rewritten to the copy, and each image gets a one-sentence **image summary** written beneath it — one small vision call per image, using the Session's own model route, which is what makes an image findable later by what it shows rather than by its filename. The marker records `summaries=N`; a failed or unavailable model leaves the picture in place without a summary.
- **Adding twice writes one copy.** The row then carries a `★` whose tooltip names the knowledge file.
- **Removing from the knowledge base never touches the collection**, and deleting a collected turn never touches the knowledge base — the two stores are independent. A month file left with no sections is deleted.
- The panel asks the host for this state with the catalog, so `★` survives a reload.

## Token cost

Collecting one turn spends exactly one auxiliary model call: the title request. Its billed counts are recorded in that section's own marker line —

```
[//]: # "dsh-favorite:start <messageId> tokens=<input>+<output>"
```

— where `input` is the whole prompt side (uncached + cache-read + cache-write, which adapters report as disjoint counts) and `output` is the generated tokens. The panel sums what has been recorded and shows the total beside Refresh, and each row's tooltip carries its own count.

Nothing else records it. DSH persists usage only where a caller logs it — the agent loop writes `assistant/message` — and this call is a direct `ctx.llm.stream()` from the plugin, so it is absent from the session log, from the per-message token badge, and from DSH telemetry. DSH's own session-title generation behaves the same way: it logs its request (`session/title-llm-request`) but not the usage that comes back. Sections collected before this recording existed carry no counts, so the panel total covers recorded collections only.

## HTTP routes

The host half registers three loopback-only routes; the browser half uses them to read and write the collection.

```
POST /dsh-save-chat/catalog   {}                        -> { workspaces: [...] }
POST /dsh-save-chat/state     { sessionId }             -> { messageIds, filePath }
POST /dsh-save-chat/toggle    { sessionId, messageId }  -> { favorited, filePath, ... }
POST /dsh-save-chat/document  { filePath, messageId? }  -> { markdown }
POST /dsh-save-chat/favorite  { action, filePath, messageId, title?, pinned? }
POST /dsh-save-chat/reveal    { filePath }                        -> { revealed: true }
POST /dsh-save-chat/knowledge { action: 'add' | 'remove', filePath?, messageId }
POST /dsh-save-chat/search    { query, scope?, limit? }            -> { hits: [...] }
```

`favorite` runs one row action — `pin`, `unpin`, `rename`, or `remove` — against a collection file the catalog produced.

`document` serves the reader: the whole file, or one collected turn's section. It refuses any path that is not one of the plugin's own `.dsh-favorites/*.md` files, so it cannot be used to read arbitrary files.

Each route checks the socket address, the `Host` header, and (when present) the `Origin` header, the same way `dsh-delete-session` does.

## Why the reader lives in the panel

DSH hides the right column whenever a global main panel is active: `shown = active && …` with `active = panelInfo.activePanelId === null`, and a `sidebar.panellist` entry selects exactly such a panel. A collection panel and the session right sidebar therefore can never be visible at the same time. The collection renders its own reader beside the list instead — the same master–detail shape the shipped task page uses for its task detail — which also means browsing favorites never navigates the conversation.

## Design notes

- The plugin imports no DSH SDK package and patches no DOM. Every service is resolved through the cordis context at call time (`ctx.get(...)`), and React plus the shared UI primitives come from the page's frozen module table, so the package loads on any profile and degrades gracefully when an optional service is absent.
- Turn content is read from the canonical session log through `sessionQuery`, so a collected turn is the durable record rather than whatever the transcript happened to render.
- A collected Turn records the human's own words. Harness bookkeeping shares the same `user/message` event type — runtime and time snapshots, instruction and skill reminders, background-job results, subagent settlements, teammate messages — so recording is a whitelist: `user`, plus a scheduled reminder unwrapped from its machine envelope to the prompt its author wrote. Everything else stays out of the file.
- Harness-injected user messages (runtime context, time context, instruction reminders) are never mistaken for your input; only messages whose source kind is not one of those are recorded.

## Limitations

- A session that records no working directory cannot be collected (`no-workspace`), because there is nowhere to place the file.
- The panel lists only files under registered workspaces that still carry a session marker. A deleted session leaves its Markdown file behind, and the plugin stops listing it.
- Very long sessions make the title call read the session log; the call itself is bounded to one turn's text and a single small model request.
- Consider adding `.dsh-favorites/` to a project's `.gitignore`; the plugin never edits your repository files.

## Development

Link a checkout into a profile and let the host half reload on edit:

```sh
plugin_manager install_bundle "/absolute/path/to/dsh-save-chat"
```

Because the package then lives outside the profile directory, its Node half is not watched by default. Add the checkout to the profile's HMR roots (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: hmr
  name: "@deepseek-ai/dsh-hmr"
  config:
    root:
      - /absolute/path/to/dsh-save-chat
```

## License

MIT

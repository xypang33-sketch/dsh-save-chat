# dsh-save-chat

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/)
[![npm](https://img.shields.io/npm/v/dsh-save-chat)](https://www.npmjs.com/package/dsh-save-chat)
[![license](https://img.shields.io/npm/l/dsh-save-chat)](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/LICENSE)

**Keep the good answers.** One heart saves a whole conversation turn — your question and the complete reply — as a real Markdown file inside your project. Later, your own panel browses them, and the model can **search** them on demand.

[中文](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/README.zh.md) · [Full reference](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/docs/reference.md)

> Zero dependencies. No database. Just Markdown files you own.

## Screenshots

*Every reply carries the action row. The heart is the save button — one click keeps the whole turn (your question plus the complete answer).*

![Save a turn from the action row](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-heart.png)

*The collection panel: workspaces, sessions, and saved turns on the left; the selected turn rendered beside it. The toolbar switches between this section and the whole file, reveals the file in your file manager, and closes the reader.*

![Browse collections and the knowledge base](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-panel.png)

## Install

```sh
dsh plugin --profile desktop add dsh-save-chat
# or straight from the repository, with no registry in between
dsh plugin --profile desktop add https://github.com/xypang33-sketch/dsh-save-chat
```

Or from the in-app **Settings → Plugin Market**. **Settings → Plugins → Add plugin** takes any of those forms — a package name, a repository URL, a `.tgz` URL, or a local path.

Restart `dsh`, then reload the page. Note that DSH does not auto-update plugins yet — to upgrade, uninstall and install the new version.

## 60-second start

1. **Click the heart** under any assistant reply. The turn is written to `<session workspace>/.dsh-favorites/<session title>.md`.
2. **Open the 收藏 panel** in the sidebar: a searchable tree of every saved turn, grouped by workspace and session, with month grouping in the knowledge base view. Click a row to read it beside the list.
3. **Right-click a row** to rename it, pin it, copy a `@file` reference, or **add it to your personal knowledge base**.
4. **Ask the model about old work**: “what did we decide about the sandbox last time?” It calls `search_knowledge`, finds the saved turn, and cites the file and date.

## Why this one

There are already bookmark plugins. This one differs in four ways:

| | dsh-save-chat |
|---|---|
| **What gets saved** | The **whole turn** — your question *and* the complete answer — not a single message or a link. |
| **Two layers** | Per-session **collections** (project-local, raw) plus a **personal knowledge base** you promote the good ones into (cross-project, durable). |
| **The model can search it** | `search_knowledge` / `read_knowledge` let the model retrieve on demand. Nothing is auto-injected, so an unused library costs zero tokens. |
| **Plain files, zero deps** | One Markdown file per session, images copied beside it, no database, no lock-in, no npm dependencies — it survives core revisions and works with git, Obsidian, or grep. |

## What you get

- **A heart in the action row** — one click, optimistic UI, revert on failure.
- **A collection panel** — workspace → session → turn tree, per-turn ordinals, small-text timestamps, collapse at every level, search over the current view, month grouping for the knowledge base, “reveal in folder”, and a close button for the reader.
- **Row actions** — pin, rename, **copy reference** (`@/path/file.md`, paste it into a later conversation), add to / remove from the knowledge base, delete.
- **Images are kept, not lost** — an image a turn carried is copied next to the Markdown and rendered in the reader; promoting it to the knowledge base copies it again and writes a **one-sentence image summary** underneath, so the picture becomes findable by what it shows.
- **Search that knows what you saved** — BM25 over paragraph-sized chunks with CJK bigrams, one result per turn, later turns win when two contradict.
- **Token honesty** — the panel shows what naming your favorites has cost so far.

## The model side

Two tools, both **on demand** — the model sees nothing until it asks:

| Tool | What it does |
|---|---|
| `search_knowledge` | Searches your knowledge base (or `scope: "all"` to include collections) and returns small hits: title, date, `file#lines`, a snippet, and an id. |
| `read_knowledge` | Pulls one section back in full (capped at 8 KB) when a snippet is not enough. |

By default the model searches **only the personal knowledge base** — promoting a turn is how you tell it “this one is worth your attention”. Your raw collections stay yours unless you promote them or ask explicitly.

## FAQ

**Where are the files?** `<session workspace>/.dsh-favorites/<session title>.md`; the knowledge base is `~/.dsh/knowledge/<YYYY-MM>.md` (configurable). Both are ordinary Markdown — open them in any editor.

**Does it send anything anywhere?** No. Everything stays on your machine, and the routes it serves are loopback-only.

**What does it cost?** Favoriting makes one small model call to name the turn (a few hundred tokens, shown in the panel). Promoting an image makes one small vision call for its summary. Searching is local and free.

**Does it slow DSH down?** Parses are cached by file size and mtime, so the catalog only re-reads what changed.

**What if I delete the project?** Collection files go with it. Anything you promoted into the knowledge base stays — pictures included.

**Can the model see my whole collection?** Only if it searches with `scope: "all"`, which it does when you ask about past work. Otherwise it sees what you promoted.

## Development

```sh
npm test        # host unit tests + real-DOM tests (jsdom)
```

The reference — file format, every HTTP route, design notes, limitations — lives in [docs/reference.md](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/docs/reference.md).

## License

MIT

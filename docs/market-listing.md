# Market listing (awesome-dsh-plugin)

Inside the app, users install community plugins from **Settings → Plugin Market** (`dshmarket`). That market — and [dshmarket.com](https://dshmarket.com), the [catalog](https://awesome-dsh-plugin.com) site, and [dshget.com](https://www.dshget.com/) — all read one curated registry:

> **`awesome-dsh-plugin/awesome-dsh-plugin`** — “to get your plugin listed in the market, open a PR **there** (one entry in the list; the site and this market pick it up automatically, usually within a day). Please don't PR plugin entries against this repo.”

Do not confuse this with DSH's own **Settings → Plugins → Add plugin** dialog (`@deepseek-ai/dsh-client-ui-plugin-manager`): that one takes any npm package name, GitHub URL, or local path and consults **no catalog at all**. It is the pull channel for users who already know the name; the market is the discovery channel. Both end at the same package.

## Verified submission rules

Read from the registry's own `contributing.md` (fetched 2026-10-02):

- **One file per plugin**: `data/plugins/<owner>__<repo>.yml` — for this repo, `data/plugins/xypang33-sketch__dsh-save-chat.yml`. That single file is the whole submission; the two READMEs in that repo are generated from `data/plugins/*.yml`, so never edit them by hand.
- **Fields**: `url` (must match the repository exactly), `name` (`owner/repo`, the link text), `category`, and `description` with `en` (required) and `zh` (optional — a maintainer will add it). A description containing `: ` must be quoted.
- **Categories**: `agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun` — the maintainers re-file a near miss rather than reject it.
- **Manifest**: the repository must declare `dsh.bundle` in `package.json` plus a root `cordis.patch.yml`. *“Most rejected submissions declare only `dsh.client`”* — this repo declares both correctly.
- **Repository must be at least one day old** (checked automatically by CI). This repo was created 2026-10-02 15:59 UTC, so the earliest submission is **2026-10-03 15:59 UTC (23:59 CST)**.
- **npm is optional.** Publishing skips the build-approval step and is preferred, but a repository that installs from source needs no npm package and no `tarball:` field. This repo is plain JavaScript with no build step, so a source install works as-is.
- **The description is read as a claim and checked against the code**; overstating is the main reason good plugins are sent back. The entry in `docs/registry-entry.yml` only claims what the repository does.
- Reviewers also check: does the code do what the entry says, is the category reasonable, is the plugin already covered by an existing entry (a tiebreaker — *“the rule is whichever is better”*), is anything alarming in the source, and does the PR touch entries it has no business touching.

## Why `category: session`

The primary flow happens inside a session — you save a turn from the reply's action row — and the closest neighbour, `penguin-oo/dsh-bookmarks`, is filed under `session` too. The overlap is deliberate and the entry states the differences: that plugin bookmarks single replies with notes and tags and exports Markdown on demand from its own store, whereas this one writes a real Markdown file per session, keeps per-session collections separate from a cross-project personal knowledge base, and lets the model query only what the user deliberately promoted.

The other two neighbours sit under `memory`: `htcqp802/dsh-knowledge-base` imports external documents into SQLite FTS5, and `Relistencode/dsh-recall` retrieves over every past session. This plugin does neither — its content originates from your own conversations, it stores plain files, and its two model tools are read-only and scoped to the promoted knowledge base by default. `memory` was the first choice (the retrieval layer is the differentiator); `session` is the plainer description of what the plugin is, and the catalog's rule is to pick what the plugin does rather than where it would be nice to appear — maintainers re-file a near miss anyway.

## Screenshots are not a submission field

Verified 2026-10-03: the per-plugin YAML accepts `url`, `name`, `category`, `description` and the optional `tarball` — **not** `screenshots`. The catalog keeps images in its own `data/screenshots.json`, populated by `scripts/probe-screenshots.mjs`, which resolves each entry's images against `https://raw.githubusercontent.com/<repo>/HEAD/…` and prefers **relative paths inside the plugin repository** (its comment notes that absolute `raw.githubusercontent` URLs "could only rot silently"). Entries in the PR should therefore declare no screenshots at all; the images that matter are the ones in this repository's README, which the market also falls back to when the install dialog opens. Five annotated shots are in the README: the action-row heart, the collection panel, adding a turn to the knowledge base, the knowledge-base view with its hint, and copy-reference.

## What the market reads per entry

Field names used by the market client (`dshmarket` 1.44):

| Field | Meaning |
|---|---|
| `name` | Display name |
| `npm` | npm package name — the install source |
| `url` | Repository URL |
| `category` | Category filter |
| `description` | Card copy; the market shows English or Chinese following the UI language |
| `screenshots` | Author-curated shots (GitHub-hosted only); without them the market extracts images from the README when the install dialog opens |
| `stars` | Read from the repository |

Also relevant: cards show the DSH requirement declared by `engines.dsh`. **This plugin deliberately declares none** — it imports nothing from the core (only `react` and `@deepseek-ai/dsh-client-ui-primitives`, both stable browser externals), and undeclared entries remain visible instead of being filtered as a suspected mismatch.

## Entry to submit

Copy the surrounding format from the registry's own `contributing.md` (the list has its own ordering and header conventions), then use this content:

```yaml
- name: dsh-save-chat
  npm: dsh-save-chat
  url: https://github.com/xypang33-sketch/dsh-save-chat
  category: productivity
  description:
    en: Save whole conversation turns as Markdown: a per-session collection panel plus a personal knowledge base the model can search on demand. Zero dependencies.
    zh: 把整轮对话存成 Markdown：会话内的收藏面板 + 个人知识库，模型可按需检索。零依赖。
  screenshots:
    - https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-heart.png
    - https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-panel.png
```

## Submission steps

1. `npm publish` the package (the registry installs from npm, so the version must exist first).
2. Push the repository, including the two screenshots under `docs/` referenced at the top of both READMEs — the market loads images from GitHub hosting only.
3. Fork `awesome-dsh-plugin/awesome-dsh-plugin`, add one entry in the list's own format, and open the PR describing what the plugin does in two lines.
4. After it lands (usually within a day), the in-app market, the catalog site, and dshget.com all show it; no separate submissions.

## After listing

- Keep the npm README current: npm is the page the market links to and the place people read before installing.
- Bump `version` and add a `CHANGELOG.md` entry for every release; the market checks updates by comparing npm versions.
- Watch the discussion thread the market opens per plugin (GitHub Discussions via giscus) — it is the same thread on all three sites.

# Market listing (awesome-dsh-plugin)

Inside the app, users install community plugins from **Settings → Plugin Market** (`dshmarket`). That market — and [dshmarket.com](https://dshmarket.com), the [catalog](https://awesome-dsh-plugin.com) site, and [dshget.com](https://www.dshget.com/) — all read one curated registry:

> **`awesome-dsh-plugin/awesome-dsh-plugin`** — “to get your plugin listed in the market, open a PR **there** (one entry in the list; the site and this market pick it up automatically, usually within a day). Please don't PR plugin entries against this repo.”

Installs from the market are restricted to sources in that registry, so **being listed is what makes the plugin installable in one click** — it is the main exposure channel.

Do not confuse this with DSH's own **Settings → Plugins → Add plugin** dialog (`@deepseek-ai/dsh-client-ui-plugin-manager`): that one takes any npm package name, GitHub URL, or local path and consults **no catalog at all**. It is the pull channel for users who already know the name; the market is the discovery channel. Both end at the same npm package.

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

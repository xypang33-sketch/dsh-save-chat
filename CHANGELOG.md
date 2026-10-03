# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-10-03

Documentation only; no runtime changes.

### Changed

- The heart screenshot is annotated: the heart is circled and labelled
  **加入收藏 / Add to favorites**, so the README shows the entry point at a glance.
- Both screenshots are preceded by a sentence describing what the picture shows.
- The language switch and license links are absolute, so they also work on the npm
  page (npm renders the Chinese README, which previously linked to a missing relative path).
- The market listing material now records the verified `awesome-dsh-plugin`
  submission rules (one file per plugin, the `dsh.bundle` manifest requirement, the
  one-day repository age gate, and that npm is optional when a release tarball exists).

## [0.1.2] — 2026-10-03

Documentation only.

### Fixed

- The install section no longer assumes the CLI is on `PATH` (the desktop app bundles it),
  and it documents all four spec forms the installer accepts: npm name, repository URL,
  prebuilt `.tgz` URL, and local path.
- The install section no longer hard-codes the `desktop` profile without saying so.

## [Unreleased]

## [0.1.0] — first public release

### Added

- **Heart action** in the assistant action row: one click collects the whole turn
  (question plus complete answer) into `<session workspace>/.dsh-favorites/<session title>.md`,
  with an optimistic heart and a revert when the write fails.
- **Collection panel** in the sidebar: workspace → session → turn tree with ordinals,
  small-text timestamps, collapsible groups and sessions, session search, a reader
  beside the list, full-document scope toggle, and a close button.
- **Row actions**: pin, rename, copy reference (`@/path/file.md`), delete.
- **Personal knowledge base** at `~/.dsh/knowledge/<YYYY-MM>.md`, configurable via
  `knowledgeDir`: promote a turn with a right-click, browse it grouped by month,
  rename or remove it, and reveal it in the file manager.
- **Images and attachments are preserved**: bytes are copied beside the record and
  rendered in the reader; promoting an image copies it into the knowledge base and
  writes a one-sentence image summary so it can be found by what it shows.
- **On-demand retrieval for the model**: `search_knowledge` and `read_knowledge`
  tools over paragraph-sized chunks, ranked with BM25 and CJK bigrams, one hit per
  turn, later turns winning contradictions. Nothing is injected automatically.
- **Loopback-only HTTP routes** for the panel: `catalog`, `state`, `document`,
  `toggle`, `favorite`, `knowledge`, `search`, `reveal`.
- **Parse cache** keyed by file size and mtime, so the catalog re-reads only what changed.
- No runtime dependencies: plain JavaScript, no build step, no database.

[Unreleased]: https://github.com/xypang33-sketch/dsh-save-chat/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/xypang33-sketch/dsh-save-chat/releases/tag/v0.1.2
[0.1.1]: https://github.com/xypang33-sketch/dsh-save-chat/releases/tag/v0.1.1
[0.1.0]: https://github.com/xypang33-sketch/dsh-save-chat/releases/tag/v0.1.0

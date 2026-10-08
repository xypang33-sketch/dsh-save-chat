# 发布稿 ①：DSH 官方 Discussions → `🙌 Show Your Plugins!`

- 发帖入口：<https://github.com/deepseek-ai/deepseek-harness/discussions> → **New discussion** → 分类选 **`🙌 Show Your Plugins!`**（说明原文：*Show off something you've made*）
- 图片：**直接把下面 5 张图拖进发帖框**（本地文件在 `dsh-save-chat/docs/`），或者用正文里给的 raw 地址（GitHub 上能直接渲染）
- 礼仪：一个插件一帖；回复每一条提问；不要手动 bump

---

## 标题（二选一）

```
[Plugin] dsh-save-chat — 把整轮问答存成真实 Markdown，模型按需检索
```

```
[Plugin] dsh-save-chat — save whole turns as Markdown, with an on-demand knowledge base
```

---

## 正文（中文版）

```
非官方项目，由社区成员独立开发和维护。

**我经常在跟 AI 重复问一样的问题。** 一个报错之前解决过，过几天又碰到却找不到当时的回答；一个方案聊了半天，换个会话又得重新问一遍。来来回回，造了不少重复的轮子。

所以做了 dsh-save-chat：**点一下心形，就把整轮对话（你的问题 + 完整回答）存成项目里的真实 Markdown 文件**，之后可以浏览、可以复制引用，模型也能按需检索。

## 它做什么

- **动作行里一个心形**：收藏整轮问答，写进 `<会话工作目录>/.dsh-favorites/<会话标题>.md`；图片会复制到 Markdown 旁边
- **收藏面板**：工作区 → 会话 → 条目树，可搜索、可折叠；右侧阅读区支持「只看该节 / 展开全文」、在文件夹中显示
- **两层结构**：会话内**收藏**跟着项目走；你挑出来的那些再提升进**个人知识库**（`~/.dsh/knowledge/<年-月>.md`，按月分组，可改名、可移除）
- **模型按需检索**：`search_knowledge` / `read_knowledge` 两个工具（段落级切块 + BM25 + 中文二元组）。**不自动注入对话**，默认只搜你提升过的知识库
- **零依赖、纯文件**：无数据库、无运行时依赖、无构建；Markdown 就是源，可以进 git、用 Obsidian 打开、直接 grep

## 截图

1）动作行的红心就是收藏按钮
![heart](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-heart.png)

2）收藏面板：左侧树 + 右侧阅读区
![panel](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-panel.png)

3）右键菜单：加入个人知识库 / 复制引用 / 重命名 / 置顶
![menu](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-knowledge-menu.png)

4）知识库视图，按月分组，顶部写明"按需检索、不会自动注入"
![kb](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-knowledge.png)

5）「复制引用」把 `@文件路径` 放进剪贴板，粘到之后的对话里模型就能读到
![copy](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-copy-reference.png)

## 安装

桌面 App 和 `dsh web` 都可用，装进你正在运行的那个 profile（下面是 `web`，桌面是 `desktop`）：

```sh
# npm（国内走镜像同样可用）
dsh plugin --profile web add dsh-save-chat

# 或者直连仓库
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat

# 或者预构建包（不克隆仓库、不构建）
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat/releases/latest/download/dsh-save-chat.tgz
```

装完重启 DSH（`dsh web` 就重启那个进程）+ 刷新页面。也可以直接用在 **设置 → 插件 → 添加插件** 里粘贴以上任意一种。

## 和已有插件的区别

- 和 **dsh-bookmarks**（收藏单条回复、加备注标签、从自己的存储导出 Markdown）不同：这里存的是**整轮问答**，**每个会话一个常驻 `.md` 文件**（Markdown 是源，不是导出产物），分成"会话收藏 + 个人知识库"两层；
- 和 **dsh-knowledge-base**（把 PDF/DOCX 等导入 SQLite FTS5）不同：内容来自**你自己的对话**，存的是纯文件、零依赖（不像 FTS5 方案需要 Node 22.5+ 的 `node:sqlite`）；
- 和 **ReMe#dsh**（自动捕获对话、每日整理、服务端嵌入检索）不同：这里是**人工确认制**——只有你亲手留下的才存在，模型默认只搜你提升过的那些。

## 隐私与成本

- **没有遥测，也没有我们自己的服务器**：插件只在本机读写 Markdown，接口只监听回环地址；
- 唯一离开本机的是 DSH 本来就在做的模型调用：收藏时给这一轮起标题、提升图片时写一句图片摘要——走你自己配置的服务商；
- 检索完全在本地，免费；面板会显示"为收藏这件事已消耗多少 token"。

## 状态与反馈

- 版本 **0.1.2**，MIT，21 个测试；正在提交插件目录收录（awesome-dsh-plugin PR #6502），合并后市场里也能一键安装；
- 反馈/问题：<https://github.com/xypang33-sketch/dsh-save-chat/issues>（也欢迎直接在这里回帖）

仓库：<https://github.com/xypang33-sketch/dsh-save-chat> · npm：<https://www.npmjs.com/package/dsh-save-chat>
```

---

## 正文（English version，可接在中文后面，或单独发英文帖）

```
Unofficial community project, independently developed and maintained.

**I kept asking the AI the same questions.** An error I had already solved came back a week later and I could not find the answer; a plan we worked out over half an hour had to be re-explained in a new session. So I built dsh-save-chat: **one heart on a reply saves the whole turn — your question plus the complete answer — as a real Markdown file inside your project**, and the model can search those files on demand.

**What it does**

- A heart on the action row saves the whole turn to `<session workspace>/.dsh-favorites/<session title>.md`; images are copied beside it.
- A sidebar panel browses every collection (workspace → session → turn, searchable, collapsible) with a reader that can show just the saved section or the whole file.
- Two layers: per-session **collections** stay with the project; what you deliberately promote goes into a **personal knowledge base** (`~/.dsh/knowledge/<YYYY-MM>.md`, grouped by month, renameable and removable).
- Two read-only model tools, `search_knowledge` / `read_knowledge` (paragraph chunks, BM25 + CJK bigrams). **Nothing is injected into a conversation**: the default search scope is the knowledge base you curated.
- Zero runtime dependencies, no database, no build step — plain Markdown you can grep, commit, or open in Obsidian.

**Install** (works in the desktop app and `dsh web`; it installs into the profile you run — `web` below, `desktop` for the app)

```sh
dsh plugin --profile web add dsh-save-chat
# or straight from the repository
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat
# or the prebuilt tarball (no clone, no build)
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat/releases/latest/download/dsh-save-chat.tgz
```

Restart DSH and reload the page. The same specs can be pasted into **Settings → Plugins → Add plugin**.

**How it differs from neighbours**

- `dsh-bookmarks` bookmarks single replies with notes and tags and exports Markdown on demand; this one saves the **whole turn** as a live file per session and separates session collections from a personal knowledge base.
- `dsh-knowledge-base` imports external documents into SQLite FTS5; this one works on **your own conversations**, stores plain files, and has no runtime dependencies.
- `ReMe#dsh` captures conversations automatically and consolidates them daily; this one is **deliberate**: only what you keep exists, and the model searches only what you promoted.

**Privacy and cost** — no telemetry and no server of ours; the browser half talks only to loopback routes. The only content that leaves your machine is what DSH already sends for you: naming a saved turn, and summarising an image when you promote it, through your configured provider. Searching is local and free.

**Status** — v0.1.2, MIT, 21 tests. Submitted for the plugin catalog (awesome-dsh-plugin PR #6502); once merged it will also be installable from the Plugin Market.

Repo: <https://github.com/xypang33-sketch/dsh-save-chat> · Issues: <https://github.com/xypang33-sketch/dsh-save-chat/issues> · npm: <https://www.npmjs.com/package/dsh-save-chat>
```

---

## 发帖后：回帖备用

见同目录 `faq.md`（被问到差异、隐私、成本、失败排查时直接贴）。

**发布前最后自查**

- [ ] 分类选的是 **`🙌 Show Your Plugins!`**
- [ ] 标题保留了 `[Plugin]` 前缀 + 插件名 + 一句话
- [ ] 开头写了"非官方项目，由社区成员独立开发和维护"
- [ ] 5 张图都成功上传（或 raw 地址能正常显示）
- [ ] 三条安装命令的 profile 名与读者一致（`web` / `desktop`）
- [ ] 结尾有仓库、npm、Issues 三个链接

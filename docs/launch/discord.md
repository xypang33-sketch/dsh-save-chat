# 发布稿 ②：DSH 官方 Discord

- 邀请链接（来自官方英文 README）：<https://discord.gg/4MrtZUhpxg>
- 进群后：**先读频道规则**，找到插件/展示类频道（名字类似 `#plugins`、`#showcase`、`#community`），**不要在 `#general` 里连发**
- 风格：Discord 是聊天流，**短**、**一段话**、别贴长文；图片可以直接拖进去
- 礼仪：发一条就够，之后**回答提问**为主；不要重复贴

---

## 推荐文案（英文，一段 + 三条命令）

```
Hi all — I built a small community plugin: **dsh-save-chat**.

The heart on a reply's action row saves the whole turn (your question + the full answer) as a plain Markdown file inside the session workspace (`<workspace>/.dsh-favorites/<session>.md`). A sidebar panel browses every collection across sessions, and the turns you promote go into a personal knowledge base (`~/.dsh/knowledge/<YYYY-MM>.md`) that the model can search on demand with `search_knowledge` / `read_knowledge` — nothing is injected into a conversation unless you promoted it.

No database, no runtime dependencies, no telemetry: plain files you can grep or commit. Works in the desktop app and `dsh web`.

```
dsh plugin --profile web add dsh-save-chat
# or from the repo / prebuilt tarball
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat
dsh plugin --profile web add https://github.com/xypang33-sketch/dsh-save-chat/releases/latest/download/dsh-save-chat.tgz
```

Repo + screenshots: https://github.com/xypang33-sketch/dsh-save-chat · npm: https://www.npmjs.com/package/dsh-save-chat
Issues and questions welcome: https://github.com/xypang33-sketch/dsh-save-chat/issues
```

---

## 短版（如果频道只允许一两句）

```
**dsh-save-chat** — one heart saves the whole turn (question + answer) as a real Markdown file in your session workspace; promote the good ones into a personal knowledge base the model can search on demand. Plain files, zero dependencies, no telemetry. Install: `dsh plugin --profile web add dsh-save-chat` · https://github.com/xypang33-sketch/dsh-save-chat
```

---

## 中文版（如果进的是中文频道）

```
大家好，做了个社区插件 **dsh-save-chat**：回复下方动作行点一下红心，就把**整轮问答**（你的问题 + 完整回答）存成会话工作区里的真实 Markdown 文件（`<工作区>/.dsh-favorites/<会话标题>.md`）。侧栏「收藏」面板可以跨会话浏览、搜索、复制 `@文件` 引用；你挑出来的那些可以提升进**个人知识库**（`~/.dsh/knowledge/<年-月>.md`），模型用 `search_knowledge` / `read_knowledge` **按需检索**——不提升的东西不会自动进上下文。

零依赖、无数据库、无遥测，就是普通文件，能 grep、能进 git。桌面 App 与 `dsh web` 都可用。

dsh plugin --profile web add dsh-save-chat

仓库（含 5 张截图）：https://github.com/xypang33-sketch/dsh-save-chat
有问题欢迎开 issue 或在这里问我：https://github.com/xypang33-sketch/dsh-save-chat/issues
```

---

## 进群/发帖注意事项

- 不要在多个频道重复发同一条；选一个最合适的；
- 有人提问**先解决问题**、再谈插件（这样不容易被当成广告）；
- 被问到"和别的记忆插件有什么区别"，直接贴 `faq.md` 里的差异段落；
- 如果频道有 `#introductions` 之类，先自我介绍再发插件更自然。

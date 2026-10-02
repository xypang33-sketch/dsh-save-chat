# dsh-save-chat

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/)
[![npm](https://img.shields.io/npm/v/dsh-save-chat)](https://www.npmjs.com/package/dsh-save-chat)
[![license](https://img.shields.io/npm/l/dsh-save-chat)](LICENSE)

**把好的回答留下来。** 点一下心形，就把**整轮对话**（你的问题 + 完整回答）存成项目里的真实 Markdown 文件；之后面板可以浏览它们，模型也能**按需检索**它们。

[English](README.md) · [完整参考](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/docs/reference.zh.md)

> 零依赖、无数据库，就是你自己的 Markdown 文件。

## 截图

![在动作行收藏一轮对话](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-heart.png)

![浏览收藏与知识库](https://raw.githubusercontent.com/xypang33-sketch/dsh-save-chat/main/docs/screenshot-panel.png)

## 安装

```sh
dsh plugin --profile desktop add dsh-save-chat
# 或者直连仓库安装，不经过 npm
dsh plugin --profile desktop add https://github.com/xypang33-sketch/dsh-save-chat
```

或在应用内的 **设置 → 插件市场** 里一键安装。**设置 → 插件 → 添加插件** 这几种形式都接受：包名、仓库地址、`.tgz` 地址、本地路径。

重启 `dsh`，然后刷新页面。注意 DSH 目前不支持插件自动更新——升级需要先卸载再安装新版本。

## 60 秒上手

1. **点助手回复下方的心形**：这一轮会写进 `<会话工作目录>/.dsh-favorites/<会话标题>.md`；
2. **打开侧栏的「收藏」面板**：按工作区、会话分组的可搜索树（知识库视图按月份分组）；点任意一条，就在列表右侧读它；
3. **右键一条**：重命名、置顶、**复制引用**（`@文件`，可直接粘到之后的对话里）、或**加入个人知识库**；
4. **直接问模型过去的事**："上次沙箱那个结论是什么？" 它会调用 `search_knowledge` 找到你保存的那一轮，并给出文件与日期。

## 为什么用它

同类书签插件已经存在，这个的差别在四点：

| | dsh-save-chat |
|---|---|
| **存什么** | **整轮问答**（你的问题 + 完整回答），不是单条消息、也不是一个链接。 |
| **两层结构** | 会话内**收藏**（跟着项目、原始记录）+ **个人知识库**（跨项目、你把值得留的挑进去）。 |
| **模型能检索** | 通过 `search_knowledge` / `read_knowledge` **按需**取用；**不自动注入**，没人问的库一分钱不花。 |
| **纯文件、零依赖** | 一个会话一个 Markdown 文件，图片复制在旁边；无数据库、无锁定、无 npm 依赖——能扛核心版本变化，也能进 git、Obsidian 或直接 grep。 |

## 你会得到什么

- **动作行里的心形**——一次点击，先乐观更新、失败自动回滚；
- **收藏面板**——工作区 → 会话 → 条目的树、每条带序号、时间小字、各层可折叠、按当前视图搜索、知识库按月分组、「在文件夹中显示」、阅读区可关闭；
- **条目操作**——置顶、重命名、**复制引用**、加入/移出知识库、删除；
- **图片不会丢**——图片会复制到 Markdown 旁边并在阅读区显示；加入知识库时再复制一份，并在图下写一句**图片摘要**，让图片之后能**按内容**被检索；
- **懂你存了什么的检索**——段落级切块 + BM25 + 中文二元组，一个小节只出一条，两条矛盾时以时间较晚者为准；
- **成本透明**——面板显示"为收藏这件事已消耗多少 token"。

## 模型那一侧

两个工具，都是**按需**——不问就完全看不到：

| 工具 | 作用 |
|---|---|
| `search_knowledge` | 搜个人知识库（`scope: "all"` 可连收藏层一起），返回小命中：标题、日期、`文件#行号`、片段和 id。 |
| `read_knowledge` | 片段不够时取回该节全文（上限 8 KB）。 |

默认**只搜个人知识库**——"加入知识库"就是你告诉模型"这条值得你看"的方式。原始收藏仍归你自己，除非你提升它或明确要求。

## 常见问题

**文件在哪？** `<会话工作目录>/.dsh-favorites/<会话标题>.md`；知识库在 `~/.dsh/knowledge/<年-月>.md`（可配置）。都是普通 Markdown，用任何编辑器都能打开。

**会把数据发到别处吗？** 不会。全部在本机，它提供的接口只监听回环地址。

**花钱吗？** 收藏时一次小模型调用给这一轮起名（几百 token，面板里可见）；提升图片时一次小视觉调用写摘要；检索是本地免费的。

**会拖慢 DSH 吗？** 解析结果按文件大小与 mtime 缓存，只重读变过的文件。

**项目删了怎么办？** 收藏跟着项目走；你**提升进知识库的那些还在**，图片也在。

**模型能看到我全部收藏吗？** 只有它用 `scope: "all"` 搜索时（你问过去的事就会）。否则它只看到你提升过的。

## 开发

```sh
npm test        # 宿主单测 + 真实 DOM 测试（jsdom）
```

文件格式、全部 HTTP 接口、设计取舍与限制都在 [docs/reference.zh.md](https://github.com/xypang33-sketch/dsh-save-chat/blob/main/docs/reference.zh.md)。

## 许可

MIT

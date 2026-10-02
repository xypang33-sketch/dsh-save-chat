import { loadModule } from './support.mjs'
const { micromark } = loadModule('micromark')
const { gfm, gfmHtml } = loadModule('micromark-extension-gfm')
const md = [
  '# 会话标题',
  '',
  '[//]: # "dsh-favorites:session=session-abc"',
  '',
  '[//]: # "dsh-favorite:start 61ed3cd4-d01f-4cee-b59f-5fafe807eda9"',
  '## 动态插件创建受阻',
  '*2026-09-17 00:22*',
  '',
  '### User',
  '',
  '> 问一下',
  '',
  '### assistant',
  '',
  '#### 1. 名称冲突',
  '',
  '正文',
  '',
  '[//]: # "dsh-favorite:end"',
].join('\n')
console.log(micromark(md, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }))

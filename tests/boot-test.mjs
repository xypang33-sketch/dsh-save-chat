// Boot smoke test: the host half must load and register its routes in the same
// environment the app runs in. DSH_HOME is cleared on purpose — the app does not
// set it, and a fallback that only works with it set is not a working plugin.
delete process.env.DSH_HOME

const moduleUrl = '../src/index.js'
const loaded = await import(moduleUrl)
const routes = []
const webServer = { register: (config) => { routes.push(config.path); return () => {} } }
const registered = []
const tools = { register: (definition) => { registered.push(definition); return () => {} } }
const ctx = {
  get: (name) => (name === 'webServer' ? webServer : name === 'tools' ? tools : undefined),
  inject: (names, cb) => { cb({ webServer, tools }); return () => {} },
  effect: (callback) => { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } },
}
let failed = null
try {
  loaded.apply(ctx, {})
} catch (error) {
  failed = error
}
console.log('DSH_HOME =', process.env.DSH_HOME === undefined ? '(unset)' : process.env.DSH_HOME)
console.log('默认知识库目录:', loaded.resolveKnowledgeDir({}))
console.log('apply:', failed === null ? '成功' : `${failed.constructor.name}: ${failed.message}`)
console.log('注册路由:', routes)
console.log('注册工具:', registered.map((t) => t.name))
for (const tool of registered) {
  const schemaOk = tool.output && typeof tool.output.render === 'function' && typeof tool.output.schema === 'object'
  const paramsOk = typeof tool.parameters === 'object' && typeof tool.description === 'string' && tool.description.length > 50
  console.log(`  ${tool.name}: output/render ${schemaOk ? 'OK' : '缺失'}, 参数与描述 ${paramsOk ? 'OK' : '缺失'}, execute ${typeof tool.execute === 'function' ? 'OK' : '缺失'}`)
}
const searchTool = registered.find((tool) => tool.name === 'search_knowledge')
const rendered = searchTool.output.render({}, {
  query: '沙箱', scope: 'knowledge', limit: 5, total: 2,
  hits: [{ id: 'a', messageId: 'm', scope: 'knowledge', title: '旧结论', time: '2026-09-16 20:31', source: '/k/2026-10.md', lines: '4-9', snippet: '允许读取。' }],
})
const renderedText = rendered.map((block) => block.text).join('\n')
console.log('工具渲染含"时间较晚为准":', renderedText.includes('以「原会话时间」较晚的一条为准'))
console.log('工具渲染含来源与提示:', renderedText.includes('/k/2026-10.md#L4-9') && renderedText.includes('不得当作已验证事实') === false)
if (!renderedText.includes('以「原会话时间」较晚的一条为准')) {
  console.log('结果: FAIL')
  process.exit(1)
}
if (failed !== null || routes.length !== 8 || registered.length !== 2) {
  console.log('结果: FAIL')
  process.exit(1)
}
console.log('结果: OK')

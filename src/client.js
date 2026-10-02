// dsh-save-chat - browser half.
//
// The module is a classic client bundle (client-modules protocol): it
// registers a factory with window.__ModuleLoader__.load and returns apply().
// Everything runs through DSH's own extension points, so nothing is injected
// at the DOM level:
//
//   * assistant message action row -> conversation.chat.assistant-actions
//     (a heart that collects or retracts this Turn);
//   * sidebar panel entry          -> sidebar.panellist;
//   * collection browser page      -> main (keyed by this panel's id);
//   * the collected markdown opens in the shipped text/markdown preview of the
//     right sidebar through a dsh-resource://file/session/... address.
//
// React and the shared UI primitives come from the page's frozen module table;
// every other service is resolved from the plugin's own cordis context.
window.__ModuleLoader__.load({
  id: 'dsh-save-chat',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    // The primitives package is a platform module; a page built without it
    // still renders every control, only without its tooltip bubble.
    let primitives = null
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch (error) {
      primitives = null
    }

    const NS = 'dsh-save-chat'
    const ROUTE = '/dsh-save-chat'
    const PANEL_ID = 'save-chat'

    const zh = {
      panel: '收藏',
      action: '收藏此轮对话',
      actionActive: '取消收藏此轮对话',
      title: '收藏',
      searchPlaceholder: '搜索收藏',
      searchPlaceholderKnowledge: '搜索知识库',
      viewSaved: '收藏',
      viewKnowledge: '知识库',
      knowledgeEmpty: '知识库还没有内容：在收藏条目上右键「加入个人知识库」。',
      knowledgeLoading: '正在读取知识库…',
      copyRef: '复制引用',
      copied: '已复制引用',
      copyFailed: '复制失败',
      closeReader: '关闭右侧内容',
      knowledgeAiHint: '知识库的内容 AI 可按需检索——需要时它才会来查，不会自动注入对话。',
      knowledgeGroup: (month, count) => `${month} · ${count} 条`,
      searching: '搜索中…',
      searchEmpty: (query) => `没有找到与「${query}」相关的内容`,
      searchHint: '回车搜索；清空恢复目录',
      searchMatches: (count) => `本节 ${count} 处命中`,
      addKnowledgeHint: (dir) => `复制到个人知识库（跨项目长期留存）：${dir}\n也可被 AI 按需检索 · 不会自动注入对话`,
      addKnowledgeHintNoDir: '复制到个人知识库（跨项目长期留存）\n也可被 AI 按需检索 · 不会自动注入对话',
      inKnowledgeHint: (file) => `已在知识库：${file} · AI 可按需检索`,
      loading: '加载中…',
      empty: '还没有收藏。在任意一条助手回复的动作行点击心形图标即可收藏这一轮对话。',
      error: '读取失败',
      retry: '重试',
      turns: (count) => `${count} 轮`,
      recordedTokens: (value) => `已消耗 ${value} tok`,
      pin: '置顶',
      unpin: '取消置顶',
      rename: '重命名',
      renameLabel: '新标题',
      remove: '删除',
      removeConfirm: '删除这条收藏？该小节会从 markdown 文件中移除。',
      addKnowledge: '加入个人知识库',
      removeKnowledge: '从知识库移除',
      inKnowledge: (file) => (file ? `已在知识库：${file}` : '已在知识库'),
      reveal: '在文件夹中显示',
      revealFailed: (reason) => `无法在文件夹中显示：${reason}`,
      hostMissing: '页面里的插件版本比宿主旧（HTTP 40x）：先刷新页面（⌘R）；若仍旧，再确认插件已启用或重启 DSH。',
      wholeDocument: '整篇已展开——点某一条收藏即可只看该节',
      expandItems: '收起收藏条目',
      collapseItems: '展开收藏条目',
      expand: '展开全文',
      collapse: '只看该节',
      panelError: '收藏面板出错：',
      openFailed: '打开失败',
      readerLoading: '加载中…',
      readerError: '读取失败：',
      codeCopy: '复制',
      codeCopied: '已复制',
      footnotes: '脚注',
    }

    const en = {
      panel: 'Favorites',
      action: 'Favorite this turn',
      actionActive: 'Remove this turn from favorites',
      title: 'Favorites',
      searchPlaceholder: 'Search collections',
      searchPlaceholderKnowledge: 'Search the knowledge base',
      viewSaved: 'Collections',
      viewKnowledge: 'Knowledge base',
      knowledgeEmpty: 'The knowledge base is empty: right-click a collected turn and choose “Add to knowledge base”.',
      knowledgeLoading: 'Reading the knowledge base…',
      copyRef: '复制引用',
      copied: '已复制引用',
      copyFailed: '复制失败',
      copyRef: 'Copy reference',
      copied: 'Reference copied',
      copyFailed: 'Copy failed',
      knowledgeAiHint: 'The AI can search knowledge base content on demand — it looks things up only when needed, and nothing is injected automatically.',
      knowledgeGroup: (month, count) => `${month} · ${count} entries`,
      searching: 'Searching…',
      searchEmpty: (query) => `Nothing saved matches “${query}”`,
      searchHint: 'Enter to search; clear the box for the tree',
      searchMatches: (count) => `${count} matches in this section`,
      addKnowledgeHint: (dir) => `Copies into the personal knowledge base (cross-project): ${dir}\nThe AI can search it on demand · never injected automatically`,
      addKnowledgeHintNoDir: 'Copies into the personal knowledge base (cross-project)\nThe AI can search it on demand · never injected automatically',
      inKnowledgeHint: (file) => `In knowledge base: ${file} · searchable by the AI on demand`,
      loading: 'Loading…',
      empty: 'No favorites yet. Click the heart in any assistant reply action row to collect that turn.',
      error: 'Could not load',
      retry: 'Retry',
      turns: (count) => `${count} ${count === 1 ? 'turn' : 'turns'}`,
      recordedTokens: (value) => `${value} tok used`,
      pin: 'Pin to top',
      unpin: 'Unpin',
      rename: 'Rename',
      renameLabel: 'New title',
      remove: 'Delete',
      removeConfirm: 'Delete this collected turn? Its section is removed from the Markdown file.',
      addKnowledge: 'Add to knowledge base',
      removeKnowledge: 'Remove from knowledge base',
      inKnowledge: (file) => (file ? `In knowledge base: ${file}` : 'In knowledge base'),
      reveal: 'Reveal in folder',
      revealFailed: (reason) => `Could not reveal in folder: ${reason}`,
      hostMissing: 'This page is running an older copy of the plugin (HTTP 40x): reload the page first (Cmd-R); if it persists, check that the plugin is enabled or restart DSH.',
      wholeDocument: 'The whole document is shown — pick a collected turn for one section',
      expandItems: 'Hide collected turns',
      collapseItems: 'Show collected turns',
      expand: 'Show full document',
      collapse: 'Show this turn only',
      panelError: 'Favorites panel error: ',
      openFailed: 'Could not open',
      readerLoading: 'Loading…',
      readerError: 'Could not read: ',
      codeCopy: 'Copy',
      codeCopied: 'Copied',
      footnotes: 'Footnotes',
    }

    const CSS = [
      '.dshfav-action{display:inline-flex;align-items:center;justify-content:center;width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.dshfav-action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}',
      '.dshfav-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshfav-action:disabled{cursor:default;opacity:.4}',
      '.dshfav-action[data-favorited]{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dshfav-action[data-favorited]:hover{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dshfav-failure{padding-left:4px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
      '.dshfav-page{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6}',
      '.dshfav-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:28px clamp(16px,3vw,32px) 14px}',
      '.dshfav-body{flex:1;display:flex;min-width:0;min-height:0;overflow:hidden;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}',
      '.dshfav-tree{flex:none;width:clamp(260px,28vw,360px);min-width:0;box-sizing:border-box;overflow:auto;padding:12px 8px 32px 12px;border-right:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}',
      '.dshfav-tree-wide{flex:1 1 auto;width:auto;min-width:0;box-sizing:border-box;border-right:none;padding-right:clamp(16px,3vw,32px)}',
      '.dshfav-reader{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.dshfav-reader-head{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px 0}',
      '.dshfav-reveal{appearance:none;display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer}',
      '.dshfav-reveal:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshfav-reveal-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dshfav-reveal:disabled{opacity:.5;cursor:default}',
      '.dshfav-reveal:disabled:hover{background:transparent;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-close{appearance:none;flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1;cursor:pointer}',
      '.dshfav-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dshfav-reader-scroll{flex:1;min-height:0;box-sizing:border-box;overflow:auto;padding:4px clamp(16px,3vw,40px) 48px}',
      '.dshfav-actions{display:flex;align-items:center;gap:12px}',
      '.dshfav-total{font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.dshfav-title{margin:0;font-size:17px;font-weight:600;line-height:28px}',
      '.dshfav-switch{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm);overflow:hidden}',
      '.dshfav-switch-btn{appearance:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;padding:7px 12px;cursor:pointer}',
      '.dshfav-switch-btn+.dshfav-switch-btn{border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))}',
      '.dshfav-switch-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-switch-on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dshfav-kb-group{padding:0 0 18px}',
      '.dshfav-kb-head{display:flex;align-items:center;gap:8px;padding:0 10px 8px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dshfav-kb-list{list-style:none;margin:0;padding:0}',
      '.dshfav-flash{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-kb-hint{display:flex;align-items:flex-start;gap:7px;margin:2px 10px 12px;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;line-height:1.55}',
      '.dshfav-kb-hint-icon{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-month-head{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px 6px 4px;border:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:22px;text-align:left;cursor:pointer}',
      '.dshfav-month-head:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-month-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-search{appearance:none;width:min(320px,34vw);min-height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dshfav-search::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-hits{list-style:none;margin:0;padding:0 0 18px}',
      '.dshfav-hit{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;appearance:none;border:none;background:transparent;border-radius:var(--dsw-radius-sm);padding:8px 10px;cursor:pointer;color:var(--dsw-alias-label-primary)}',
      '.dshfav-hit:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-hit-head{display:flex;align-items:baseline;gap:8px;min-width:0}',
      '.dshfav-hit-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}',
      '.dshfav-hit-matches{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-hit-snippet{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '.dshfav-hit-source{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-notice{padding:16px 8px;color:var(--dsw-alias-label-tertiary);font-size:13px}',
      '.dshfav-group{margin-bottom:24px}',
      '.dshfav-group-head{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px 6px 4px;border:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));border-radius:var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;background:transparent;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:24px;text-align:left;cursor:pointer}',
      '.dshfav-group-head:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-chevron{flex:none;width:12px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-folder{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-group-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-list{list-style:none;margin:0;padding:0}',
      '.dshfav-row-wrap{display:flex;align-items:center;gap:2px;padding-left:6px}',
      '.dshfav-caret{appearance:none;flex:none;width:20px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1;cursor:pointer}',
      '.dshfav-caret:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshfav-row{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:7px 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-align:left;cursor:pointer}',
      '.dshfav-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-badge{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-items{list-style:none;margin:0 0 4px;padding:0 0 0 34px}',
      '.dshfav-item{display:flex;align-items:baseline;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
      '.dshfav-item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-item-time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;font-variant-numeric:tabular-nums}',
      '.dshfav-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dshfav-item:hover .dshfav-item-time{color:var(--dsw-alias-label-secondary)}',
      '.dshfav-pin{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dshfav-star{flex:none;font-size:11px;color:var(--dsw-alias-state-warning-primary,#d9a13b)}',
      '.dshfav-rename{flex:1;min-width:0;height:22px;padding:0 6px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dshfav-menu{position:fixed;z-index:2147483000;min-width:146px;padding:4px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 10px 28px rgba(0,0,0,.2)}',
      '.dshfav-menu-item{display:block;width:100%;padding:6px 10px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
      '.dshfav-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfav-menu-danger{color:var(--dsw-alias-state-error-primary,#e5484d)}',
    ].join('')

    // --- shared helpers --------------------------------------------------------

    async function post(routePath, body) {
      const response = await fetch(`${ROUTE}${routePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok || !data || data.ok !== true) {
        // A 200 that is not `{ok: true}` means an older Host half answered.
        const fallback = response.ok ? 'unexpected response' : `HTTP ${response.status}`
        throw new Error((data && data.error) || fallback)
      }
      return data
    }

    /** Compact token count for a row or a page total. */
    function formatTokens(count) {
      if (!Number.isFinite(count) || count <= 0) return ''
      if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
      if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
      return String(count)
    }

    function HeartGlyph({ filled, size }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size === undefined ? 15 : size,
        height: size === undefined ? 15 : size,
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: filled ? 0 : 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' }))
    }

    /** The product's folder artwork, with an inline fallback when primitives are absent. */
    function FolderGlyph({ open }) {
      const ProductIcon = primitives && (open ? primitives.IconFolderOpenOutlineRegular : primitives.IconFolderCloseRegular)
      if (typeof ProductIcon === 'function') return h(ProductIcon, { size: 16 })
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        h('path', { key: 'back', d: 'M2.05 13.6h10.35c.55 0 1-.45 1-1V5.24c0-.55-.45-1-1-1H7.6c-.24 0-.48-.09-.66-.25L5.43 2.65a1 1 0 0 0-.66-.25H2.05c-.55 0-1 .45-1 1v9.2c0 .55.45 1 1 1Z' }),
        open ? h('path', { key: 'front', d: 'M2.56 7.94c.12-.44.51-.74.97-.74h10.12c.66 0 1.14.62.97 1.26l-1.18 4.4c-.12.44-.51.74-.97.74H2.35c-.66 0-1.14-.62-.97-1.26l1.18-4.4Z' }) : null,
      ])
    }

    /** Per-Session favorited-id store shared by every heart in one transcript. */
    function createFavoritesStore() {
      const records = new Map()

      function recordOf(sessionId) {
        let record = records.get(sessionId)
        if (record === undefined) {
          record = {
            snapshot: { ids: new Set(), status: 'idle', filePath: null, error: null },
            overrides: new Map(),
            listeners: new Set(),
            loaded: false,
            pending: null,
          }
          records.set(sessionId, record)
        }
        return record
      }

      function publish(record) {
        for (const listener of record.listeners) listener()
      }

      function load(sessionId, force) {
        const record = recordOf(sessionId)
        if (record.pending !== null) return record.pending
        if (record.loaded && force !== true) return Promise.resolve(record.snapshot)
        record.pending = post('/state', { sessionId }).then((data) => {
          const ids = new Set(data.messageIds || [])
          // A click that lands while this read is in flight is newer than the
          // read; its optimistic state wins until the next read settles.
          for (const [id, wanted] of record.overrides) {
            if (wanted) ids.add(id)
            else ids.delete(id)
          }
          record.snapshot = { ids, status: 'ready', filePath: data.filePath || null, error: null }
          record.loaded = true
          record.pending = null
          publish(record)
          return record.snapshot
        }).catch((error) => {
          record.snapshot = { ...record.snapshot, status: 'error', error: String((error && error.message) || error) }
          record.pending = null
          publish(record)
          return record.snapshot
        })
        return record.pending
      }

      return {
        snapshotOf: (sessionId) => recordOf(sessionId).snapshot,
        subscribe: (sessionId, listener) => {
          const record = recordOf(sessionId)
          record.listeners.add(listener)
          return () => record.listeners.delete(listener)
        },
        load,
        apply: (sessionId, messageId, favorited, filePath) => {
          const record = recordOf(sessionId)
          const ids = new Set(record.snapshot.ids)
          if (favorited) ids.add(messageId)
          else ids.delete(messageId)
          record.overrides.set(messageId, favorited)
          record.snapshot = { ids, status: 'ready', filePath: filePath || record.snapshot.filePath, error: null }
          record.loaded = true
          publish(record)
        },
      }
    }

    // --- plugin body -----------------------------------------------------------

    /** Required browser services: the slot registry and the locale registry. */
    const inject = ['slots', 'locale']

    function apply(ctx) {
      const store = createFavoritesStore()
      const style = document.createElement('style')
      style.dataset.dshConversationFavorites = '1'
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), 'dsh-save-chat: styles')

      const locale = ctx.get('locale')
      if (locale && typeof locale.register === 'function') {
        ctx.effect(() => {
          try {
            return locale.register(NS, { zh, en })
          } catch {
            // the plugin keeps its own dictionaries when registration is unavailable
            return () => {}
          }
        }, 'dsh-save-chat: dictionaries')
      }

      /** Pick the dictionary from the active locale, independent of the registry. */
      function dictionary() {
        let active = ''
        try {
          active = String((locale && locale.getSnapshot ? locale.getSnapshot().active : '') || '')
        } catch {
          active = ''
        }
        if (!active && typeof navigator !== 'undefined') active = String(navigator.language || '')
        return active.toLowerCase().startsWith('zh') ? zh : en
      }

      /**
       * Resolve a local image path the way DSH's document preview does: the
       * authenticated `api/file` route serves the bytes, so a collected image
       * copied beside the markdown renders without any extra endpoint.
       */
      const pathImagesResolver = {
        resolve: (value) => {
          if (typeof value !== 'string' || value === '') return undefined
          if (!/^([a-zA-Z]:[\\/]|\/)/.test(value)) return undefined
          try {
            return new URL(`api/file?path=${encodeURIComponent(value)}`, document.baseURI).href
          } catch {
            return undefined
          }
        },
      }

      function useTranslate() {
        const [revision, setRevision] = React.useState(0)
        React.useEffect(() => {
          if (!locale || typeof locale.subscribe !== 'function') return undefined
          return locale.subscribe(() => setRevision((value) => value + 1))
        }, [])
        return React.useMemo(() => {
          const table = dictionary()
          return (key, ...args) => {
            let value = table[key]
            if (typeof value === 'function') value = value(...args)
            if (typeof value === 'string') return value
            const other = table === zh ? en[key] : zh[key]
            if (typeof other === 'function') return other(...args)
            return typeof other === 'string' ? other : key
          }
        }, [revision])
      }

      function useSessionFavorites(sessionId) {
        const subscribe = React.useCallback((listener) => store.subscribe(sessionId, listener), [sessionId])
        const getSnapshot = React.useCallback(() => store.snapshotOf(sessionId), [sessionId])
        const snapshot = React.useSyncExternalStore(subscribe, getSnapshot)
        React.useEffect(() => {
          void store.load(sessionId)
        }, [sessionId])
        return snapshot
      }

      // --- the heart in one assistant message's action row ---------------------

      function FavoriteAction(props) {
        const t = useTranslate()
        const sessionId = props.sessionId
        const messageId = props.messageId
        const state = useSessionFavorites(sessionId)
        const favorited = state.ids ? state.ids.has(messageId) : false
        const [pending, setPending] = React.useState(false)
        const [failure, setFailure] = React.useState(null)

        const onClick = React.useCallback(() => {
          if (pending) return
          setPending(true)
          setFailure(null)
          // The write may take a model call to title the Turn, so the heart
          // shows its new state at once and reverts only if the write fails.
          store.apply(sessionId, messageId, !favorited, undefined)
          post('/toggle', { sessionId, messageId }).then((data) => {
            store.apply(sessionId, messageId, data.favorited === true, data.filePath)
          }).catch((error) => {
            store.apply(sessionId, messageId, favorited, undefined)
            const message = String((error && error.message) || error)
            // 404/405 means this page's copy of the plugin is older than the Host
            // half (a rename or an upgrade): say so instead of printing the code.
            setFailure(/HTTP 40[45]/.test(message) ? t('hostMissing') : message)
          }).then(() => {
            setPending(false)
          })
        }, [pending, favorited, sessionId, messageId])

        const label = favorited ? t('actionActive') : t('action')
        const button = h('button', {
          type: 'button',
          className: 'dshfav-action',
          'aria-label': label,
          'aria-pressed': favorited ? 'true' : 'false',
          'data-favorited': favorited ? '1' : undefined,
          disabled: pending,
          onClick,
        }, h(HeartGlyph, { filled: favorited }))

        const control = primitives && primitives.Tooltip
          ? h(primitives.Tooltip, { label, side: 'bottom' }, button)
          : button

        if (failure === null) return control
        return h(React.Fragment, null, control, h('span', { className: 'dshfav-failure', role: 'status' }, failure))
      }

      // --- sidebar entry + collection browser ----------------------------------

      function PanelIcon(props) {
        return h(HeartGlyph, { filled: false, size: props && props.size ? props.size : 18 })
      }

      /**
       * Keeps the registered panel alive when rendering or an effect throws.
       * DSH removes a slot entry whose component crashed, which would leave the
       * sidebar button pointing at nothing until a page reload; this shows the
       * message instead and lets the rest of the frame keep working.
       */
      class FavoritesPanelBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { error: null }
        }

        static getDerivedStateFromError(error) {
          return { error: String((error && error.message) || error) }
        }

        componentDidCatch(error) {
          console.error('dsh-save-chat: panel error', error)
        }

        render() {
          if (this.state.error === null) return h(FavoritesPanel, this.props)
          return h('div', { className: 'dshfav-page' }, h('div', { className: 'dshfav-notice' }, `${dictionary().panelError}${this.state.error}`))
        }
      }

      function FavoritesPanel() {
        const t = useTranslate()
        const [state, setState] = React.useState({ status: 'loading', groups: [], knowledge: [], knowledgeDir: null, error: null })
        // Read once, high up: the context menu's tooltip is built before the tree.
        const knowledgeDir = state.knowledgeDir === undefined ? null : state.knowledgeDir
        const [collapsed, setCollapsed] = React.useState(() => new Set())
        const [collapsedSessions, setCollapsedSessions] = React.useState(() => new Set())
        const [selected, setSelected] = React.useState(null)
        const [content, setContent] = React.useState({ status: 'idle', text: '', error: null })
        const [menu, setMenu] = React.useState(null)
        const [editing, setEditing] = React.useState(null)
        const [revision, setRevision] = React.useState(0)
        const readerRef = React.useRef(null)
        const [expanded, setExpanded] = React.useState(false)
        const [revealError, setRevealError] = React.useState(null)

        // The host half performs the reveal through the session controller, so it
        // works while this global panel is on screen and its failure reason is the
        // host's own. A failure is reported on the toolbar, never swallowed.
        const revealFile = React.useCallback((filePath) => {
          setRevealError(null)
          post('/reveal', { filePath }).catch((error) => {
            const reason = String((error && error.message) || error)
            setRevealError(dictionary().revealFailed(reason))
          })
        }, [])

        const [view, setView] = React.useState('saved')
        const [flash, setFlash] = React.useState(null)
        const flashTimer = React.useRef(null)
        React.useEffect(() => () => {
          if (flashTimer.current !== null) clearTimeout(flashTimer.current)
        }, [])
        const showFlash = React.useCallback((message) => {
          setFlash(message)
          if (flashTimer.current !== null) clearTimeout(flashTimer.current)
          flashTimer.current = setTimeout(() => setFlash(null), 2500)
        }, [])
        // The clipboard gets a file mention in DSH's own `@path` grammar, so the
        // next conversation can pull the saved record in by pasting it.
        const copyMention = React.useCallback((filePath) => {
          const mention = /\s/.test(filePath) ? `@"${filePath}"` : `@${filePath}`
          const legacy = () => {
            try {
              const area = document.createElement('textarea')
              area.value = mention
              area.setAttribute('readonly', '')
              area.style.position = 'fixed'
              area.style.opacity = '0'
              document.body.appendChild(area)
              area.select()
              const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
              document.body.removeChild(area)
              return copied === true
            } catch {
              return false
            }
          }
          const done = (ok) => showFlash(ok ? dictionary().copied : dictionary().copyFailed)
          const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
          if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
            clipboard.writeText(mention).then(() => done(true)).catch(() => done(legacy()))
            return
          }
          done(legacy())
        }, [showFlash])
        const starFor = (file) => h('span', { key: 'star', className: 'dshfav-star', title: t('inKnowledgeHint', file), 'aria-hidden': 'true' }, '★')
        const [query, setQuery] = React.useState('')
        const [results, setResults] = React.useState({ status: 'idle', hits: [], error: null })

        // One search backs both this box and the model's search_knowledge tool, so
        // what the reader finds by hand is exactly what the model can find.
        React.useEffect(() => {
          const text = query.trim()
          if (text === '') {
            setResults({ status: 'idle', hits: [], error: null })
            return undefined
          }
          let live = true
          // The search runs in-process over local files, so there is no need to
          // debounce keystrokes: previous hits stay on screen while the next set
          // is being ranked.
          setResults((current) => ({ status: 'loading', hits: current.hits, error: null }))
          // Search covers the list in front of you: the collections, or the
          // knowledge base — never both at once.
          post('/search', { query: text, scope: view === 'knowledge' ? 'knowledge' : 'saved', limit: 20 }).then((data) => {
            if (live) setResults({ status: 'ready', hits: Array.isArray(data.hits) ? data.hits : [], error: null })
          }).catch((error) => {
            if (live) setResults({ status: 'error', hits: [], error: String((error && error.message) || error) })
          })
          return () => { live = false }
        }, [query, view])

        const refresh = React.useCallback(() => {
          setState((current) => ({ status: 'loading', groups: current.groups, knowledge: current.knowledge, knowledgeDir: current.knowledgeDir, error: null }))
          post('/catalog').then((data) => {
            setState({
              status: 'ready',
              groups: Array.isArray(data.workspaces) ? data.workspaces : [],
              knowledge: Array.isArray(data.knowledge) ? data.knowledge : [],
              knowledgeDir: typeof data.knowledgeDir === 'string' && data.knowledgeDir !== '' ? data.knowledgeDir : null,
              error: null,
            })
          }).catch((error) => {
            setState({ status: 'error', groups: [], knowledge: [], knowledgeDir: null, error: String((error && error.message) || error) })
          })
        }, [])

        // The header no longer carries a refresh button: entering a view re-reads
        // the files, which is also how a hand-edited collection shows up.
        React.useEffect(() => {
          refresh()
        }, [refresh, view])

        // The reader follows the click: the clicked Turn's own section by
        // default, the whole document once the toolbar asks for it. A Session row
        // has no section to narrow to, so it always reads the whole file. With
        // nothing clicked there is no reader at all, so the list keeps the page.
        React.useEffect(() => {
          if (selected === null) {
            setContent({ status: 'idle', text: '', error: null })
            return undefined
          }
          let live = true
          setContent({ status: 'loading', text: '', error: null })
          const request = expanded || selected.messageId === undefined
            ? { filePath: selected.filePath }
            : { filePath: selected.filePath, messageId: selected.messageId }
          post('/document', request).then((data) => {
            if (live) setContent({ status: 'ready', text: typeof data.markdown === 'string' ? data.markdown : '', error: null })
          }).catch((error) => {
            if (live) setContent({ status: 'error', text: '', error: String((error && error.message) || error) })
          })
          return () => { live = false }
        }, [selected, revision, expanded])

        // Land the reader on the clicked Turn: its own heading carries the
        // ordinal the row shows, so the two cannot drift apart.
        React.useEffect(() => {
          const container = readerRef.current
          if (container === null || content.status !== 'ready') return
          const whole = expanded || selected === null || selected.messageId === undefined
          const wanted = whole && selected !== null ? selected.name : null
          if (wanted === null || wanted === undefined) {
            container.scrollTop = 0
            return
          }
          for (const heading of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
            if ((heading.textContent || '').trim().startsWith(wanted)) {
              heading.scrollIntoView({ block: 'start' })
              return
            }
          }
          container.scrollTop = 0
        }, [content, selected])

        // Every write goes through the host half, then the catalog is re-read so
        // the panel and the file never disagree.
        React.useEffect(() => {
          setRevealError(null)
        }, [selected, expanded])

        const mutate = React.useCallback((route, payload) => {
          post(route, payload).then(() => {
            setEditing(null)
            setMenu(null)
            setRevision((value) => value + 1)
            refresh()
          }).catch((error) => {
            setState((current) => ({ ...current, status: current.groups.length === 0 ? 'error' : current.status, error: String((error && error.message) || error) }))
          })
        }, [refresh])

        React.useEffect(() => {
          if (menu === null) return undefined
          const close = () => setMenu(null)
          const onKey = (event) => { if (event.key === 'Escape') setMenu(null) }
          document.addEventListener('mousedown', close)
          document.addEventListener('keydown', onKey)
          window.addEventListener('resize', close)
          return () => {
            document.removeEventListener('mousedown', close)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', close)
          }
        }, [menu])

        const toggleGroup = React.useCallback((key) => {
          setCollapsed((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }, [])

        const toggleSession = React.useCallback((key) => {
          setCollapsedSessions((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }, [])

        const markdownLabels = React.useMemo(() => ({
          code: { copyLabel: t('codeCopy'), copiedLabel: t('codeCopied') },
          footnotes: t('footnotes'),
        }), [t])

        const sections = []
        for (const group of state.groups) {
          const groupKey = group.id || group.path
          const open = !collapsed.has(groupKey)
          const sessions = []
          for (const session of group.sessions) {
            const items = []
            for (const item of session.items) {
              const name = item.name || item.messageId
              const chosen = selected !== null && selected.filePath === session.filePath && selected.messageId === item.messageId
              const cost = item.tokens ? formatTokens(item.tokens.total) : ''
              const hint = [name, item.time, cost === '' ? '' : `${cost} tok`].filter((part) => part).join(' · ')
              const renaming = editing !== null && editing.messageId === item.messageId && editing.kind !== 'knowledge'
              // The input carries the title without its ordinal, so an unchanged
              // edit is recognised as a no-op rather than a rewrite.
              const bareName = name.replace(/^\d+\.\s*/, '')
              const commitRename = () => {
                const value = editing === null ? '' : editing.value.trim()
                if (editing === null || value === '' || value === bareName) {
                  setEditing(null)
                  return
                }
                mutate(editing !== null && editing.kind === 'knowledge' ? '/knowledge' : '/favorite', editing !== null && editing.kind === 'knowledge'
                  ? { action: 'rename', filePath: session.filePath, messageId: item.messageId, title: value }
                  : { action: 'rename', filePath: session.filePath, messageId: item.messageId, title: value })
              }
              const row = renaming
                ? h('input', {
                  key: 'rename',
                  className: 'dshfav-rename',
                  value: editing.value,
                  autoFocus: true,
                  'aria-label': t('renameLabel'),
                  onChange: (event) => setEditing({ messageId: item.messageId, value: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') setEditing(null)
                  },
                  onBlur: commitRename,
                })
                : h('span', { key: 'name', className: 'dshfav-item-name' }, name)
              items.push(h('li', { key: item.messageId }, h('button', {
                type: 'button',
                className: 'dshfav-item',
                'data-selected': chosen ? '1' : undefined,
                title: hint,
                onClick: () => setSelected({ filePath: session.filePath, messageId: item.messageId, name }),
                onContextMenu: (event) => {
                  event.preventDefault()
                  setEditing(null)
                  setMenu({
                    x: event.clientX,
                    y: event.clientY,
                    filePath: session.filePath,
                    messageId: item.messageId,
                    sessionId: session.sessionId,
                    pinned: item.pinned === true,
                    inKnowledge: item.inKnowledge === true,
                    knowledgeFile: item.knowledgeFile,
                    label: name,
                  })
                },
              }, [
                item.pinned === true ? h('span', { key: 'pin', className: 'dshfav-pin', 'aria-hidden': 'true' }, '📌') : null,
                item.inKnowledge === true ? starFor(item.knowledgeFile) : null,
                row,
                renaming ? null : item.time ? h('span', { key: 'time', className: 'dshfav-item-time' }, item.time) : null,
              ])))
            }
            const sessionKey = session.sessionId || session.filePath
            const itemsOpen = !collapsedSessions.has(sessionKey)
            sessions.push(h('li', { key: sessionKey }, [
              h('div', { key: 'row', className: 'dshfav-row-wrap' }, [
                h('button', {
                  key: 'caret',
                  type: 'button',
                  className: 'dshfav-caret',
                  'aria-expanded': itemsOpen ? 'true' : 'false',
                  'aria-label': itemsOpen ? t('expandItems') : t('collapseItems'),
                  onClick: () => toggleSession(sessionKey),
                }, itemsOpen ? '▾' : '▸'),
                h('button', {
                  key: 'session',
                  type: 'button',
                  className: 'dshfav-row',
                  title: session.filePath,
                  onClick: () => setSelected({ filePath: session.filePath, messageId: undefined }),
                }, [
                  h('span', { key: 'title', className: 'dshfav-row-title' }, session.title),
                  h('span', { key: 'count', className: 'dshfav-badge' }, t('turns', session.items.length)),
                ]),
              ]),
              itemsOpen ? h('ul', { key: 'items', className: 'dshfav-items' }, items) : null,
            ]))
          }
          sections.push(h('section', { key: groupKey, className: 'dshfav-group' }, [
            h('button', {
              key: 'head',
              type: 'button',
              className: 'dshfav-group-head',
              'aria-expanded': open ? 'true' : 'false',
              onClick: () => toggleGroup(groupKey),
            }, [
              h('span', { key: 'chevron', className: 'dshfav-chevron' }, open ? '▾' : '▸'),
              h('span', { key: 'folder', className: 'dshfav-folder' }, h(FolderGlyph, { open })),
              h('span', { key: 'name', className: 'dshfav-group-title' }, group.title || group.path),
            ]),
            open ? h('ul', { key: 'list', className: 'dshfav-list' }, sessions) : null,
          ]))
        }

        const openHit = (hit) => {
          setSelected({ filePath: hit.source, messageId: hit.messageId, name: hit.title })
        }

        const hitList = results.status === 'loading'
          ? h('div', { key: 'hit-loading', className: 'dshfav-notice' }, t('searching'))
          : results.status === 'error'
            ? h('div', { key: 'hit-error', className: 'dshfav-notice' }, `${t('error')}: ${results.error}`)
            : results.hits.length === 0
              ? h('div', { key: 'hit-empty', className: 'dshfav-notice' }, t('searchEmpty', query.trim()))
              : h('ul', { key: 'hits', className: 'dshfav-hits' }, results.hits.map((hit, index) => h('li', { key: `${hit.source}:${hit.id}:${index}` }, h('button', {
                type: 'button',
                className: 'dshfav-hit',
                title: hit.source,
                onClick: () => openHit(hit),
              }, [
                h('span', { key: 'head', className: 'dshfav-hit-head' }, [
                  h('span', { key: 'title', className: 'dshfav-hit-title' }, hit.title),
                  hit.matches > 1 ? h('span', { key: 'matches', className: 'dshfav-hit-matches' }, t('searchMatches', hit.matches)) : null,
                ]),
                h('span', { key: 'snippet', className: 'dshfav-hit-snippet' }, hit.snippet),
                h('span', { key: 'source', className: 'dshfav-hit-source' }, `${hit.source}${hit.lines === undefined ? '' : `#L${hit.lines}`}${hit.time === undefined || hit.time === '' ? '' : ` · ${hit.time}`}`),
              ]))))

        const knowledgeEntries = Array.isArray(state.knowledge) ? state.knowledge : []
        const knowledgeRow = (entry) => {
          const renaming = editing !== null && editing.kind === 'knowledge' && editing.messageId === entry.messageId
          const commitRename = () => {
            const value = editing === null ? '' : editing.value.trim()
            if (editing === null || value === '' || value === entry.title) {
              setEditing(null)
              return
            }
            mutate('/knowledge', { action: 'rename', filePath: entry.filePath, messageId: entry.messageId, title: value })
          }
          const label = renaming
            ? h('input', {
              key: 'rename',
              className: 'dshfav-rename',
              value: editing.value,
              autoFocus: true,
              'aria-label': t('renameLabel'),
              onChange: (event) => setEditing({ kind: 'knowledge', messageId: entry.messageId, value: event.target.value }),
              onKeyDown: (event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') setEditing(null)
              },
              onBlur: commitRename,
            })
            : h('span', { key: 'name', className: 'dshfav-item-name' }, entry.title)
          return h('li', { key: `${entry.filePath}:${entry.messageId}` }, h('button', {
            type: 'button',
            className: 'dshfav-item',
            title: `${entry.title}${entry.time === undefined || entry.time === '' ? '' : ` · ${entry.time}`}`,
            onClick: () => setSelected({ filePath: entry.filePath, messageId: entry.messageId, name: entry.title }),
            onContextMenu: (event) => {
              event.preventDefault()
              setMenu({
                kind: 'knowledge',
                x: event.clientX,
                y: event.clientY,
                filePath: entry.filePath,
                messageId: entry.messageId,
                label: entry.title,
              })
            },
          }, [
            starFor(entry.filePath),
            label,
            entry.time === undefined || entry.time === '' ? null : h('span', { key: 'time', className: 'dshfav-item-time' }, entry.time),
          ]))
        }

        const knowledgeMonths = []
        for (const entry of knowledgeEntries) {
          const month = typeof entry.month === 'string' && entry.month !== '' ? entry.month : t('viewKnowledge')
          const last = knowledgeMonths[knowledgeMonths.length - 1]
          if (last !== undefined && last.month === month) last.entries.push(entry)
          else knowledgeMonths.push({ month, entries: [entry] })
        }

        const knowledgePane = state.status === 'loading' && knowledgeEntries.length === 0
          ? h('div', { className: 'dshfav-notice' }, t('knowledgeLoading'))
          : knowledgeEntries.length === 0
            ? h('div', { className: 'dshfav-notice' }, t('knowledgeEmpty'))
            : h('div', { className: 'dshfav-kb-group' }, [
              h('div', { key: 'hint', className: 'dshfav-kb-hint' }, [
                h('span', { key: 'icon', className: 'dshfav-kb-hint-icon', 'aria-hidden': 'true' }, 'ⓘ'),
                h('span', { key: 'text' }, t('knowledgeAiHint')),
              ]),
              ...knowledgeMonths.map((group) => {
                const open = !collapsed.has(`month:${group.month}`)
                return h('section', { key: `month:${group.month}` }, [
                  h('button', {
                    key: 'head',
                    type: 'button',
                    className: 'dshfav-month-head',
                    'aria-expanded': open ? 'true' : 'false',
                    onClick: () => toggleGroup(`month:${group.month}`),
                  }, [
                    h('span', { key: 'chevron', className: 'dshfav-chevron' }, open ? '▾' : '▸'),
                    h('span', { key: 'title', className: 'dshfav-month-title' }, t('knowledgeGroup', group.month, group.entries.length)),
                  ]),
                  open ? h('ul', { key: 'list', className: 'dshfav-kb-list' }, group.entries.map((entry) => knowledgeRow(entry))) : null,
                ])
              }),
            ])

        const searchActive = query.trim() !== ''
        const tree = state.status === 'loading' && state.groups.length === 0
          ? h('div', { className: 'dshfav-notice' }, t('loading'))
          : state.status === 'error'
            ? h('div', { className: 'dshfav-notice' }, /HTTP 40[45]/.test(state.error) ? t('hostMissing') : `${t('error')}: ${state.error}`)
            : sections.length === 0
              ? h('div', { className: 'dshfav-notice' }, t('empty'))
              : sections

        const readerBody = content.status === 'idle'
          ? null
          : content.status === 'loading'
            ? h('div', { className: 'dshfav-notice' }, t('readerLoading'))
            : content.status === 'error'
              ? h('div', { className: 'dshfav-notice' }, `${t('readerError')}${content.error}`)
              : primitives && primitives.MarkdownText
                ? h(primitives.MarkdownText, { text: content.text, labels: markdownLabels, pathImages: pathImagesResolver })
                : h('pre', { className: 'dshfav-pre' }, content.text)

        const reader = selected === null ? null : h('div', { key: 'reader', className: 'dshfav-reader' }, [
          h('div', { key: 'head', className: 'dshfav-reader-head' }, [
            revealError === null ? null : h('span', { key: 'reveal-error', className: 'dshfav-reveal-error' }, revealError),
            h('button', {
              key: 'scope',
              type: 'button',
              className: 'dshfav-reveal',
              // A Session row already reads the whole file, so there is no
              // section to narrow to; the control stays visible and explains
              // itself instead of disappearing.
              disabled: selected.messageId === undefined,
              title: selected.messageId === undefined ? t('wholeDocument') : undefined,
              onClick: () => setExpanded((value) => !value),
            }, expanded || selected.messageId === undefined ? t('collapse') : t('expand')),
            h('button', {
              key: 'reveal',
              type: 'button',
              className: 'dshfav-reveal',
              title: selected.filePath,
              onClick: () => revealFile(selected.filePath),
            }, [h(FolderGlyph, { key: 'icon', open: true }), h('span', { key: 'label' }, t('reveal'))]),
            h('button', {
              key: 'close',
              type: 'button',
              className: 'dshfav-close',
              title: t('closeReader'),
              'aria-label': t('closeReader'),
              onClick: () => setSelected(null),
            }, '✕'),
          ]),
          h('div', { key: 'scroll', className: 'dshfav-reader-scroll', ref: readerRef }, readerBody),
        ])

        let recorded = 0
        for (const group of state.groups) {
          for (const session of group.sessions) {
            for (const item of session.items) recorded += item.tokens ? item.tokens.total : 0
          }
        }
        const totalLabel = recorded > 0 ? t('recordedTokens', formatTokens(recorded)) : null

        const menuLayer = menu === null ? null : h('div', {
          key: 'menu',
          className: 'dshfav-menu',
          style: {
            left: `${Math.min(menu.x, Math.max(0, window.innerWidth - 170))}px`,
            top: `${Math.min(menu.y, Math.max(0, window.innerHeight - 130))}px`,
          },
          onMouseDown: (event) => event.stopPropagation(),
          onContextMenu: (event) => event.preventDefault(),
        }, [
          menu.kind === 'knowledge' ? null : h('button', {
            key: 'pin',
            type: 'button',
            className: 'dshfav-menu-item',
            onClick: () => mutate('/favorite', { action: menu.pinned ? 'unpin' : 'pin', filePath: menu.filePath, messageId: menu.messageId }),
          }, menu.pinned ? t('unpin') : t('pin')),
          h('button', {
            key: 'rename',
            type: 'button',
            className: 'dshfav-menu-item',
            onClick: () => {
              setEditing({
                kind: menu.kind === 'knowledge' ? 'knowledge' : 'saved',
                messageId: menu.messageId,
                value: menu.kind === 'knowledge' ? menu.label : menu.label.replace(/^\d+\.\s*/, ''),
              })
              setMenu(null)
            },
          }, t('rename')),
          h('button', {
            key: 'copy',
            type: 'button',
            className: 'dshfav-menu-item',
            title: menu.filePath,
            onClick: () => {
              const target = menu.filePath
              setMenu(null)
              copyMention(target)
            },
          }, t('copyRef')),
          h('button', {
            key: 'knowledge',
            type: 'button',
            className: 'dshfav-menu-item',
            title: knowledgeDir === null ? t('addKnowledgeHintNoDir') : t('addKnowledgeHint', knowledgeDir),
            onClick: () => mutate('/knowledge', {
              action: menu.kind === 'knowledge' || menu.inKnowledge ? 'remove' : 'add',
              filePath: menu.filePath,
              messageId: menu.messageId,
            }),
          }, menu.kind === 'knowledge' || menu.inKnowledge ? t('removeKnowledge') : t('addKnowledge')),
          menu.kind === 'knowledge' ? null : h('button', {
            key: 'remove',
            type: 'button',
            className: 'dshfav-menu-item dshfav-menu-danger',
            onClick: () => {
              const target = menu
              setMenu(null)
              if (!window.confirm(t('removeConfirm'))) return
              store.apply(target.sessionId, target.messageId, false, undefined)
              mutate('/favorite', { action: 'remove', filePath: target.filePath, messageId: target.messageId })
            },
          }, t('remove')),
        ])

        const treePane = h('div', {
          key: 'tree',
          className: selected === null ? 'dshfav-tree dshfav-tree-wide' : 'dshfav-tree',
        }, searchActive ? hitList : view === 'knowledge' ? knowledgePane : tree)

        return h('div', { className: 'dshfav-page' }, [
          h('div', { key: 'heading', className: 'dshfav-heading' }, [
            h('h1', { key: 'title', className: 'dshfav-title' }, t('title')),
            flash === null ? null : h('span', { key: 'flash', className: 'dshfav-flash' }, flash),
            h('div', { key: 'actions', className: 'dshfav-actions' }, [
              totalLabel === null ? null : h('span', { key: 'total', className: 'dshfav-total' }, totalLabel),
              h('input', {
                key: 'search',
                type: 'search',
                className: 'dshfav-search',
                value: query,
                placeholder: view === 'knowledge' ? t('searchPlaceholderKnowledge') : t('searchPlaceholder'),
                title: t('searchHint'),
                'aria-label': view === 'knowledge' ? t('searchPlaceholderKnowledge') : t('searchPlaceholder'),
                onChange: (event) => setQuery(event.target.value),
              }),
              h('div', { key: 'view', className: 'dshfav-switch' }, [
                h('button', {
                  key: 'saved',
                  type: 'button',
                  className: view === 'saved' ? 'dshfav-switch-btn dshfav-switch-on' : 'dshfav-switch-btn',
                  onClick: () => { setQuery(''); setView('saved') },
                }, t('viewSaved')),
                h('button', {
                  key: 'knowledge',
                  type: 'button',
                  className: view === 'knowledge' ? 'dshfav-switch-btn dshfav-switch-on' : 'dshfav-switch-btn',
                  onClick: () => { setQuery(''); setView('knowledge') },
                }, t('viewKnowledge')),
              ]),
            ]),
          ]),
          h('div', { key: 'body', className: 'dshfav-body' }, selected === null
            ? treePane
            : [treePane, reader]),
          menuLayer,
        ])
      }

      ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'save-chat',
        order: 11,
        locale: NS,
        label: () => '收藏',
      }, FavoriteAction))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 12,
        locale: NS,
        label: () => dictionary().panel,
      }, PanelIcon))

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        label: () => dictionary().panel,
      }, FavoritesPanelBoundary))
    }

    return { name: 'dsh-save-chat', inject, apply }
  },
})

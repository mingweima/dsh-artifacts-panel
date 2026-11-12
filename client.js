window.__ModuleLoader__.load({
  id: 'dsh-artifacts-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'artifacts'
    const STORAGE_PREFIX = 'dsh-artifacts-panel:v1:'
    const POLL_INTERVAL = 3000
    const GROUPS_PAGE = 30
    const SIDEBAR_TAB_ID = 'dsh-artifacts-panel/sidebar'
    const SIDEBAR_KIND = 'artifacts'
    // The Host serves the cross-session index over same-origin HTTP routes
    // (`/artifacts-panel/index.json`); the browser never needs a package path.
    // A manual absolute directory override stays available for diagnostics and
    // for hosts without the HTTP carrier (localStorage key below, empty = auto).
    const INDEX_ROUTE_PREFIX = '/artifacts-panel'
    const INDEX_DIR_KEY = 'dsh-artifacts-panel.indexDir.v1'
    const INDEX_STATS_KEY = 'dsh-artifacts-panel.indexStats.v1'
    const INDEX_POLL_INTERVAL = 8000
    const INDEX_CACHE_TTL = 15000
    const INDEX_SEARCH_LIMIT = 200
    const INDEX_FILE_CACHE = new Map()
    const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/

    //#region dictionaries
    const zh = {
      'view.artifacts': '产物',
      'title': '产物',
      'subtitle': '这个会话的最终回复与产出文件，按轮次归档，途中或结束后都能回看。',
      'stats': '{turns} 轮 · {files} 个产物 · 更新于 {updated}',
      'filter.all': '全部',
      'filter.docs': '文档',
      'filter.images': '图片',
      'filter.files': '文件',
      'search.placeholder': '搜索文件名、路径或描述',
      'refresh': '刷新',
      'refreshing': '刷新中…',
      'export': '导出清单',
      'hidden.show': '显示已隐藏（{count}）',
      'hidden.hide': '不显示已隐藏',
      'pinned.title': '已收藏',
      'turn.label': '第 {n} 轮',
      'turn.short': '第 {n} 轮',
      'turn.files': '{count} 个产物',
      'turn.failed': '本轮未正常结束',
      'turn.noArtifacts': '无产物',
      'turn.noArtifactsHint': '本轮只有最终回复，没有可自动收录的文件产物',
      'reply.label': '最终回复',
      'reply.expand': '展开全文',
      'reply.collapse': '收起',
      'kind.doc': '文档',
      'kind.image': '图片',
      'kind.file': '文件',
      'source.presented': '显式交付',
      'action.star': '收藏',
      'action.unstar': '取消收藏',
      'action.hide': '隐藏',
      'action.unhide': '取消隐藏',
      'action.download': '下载',
      'action.copy': '复制路径',
      'copied': '路径已复制',
      'copy.failed': '复制失败',
      'preview.failed': '无法打开预览',
      'empty.title': '还没有可收集的产物',
      'empty.body': '这个会话还没有最终回复或产出文件。开始对话后，最终回复、文档、图片和其他文件会自动归档到这里。',
      'empty.filtered': '没有符合筛选条件的产物',
      'empty.clear': '清除筛选',
      'error.title': '读取会话产物失败',
      'error.retry': '重试',
      'error.banner': '上次刷新失败：{message}',
      'export.title': '产物清单',
      'export.session': '会话',
      'export.time': '导出时间',
      'export.turns': '轮次数',
      'export.files': '产物数',
      'loading': '正在读取会话产物…',
      'no.session': '未选择会话',
    }
    const en = {
      'view.artifacts': 'Artifacts',
      'title': 'Artifacts',
      'subtitle': 'Final replies and produced files from this session, archived by turn and available while it runs or after it ends.',
      'stats': '{turns} turns · {files} artifacts · updated {updated}',
      'filter.all': 'All',
      'filter.docs': 'Docs',
      'filter.images': 'Images',
      'filter.files': 'Files',
      'search.placeholder': 'Search name, path or description',
      'refresh': 'Refresh',
      'refreshing': 'Refreshing…',
      'export': 'Export list',
      'hidden.show': 'Show hidden ({count})',
      'hidden.hide': 'Hide hidden',
      'pinned.title': 'Starred',
      'turn.label': 'Turn {n}',
      'turn.short': 'Turn {n}',
      'turn.files': '{count} artifacts',
      'turn.failed': 'Did not finish normally',
      'turn.noArtifacts': 'No artifacts',
      'turn.noArtifactsHint': 'This turn has a final reply but no collectable file artifact',
      'reply.label': 'Final reply',
      'reply.expand': 'Show full text',
      'reply.collapse': 'Collapse',
      'kind.doc': 'Doc',
      'kind.image': 'Image',
      'kind.file': 'File',
      'source.presented': 'Presented',
      'action.star': 'Star',
      'action.unstar': 'Unstar',
      'action.hide': 'Hide',
      'action.unhide': 'Unhide',
      'action.download': 'Download',
      'action.copy': 'Copy path',
      'copied': 'Path copied',
      'copy.failed': 'Copy failed',
      'preview.failed': 'Cannot open the preview',
      'empty.title': 'No artifacts yet',
      'empty.body': 'This session has no final reply or produced file yet. Once you start a conversation, replies, documents, images and other files are collected here automatically.',
      'empty.filtered': 'No artifacts match the current filters',
      'empty.clear': 'Clear filters',
      'error.title': 'Could not read session artifacts',
      'error.retry': 'Retry',
      'error.banner': 'Last refresh failed: {message}',
      'export.title': 'Artifact list',
      'export.session': 'Session',
      'export.time': 'Exported',
      'export.turns': 'Turns',
      'export.files': 'Artifacts',
      'loading': 'Reading session artifacts…',
      'no.session': 'No session selected',
    }
    Object.assign(zh, {
      'settings.title': '产物面板',
      'settings.intro': '调整产物面板的字号、密度、收录范围与噪音过滤。设置保存在本机，改动立即生效。',
      'settings.section.font': '字号与密度',
      'settings.fontSize.label': '字号倍率',
      'settings.fontSize.help': '按宿主字号放大，滑杆 0.8–2.5 倍；默认 1.5 倍（宿主 16px 时约 24px）。',
      'settings.fontSize.preview': '字号预览：正文、轮次标题与卡片会一起放大',
      'settings.fontScale.actual': '当前实际字号 ≈ {px}px',
      'settings.font.small': '小 13',
      'settings.font.standard': '标准 15',
      'settings.font.large': '大 17',
      'settings.font.xlarge': '特大 19',
      'settings.density.label': '行距 / 密度',
      'settings.density.help': '控制回复与卡片之间的疏密。',
      'settings.density.compact': '紧凑',
      'settings.density.standard': '标准',
      'settings.density.relaxed': '宽松',
      'settings.section.theme': '配色主题',
      'settings.theme.help': '默认跟随 DSH 主题；也可以只给产物面板固定深色或浅色，不影响宿主其他页面。',
      'settings.theme.mode': '主题模式',
      'settings.theme.mode.help': '「跟随 DSH」沿用宿主配色；深色 / 浅色作用于产物面板、右侧栏、悬浮条与画廊，灯箱遮罩始终保持深色。',
      'settings.theme.mode.inherit': '跟随 DSH',
      'settings.theme.mode.dark': '深色',
      'settings.theme.mode.light': '浅色',
      'settings.theme.accent': '强调色',
      'settings.theme.accent.help': '用于链接、选中态、进度与主按钮；「默认」沿用宿主强调色。',
      'settings.accent.default': '默认',
      'settings.accent.blue': '蓝',
      'settings.accent.amber': '琥珀',
      'settings.accent.green': '绿',
      'settings.accent.purple': '紫',
      'settings.accent.rose': '玫瑰',
      'settings.theme.previewTitle': '产物面板预览',
      'settings.theme.previewBody': '正文与说明文字跟随当前主题，强调色用于链接、选中态和主按钮。',
      'settings.theme.previewButton': '主按钮',
      'settings.theme.previewChip': '强调色',
      'settings.section.content': '收录内容',
      'settings.content.help': '关闭后对应类型不再出现在产物面板；收藏与隐藏记录保留。',
      'settings.content.replies': '每轮最终回复',
      'settings.content.docs': '文档（md / txt / json 等）',
      'settings.content.images': '图片',
      'settings.content.files': '其他文件',
      'settings.section.noise': '过滤噪音',
      'settings.noise.hideNoArtifacts': '隐藏没有产物的轮次',
      'settings.noise.hideNoArtifacts.help': '默认关；打开后只显示有产物的轮次，只有回复、没有文件的轮次会被隐藏。',
      'settings.noise.hideShort': '隐藏短回复',
      'settings.noise.hideShort.help': '仅过滤没有产物的轮次，避免误伤有交付的轮次；默认开。',
      'settings.noise.threshold': '短回复阈值',
      'settings.noise.threshold.help': '0–200 字，低于该值视为短回复。',
      'settings.noise.unit': '字',
      'settings.noise.keywords': '忽略轮次关键词',
      'settings.noise.keywords.help': '逗号分隔；命中关键词的轮次默认隐藏。默认：总线无新消息,已处理到',
      'settings.section.grouping': '分组与子代理',
      'settings.defaultDimension.label': '默认分组维度',
      'settings.defaultDimension.help': '「自动」优先任务，其次运行，最后轮次；也可固定某一维度。',
      'settings.showSubagents': '显示子代理产物',
      'settings.showSubagents.help': '展开任务/运行组时拉取子会话产物；关闭后只看本会话。',
      'settings.showUnassigned': '显示未归属产物',
      'settings.showUnassigned.help': '无法按任务/运行归属的产物集中到「未归属」组。',
      'dimension.auto': '自动',
      'dimension.turns': '轮次',
      'dimension.tasks': '任务',
      'dimension.runs': '运行',
      'dimension.label': '分组维度',
      'dimension.empty': '当前维度还没有可显示的产物',
      'group.unassigned': '未归属',
      'group.owner': '负责人：{name}',
      'group.members': '{count} 个成员',
      'group.childCount': '含子代理 {count}',
      'group.expand': '展开子代理',
      'group.collapse': '收起子代理',
      'group.loadingChildren': '正在读取子代理产物…',
      'group.noChildren': '子代理暂无产物',
      'group.openChild': '打开子代理会话',
      'group.writeScopes': '{count} 个写入范围',
      'group.unassignedHint': '无法精确匹配到任务或运行的产物',
      'group.loadChildren': '加载子代理产物（{count}）',
      'group.childFailed': '子代理产物读取失败',
      'group.moreScopes': '还有 {count} 个范围',
      'badge.subagent': '子代理',
      'stats.groups': '{groups} 组 · {files} 个产物 · 更新于 {updated}',
      'pagination.loadGroups': '显示更多分组（还剩 {count} 组）',
      'status.pending': '待处理',
      'status.running': '进行中',
      'status.completed': '已完成',
      'status.blocked': '阻塞',
      'status.failed': '失败',
      'status.ended': '已结束',
      'status.aborted': '已中止',
      'settings.section.pagination': '分页',
      'settings.pageSize.label': '每页轮次',
      'settings.pageSize.help': '产物面板底部可「加载更早」；选择「全部」会一次渲染所有轮次。',
      'settings.page.10': '10 轮',
      'settings.page.20': '20 轮',
      'settings.page.50': '50 轮',
      'settings.page.all': '全部',
      'settings.reset': '恢复默认设置',
      'settings.foot': '设置保存在本机，不改动会话内容与已收藏/已隐藏记录。',
      'settings.open': '设置',
      'settings.hint': '在「设置 → 产物面板」里可以调整字号、收录内容与噪音过滤。',
      'sidebar.open': '在右侧栏打开',
      'sidebar.failed': '无法打开右侧栏，请先在会话中打开右侧栏再试。',
      'sidebar.guide.description': '本会话全部产物',
      'sidebar.menu': '页面操作',
      'sidebar.float': '浮出为浮动面板',
      'sidebar.fullscreen': '全屏 / 退出全屏',
      'sidebar.split': '分屏',
      'sidebar.splitUnavailable': '当前栏宽或分屏上限不支持分屏',
      'sidebar.actionUnavailable': '当前无法执行该操作',
      'onlyArtifacts.label': '只看有产物',
      'onlyArtifacts.hint': '打开后只显示至少有一个可收录产物的轮次',
      'settings.sourceLimit': '通过 bash 等非文件工具写入的文件暂不自动收录（只认 present / write / edit / workspace changes 三类来源）；这类轮次会以「无产物」显示，不是面板坏了。',
      'showAll.off': '显示全部轮次',
      'showAll.on': '只看产物轮次',
      'showAll.hint': '临时显示被噪音规则过滤的轮次',
      'pagination.loadOlder': '加载更早（还剩 {count} 轮）',
      'pagination.shownAll': '已显示全部 {count} 轮',
      'empty.filteredBody': '当前筛选或噪音规则隐藏了所有轮次。可以清除筛选，或临时显示被过滤的轮次。',
    })
    Object.assign(zh, {
      'scope.label': '产物范围',
      'scope.session': '本会话',
      'scope.all': '全部会话',
      'all.stats': '{sessions} 个会话 · {files} 个产物 · 更新于 {updated}',
      'all.preparing': '跨会话索引准备中…',
      'all.missing.title': '索引准备中（需 DSH 下次启动生效）',
      'all.missing.body': '跨会话索引由 Host 在下次启动 DSH 时生成；本会话视图不受影响，可先继续使用。若启动后长期停在这里，可能是索引目录不可写（持久化降级），Host 日志会记录原因。',
      'all.invalid.title': '跨会话索引格式不符',
      'all.invalid.body': '索引文件校验失败，当前已跳过读取；下次启动 DSH 会自动隔离损坏文件并重建索引。',
      'all.error.title': '读取跨会话索引失败',
      'all.error.body': '无法通过宿主接口读取索引文件。请确认索引目录可读，或稍后重试。',
      'all.unavailable.title': '跨会话索引服务不可用',
      'all.unavailable.body': '当前宿主没有提供跨会话索引读取接口（同源 HTTP 路由与 remote.workspaceFiles 均不可用），通常旧版宿主或服务未注册。本会话视图不受影响；升级或重启 DSH 后恢复。',
      'all.denied.title': '没有读取索引的权限',
      'all.denied.body': '索引文件存在，但当前会话没有读取权限。请确认索引目录与索引文件可读，然后重试。',
      'all.details': '原始错误',
      'all.session.serviceUnavailable': '索引服务不可用',
      'all.retry': '重试读取',
      'all.progress': '索引中 {done}/{total}',
      'all.degraded': '持久化降级：索引只在内存中',
      'all.updated': '索引更新：{time}',
      'all.filters.archived': '含归档',
      'all.filters.subagents': '含子代理',
      'all.search.running': '正在检索全部会话（剩余 {count}）…',
      'all.search.placeholder': '按产物路径搜索全部会话',
      'all.workspace.unnamed': '未命名工作区',
      'all.workspace.count': '{sessions} 个会话',
      'all.session.label': '会话 {id}',
      'all.session.count': '{files} 个产物 · {turns} 轮',
      'all.session.current': '当前会话',
      'all.session.archived': '已归档',
      'all.session.subagent': '子代理',
      'all.session.open': '打开会话',
      'all.session.select': '选择一个会话查看产物',
      'all.session.loading': '正在读取会话产物…',
      'all.session.failed': '会话索引读取失败',
      'all.session.empty': '这个会话没有产物',
      'all.session.searchEmpty': '没有路径匹配的产物',
      'all.loadMore': '显示更多（还剩 {count}）',
      'all.empty': '索引里还没有可显示的产物',
      'settings.section.crossSession': '跨会话索引',
      'settings.crossSession': '启用「全部会话」视图',
      'settings.crossSession.help': '开启后产物页签顶部出现「本会话 | 全部会话」。Host 侧索引写入由插件配置 crossSessionIndex 控制；改动 Host 代码需下次启动 DSH 生效。',
      'settings.crossSession.groupHelp': '索引由 Host 在后台维护，只存引用；本会话视图不依赖它。',
      'settings.indexDir.label': '索引目录（可选）',
      'settings.indexDir.help': '留空 = 由 Host 经同源 HTTP 接口提供索引（推荐）。只有宿主没有 HTTP 路由时才需要填绝对路径；填写后改为通过工作区文件服务直接读取该目录。',
      'settings.indexDir.placeholder': '留空自动（/artifacts-panel/index.json）',
      'settings.rebuild.label': '重建索引',
      'settings.rebuild.help': '丢弃当前索引并重新扫描全部会话；只重建引用，不重新生成产物文件。',
      'settings.rebuild.action': '立即重建',
      'settings.rebuild.busy': '正在重建…',
      'settings.rebuild.done': '已触发重建；稍后回到「全部会话」即可看到新结果。',
      'settings.rebuild.unavailable': '宿主没有提供重建接口（旧版宿主或 HTTP 路由未注册）。',
      'settings.promptGuidance.help': '提示词透明：安装后宿主会给所有会话增加约 80 字的「产物引导」；不需要时在插件配置里设 promptGuidance: false（需重启 DSH）。',
      'settings.indexCapacity': '容量上限',
      'settings.indexCapacity.help': '只存引用（会话 id、路径、轮次、来源、类型、可选 size/sha），不存回复正文或文件内容。',
      'settings.indexCapacityValue': '最多 300 个会话 · 每会话 300 条 · index.json ≤ 512KB',
      'settings.indexLast': '最近回填',
      'settings.indexLastValue': '{time} · {sessions} 个会话 / {files} 条引用',
      'settings.indexNever': '尚未建立（DSH 下次启动后生成）',
      'settings.indexCleanup': '卸载/清理：索引位于 $DSH_HOME/artifacts-panel/index（DSH_HOME 缺失时在系统临时目录），删除该目录即可重置；旧版插件目录下的 .index/ 只做一次性复制迁移，可手动删除。DSH 投影缓存里可能残留 artifactIndex 检查点，插件不会读写该缓存，缓存重建后自然失效。',
    })
    Object.assign(zh, {
      'action.more': '更多操作',
      'action.reveal': '在 Finder 中显示',
      'action.openDefault': '用默认应用打开',
      'action.saveAs': '另存为…',
      'action.changes': '看改动',
      'action.changesHint': '在官方 diff 评审页打开本轮的改动',
      'action.gallery': '画廊',
      'action.list': '列表',
      'file.failed': '文件操作失败：宿主能力不可用',
      'changes.loading': '读取改动信息…',
      'gallery.title': '图片画廊',
      'gallery.empty': '没有可显示的图片',
      'gallery.failed': '图片加载失败',
      'gallery.open': '查看大图',
      'gallery.prev': '上一张',
      'gallery.next': '下一张',
      'gallery.close': '关闭',
      'gallery.counter': '{index} / {total}',
      'gallery.viewLabel': '图片视图',
      'export.menu': '导出包',
      'export.menuTitle': '导出与复制',
      'export.manifest': '导出清单（Markdown）',
      'export.bundle': '导出本会话产物包（ZIP）',
      'export.bundleFailed': '会话包导出失败',
      'export.bundleStarted': '已开始下载会话包',
      'export.degradedItem': '导出带下载链接的产物清单（降级）',
      'export.degraded': '当前运行时没有会话包导出（sessionLogDownload 不可用），已降级为带下载链接的清单。',
      'export.copyMarkdown': '复制全文 Markdown',
      'export.copyDone': '全文 Markdown 已复制',
      'export.copyFailed': '读取或复制全文 Markdown 失败',
      'export.menuNote': '会话包包含本会话、子会话与附件；清单只导出当前筛选可见的产物。',
      'settings.section.view': '视图与悬浮条',
      'settings.imageView.label': '图片默认视图',
      'settings.imageView.help': '仅在「图片」筛选与轮次维度下生效；画廊用缩略图网格，点击可全屏浏览。',
      'settings.view.list': '列表',
      'settings.view.gallery': '画廊',
      'settings.floatingBar': '显示产物悬浮条',
      'settings.floatingBar.help': '在页面右下角显示「产物 N」小条，点击打开右侧栏产物面板；关闭后本页不再显示。默认开。',
      'settings.autoOpenSidebar': '打开会话时自动展开产物标签页',
      'settings.autoOpenSidebar.help': '默认关。开启后只在右侧栏处于收起状态时打开产物标签页；已展开的其他标签页不会被抢占，每个会话只自动触发一次。',
      'settings.renderMarkdown': '渲染最终回复的 Markdown',
      'settings.renderMarkdown.help': '默认开。开启后最终回复按标题、列表、代码块、引用与链接排版；关闭则显示原始 Markdown 源码。工具输出、diff 与复制/导出始终保留原始文本。',
      'sidebar.collapse': '收起右栏',
      'sidebar.collapseHint': '收起右侧栏（已打开的标签页保持打开）',
      'dock.label': '产物',
      'dock.count': '产物 {count}',
      'dock.open': '打开产物面板',
      'dock.close': '关闭悬浮条',
    })
    Object.assign(en, {
      'settings.title': 'Artifacts panel',
      'settings.intro': 'Adjust the artifacts panel font size, density, included content and noise filters. Settings are stored locally and apply immediately.',
      'settings.section.font': 'Font size and density',
      'settings.fontSize.label': 'Font scale',
      'settings.fontSize.help': 'Scales font size relative to the host, 0.8–2.5×. Default 1.5× (about 24px when the host root is 16px).',
      'settings.fontSize.preview': 'Font preview: body, turn titles and cards scale together',
      'settings.fontScale.actual': 'Current effective size ≈ {px}px',
      'settings.font.small': 'Small 13',
      'settings.font.standard': 'Standard 15',
      'settings.font.large': 'Large 17',
      'settings.font.xlarge': 'Extra large 19',
      'settings.density.label': 'Line height / density',
      'settings.density.help': 'Controls the spacing between replies and cards.',
      'settings.density.compact': 'Compact',
      'settings.density.standard': 'Standard',
      'settings.density.relaxed': 'Relaxed',
      'settings.section.theme': 'Color theme',
      'settings.theme.help': 'Follows the DSH theme by default. You can also pin the artifacts panel to dark or light without touching other host pages.',
      'settings.theme.mode': 'Theme mode',
      'settings.theme.mode.help': '"Follow DSH" uses the host palette. Dark or light applies to the panel, sidebar tab, floating bar and gallery; the lightbox mask always stays dark.',
      'settings.theme.mode.inherit': 'Follow DSH',
      'settings.theme.mode.dark': 'Dark',
      'settings.theme.mode.light': 'Light',
      'settings.theme.accent': 'Accent color',
      'settings.theme.accent.help': 'Used for links, selected states, progress and primary buttons. "Default" keeps the host accent.',
      'settings.accent.default': 'Default',
      'settings.accent.blue': 'Blue',
      'settings.accent.amber': 'Amber',
      'settings.accent.green': 'Green',
      'settings.accent.purple': 'Purple',
      'settings.accent.rose': 'Rose',
      'settings.theme.previewTitle': 'Artifacts panel preview',
      'settings.theme.previewBody': 'Body and secondary text follow the current theme; the accent drives links, selected states and the primary button.',
      'settings.theme.previewButton': 'Primary',
      'settings.theme.previewChip': 'Accent',
      'settings.section.content': 'Included content',
      'settings.content.help': 'Turning a type off hides it from the panel; stars and hidden records are kept.',
      'settings.content.replies': 'Final reply of each turn',
      'settings.content.docs': 'Documents (md / txt / json …)',
      'settings.content.images': 'Images',
      'settings.content.files': 'Other files',
      'settings.section.noise': 'Noise filters',
      'settings.noise.hideNoArtifacts': 'Hide turns without artifacts',
      'settings.noise.hideNoArtifacts.help': 'Off by default. On shows only turns with at least one included artifact and hides reply-only turns.',
      'settings.noise.hideShort': 'Hide short replies',
      'settings.noise.hideShort.help': 'Only applies to turns without artifacts, so deliveries are never hidden. On by default.',
      'settings.noise.threshold': 'Short reply threshold',
      'settings.noise.threshold.help': '0–200 characters. Shorter replies count as short.',
      'settings.noise.unit': 'chars',
      'settings.noise.keywords': 'Ignored-turn keywords',
      'settings.noise.keywords.help': 'Comma separated. Turns containing a keyword are hidden by default. Default: 总线无新消息,已处理到',
      'settings.section.grouping': 'Grouping and subagents',
      'settings.defaultDimension.label': 'Default grouping',
      'settings.defaultDimension.help': 'Auto prefers tasks, then runs, then turns. You can pin one dimension.',
      'settings.showSubagents': 'Show subagent artifacts',
      'settings.showSubagents.help': 'Load child-session artifacts when a task/run group is expanded; off shows this session only.',
      'settings.showUnassigned': 'Show unassigned artifacts',
      'settings.showUnassigned.help': 'Artifacts that cannot be attributed to a task or run go to an Unassigned group.',
      'dimension.auto': 'Auto',
      'dimension.turns': 'Turns',
      'dimension.tasks': 'Tasks',
      'dimension.runs': 'Runs',
      'dimension.label': 'Grouping',
      'dimension.empty': 'No artifacts in this dimension yet',
      'group.unassigned': 'Unassigned',
      'group.owner': 'Owner: {name}',
      'group.members': '{count} members',
      'group.childCount': '{count} subagents',
      'group.expand': 'Expand subagents',
      'group.collapse': 'Collapse subagents',
      'group.loadingChildren': 'Reading subagent artifacts…',
      'group.noChildren': 'Subagents produced no artifacts',
      'group.openChild': 'Open subagent session',
      'group.writeScopes': '{count} write scopes',
      'group.unassignedHint': 'Artifacts that cannot be matched to a task or run',
      'group.loadChildren': 'Load subagent artifacts ({count})',
      'group.childFailed': 'Could not read subagent artifacts',
      'group.moreScopes': '{count} more scopes',
      'badge.subagent': 'Subagent',
      'stats.groups': '{groups} groups · {files} artifacts · updated {updated}',
      'pagination.loadGroups': 'Show more groups ({count} left)',
      'status.pending': 'Pending',
      'status.running': 'Running',
      'status.completed': 'Completed',
      'status.blocked': 'Blocked',
      'status.failed': 'Failed',
      'status.ended': 'Ended',
      'status.aborted': 'Aborted',
      'settings.section.pagination': 'Pagination',
      'settings.pageSize.label': 'Turns per page',
      'settings.pageSize.help': 'Use “Load earlier” at the bottom of the panel. “All” renders every turn at once.',
      'settings.page.10': '10 turns',
      'settings.page.20': '20 turns',
      'settings.page.50': '50 turns',
      'settings.page.all': 'All',
      'settings.reset': 'Reset to defaults',
      'settings.foot': 'Stored on this machine. Session content, stars and hidden records are not changed.',
      'settings.open': 'Settings',
      'settings.hint': 'Adjust font size, included content and noise filters in Settings → Artifacts panel.',
      'sidebar.open': 'Open in sidebar',
      'sidebar.failed': 'Could not open the sidebar. Open it from the conversation first.',
      'sidebar.guide.description': 'All artifacts in this session',
      'sidebar.menu': 'Page actions',
      'sidebar.float': 'Float as panel',
      'sidebar.fullscreen': 'Fullscreen / restore',
      'sidebar.split': 'Split pane',
      'sidebar.splitUnavailable': 'The current width or split limit does not allow splitting',
      'sidebar.actionUnavailable': 'This action is not available right now',
      'onlyArtifacts.label': 'Only artifact turns',
      'onlyArtifacts.hint': 'Show only turns with at least one included artifact',
      'settings.sourceLimit': 'Files written by bash and other non-file tools are not collected automatically (only present / write / edit / workspace changes are); those turns show as “No artifacts”. The panel is not broken.',
      'showAll.off': 'Show all turns',
      'showAll.on': 'Only artifact turns',
      'showAll.hint': 'Temporarily show turns hidden by noise filters',
      'pagination.loadOlder': 'Load earlier ({count} left)',
      'pagination.shownAll': 'All {count} turns shown',
      'empty.filteredBody': 'The current filters or noise rules hide every turn. Clear the filters, or temporarily show the filtered turns.',
    })
    Object.assign(en, {
      'scope.label': 'Artifact scope',
      'scope.session': 'This session',
      'scope.all': 'All sessions',
      'all.stats': '{sessions} sessions · {files} artifacts · updated {updated}',
      'all.preparing': 'Preparing the cross-session index…',
      'all.missing.title': 'Index pending (takes effect on the next DSH start)',
      'all.missing.body': 'The Host builds the cross-session index on the next DSH start. The this-session view is unaffected and keeps working. If this state persists after a restart, the index directory may be unwritable (persistence degraded); the Host log records why.',
      'all.invalid.title': 'Cross-session index format mismatch',
      'all.invalid.body': 'The index failed validation and was skipped. The next DSH start quarantines the broken file and rebuilds the index.',
      'all.error.title': 'Could not read the cross-session index',
      'all.error.body': 'The Host interface could not read the index. Check that the index directory is readable, then retry.',
      'all.unavailable.title': 'Cross-session index service unavailable',
      'all.unavailable.body': 'This host exposes neither the same-origin index HTTP route nor remote.workspaceFiles to the artifacts panel, usually an older host or an unregistered service. The this-session view is unaffected; it recovers after upgrading or restarting DSH.',
      'all.denied.title': 'No permission to read the index',
      'all.denied.body': 'The index file exists but this session cannot read it. Check that the index directory and index file are readable, then retry.',
      'all.details': 'Raw error',
      'all.session.serviceUnavailable': 'index service unavailable',
      'all.retry': 'Retry',
      'all.progress': 'Indexing {done}/{total}',
      'all.degraded': 'Persistence degraded: memory-only index',
      'all.updated': 'Index updated: {time}',
      'all.filters.archived': 'Include archived',
      'all.filters.subagents': 'Include subagents',
      'all.search.running': 'Searching all sessions ({count} left)…',
      'all.search.placeholder': 'Search all sessions by artifact path',
      'all.workspace.unnamed': 'Unnamed workspace',
      'all.workspace.count': '{sessions} sessions',
      'all.session.label': 'Session {id}',
      'all.session.count': '{files} artifacts · {turns} turns',
      'all.session.current': 'Current',
      'all.session.archived': 'Archived',
      'all.session.subagent': 'Subagent',
      'all.session.open': 'Open session',
      'all.session.select': 'Select a session to see its artifacts',
      'all.session.loading': 'Reading session artifacts…',
      'all.session.failed': 'Could not read the session index',
      'all.session.empty': 'This session has no artifacts',
      'all.session.searchEmpty': 'No artifact path matches',
      'all.loadMore': 'Show more ({count} left)',
      'all.empty': 'The index has no artifacts to show yet',
      'settings.section.crossSession': 'Cross-session index',
      'settings.crossSession': 'Enable the all-sessions view',
      'settings.crossSession.help': 'Adds “This session | All sessions” above the artifacts tab. The Host-side writer is controlled by the crossSessionIndex plugin config; Host code changes take effect on the next DSH start.',
      'settings.crossSession.groupHelp': 'The Host maintains the index in the background and stores references only; the this-session view does not depend on it.',
      'settings.indexDir.label': 'Index directory (optional)',
      'settings.indexDir.help': 'Leave empty to read the index through the Host same-origin HTTP route (recommended). Fill an absolute path only when the host has no HTTP route; it is then read through the workspace file service.',
      'settings.indexDir.placeholder': 'Empty = automatic (/artifacts-panel/index.json)',
      'settings.rebuild.label': 'Rebuild index',
      'settings.rebuild.help': 'Drop the current index and rescan every session; only references are rebuilt, artifact files are never regenerated.',
      'settings.rebuild.action': 'Rebuild now',
      'settings.rebuild.busy': 'Rebuilding…',
      'settings.rebuild.done': 'Rebuild triggered; return to “All sessions” in a moment to see the new result.',
      'settings.rebuild.unavailable': 'The host exposes no rebuild endpoint (older host or the HTTP route is not registered).',
      'settings.promptGuidance.help': 'Prompt transparency: installation adds an ~80-character artifact-guidance section to every session. Disable it with promptGuidance: false in the plugin config (restart DSH).',
      'settings.indexCapacity': 'Capacity limits',
      'settings.indexCapacity.help': 'References only (session id, path, turn, source, kind, optional size/sha). No reply text or file content is stored.',
      'settings.indexCapacityValue': 'Max 300 sessions · 300 rows each · index.json ≤ 512KB',
      'settings.indexLast': 'Last backfill',
      'settings.indexLastValue': '{time} · {sessions} sessions / {files} references',
      'settings.indexNever': 'Not built yet (generated on the next DSH start)',
      'settings.indexCleanup': 'Uninstall/cleanup: the index lives in $DSH_HOME/artifacts-panel/index (or an OS temp directory when DSH_HOME is missing); delete it to reset. The old in-package .index/ is copied once at startup and can be removed by hand. DSH’s projection cache may retain an artifactIndex checkpoint; the plugin never reads or writes that cache, and it lapses when the cache is rebuilt.',
    })
    Object.assign(en, {
      'action.more': 'More actions',
      'action.reveal': 'Reveal in Finder',
      'action.openDefault': 'Open with default app',
      'action.saveAs': 'Save as…',
      'action.changes': 'View changes',
      'action.changesHint': 'Open this turn’s changes in the official diff review tab',
      'action.gallery': 'Gallery',
      'action.list': 'List',
      'file.failed': 'File action failed: the host capability is unavailable',
      'changes.loading': 'Reading changes…',
      'gallery.title': 'Image gallery',
      'gallery.empty': 'No images to show',
      'gallery.failed': 'Could not load the image',
      'gallery.open': 'View larger',
      'gallery.prev': 'Previous',
      'gallery.next': 'Next',
      'gallery.close': 'Close',
      'gallery.counter': '{index} / {total}',
      'gallery.viewLabel': 'Image view',
      'export.menu': 'Export',
      'export.menuTitle': 'Export and copy',
      'export.manifest': 'Export list (Markdown)',
      'export.bundle': 'Export this session bundle (ZIP)',
      'export.bundleFailed': 'Could not export the session bundle',
      'export.bundleStarted': 'Session bundle download started',
      'export.degradedItem': 'Export list with download links (degraded)',
      'export.degraded': 'This runtime has no session-bundle export (sessionLogDownload unavailable); exporting a list with download links instead.',
      'export.copyMarkdown': 'Copy full Markdown',
      'export.copyDone': 'Full Markdown copied',
      'export.copyFailed': 'Could not read or copy the full Markdown',
      'export.menuNote': 'The bundle contains this session, its subagents and attachments; the list contains only the artifacts currently visible after filters.',
      'settings.section.view': 'View and floating bar',
      'settings.imageView.label': 'Default image view',
      'settings.imageView.help': 'Only applies to the Images filter in the turns dimension. The gallery shows thumbnails; click one for a fullscreen view.',
      'settings.view.list': 'List',
      'settings.view.gallery': 'Gallery',
      'settings.floatingBar': 'Show the artifacts floating bar',
      'settings.floatingBar.help': 'Shows a small “Artifacts N” pill at the bottom right that opens the artifacts sidebar tab; closing it hides it for this page. On by default.',
      'settings.autoOpenSidebar': 'Open the artifacts tab when a conversation opens',
      'settings.autoOpenSidebar.help': 'Off by default. When on, the artifacts tab opens only while the right sidebar is collapsed: a tab you already opened is never replaced, and each conversation triggers at most once.',
      'settings.renderMarkdown': 'Render Markdown in final replies',
      'settings.renderMarkdown.help': 'On by default. Final replies lay out headings, lists, code blocks, quotes and links; turn it off to show the raw Markdown source. Tool output, diffs, copy and export always keep the raw text.',
      'sidebar.collapse': 'Collapse sidebar',
      'sidebar.collapseHint': 'Collapse the right sidebar (open tabs stay open)',
      'dock.label': 'Artifacts',
      'dock.count': 'Artifacts {count}',
      'dock.open': 'Open the artifacts panel',
      'dock.close': 'Hide the floating bar',
    })
    Object.assign(zh, {
      'filter.open': '筛选',
      'filter.heading': '筛选与视图',
      'filter.subtitle': '筛选只改变显示，不会改动收藏或隐藏记录。',
      'filter.onlyArtifacts': '只看有产物',
      'filter.onlyArtifacts.help': '隐藏只有回复、没有文件的轮次',
      'filter.showAllTurns': '显示全部轮次',
      'filter.showAllTurns.help': '临时绕过噪音规则，显示被过滤的轮次',
      'filter.showHidden': '显示已隐藏',
      'filter.view': '图片视图',
      'filter.sort': '排序',
      'filter.sort.default': '默认',
      'filter.sort.time': '最新在前',
      'filter.sort.name': '按名称',
      'filter.clear': '清除全部筛选',
      'filter.activeCount': '{count} 项',
      'stats.filtered': '已筛选 {count} 项',
      'more.menu': '更多面板操作',
      'more.settings': '打开设置面板',
      'card.open': '打开 {name}',
      'card.copyPath': '复制路径',
      'empty.newTitle': '这里会自动收集本轮产物',
      'empty.newBody': '每轮的最终回复、文档、图片和其他产出文件都会自动归档到这里。不用手动整理，打开会话就能看。',
      'empty.sample': '看看会收集什么',
      'empty.sampleTitle': '会收集的内容',
      'empty.sampleReply': '最终回复：这一轮做了什么、结论是什么',
      'empty.sampleDoc': '文档：报告、清单、说明（md / txt / json）',
      'empty.sampleImage': '图片：截图、图表、生成的图像',
      'empty.settings': '调整字号与主题',
      'empty.filteredTitle': '当前筛选下没有产物',
      'empty.clearAll': '清空全部筛选',
      'empty.removeFilter': '移除筛选：{label}',
      'filter.chip.kind': '类型：{value}',
      'filter.chip.query': '搜索：{value}',
      'filter.chip.showHidden': '显示已隐藏',
      'error.body': '产物列表暂时读不到，通常是读取通道刚被刷新打断，或会话文件服务还没就绪。稍等片刻再试一次。',
      'error.noSessionBody': '还没有选中会话。打开一个会话后，产物会显示在这里。',
      'error.serviceBody': '会话文件服务暂时不可用，读不到产物索引。重试一次；如果一直失败，可以复制诊断信息反馈。',
      'error.copyDiag': '复制诊断信息',
      'error.diagCopied': '诊断信息已复制',
      'error.diagFailed': '诊断信息复制失败',
      'error.details': '技术细节',
      'error.code': '错误码：{code}',
      'error.unknown': '未知错误',
      'onboarding.title': '第一次用产物面板？',
      'onboarding.body': '这里会自动收集每轮的最终回复、文档、图片和其他产出文件。点卡片打开内容，点齿轮可以调整字号、主题和过滤规则。',
      'onboarding.dismiss': '知道了',
      'onboarding.settings': '去设置',
      'all.session.expand': '展开子会话',
      'all.session.collapse': '收起子会话',
      'settings.font.groupHelp': '控制面板整体字号与行距；下面的配色只作用于产物面板，不改宿主其它页面。',
      'settings.noise.groupHelp': '按内容噪音隐藏轮次；这些规则只影响显示，不改会话记录。',
      'settings.grouping.groupHelp': '决定产物按轮次、任务还是运行分组，以及是否收录子代理的产物。',
      'settings.view.groupHelp': '图片默认视图、悬浮条、打开会话时的停靠行为与分页。',
      'settings.onboarding.label': '首次引导',
      'settings.onboarding.help': '第一次打开面板时显示说明卡，只出现一次。',
      'settings.onboarding.reset': '重新显示引导',
    })
    Object.assign(en, {
      'filter.open': 'Filter',
      'filter.heading': 'Filter and view',
      'filter.subtitle': 'Filters only change what is shown; stars and hidden records are kept.',
      'filter.onlyArtifacts': 'Only turns with artifacts',
      'filter.onlyArtifacts.help': 'Hide turns that have a reply but no file',
      'filter.showAllTurns': 'Show all turns',
      'filter.showAllTurns.help': 'Temporarily bypass the noise rules',
      'filter.showHidden': 'Show hidden',
      'filter.view': 'Image view',
      'filter.sort': 'Sort',
      'filter.sort.default': 'Default',
      'filter.sort.time': 'Newest first',
      'filter.sort.name': 'By name',
      'filter.clear': 'Clear all filters',
      'filter.activeCount': '{count} active',
      'stats.filtered': '{count} filters active',
      'more.menu': 'More panel actions',
      'more.settings': 'Open the settings panel',
      'card.open': 'Open {name}',
      'card.copyPath': 'Copy path',
      'empty.newTitle': 'Artifacts collect here automatically',
      'empty.newBody': 'Each turn’s final reply, documents, images and other produced files are archived here. No manual filing; open the conversation and they are ready.',
      'empty.sample': 'See what gets collected',
      'empty.sampleTitle': 'What gets collected',
      'empty.sampleReply': 'Final reply: what the turn did and concluded',
      'empty.sampleDoc': 'Documents: reports, lists, notes (md / txt / json)',
      'empty.sampleImage': 'Images: screenshots, charts, generated images',
      'empty.settings': 'Adjust size and theme',
      'empty.filteredTitle': 'No artifacts under the current filters',
      'empty.clearAll': 'Clear all filters',
      'empty.removeFilter': 'Remove filter: {label}',
      'filter.chip.kind': 'Type: {value}',
      'filter.chip.query': 'Search: {value}',
      'filter.chip.showHidden': 'Show hidden',
      'error.body': 'The artifact list cannot be read right now. A refresh may have interrupted the read, or the session file service is not ready yet. Try again in a moment.',
      'error.noSessionBody': 'No conversation is selected. Open a conversation and its artifacts show up here.',
      'error.serviceBody': 'The session file service is unavailable, so the artifact index cannot be read. Retry; if it keeps failing, copy the diagnostics and report them.',
      'error.copyDiag': 'Copy diagnostics',
      'error.diagCopied': 'Diagnostics copied',
      'error.diagFailed': 'Could not copy diagnostics',
      'error.details': 'Technical details',
      'error.code': 'Error code: {code}',
      'error.unknown': 'Unknown error',
      'onboarding.title': 'First time with the artifacts panel?',
      'onboarding.body': 'Final replies, documents, images and other produced files collect here automatically. Click a card to open it, or the gear to adjust size, theme and filters.',
      'onboarding.dismiss': 'Got it',
      'onboarding.settings': 'Open settings',
      'all.session.expand': 'Expand sub-sessions',
      'all.session.collapse': 'Collapse sub-sessions',
      'settings.font.groupHelp': 'Controls the panel font size and spacing; the palette below applies to the artifacts panel only, not the rest of the host.',
      'settings.noise.groupHelp': 'Hides turns by content noise; these rules only change what is shown, never the stored session.',
      'settings.grouping.groupHelp': 'Chooses whether artifacts group by turn, task or run, and whether subagent output is included.',
      'settings.view.groupHelp': 'Default image view, floating bar, sidebar behaviour when a conversation opens, and pagination.',
      'settings.onboarding.label': 'First-run guide',
      'settings.onboarding.help': 'Shows a short card the first time the panel opens; it appears only once.',
      'settings.onboarding.reset': 'Show the guide again',
    })

    //#endregion

    //#region helpers
    function interpolate(template, params) {
      if (typeof template !== 'string') return ''
      if (params === undefined || params === null) return template
      return template.replace(/\{(\w+)\}/g, function (match, key) {
        return params[key] === undefined || params[key] === null ? match : String(params[key])
      })
    }

    function fallbackT(key, params) {
      const dict = /^zh/i.test(typeof navigator !== 'undefined' ? navigator.language || '' : '') ? zh : en
      return interpolate(dict[key] || key, params)
    }

    function basename(path) {
      const value = String(path)
      const at = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
      return at === -1 ? value : value.slice(at + 1)
    }

    // Keep the file name (the tail) readable when a deep path is squeezed into a
    // card row: the middle elides, the head keeps the workspace hint.
    function middleEllipsis(value, limit) {
      const text = String(value || '')
      const max = Math.max(12, Number(limit) || 42)
      if (text.length <= max) return text
      const name = basename(text)
      const reservedTail = name.length + 1 < max - 6 ? name.length + 1 : Math.max(10, Math.floor(max * 0.62))
      const head = Math.max(6, max - 1 - reservedTail)
      return text.slice(0, head) + '…' + text.slice(Math.max(head, text.length - reservedTail))
    }

    function copyText(text) {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
      if (!clipboard || typeof clipboard.writeText !== 'function') return Promise.reject(new Error('CLIPBOARD_UNAVAILABLE'))
      return Promise.resolve(clipboard.writeText(String(text)))
    }

    function isAbsolutePath(path) {
      return typeof path === 'string' && (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path))
    }

    function normalizePath(path) {
      if (typeof path !== 'string') return ''
      return path.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
    }

    function resolveAgainst(cwd, path) {
      if (!path) return ''
      if (isAbsolutePath(path) || !cwd) return path
      return String(cwd).replace(/[/\\]+$/, '') + '/' + String(path).replace(/^(?:\.?[/\\])+/, '')
    }

    function fileAddress(sessionId, path) {
      const normalized = normalizePath(path)
      const encoded = normalized.split('/').map(function (segment) {
        return encodeURIComponent(segment).replace(/%3A/gi, ':')
      }).join('/')
      return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + encoded
    }

    function mediaUrl(path) {
      try {
        if (!isAbsolutePath(path)) return null
        if (/^[/\\]{2}/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) return null
        return new URL('api/file?path=' + encodeURIComponent(path), document.baseURI).href
      } catch (error) {
        return null
      }
    }

    // Official diff review deep link: the Session and the workspace/changes
    // announcement sequence identify the content; the turn only names the tab.
    function changesReviewAddress(sessionId, seq, turn) {
      return 'dsh-resource://changes-review/session/' + encodeURIComponent(sessionId) + '/' + String(seq) + '/' + String(turn)
    }

    function changesSummaryRoute(sessionId, seq) {
      return 'api/changes.summary?' + new URLSearchParams({ sessionId: String(sessionId), seq: String(seq) }).toString()
    }

    function sessionMarkdownRoute(sessionId) {
      return 'api/session.markdown?' + new URLSearchParams({ sessionId: String(sessionId) }).toString()
    }

    const MEDIA_TYPES = {
      md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', json: 'application/json',
      jsonl: 'application/x-ndjson', yaml: 'text/yaml', yml: 'text/yaml', csv: 'text/csv', tsv: 'text/tab-separated-values',
      html: 'text/html', htm: 'text/html', xml: 'application/xml', pdf: 'application/pdf', zip: 'application/zip',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
      svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
    }

    function mediaTypeFor(path) {
      const name = basename(path).toLowerCase()
      const at = name.lastIndexOf('.')
      if (at === -1) return ''
      return MEDIA_TYPES[name.slice(at + 1)] || ''
    }

    const DOC_EXT = new Set(['md', 'markdown', 'mdx', 'txt', 'json', 'jsonl', 'yaml', 'yml', 'csv', 'tsv', 'toml', 'ini', 'xml', 'html', 'htm', 'rst', 'tex', 'text'])
    const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif', 'ico', 'heic'])

    function fileKind(path) {
      const name = basename(path).toLowerCase()
      const at = name.lastIndexOf('.')
      const ext = at === -1 ? '' : name.slice(at + 1)
      if (IMAGE_EXT.has(ext)) return 'image'
      if (DOC_EXT.has(ext)) return 'doc'
      return 'file'
    }

    function isExcludedPath(path) {
      const lower = String(path).toLowerCase()
      if (lower === '/tmp' || lower.startsWith('/tmp/') || lower.startsWith('/private/tmp/') || lower.startsWith('/var/folders/')) return true
      if (lower.includes('/.git/') || lower.startsWith('.git/')) return true
      if (/(^|\/)(node_modules|dist|build|\.next)\//.test(lower)) return true
      const name = basename(lower)
      if (name.startsWith('.')) return true
      if (name.endsWith('.log')) return true
      return false
    }

    function messageText(message) {
      const content = message && Array.isArray(message.content) ? message.content : []
      const parts = []
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') parts.push(block.text)
      }
      return parts.join('\n\n')
    }

    function mutationPath(name, argsRaw) {
      if (typeof argsRaw !== 'string') return ''
      let args
      try {
        args = JSON.parse(argsRaw)
      } catch (error) {
        return ''
      }
      if (!args || typeof args !== 'object' || Array.isArray(args)) return ''
      if (name === 'write' || name === 'edit') {
        return typeof args.file_path === 'string' && args.file_path.trim() !== '' ? args.file_path : ''
      }
      if (name === 'str_replace_editor') {
        if (args.command === 'view' || args.command === 'undo_edit') return ''
        return typeof args.path === 'string' && args.path.trim() !== '' ? args.path : ''
      }
      return ''
    }

    function ensureTurn(turns, number, time) {
      if (typeof number !== 'number' || !Number.isFinite(number)) return null
      let turn = turns.get(number)
      if (!turn) {
        turn = { turn: number, startTime: 0, endTime: 0, reply: '', replyTime: 0, reason: '', files: [], fileIndex: new Map(), changes: [] }
        turns.set(number, turn)
      }
      if (time && (!turn.startTime || time < turn.startTime)) turn.startTime = time
      return turn
    }

    function addFile(turn, path, options) {
      if (!turn) return
      const cleaned = normalizePath(path)
      if (!cleaned || isExcludedPath(cleaned)) return
      const existing = turn.fileIndex.get(cleaned)
      if (existing) {
        if (options && options.description && !existing.description) existing.description = options.description
        if (options && options.source === 'presented') existing.source = 'presented'
        if (options && options.time && (!existing.time || options.time < existing.time)) existing.time = options.time
        return
      }
      const file = {
        path: cleaned,
        name: basename(cleaned),
        kind: fileKind(cleaned),
        source: options && options.source === 'presented' ? 'presented' : 'produced',
        description: options && options.description ? options.description : '',
        time: options && options.time ? options.time : 0,
      }
      turn.fileIndex.set(cleaned, file)
      turn.files.push(file)
    }

    function foldSession(records, cwd) {
      const turns = new Map()
      const calls = new Map()
      const tasks = new Map()
      const members = new Map()
      const runs = new Map()
      const events = []
      for (const record of records) {
        const event = record && record.event ? record.event : record
        if (event && typeof event.seq === 'number') events.push(event)
      }
      events.sort(function (left, right) { return left.seq - right.seq })
      for (const event of events) {
        const data = event.data && typeof event.data === 'object' ? event.data : {}
        if (event.type === 'turn/start') {
          const turn = ensureTurn(turns, data.turn, event.time)
          if (turn) turn.ended = false
          continue
        }
        if (event.type === 'turn/end') {
          const turn = ensureTurn(turns, data.turn, event.time)
          if (turn) {
            turn.ended = true
            turn.endTime = event.time
            turn.reason = data.reason && typeof data.reason.kind === 'string' ? data.reason.kind : ''
          }
          continue
        }
        if (event.type === 'assistant/message') {
          const turn = ensureTurn(turns, data.turn, event.time)
          const text = messageText(data.message)
          if (turn && text.trim() !== '') {
            turn.reply = text
            turn.replyTime = event.time
          }
          continue
        }
        if (event.type === 'deliverables/presented') {
          const turn = ensureTurn(turns, data.turn, event.time)
          const files = Array.isArray(data.files) ? data.files : []
          for (const file of files) {
            if (!file || typeof file.path !== 'string') continue
            addFile(turn, file.path, {
              source: 'presented',
              description: typeof file.description === 'string' ? file.description : '',
              time: event.time,
            })
          }
          continue
        }
        if (event.type === 'tool/call') {
          const turn = ensureTurn(turns, data.turn, event.time)
          if (turn && data.callId !== undefined) {
            calls.set(String(data.callId), { turn: turn, path: mutationPath(data.name, data.arguments) })
          }
          continue
        }
        if (event.type === 'tool/result') {
          const message = data.message && typeof data.message === 'object' ? data.message : {}
          if (message.isError === true) continue
          const callId = message.source && message.source.callId !== undefined ? String(message.source.callId) : ''
          const call = callId ? calls.get(callId) : undefined
          if (!call || !call.path || !call.turn) continue
          let path = call.path
          const metaPath = data.meta && typeof data.meta.path === 'string' ? data.meta.path : ''
          if (isAbsolutePath(metaPath)) path = metaPath
          addFile(call.turn, resolveAgainst(cwd, path), { source: 'produced', time: event.time })
          continue
        }
        if (event.type === 'workspace/changes') {
          // The durable event only announces that a turn changed workspace files;
          // the file list with binary/oversized markers is read from the Host's
          // authenticated summary route on demand (never computed here).
          const turn = ensureTurn(turns, data.turn, event.time)
          if (turn && Number.isFinite(event.seq)) {
            if (!Array.isArray(turn.changes)) turn.changes = []
            if (!turn.changes.some(function (item) { return item.seq === event.seq })) {
              turn.changes.push({ seq: event.seq, turn: data.turn, time: event.time })
            }
          }
          continue
        }
        if (event.type === 'team/task') {
          const id = typeof data.id === 'string' ? data.id : ''
          if (!id) continue
          const revision = Number.isFinite(data.revision) ? data.revision : 0
          const previous = tasks.get(id)
          if (!previous || revision >= (previous.revision || 0)) {
            tasks.set(id, {
              id: id,
              revision: revision,
              subject: typeof data.subject === 'string' && data.subject !== '' ? data.subject : id,
              description: typeof data.description === 'string' ? data.description : '',
              status: typeof data.status === 'string' ? data.status : '',
              ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
              blockedBy: Array.isArray(data.blockedBy) ? data.blockedBy.map(String) : [],
              writeScopes: Array.isArray(data.writeScopes) ? data.writeScopes.filter(function (scope) { return typeof scope === 'string' && scope.trim() !== '' }) : [],
            })
          }
          continue
        }
        if (event.type === 'team/member') {
          const id = typeof data.id === 'string' ? data.id : ''
          if (!id) continue
          members.set(id, {
            id: id,
            name: typeof data.name === 'string' && data.name !== '' ? data.name : id,
            phase: typeof data.phase === 'string' ? data.phase : '',
          })
          continue
        }
        if (event.type === 'tool-workflow/run-start') {
          ensureRun(runs, data.runId, data.name, event)
          continue
        }
        if (event.type === 'tool-workflow/agent-start') {
          const run = ensureRun(runs, data.runId, '', event)
          const childId = typeof data.childId === 'string' ? data.childId : String(data.childId || '')
          if (!childId) continue
          run.agents.push({
            childId: childId,
            label: typeof data.label === 'string' ? data.label : '',
            phase: typeof data.phase === 'string' && data.phase !== '' ? data.phase : 'default',
            startSeq: Number.isFinite(data.seq) ? data.seq : event.seq,
            endSeq: 0,
            outcome: '',
          })
          continue
        }
        if (event.type === 'tool-workflow/agent-end') {
          let target = null
          const seq = Number.isFinite(data.seq) ? data.seq : -1
          for (const run of runs.values()) {
            for (const agent of run.agents) {
              if (!target && agent.startSeq === seq && agent.outcome === '') target = agent
            }
            if (target) break
          }
          if (!target) {
            for (const run of runs.values()) {
              for (const agent of run.agents) {
                if (!target && agent.outcome === '') target = agent
              }
              if (target) break
            }
          }
          if (target) {
            target.outcome = typeof data.outcome === 'string' ? data.outcome : 'ended'
            target.endSeq = event.seq
          }
          continue
        }
        if (event.type === 'tool-workflow/run-end') {
          const run = ensureRun(runs, data.runId, '', event)
          run.status = typeof data.stopReason === 'string' ? data.stopReason : 'ended'
          run.endSeq = event.seq
          continue
        }
      }
      const result = []
      for (const turn of turns.values()) {
        if (turn.files.length === 0 && turn.reply.trim() === '') continue
        turn.files.sort(function (left, right) {
          if (left.source !== right.source) return left.source === 'presented' ? -1 : 1
          if ((left.time || 0) !== (right.time || 0)) return (left.time || 0) - (right.time || 0)
          return left.name.localeCompare(right.name)
        })
        if (Array.isArray(turn.changes)) {
          turn.changes.sort(function (left, right) { return left.seq - right.seq })
        }
        result.push(turn)
      }
      result.sort(function (left, right) { return left.turn - right.turn })
      const children = new Map()
      for (const member of members.values()) {
        children.set(member.id, { id: member.id, name: member.name, phase: member.phase, kind: 'member', runId: '' })
      }
      const runList = Array.from(runs.values()).map(function (run) {
        return {
          runId: run.runId,
          name: run.name,
          status: run.status,
          startSeq: run.startSeq,
          endSeq: run.endSeq,
          agents: run.agents.map(function (agent) { return Object.assign({}, agent) }),
          phases: Array.from(new Set(run.agents.map(function (agent) { return agent.phase || 'default' }))),
        }
      }).sort(function (left, right) { return left.startSeq - right.startSeq })
      for (const run of runList) {
        for (const agent of run.agents) {
          const previous = children.get(agent.childId)
          children.set(agent.childId, {
            id: agent.childId,
            name: previous ? previous.name : (agent.label || agent.childId),
            phase: agent.phase || (previous ? previous.phase : ''),
            kind: 'agent',
            runId: run.runId,
          })
        }
      }
      return {
        turns: result,
        team: {
          tasks: Array.from(tasks.values()).sort(function (left, right) { return (left.revision || 0) - (right.revision || 0) || left.id.localeCompare(right.id) }),
          members: Array.from(members.values()),
        },
        runs: runList,
        children: Array.from(children.values()),
      }
    }

    function foldTurns(records, cwd) {
      return foldSession(records, cwd).turns
    }

    function ensureRun(runs, runId, name, event) {
      const key = String(runId || 'run')
      let run = runs.get(key)
      if (!run) {
        run = { runId: key, name: typeof name === 'string' && name !== '' ? name : key, status: 'running', agents: [], startSeq: event ? event.seq : 0, endSeq: 0 }
        runs.set(key, run)
      } else if (typeof name === 'string' && name !== '' && (run.name === run.runId || run.name === '')) {
        run.name = name
      }
      return run
    }

    function normalizeScope(scope) {
      return String(scope || '').replace(/\\/g, '/').replace(/\/+$/, '')
    }

    function pathWithinScope(path, scope) {
      const value = String(path || '').replace(/\\/g, '/')
      const prefix = normalizeScope(scope)
      if (prefix === '') return false
      return value === prefix || value.indexOf(prefix + '/') === 0
    }

    function taskForPath(path, tasks) {
      let best = null
      for (const task of tasks) {
        for (const scope of task.writeScopes || []) {
          if (!pathWithinScope(path, scope)) continue
          const length = normalizeScope(scope).length
          if (!best || length > best.length || (length === best.length && (task.revision || 0) > (best.task.revision || 0))) {
            best = { task: task, length: length }
          }
        }
      }
      return best ? best.task : null
    }

    function dedupeRows(rows) {
      const seen = new Set()
      const result = []
      for (const row of rows) {
        const key = String(row.childId || '') + '|' + String(row.turn || 0) + '|' + String(row.path || '')
        if (seen.has(key)) continue
        seen.add(key)
        result.push(row)
      }
      result.sort(function (left, right) {
        return (left.time || 0) - (right.time || 0) || String(left.path).localeCompare(String(right.path))
      })
      return result
    }

    function buildGroups(options) {
      const dimension = options.dimension
      if (dimension !== 'tasks' && dimension !== 'runs') return []
      const settings = options.settings
      const hiddenSet = options.hiddenSet
      const filter = options.filter
      const needle = String(options.query || '').trim().toLowerCase()
      const showHidden = options.showHidden === true
      const showSubagents = options.showSubagents !== false
      const showUnassigned = options.showUnassigned !== false
      const tasks = options.team && Array.isArray(options.team.tasks) ? options.team.tasks : []
      const members = options.team && Array.isArray(options.team.members) ? options.team.members : []
      const runs = Array.isArray(options.runs) ? options.runs : []
      const childRows = options.childRows || {}
      const labels = options.labels || {}
      function memberName(id) {
        for (const member of members) if (member.id === id) return member.name
        for (const child of options.children || []) if (child.id === id) return child.name
        return id
      }
      function allowed(file, turn) {
        if (!kindEnabled(file.kind, settings)) return false
        if (!showHidden && hiddenSet.has(file.path)) return false
        if (filter !== 'all' && file.kind !== filter) return false
        if (needle) {
          const haystack = (file.path + '\n' + (file.name || '') + '\n' + (file.description || '')).toLowerCase()
          if (haystack.indexOf(needle) === -1) return false
        }
        return true
      }
      const parentRows = []
      for (const turn of options.turns || []) {
        for (const file of turn.files) {
          if (allowed(file, turn.turn)) parentRows.push(Object.assign({}, file, { turn: turn.turn, childId: '', childName: '' }))
        }
      }
      const childList = []
      if (showSubagents) {
        for (const childId of Object.keys(childRows)) {
          for (const row of childRows[childId] || []) {
            if (!allowed(row, row.turn)) continue
            childList.push(Object.assign({}, row, { childId: childId, childName: row.childName || memberName(childId) }))
          }
        }
      }
      const groups = []
      const assignedParent = new Set()
      const assignedChild = new Set()
      if (dimension === 'tasks') {
        const childTask = new Map()
        for (const task of tasks) {
          if (!task.ownerId) continue
          const previous = childTask.get(task.ownerId)
          if (!previous || (task.revision || 0) > (previous.revision || 0)) childTask.set(task.ownerId, task)
        }
        for (const task of tasks) {
          const rows = []
          for (const row of parentRows) {
            const matched = taskForPath(row.path, tasks)
            if (matched && matched.id === task.id) {
              rows.push(row)
              assignedParent.add(String(row.turn) + '|' + row.path)
            }
          }
          const childIds = []
          if (showSubagents && task.ownerId && childTask.get(task.ownerId) === task) childIds.push(task.ownerId)
          for (const childId of childIds) {
            for (const row of childList) {
              if (row.childId !== childId) continue
              rows.push(row)
              assignedChild.add(row.childId + '|' + row.turn + '|' + row.path)
            }
          }
          if (rows.length === 0 && childIds.length === 0) continue
          groups.push({
            key: 'task:' + task.id,
            kind: 'task',
            title: task.subject || task.id,
            subtitle: task.description || '',
            status: task.status || '',
            owner: task.ownerId ? memberName(task.ownerId) : '',
            members: task.ownerId ? [memberName(task.ownerId)] : [],
            writeScopes: task.writeScopes || [],
            childIds: childIds,
            rows: dedupeRows(rows),
          })
        }
        if (showUnassigned) {
          const rows = parentRows.filter(function (row) {
            return !taskForPath(row.path, tasks) && !assignedParent.has(String(row.turn) + '|' + row.path)
          })
          for (const row of childList) {
            if (childTask.has(row.childId)) continue
            rows.push(row)
            assignedChild.add(row.childId + '|' + row.turn + '|' + row.path)
          }
          if (rows.length > 0) {
            groups.push({ key: 'unassigned', kind: 'unassigned', title: labels.unassigned || 'Unassigned', subtitle: '', status: '', owner: '', members: [], writeScopes: [], childIds: [], rows: dedupeRows(rows) })
          }
        }
      } else {
        for (const run of runs) {
          const phases = Array.isArray(run.phases) && run.phases.length > 0 ? run.phases : ['default']
          for (const phase of phases) {
            const agents = (run.agents || []).filter(function (agent) { return (agent.phase || 'default') === phase })
            const childIds = []
            for (const agent of agents) if (agent.childId && childIds.indexOf(agent.childId) === -1) childIds.push(agent.childId)
            const rows = []
            for (const row of parentRows) {
              const matched = taskForPath(row.path, tasks)
              if (matched && childIds.indexOf(matched.ownerId) !== -1) {
                rows.push(row)
                assignedParent.add(String(row.turn) + '|' + row.path)
              }
            }
            for (const row of childList) {
              if (childIds.indexOf(row.childId) === -1) continue
              rows.push(row)
              assignedChild.add(row.childId + '|' + row.turn + '|' + row.path)
            }
            if (rows.length === 0 && (!showSubagents || childIds.length === 0)) continue
            groups.push({
              key: 'run:' + run.runId + ':' + phase,
              kind: 'run',
              title: run.name || run.runId,
              subtitle: phase === 'default' ? '' : phase,
              status: run.status || '',
              owner: '',
              members: agents.map(function (agent) { return agent.label || memberName(agent.childId) }),
              writeScopes: [],
              childIds: childIds,
              rows: dedupeRows(rows),
            })
          }
        }
        if (showUnassigned) {
          const rows = parentRows.filter(function (row) { return !assignedParent.has(String(row.turn) + '|' + row.path) })
          for (const row of childList) {
            if (assignedChild.has(row.childId + '|' + row.turn + '|' + row.path)) continue
            rows.push(row)
          }
          if (rows.length > 0) {
            groups.push({ key: 'unassigned', kind: 'unassigned', title: labels.unassigned || 'Unassigned', subtitle: '', status: '', owner: '', members: [], writeScopes: [], childIds: [], rows: dedupeRows(rows) })
          }
        }
      }
      return groups
    }

    function resolveDimension(team, runs, preference) {
      if (preference === 'turns' || preference === 'tasks' || preference === 'runs') return preference
      const tasks = team && Array.isArray(team.tasks) ? team.tasks : []
      if (tasks.length > 0) return 'tasks'
      if (Array.isArray(runs) && runs.length > 0) return 'runs'
      return 'turns'
    }

    // One Markdown manifest for both the plain export and the degraded export
    // that carries per-file download links instead of a session ZIP.
    function manifestText(t, sessionId, turns, options) {
      const opts = options || {}
      const lines = []
      let fileCount = 0
      for (const turn of turns) fileCount += turn.files.length
      lines.push('# ' + t('export.title'))
      lines.push('')
      lines.push('- ' + t('export.session') + ': ' + (sessionId || '—'))
      lines.push('- ' + t('export.time') + ': ' + new Date().toLocaleString())
      lines.push('- ' + t('export.turns') + ': ' + turns.length)
      lines.push('- ' + t('export.files') + ': ' + fileCount)
      if (opts.note) {
        lines.push('')
        lines.push('> ' + opts.note)
      }
      lines.push('')
      for (const turn of turns.slice().reverse()) {
        lines.push('## ' + t('turn.label', { n: turn.turn }) + ' · ' + formatTime(turn.endTime || turn.startTime))
        lines.push('')
        if (turn.reply.trim() !== '') {
          const excerpt = turn.reply.trim().split('\n').slice(0, 3).join('\n> ')
          lines.push('> ' + excerpt)
          lines.push('')
        }
        for (const file of turn.files) {
          const url = opts.links && typeof opts.fileUrl === 'function' ? opts.fileUrl(file.path) : ''
          if (url) lines.push('- [' + t('kind.' + file.kind) + ' · ' + (file.name || basename(file.path)) + '](' + url + ') — `' + file.path + '`' + (file.description ? ' — ' + file.description : ''))
          else lines.push('- [' + t('kind.' + file.kind) + '] `' + file.path + '`' + (file.description ? ' — ' + file.description : ''))
        }
        lines.push('')
      }
      return lines.join('\n')
    }

    // Capability gate for the per-artifact ⋯ menu. Every entry must correspond to
    // a host call this runtime actually exposes, so unavailable actions are
    // absent instead of failing after a click.
    function artifactMenuModel(t, options) {
      const opts = options || {}
      const caps = opts.caps || {}
      const prefs = opts.prefs || null
      const items = []
      // Star/hide only appear when the caller passes the current prefs; the
      // pure model (capability tests) keeps its original order.
      if (prefs) items.push({ id: prefs.starred ? 'unstar' : 'star', label: prefs.starred ? t('action.unstar') : t('action.star') })
      if (caps.workspacePath && caps.desktop && opts.absolutePath) {
        items.push({ id: 'reveal', label: t('action.reveal') })
        items.push({ id: 'open', label: t('action.openDefault') })
      }
      items.push({ id: 'copy', label: t('action.copy') })
      if (opts.download) items.push({ id: 'download', label: t('action.download') })
      if (caps.saveAs && opts.absolutePath) items.push({ id: 'saveAs', label: t('action.saveAs') })
      if (opts.changeIndex >= 0) items.push({ id: 'changes', label: t('action.changes') })
      if (opts.canOpenChild) items.push({ id: 'openChild', label: t('group.openChild') })
      if (prefs) items.push({ id: prefs.hidden ? 'unhide' : 'hide', label: prefs.hidden ? t('action.unhide') : t('action.hide') })
      return items
    }

    // Download and save-as are capability-gated for the same reason; the plain
    // browser download is the fallback when ctx.fileActions is unavailable.
    function exportMenuModel(t, caps) {
      const c = caps || {}
      const items = [{ id: 'manifest', label: t('export.manifest') }]
      if (c.sessionLogDownload) items.push({ id: 'bundle', label: t('export.bundle') })
      else items.push({ id: 'degradedManifest', label: t('export.degradedItem') })
      if (c.markdown === true) items.push({ id: 'copyMarkdown', label: t('export.copyMarkdown') })
      return { items: items, degraded: c.sessionLogDownload !== true }
    }

    function galleryItems(turns) {
      const items = []
      for (const turn of turns || []) {
        for (const file of turn.files || []) {
          if (file.kind !== 'image') continue
          items.push({ file: file, turn: turn.turn })
        }
      }
      return items
    }

    function formatTime(ms) {
      if (!ms) return '—'
      try {
        return new Date(ms).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      } catch (error) {
        return '—'
      }
    }

    function storageKey(sessionId) {
      return STORAGE_PREFIX + String(sessionId || 'none')
    }

    function readPrefs(sessionId) {
      try {
        const raw = window.localStorage.getItem(storageKey(sessionId))
        if (!raw) return { stars: [], hidden: [] }
        const parsed = JSON.parse(raw)
        return {
          stars: Array.isArray(parsed.stars) ? parsed.stars.filter(function (item) { return typeof item === 'string' }) : [],
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(function (item) { return typeof item === 'string' }) : [],
        }
      } catch (error) {
        return { stars: [], hidden: [] }
      }
    }

    function writePrefs(sessionId, prefs) {
      try {
        window.localStorage.setItem(storageKey(sessionId), JSON.stringify(prefs))
      } catch (error) {
        // Private mode or quota failures only lose the manual curation, never the panel.
      }
    }

    function unwrapRemote(value) {
      if (value && typeof value === 'object' && value.ok === false) {
        const error = value.error
        throw error instanceof Error ? error : new Error(error && error.message ? error.message : 'Remote request failed')
      }
      if (value && typeof value === 'object' && value.ok === true && Object.prototype.hasOwnProperty.call(value, 'value')) return value.value
      return value
    }
    //#endregion

    //#region markdown renderer
    // 轻量、零依赖的最终回复 Markdown 渲染器。所有用户可见字符先经
    // escapeHtml 再拼进标签：回复里的原始 HTML 不会进入 DOM，输出里只有
    // 这里生成的标签。围栏代码的正文单独再做一次 escapeHtml（代码块内容
    // 二次转义），链接只允许 http(s)，javascript:/data: 会退化成纯文本。
    // 仅用于「最终回复」正文；diff、工具输出、日志视图保持原文。
    const MD_HEADING_RE = /^ {0,3}(#{1,4})\s+(.*)$/
    const MD_QUOTE_RE = /^ {0,3}>\s?(.*)$/
    const MD_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
    const MD_HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
    const MD_FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^`]*)$/

    function escapeHtml(value) {
      return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    // 只接受绝对 http(s) 地址；空白、控制字符与引号一律拒绝，避免拼进
    // href="..." 时逃出属性。
    function safeMarkdownHref(value) {
      const url = String(value === null || value === undefined ? '' : value).trim()
      if (!/^https?:\/\//i.test(url)) return ''
      if (/[\s\u0000-\u001f\u007f<>"']/.test(url)) return ''
      return url
    }

    // 输入已 escapeHtml；这里只补强调标签，不会重新解释尖括号。行内代码与
    // 链接由 markdownInline 的扫描器先切走，不会被强调规则误伤。
    function markdownEmphasis(escaped) {
      return escaped
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    }

    function markdownInline(raw) {
      const source = String(raw === null || raw === undefined ? '' : raw)
      const patterns = [
        { kind: 'code', re: /`([^`\n]+)`/g },
        // Any markdown link is tokenised, then the target is protocol-checked:
        // unsupported schemes fall back to the plain label, so neither
        // javascript: nor data: text is turned into an anchor.
        { kind: 'link', re: /\[([^\]\n]+)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g },
        { kind: 'url', re: /https?:\/\/[^\s<>"'`]+/g },
      ]
      let html = ''
      let index = 0
      while (index < source.length) {
        let found = null
        for (const pattern of patterns) {
          pattern.re.lastIndex = index
          const match = pattern.re.exec(source)
          if (match && (found === null || match.index < found.match.index)) found = { kind: pattern.kind, match: match }
        }
        if (found === null) {
          html += markdownEmphasis(escapeHtml(source.slice(index)))
          break
        }
        const match = found.match
        if (match.index > index) html += markdownEmphasis(escapeHtml(source.slice(index, match.index)))
        if (found.kind === 'code') {
          // 行内代码内容单独转义，反引号里的 Markdown 不再解析。
          html += '<code class="ap-md-inline">' + escapeHtml(match[1]) + '</code>'
        } else if (found.kind === 'link') {
          const href = safeMarkdownHref(match[2])
          const label = markdownEmphasis(escapeHtml(match[1]))
          html += href
            ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
            : label
        } else {
          // 裸链接常被句号/逗号收尾，标点留在链接外，别拼进 href。
          let urlText = match[0]
          while (urlText.length > 8 && /[.,;:!?，。；：！？、]$/.test(urlText)) urlText = urlText.slice(0, -1)
          const href = safeMarkdownHref(urlText)
          html += href
            ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(href) + '</a>' +
              escapeHtml(match[0].slice(urlText.length))
            : escapeHtml(match[0])
        }
        index = match.index + match[0].length
      }
      return html
    }

    function markdownTableCells(line) {
      let text = String(line).trim()
      if (text.charAt(0) === '|') text = text.slice(1)
      if (text.charAt(text.length - 1) === '|') text = text.slice(0, -1)
      return text.split('|').map(function (cell) { return cell.trim() })
    }

    function markdownTableDelimiter(line) {
      if (!line || line.indexOf('|') === -1) return false
      const cells = markdownTableCells(line)
      return cells.length > 0 && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell) })
    }

    function markdownAlignClass(cell) {
      const left = cell.charAt(0) === ':'
      const right = cell.charAt(cell.length - 1) === ':'
      if (left && right) return ' ap-md-align-center'
      if (right) return ' ap-md-align-right'
      if (left) return ' ap-md-align-left'
      return ''
    }

    // 只处理最简单的管道表格：表头 + 分隔行 + 同列数的数据行。单元内容仍走
    // markdownInline，所以转义与链接规则和正文一致。
    function markdownTable(lines, start) {
      const header = markdownTableCells(lines[start])
      const aligns = markdownTableCells(lines[start + 1])
      let html = '<div class="ap-md-tablewrap"><table class="ap-md-table"><thead><tr>'
      for (let c = 0; c < header.length; c += 1) {
        html += '<th class="ap-md-th' + markdownAlignClass(aligns[c]) + '">' + markdownInline(header[c]) + '</th>'
      }
      html += '</tr></thead><tbody>'
      let index = start + 2
      while (index < lines.length) {
        const row = lines[index]
        if (row.trim() === '' || row.indexOf('|') === -1) break
        const cells = markdownTableCells(row)
        if (cells.length !== header.length) break
        html += '<tr>'
        for (let c = 0; c < header.length; c += 1) {
          html += '<td class="ap-md-td' + markdownAlignClass(aligns[c]) + '">' + markdownInline(cells[c]) + '</td>'
        }
        html += '</tr>'
        index += 1
      }
      html += '</tbody></table></div>'
      return { html: html, next: index }
    }

    function markdownBlocks(lines, depth) {
      const out = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (/^\s*$/.test(line)) { i += 1; continue }

        const fence = MD_FENCE_RE.exec(line)
        if (fence) {
          const marker = fence[1].charAt(0)
          const min = fence[1].length
          const info = fence[2].trim().split(/\s+/)[0]
          const closeRe = new RegExp('^ {0,3}' + (marker === '`' ? '`' : '~') + '{' + min + ',}\\s*$')
          const codeLines = []
          i += 1
          while (i < lines.length && !closeRe.test(lines[i])) {
            codeLines.push(lines[i])
            i += 1
          }
          if (i < lines.length) i += 1
          const lang = info ? '<span class="ap-md-lang">' + escapeHtml(info) + '</span>' : ''
          out.push('<div class="ap-md-codeblock">' + lang + '<pre class="ap-md-pre"><code>' +
            escapeHtml(codeLines.join('\n')) + '</code></pre></div>')
          continue
        }

        const quote = depth < 3 ? MD_QUOTE_RE.exec(line) : null
        if (quote) {
          const inner = []
          while (i < lines.length) {
            const nested = MD_QUOTE_RE.exec(lines[i])
            if (!nested) break
            inner.push(nested[1])
            i += 1
          }
          out.push('<blockquote class="ap-md-quote">' + markdownBlocks(inner, depth + 1) + '</blockquote>')
          continue
        }

        const heading = MD_HEADING_RE.exec(line)
        if (heading) {
          const level = heading[1].length
          const content = heading[2].replace(/\s+#+\s*$/, '')
          out.push('<h' + level + ' class="ap-md-h' + level + '">' + markdownInline(content) + '</h' + level + '>')
          i += 1
          continue
        }

        if (MD_HR_RE.test(line)) {
          out.push('<hr class="ap-md-hr">')
          i += 1
          continue
        }

        if (line.indexOf('|') !== -1 && i + 1 < lines.length && markdownTableDelimiter(lines[i + 1])) {
          const headerCells = markdownTableCells(line)
          const aligns = markdownTableCells(lines[i + 1])
          if (headerCells.length >= 2 && headerCells.length === aligns.length) {
            const table = markdownTable(lines, i)
            out.push(table.html)
            i = table.next
            continue
          }
        }

        const item = MD_ITEM_RE.exec(line)
        if (item) {
          const baseIndent = item[1].length
          const ordered = /\d/.test(item[2])
          const items = []
          while (i < lines.length) {
            const row = MD_ITEM_RE.exec(lines[i])
            if (!row) break
            const indent = row[1].length
            if (indent + 1 < baseIndent) break
            const rowOrdered = /\d/.test(row[2])
            if (indent >= baseIndent + 2) {
              if (items.length > 0) items[items.length - 1].children.push({ text: row[3], ordered: rowOrdered })
              i += 1
              continue
            }
            if (rowOrdered !== ordered) break
            items.push({ text: row[3], children: [] })
            i += 1
          }
          let html = ordered ? '<ol class="ap-md-list">' : '<ul class="ap-md-list">'
          for (const entry of items) {
            let body = markdownInline(entry.text)
            if (entry.children.length > 0) {
              const childOrdered = entry.children[0].ordered
              body += childOrdered ? '<ol class="ap-md-sublist">' : '<ul class="ap-md-sublist">'
              for (const child of entry.children) body += '<li>' + markdownInline(child.text) + '</li>'
              body += childOrdered ? '</ol>' : '</ul>'
            }
            html += '<li>' + body + '</li>'
          }
          html += ordered ? '</ol>' : '</ul>'
          out.push(html)
          continue
        }

        const paragraph = []
        while (i < lines.length && !/^\s*$/.test(lines[i])) {
          const current = lines[i]
          if (MD_FENCE_RE.test(current) || MD_HEADING_RE.test(current) || MD_HR_RE.test(current) || MD_ITEM_RE.test(current)) break
          if (depth < 3 && MD_QUOTE_RE.test(current)) break
          if (current.indexOf('|') !== -1 && i + 1 < lines.length && markdownTableDelimiter(lines[i + 1])) break
          paragraph.push(current)
          i += 1
        }
        if (paragraph.length === 0) { paragraph.push(line); i += 1 }
        // 单个换行保留为 <br>：回复里的分行本来就是作者意图，折叠成空格会
        // 让清单式的短行粘成一段。
        out.push('<p class="ap-md-p">' + paragraph.map(markdownInline).join('<br>') + '</p>')
      }
      return out.join('\n')
    }

    function renderMarkdownHtml(raw) {
      const source = String(raw === null || raw === undefined ? '' : raw).replace(/\r\n?/g, '\n')
      if (source.trim() === '') return ''
      return markdownBlocks(source.split('\n'), 0)
    }
    //#endregion

    //#region cross-session index (v2b)
    function readIndexDirOverride() {
      try {
        const custom = window.localStorage.getItem(INDEX_DIR_KEY)
        return typeof custom === 'string' ? custom.trim() : ''
      } catch (error) {
        return ''
      }
    }

    function writeIndexDirOverride(value) {
      try {
        const text = String(value === undefined || value === null ? '' : value).trim()
        if (text === '') window.localStorage.removeItem(INDEX_DIR_KEY)
        else window.localStorage.setItem(INDEX_DIR_KEY, text)
      } catch (error) {
        // Private mode only loses the manual override; the Host route still works.
      }
    }

    // Empty result = use the Host's same-origin route (the normal path). A
    // non-empty absolute path is an explicit fallback for hosts without the
    // HTTP carrier; it is read through remote.workspaceFiles like before.
    function indexDirectory() {
      const custom = readIndexDirOverride()
      if (isAbsolutePath(custom)) return custom.replace(/[/\\]+$/, '')
      return ''
    }

    function indexFilePath() {
      const directory = indexDirectory()
      return directory === '' ? INDEX_ROUTE_PREFIX + '/index.json' : directory + '/index.json'
    }

    function sessionIndexFilePath(sessionId) {
      const directory = indexDirectory()
      if (directory !== '') return directory + '/sessions/' + String(sessionId) + '.json'
      return INDEX_ROUTE_PREFIX + '/sessions/' + String(sessionId) + '.json'
    }

    function isIndexRouteTarget(target) {
      return String(target || '').indexOf(INDEX_ROUTE_PREFIX + '/') === 0
    }

    // Same-origin fetch of a Host-served index resource. Error codes are typed
    // so classifyIndexError can keep the three user-facing states: missing
    // (404 + marker), denied (401/403) and route-unavailable (network/404).
    function fetchIndexResource(target, signal) {
      if (typeof fetch !== 'function') return Promise.reject(new Error('INDEX_ROUTE_UNAVAILABLE'))
      let request
      try {
        request = fetch(target, { credentials: 'same-origin', cache: 'no-store', signal: signal })
      } catch (error) {
        return Promise.reject(new Error('INDEX_ROUTE_UNAVAILABLE'))
      }
      return Promise.resolve(request).then(function (response) {
        const status = response && typeof response.status === 'number' ? response.status : 0
        const contentType = response && response.headers && typeof response.headers.get === 'function'
          ? String(response.headers.get('content-type') || '')
          : ''
        if (status === 401 || status === 403) throw new Error('INDEX_DENIED')
        if (status === 404) {
          return response.text().then(function (body) {
            throw new Error(String(body || '').indexOf('ARTIFACTS_INDEX_MISSING') !== -1 ? 'INDEX_MISSING' : 'INDEX_ROUTE_UNAVAILABLE')
          })
        }
        if (status < 200 || status >= 300) throw new Error('INDEX_HTTP_' + String(status))
        // A host without the route falls through to the SPA fallback, which
        // answers 200 text/html. Treat anything that is not JSON as unavailable
        // instead of reporting a misleading parse failure.
        if (!/json/i.test(contentType)) throw new Error('INDEX_ROUTE_UNAVAILABLE')
        return response.text().then(function (text) {
          const etag = response.headers && typeof response.headers.get === 'function'
            ? String(response.headers.get('etag') || '')
            : ''
          return { text: text, version: etag.replace(/^"|"$/g, '') }
        })
      }, function (error) {
        if (error && error.name === 'AbortError') throw error
        throw new Error('INDEX_ROUTE_UNAVAILABLE')
      })
    }

    function indexNumber(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    }

    function isMissingIndexError(error) {
      const message = error && error.message ? String(error.message) : String(error)
      return /not-found|no entry|ENOENT|does not exist|not found/i.test(message)
    }

    // Cross-session index failures split into three user-facing cases: the
    // workspace file service is absent (old host / missing injection), the
    // index file does not exist yet (Host fills it on the next start), or the
    // path is present but not readable (permissions). Anything else is a
    // generic read failure. The raw message is only shown in a folded detail.
    function classifyIndexError(error) {
      const message = error && error.message ? String(error.message) : String(error)
      if (/WORKSPACE_FILES_UNAVAILABLE|without inject|remote\.workspaceFiles|workspaceFiles remote is unavailable|INDEX_ROUTE_UNAVAILABLE|INDEX_HTTP_404|Failed to fetch|NetworkError|Load failed|fetch failed|network error/i.test(message)) return 'unavailable'
      if (/INDEX_DENIED|INDEX_HTTP_401|INDEX_HTTP_403|EACCES|EPERM|permission denied|access denied|not permitted|forbidden|operation not permitted/i.test(message)) return 'denied'
      if (/INDEX_MISSING/i.test(message)) return 'missing'
      if (isMissingIndexError(error)) return 'missing'
      return 'error'
    }

    function normalizeIndexPayload(text) {
      let raw
      try {
        raw = JSON.parse(String(text))
      } catch (error) {
        throw new Error('BAD_INDEX')
      }
      if (!raw || raw.v !== 1 || !raw.sessions || typeof raw.sessions !== 'object' || Array.isArray(raw.sessions)) {
        throw new Error('BAD_INDEX')
      }
      const sessions = {}
      for (const sid of Object.keys(raw.sessions)) {
        if (!SESSION_ID_RE.test(sid)) continue
        const meta = raw.sessions[sid]
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue
        sessions[sid] = {
          t: indexNumber(meta.t),
          u: indexNumber(meta.u),
          c: indexNumber(meta.c),
          n: indexNumber(meta.n),
          a: indexNumber(meta.a),
          w: typeof meta.w === 'string' ? meta.w : '',
          p: typeof meta.p === 'string' && SESSION_ID_RE.test(meta.p) ? meta.p : '',
        }
      }
      const totals = raw.totals && typeof raw.totals === 'object' ? {
        sessions: indexNumber(raw.totals.sessions),
        files: indexNumber(raw.totals.files),
        turns: indexNumber(raw.totals.turns),
      } : { sessions: Object.keys(sessions).length, files: 0, turns: 0 }
      const backfill = raw.backfill && typeof raw.backfill === 'object' ? {
        running: raw.backfill.running === true,
        done: indexNumber(raw.backfill.done),
        total: indexNumber(raw.backfill.total),
        finishedAt: indexNumber(raw.backfill.finishedAt),
      } : { running: false, done: 0, total: 0, finishedAt: 0 }
      return {
        v: 1,
        mode: raw.mode === 'projection' ? 'projection' : 'persistent',
        generatedAt: indexNumber(raw.generatedAt),
        totals: totals,
        backfill: backfill,
        sessions: sessions,
      }
    }

    function parseSessionIndexPayload(text, sessionId) {
      let raw
      try {
        raw = JSON.parse(String(text))
      } catch (error) {
        throw new Error('BAD_SESSION_INDEX')
      }
      if (!raw || raw.v !== 1 || raw.sid !== sessionId || !Array.isArray(raw.rows)) throw new Error('BAD_SESSION_INDEX')
      const rows = []
      for (const row of raw.rows) {
        if (!Array.isArray(row) || row.length < 4) continue
        const path = row[0]
        const turn = row[1]
        const source = row[2]
        const kind = row[3]
        if (typeof path !== 'string' || !isAbsolutePath(path)) continue
        if (typeof turn !== 'number' || !Number.isFinite(turn)) continue
        if (source !== 'presented' && source !== 'produced') continue
        if (kind !== 'doc' && kind !== 'image' && kind !== 'file') continue
        rows.push({
          path: path,
          name: basename(path),
          kind: kind,
          source: source,
          turn: turn,
          ...(typeof row[4] === 'number' && Number.isFinite(row[4]) ? { size: row[4] } : {}),
          ...(typeof row[5] === 'string' ? { sha: row[5] } : {}),
        })
      }
      return { rows: rows, version: '' }
    }

    function readIndexStats() {
      try {
        const raw = window.localStorage.getItem(INDEX_STATS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch (error) {
        return null
      }
    }

    function rememberIndexStats(data) {
      try {
        window.localStorage.setItem(INDEX_STATS_KEY, JSON.stringify({
          generatedAt: indexNumber(data.generatedAt),
          mode: data.mode,
          totals: data.totals,
          backfill: data.backfill,
          at: Date.now(),
        }))
      } catch (error) {
        // Stats are cosmetic; quota failures must not break the panel.
      }
    }

    function rowMatches(row, needle, filter, settings, hiddenSet, showHidden) {
      if (!kindEnabled(row.kind, settings)) return false
      if (!showHidden && hiddenSet && hiddenSet.has(row.path)) return false
      if (filter !== 'all' && row.kind !== filter) return false
      if (needle && String(row.path).toLowerCase().indexOf(needle) === -1) return false
      return true
    }

    function buildAllSessionTree(index, options) {
      if (!index || !index.sessions) return { workspaces: [], total: 0 }
      const needle = String(options.query || '').trim().toLowerCase()
      const filter = options.filter || 'all'
      const settings = options.settings
      const hiddenSet = options.hiddenSet || new Set()
      const showHidden = options.showHidden === true
      const includeArchived = options.includeArchived === true
      const includeSubagents = options.includeSubagents !== false
      const cache = options.cache || new Map()
      const isArchived = typeof options.isArchived === 'function' ? options.isArchived : function () { return false }
      const nodes = []
      for (const sid of Object.keys(index.sessions)) {
        const meta = index.sessions[sid]
        if (!meta || meta.c <= 0) continue
        if (!includeSubagents && meta.p) continue
        if (!includeArchived && isArchived(sid)) continue
        const cached = cache.get(sid)
        const rows = cached && Array.isArray(cached.rows) ? cached.rows : null
        let matched = true
        if (needle) {
          matched = rows === null ? true : rows.some(function (row) {
            return rowMatches(row, needle, filter, settings, hiddenSet, showHidden)
          })
        }
        nodes.push({ id: sid, meta: meta, rows: rows, matched: matched, children: [] })
      }
      const byId = new Map()
      for (const node of nodes) byId.set(node.id, node)
      const roots = []
      for (const node of nodes) {
        const parent = node.meta.p ? byId.get(node.meta.p) : undefined
        if (parent) parent.children.push(node)
        else roots.push(node)
      }
      function keep(node) {
        node.children = node.children.filter(keep)
        if (!needle) return true
        return node.matched || node.children.length > 0
      }
      const visibleRoots = roots.filter(keep)
      function sortNodes(list) {
        list.sort(function (left, right) {
          return (right.meta.u || right.meta.a || 0) - (left.meta.u || left.meta.a || 0) || left.id.localeCompare(right.id)
        })
        for (const node of list) sortNodes(node.children)
      }
      sortNodes(visibleRoots)
      const workspaceMap = new Map()
      let total = 0
      for (const node of visibleRoots) {
        const root = node.meta.w || ''
        const key = root || '(unknown)'
        let entry = workspaceMap.get(key)
        if (!entry) {
          entry = { key: key, root: root, title: root ? basename(root) : '', sessions: [], latest: 0, count: 0 }
          workspaceMap.set(key, entry)
        }
        entry.sessions.push(node)
        entry.latest = Math.max(entry.latest, node.meta.u || node.meta.a || 0)
        total += 1
        const stack = [node]
        while (stack.length > 0) {
          const current = stack.pop()
          total += current.children.length
          for (const child of current.children) stack.push(child)
        }
      }
      const workspaces = Array.from(workspaceMap.values()).sort(function (left, right) { return right.latest - left.latest })
      for (const workspace of workspaces) {
        const stack = workspace.sessions.slice()
        let count = 0
        while (stack.length > 0) {
          const node = stack.pop()
          count += 1
          for (const child of node.children) stack.push(child)
        }
        workspace.count = count
      }
      return { workspaces: workspaces, total: total }
    }
    //#endregion

    //#region settings store
    const SETTINGS_KEY = 'dsh-artifacts-panel.settings.v1'
    // v2 flips hideTurnsWithoutArtifacts to false. Legacy payloads (no
    // settingsVersion) carried `true` only because it used to be the built-in
    // default, so they migrate to the new default instead of inheriting it.
    const SETTINGS_VERSION = 2
    const FONT_CHOICES = [13, 15, 17, 19]
    const FONT_PRESETS = [1, 1.25, 1.5, 1.75, 2, 2.5]
    const MIN_FONT_SCALE = 0.8
    const MAX_FONT_SCALE = 2.5
    const DENSITY_CHOICES = ['compact', 'standard', 'relaxed']
    const PAGE_CHOICES = [10, 20, 50, 'all']
    const DIMENSION_CHOICES = ['auto', 'turns', 'tasks', 'runs']
    const IMAGE_VIEW_CHOICES = ['list', 'gallery']
    const THEME_MODES = ['inherit', 'dark', 'light']
    const ACCENT_CHOICES = ['default', 'blue', 'amber', 'green', 'purple', 'rose']
    const DEFAULT_SETTINGS = Object.freeze({
      settingsVersion: SETTINGS_VERSION,
      fontScale: 1.5,
      density: 'standard',
      themeMode: 'inherit',
      accentColor: 'default',
      showReplies: true,
      showDocs: true,
      showImages: true,
      showFiles: true,
      hideTurnsWithoutArtifacts: false,
      hideShortReplies: true,
      shortReplyThreshold: 30,
      ignoreKeywords: '总线无新消息,已处理到',
      pageSize: 20,
      defaultDimension: 'auto',
      showSubagents: true,
      showUnassigned: true,
      crossSessionIndex: true,
      imageView: 'list',
      showFloatingBar: true,
      autoOpenSidebar: false,
      // Additive since v2: older payloads have no key and keep the default
      // (on) without a version bump, so an existing config is never reset.
      renderMarkdown: true,
    })
    const BOOLEAN_SETTINGS = ['showReplies', 'showDocs', 'showImages', 'showFiles', 'hideTurnsWithoutArtifacts', 'hideShortReplies', 'showSubagents', 'showUnassigned', 'crossSessionIndex', 'showFloatingBar', 'autoOpenSidebar', 'renderMarkdown']
    let settingsState = readSettings()
    const settingsListeners = new Set()

    function normalizeSettings(raw) {
      const next = Object.assign({}, DEFAULT_SETTINGS)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next
      const legacy = raw.settingsVersion !== SETTINGS_VERSION
      next.settingsVersion = SETTINGS_VERSION
      if (raw.fontScale !== undefined) {
        next.fontScale = normalizeFontScale(raw.fontScale)
      } else if (typeof raw.fontSize === 'number') {
        const legacyScale = { 13: 1, 15: 1.5, 17: 1.75, 19: 2 }
        if (legacyScale[raw.fontSize] !== undefined) next.fontScale = legacyScale[raw.fontSize]
      }
      if (DENSITY_CHOICES.indexOf(raw.density) !== -1) next.density = raw.density
      for (const key of BOOLEAN_SETTINGS) {
        if (typeof raw[key] === 'boolean') next[key] = raw[key]
      }
      if (legacy) next.hideTurnsWithoutArtifacts = false
      if (typeof raw.shortReplyThreshold === 'number' && Number.isFinite(raw.shortReplyThreshold)) {
        next.shortReplyThreshold = Math.max(0, Math.min(200, Math.round(raw.shortReplyThreshold)))
      }
      if (typeof raw.ignoreKeywords === 'string') next.ignoreKeywords = raw.ignoreKeywords
      if (PAGE_CHOICES.indexOf(raw.pageSize) !== -1) next.pageSize = raw.pageSize
      if (DIMENSION_CHOICES.indexOf(raw.defaultDimension) !== -1) next.defaultDimension = raw.defaultDimension
      if (IMAGE_VIEW_CHOICES.indexOf(raw.imageView) !== -1) next.imageView = raw.imageView
      // Additive fields since v2: payloads written before the color theme
      // existed simply keep the defaults (inherit host colors, host accent).
      // No version bump is needed because absent values already mean "inherit".
      if (THEME_MODES.indexOf(raw.themeMode) !== -1) next.themeMode = raw.themeMode
      if (ACCENT_CHOICES.indexOf(raw.accentColor) !== -1) next.accentColor = raw.accentColor
      return next
    }

    function normalizeFontScale(value) {
      const next = Number(value)
      if (!Number.isFinite(next)) return DEFAULT_SETTINGS.fontScale
      return Math.round(Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, next)) * 100) / 100
    }

    function formatScale(value) {
      const text = String(value)
      return text.indexOf('.') === -1 ? text + '.0×' : text + '×'
    }

    function hostFontPixels() {
      try {
        if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
          const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
          if (Number.isFinite(px) && px > 0) return px
        }
      } catch (error) {
        // Fall through to the conventional root size.
      }
      return 16
    }

    function useHostFontPixels() {
      const [px, setPx] = React.useState(hostFontPixels)
      React.useEffect(function () {
        function update() { setPx(hostFontPixels()) }
        update()
        window.addEventListener('resize', update)
        const timer = window.setInterval(update, 1000)
        return function () {
          window.removeEventListener('resize', update)
          window.clearInterval(timer)
        }
      }, [])
      return px
    }

    function readSettings() {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (!raw) return Object.assign({}, DEFAULT_SETTINGS)
        return normalizeSettings(JSON.parse(raw))
      } catch (error) {
        return Object.assign({}, DEFAULT_SETTINGS)
      }
    }

    function persistSettings(next) {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch (error) {
        // Private mode or quota failures keep the in-memory setting for this page.
      }
    }

    function emitSettings() {
      for (const listener of Array.from(settingsListeners)) {
        try { listener() } catch (error) { /* one subscriber must not break the others */ }
      }
    }

    function getSettings() {
      return settingsState
    }

    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return function () { settingsListeners.delete(listener) }
    }

    function setSettings(patch) {
      settingsState = normalizeSettings(Object.assign({}, settingsState, patch))
      persistSettings(settingsState)
      emitSettings()
      return settingsState
    }

    function resetSettings() {
      settingsState = normalizeSettings({})
      persistSettings(settingsState)
      emitSettings()
      return settingsState
    }

    function useSettings() {
      const [value, setValue] = React.useState(getSettings)
      React.useEffect(function () {
        return subscribeSettings(function () { setValue(getSettings()) })
      }, [])
      return value
    }

    // Subscribe a component to any DSH snapshot store (ctx.uiWorkspace.selection
    // and similar). Missing stores degrade to the fallback value.
    function useStoreSnapshot(store, fallback) {
      const [value, setValue] = React.useState(function () {
        try {
          return store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : fallback
        } catch (error) {
          return fallback
        }
      })
      React.useEffect(function () {
        if (!store || typeof store.subscribe !== 'function' || typeof store.getSnapshot !== 'function') return undefined
        let active = true
        function sync() {
          if (!active) return
          try { setValue(store.getSnapshot()) } catch (error) { /* a store that rejects a read keeps the last value */ }
        }
        sync()
        return store.subscribe(sync)
      }, [store])
      return value
    }

    function parseKeywords(value) {
      return String(value || '')
        .split(/[,，\n]/)
        .map(function (item) { return item.trim().toLowerCase() })
        .filter(function (item) { return item !== '' })
    }

    function kindEnabled(kind, settings) {
      if (kind === 'doc') return settings.showDocs
      if (kind === 'image') return settings.showImages
      return settings.showFiles
    }

    // Pure turn selection, shared by the live view and tools/render-harness.cjs.
    // Files are only collected from three sources (deliverables/presented,
    // successful write/edit meta.path and workspace/changes), so a turn may
    // legitimately have a final reply and no file. Those turns stay visible by
    // default and only disappear when hideTurnsWithoutArtifacts is turned on.
    function selectVisibleTurns(turns, options) {
      const opts = options || {}
      const merged = Object.assign({}, DEFAULT_SETTINGS)
      if (opts.settings && typeof opts.settings === 'object') Object.assign(merged, opts.settings)
      const filter = typeof opts.filter === 'string' && opts.filter !== '' ? opts.filter : 'all'
      const needle = String(opts.query || '').trim().toLowerCase()
      const showHidden = opts.showHidden === true
      const showAllTurns = opts.showAllTurns === true
      const hiddenSet = opts.hiddenSet instanceof Set ? opts.hiddenSet : new Set()
      const keywordList = Array.isArray(opts.keywordList) ? opts.keywordList : parseKeywords(merged.ignoreKeywords)
      const result = []
      for (const turn of Array.isArray(turns) ? turns : []) {
        const replyText = turn.reply || ''
        const hasArtifact = turn.files.some(function (file) { return kindEnabled(file.kind, merged) })
        if (!showAllTurns) {
          if (merged.hideTurnsWithoutArtifacts && !hasArtifact) continue
          if (merged.hideShortReplies && !hasArtifact && replyText.trim().length < merged.shortReplyThreshold) continue
          if (keywordList.length > 0 && replyText) {
            const lower = replyText.toLowerCase()
            let hit = false
            for (const keyword of keywordList) {
              if (lower.indexOf(keyword) !== -1) { hit = true; break }
            }
            if (hit) continue
          }
        }
        const files = turn.files.filter(function (file) {
          if (!kindEnabled(file.kind, merged)) return false
          if (!showHidden && hiddenSet.has(file.path)) return false
          if (filter !== 'all' && file.kind !== filter) return false
          if (needle) {
            const haystack = (file.path + '\n' + file.name + '\n' + (file.description || '')).toLowerCase()
            if (haystack.indexOf(needle) === -1) return false
          }
          return true
        })
        const showReply = merged.showReplies && replyText.trim() !== ''
        const replyMatches = needle === '' || replyText.toLowerCase().indexOf(needle) !== -1
        if (files.length > 0 || (filter === 'all' && showReply && replyMatches)) {
          result.push({
            turn: turn.turn,
            startTime: turn.startTime,
            endTime: turn.endTime,
            reason: turn.reason,
            reply: showReply ? turn.reply : '',
            files: files,
            changes: Array.isArray(turn.changes) ? turn.changes : [],
            // "no file artifact" is a property of the turn, not of the current
            // kind/search filter, so the badge never lies after filtering.
            noArtifacts: turn.files.length === 0,
          })
        }
      }
      result.reverse()
      return result
    }

    function densityVariables(density) {
      if (density === 'compact') return { '--ap-line': '1.45', '--ap-turn-pad': '.85em', '--ap-reply-pad': '.65em', '--ap-card-pad': '.45em', '--ap-gap': '.4em' }
      if (density === 'relaxed') return { '--ap-line': '1.85', '--ap-turn-pad': '1.8em', '--ap-reply-pad': '1.1em', '--ap-card-pad': '.85em', '--ap-gap': '.75em' }
      return { '--ap-line': '1.65', '--ap-turn-pad': '1.2em', '--ap-reply-pad': '.85em', '--ap-card-pad': '.6em', '--ap-gap': '.55em' }
    }

    // Two neutral palettes for the forced modes. Body text pairs were checked
    // for WCAG AA (>= 4.5:1): dark text #e7eaf0 on #1a1d24 ≈ 14.0:1, muted
    // #a9b2c0 ≈ 7.9:1, subtle #8f98a7 ≈ 5.8:1; light text #1b2130 on #ffffff
    // ≈ 16.1:1, muted #495264 ≈ 7.9:1, subtle #5f6878 ≈ 5.6:1. State colors
    // are re-mapped too so status chips stay readable on the forced surface.
    const THEME_TOKENS = Object.freeze({
      dark: Object.freeze({
        bg: '#14161b', surface: '#1a1d24', surface2: '#20242d', surface3: '#282d38',
        overlay: '#20242d', skeleton: '#262b35',
        border: '#323844', borderStrong: '#414959',
        text: '#e7eaf0', muted: '#a9b2c0', subtle: '#8f98a7',
        hover: 'rgba(255,255,255,.08)', link: '#86b9ff',
        danger: '#ff9090', dangerBorder: '#7d3b3b', warn: '#f0c674',
        success: '#7fd7a6', info: '#8fc5ff',
        toastBg: '#282d38', toastFg: '#f2f4f8',
      }),
      light: Object.freeze({
        bg: '#f6f7f9', surface: '#ffffff', surface2: '#eef1f5', surface3: '#e3e7ee',
        overlay: '#ffffff', skeleton: '#e8ebf0',
        border: '#d7dbe3', borderStrong: '#c1c7d3',
        text: '#1b2130', muted: '#495264', subtle: '#5f6878',
        hover: 'rgba(20,30,50,.07)', link: '#1f5fbf',
        danger: '#b42318', dangerBorder: '#e2a29c', warn: '#8a5a00',
        success: '#177a42', info: '#1f5fbf',
        toastBg: '#2a2f3a', toastFg: '#f5f6f8',
      }),
    })

    // Accent pairs per mode: `accent` is always readable as text on that
    // mode's surface (dark variants are light pastels, light variants are deep
    // tones), `fg` is the readable foreground on a filled accent button.
    const ACCENT_PRESETS = Object.freeze({
      blue: Object.freeze({ dark: Object.freeze({ accent: '#8ab8ff', fg: '#0f1724' }), light: Object.freeze({ accent: '#1f5fbf', fg: '#ffffff' }) }),
      amber: Object.freeze({ dark: Object.freeze({ accent: '#f2c14e', fg: '#1c1503' }), light: Object.freeze({ accent: '#8a5a00', fg: '#ffffff' }) }),
      green: Object.freeze({ dark: Object.freeze({ accent: '#76d69d', fg: '#08170f' }), light: Object.freeze({ accent: '#1a7f45', fg: '#ffffff' }) }),
      purple: Object.freeze({ dark: Object.freeze({ accent: '#b9a2ff', fg: '#120d24' }), light: Object.freeze({ accent: '#6b46c1', fg: '#ffffff' }) }),
      rose: Object.freeze({ dark: Object.freeze({ accent: '#ff9db5', fg: '#220a11' }), light: Object.freeze({ accent: '#b4234b', fg: '#ffffff' }) }),
    })

    // Best-effort read of the host surface so "inherit accent" picks the dark
    // or light accent variant. Falls back to prefers-color-scheme, then dark,
    // which is the DSH default.
    function cssColorLuminance(value) {
      const text = String(value || '').trim().toLowerCase()
      let r, g, b
      const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
      if (hex) {
        const raw = hex[1].length === 3 ? hex[1].split('').map(function (ch) { return ch + ch }).join('') : hex[1]
        r = parseInt(raw.slice(0, 2), 16); g = parseInt(raw.slice(2, 4), 16); b = parseInt(raw.slice(4, 6), 16)
      } else {
        const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s\/]+([\d.]+))?/)
        if (!rgb) return null
        // A fully transparent surface says nothing about the theme.
        if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null
        r = Number(rgb[1]); g = Number(rgb[2]); b = Number(rgb[3])
      }
      if (![r, g, b].every(function (n) { return Number.isFinite(n) })) return null
      function channel(n) {
        const v = Math.max(0, Math.min(255, n)) / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    function hostThemeMode() {
      try {
        if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
          const probe = getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-bg-base')
          const fromToken = cssColorLuminance(probe)
          if (fromToken !== null) return fromToken > 0.45 ? 'light' : 'dark'
          if (document.body) {
            const fromBody = cssColorLuminance(getComputedStyle(document.body).backgroundColor)
            if (fromBody !== null) return fromBody > 0.45 ? 'light' : 'dark'
          }
        }
      } catch (error) { /* fall through to the media query */ }
      try {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          const media = window.matchMedia('(prefers-color-scheme: light)')
          if (media && media.matches === true) return 'light'
        }
      } catch (error) { /* fall through to the default */ }
      return 'dark'
    }

    function resolvedThemeMode(settings) {
      const mode = settings && settings.themeMode
      if (mode === 'dark' || mode === 'light') return mode
      return hostThemeMode()
    }

    // Root-container variables. "inherit" leaves the neutral palette unset so
    // every var() falls back to the host aliases; "dark"/"light" pin both the
    // plugin's --ap-* palette and the host alias names still used by semantic
    // chips, toasts and switches.
    function themeVariables(settings) {
      const state = settings || {}
      const mode = state.themeMode === 'dark' || state.themeMode === 'light' ? state.themeMode : 'inherit'
      const vars = {}
      if (mode !== 'inherit') {
        const tokens = THEME_TOKENS[mode]
        vars['--ap-bg'] = tokens.bg
        vars['--ap-surface'] = tokens.surface
        vars['--ap-surface-2'] = tokens.surface2
        vars['--ap-surface-3'] = tokens.surface3
        vars['--ap-overlay'] = tokens.overlay
        vars['--ap-skeleton'] = tokens.skeleton
        vars['--ap-border'] = tokens.border
        vars['--ap-border-strong'] = tokens.borderStrong
        vars['--ap-text'] = tokens.text
        vars['--ap-muted'] = tokens.muted
        vars['--ap-subtle'] = tokens.subtle
        vars['--ap-hover'] = tokens.hover
        vars['--ap-link'] = tokens.link
        vars['--dsw-alias-state-error-primary'] = tokens.danger
        vars['--dsw-alias-state-error-secondary'] = tokens.dangerBorder
        vars['--dsw-alias-state-warn-primary'] = tokens.warn
        vars['--dsw-alias-state-success-primary'] = tokens.success
        vars['--dsw-alias-state-business-primary'] = tokens.info
        vars['--dsw-alias-toast-bg'] = tokens.toastBg
        vars['--dsw-alias-toast-label'] = tokens.toastFg
        vars['--dsw-alias-switch-thumb'] = tokens.text
        // Match native scrollbars, range tracks and form controls to the mode.
        vars.colorScheme = mode
      }
      if (mode === 'inherit') {
        // The host aliases are not guaranteed to pass WCAG AA for tertiary
        // text. In inherit mode only these two text vars are pinned (to the
        // palette matching the detected host surface); layout/accent stay host.
        const hostTokens = THEME_TOKENS[hostThemeMode()]
        vars['--ap-subtle'] = hostTokens.subtle
        vars['--ap-muted'] = hostTokens.muted
      }
      const accentId = ACCENT_CHOICES.indexOf(state.accentColor) !== -1 ? state.accentColor : 'default'
      if (accentId !== 'default') {
        // "inherit" has no declared mode, so pick the variant matching the
        // host surface. Accent overrides are independent of the neutral mode.
        const accentMode = mode === 'inherit' ? hostThemeMode() : mode
        const preset = ACCENT_PRESETS[accentId][accentMode]
        vars['--ap-accent'] = preset.accent
        vars['--ap-accent-fg'] = preset.fg
      }
      return vars
    }

    function accentSwatchColor(settings, id) {
      if (id === 'default') return 'var(--dsw-alias-brand-primary, #4d6bfe)'
      const preset = ACCENT_PRESETS[id]
      if (!preset) return 'var(--dsw-alias-brand-primary, #4d6bfe)'
      return preset[resolvedThemeMode(settings)].accent
    }
    //#endregion

    //#region icons
    function svg(size, children, extra) {
      return h('svg', Object.assign({
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
      }, extra || {}), children)
    }
    function iconSearch(size) { return svg(size, [h('circle', { key: 'c', cx: 11, cy: 11, r: 6.5 }), h('path', { key: 'l', d: 'M16 16l4 4' })]) }
    function iconRefresh(size, spinning) { return svg(size, [h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.34-5.66' }), h('path', { key: 'b', d: 'M20 4v5h-5' })], spinning ? { className: 'ap-spin' } : undefined) }
    function iconDownload(size) { return svg(size, [h('path', { key: 'a', d: 'M12 4v10' }), h('path', { key: 'b', d: 'M8 10l4 4 4-4' }), h('path', { key: 'c', d: 'M5 20h14' })]) }
    function iconCopy(size) { return svg(size, [h('rect', { key: 'r', x: 9, y: 9, width: 11, height: 11, rx: 2 }), h('path', { key: 'p', d: 'M15 5H6a1 1 0 0 0-1 1v9' })]) }
    function iconStar(size) { return svg(size, [h('path', { key: 's', d: 'M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z' })]) }
    function iconStarFilled(size) { return svg(size, [h('path', { key: 's', d: 'M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z', fill: 'currentColor' })], { stroke: 'currentColor' }) }
    function iconEye(size) { return svg(size, [h('path', { key: 'a', d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }), h('circle', { key: 'c', cx: 12, cy: 12, r: 2.6 })]) }
    function iconEyeOff(size) { return svg(size, [h('path', { key: 'a', d: 'M3 3l18 18' }), h('path', { key: 'b', d: 'M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.7' }), h('path', { key: 'c', d: 'M6.6 6.7A16.8 16.8 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 3.2-.5' })]) }
    function iconDoc(size) { return svg(size, [h('path', { key: 'a', d: 'M6.5 3.5h7l4 4v13h-11z' }), h('path', { key: 'b', d: 'M13.5 3.5v4h4' }), h('path', { key: 'c', d: 'M9 12h6M9 15.5h6' })]) }
    function iconImage(size) { return svg(size, [h('rect', { key: 'r', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }), h('circle', { key: 'c', cx: 9, cy: 10, r: 1.6 }), h('path', { key: 'p', d: 'M4.5 17l4.5-4.5 3 3 2.5-2.5 5 5' })]) }
    function iconFile(size) { return svg(size, [h('path', { key: 'a', d: 'M6.5 3.5h7l4 4v13h-11z' }), h('path', { key: 'b', d: 'M13.5 3.5v4h4' })]) }
    function iconFolder(size) { return svg(size, [h('path', { key: 'a', d: 'M3.5 6.5h6l2 2h9v10h-17z' }), h('path', { key: 'b', d: 'M3.5 8.5v-4h14v4' })]) }
    function iconPin(size) { return svg(size, [h('path', { key: 'a', d: 'M9 4h6l-1 5 3 3H7l3-3z' }), h('path', { key: 'b', d: 'M12 12v8' })]) }
    function kindIcon(kind) { return kind === 'image' ? iconImage(16) : (kind === 'doc' ? iconDoc(16) : iconFile(16)) }
    function menuIcon(id) {
      if (id === 'reveal') return iconFolder(14)
      if (id === 'open') return iconExternal(14)
      if (id === 'copy') return iconCopy(14)
      if (id === 'download' || id === 'saveAs') return iconDownload(14)
      if (id === 'changes') return iconDiff(14)
      if (id === 'star') return iconStar(14)
      if (id === 'unstar') return iconStarFilled(14)
      if (id === 'hide') return iconEyeOff(14)
      if (id === 'unhide') return iconEye(14)
      if (id === 'openChild') return iconExternal(14)
      return iconFile(14)
    }
    function iconSidebar(size) {
      return svg(size, [
        h('rect', { key: 'r', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }),
        h('path', { key: 'l', d: 'M15 4.5v15' }),
      ])
    }
    function iconMore(size) {
      return svg(size, [
        h('circle', { key: 'a', cx: 5, cy: 12, r: 1.4 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 1.4 }),
        h('circle', { key: 'c', cx: 19, cy: 12, r: 1.4 }),
      ], { fill: 'currentColor', stroke: 'none' })
    }
    function iconExpand(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5' }),
      ])
    }
    function iconSplit(size) {
      return svg(size, [
        h('rect', { key: 'r', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }),
        h('path', { key: 'l', d: 'M14 4.5v15' }),
      ])
    }
    function iconChevron(size) {
      return svg(size, [h('path', { key: 'p', d: 'M9 5l7 7-7 7' })])
    }
    function iconChevronLeft(size) {
      return svg(size, [h('path', { key: 'p', d: 'M15 5l-7 7 7 7' })])
    }
    function iconClose(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M6 6l12 12' }),
        h('path', { key: 'b', d: 'M18 6L6 18' }),
      ])
    }
    function iconGallery(size) {
      return svg(size, [
        h('rect', { key: 'a', x: 3.5, y: 4.5, width: 7, height: 7, rx: 1.4 }),
        h('rect', { key: 'b', x: 13.5, y: 4.5, width: 7, height: 7, rx: 1.4 }),
        h('rect', { key: 'c', x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.4 }),
        h('rect', { key: 'd', x: 13.5, y: 13.5, width: 7, height: 7, rx: 1.4 }),
      ])
    }
    function iconDiff(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M8 4v16' }),
        h('path', { key: 'b', d: 'M4 8h8' }),
        h('path', { key: 'c', d: 'M16 16h5' }),
        h('path', { key: 'd', d: 'M16 8h5M16 12h5' }),
      ])
    }
    function iconExternal(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M14 4h6v6' }),
        h('path', { key: 'b', d: 'M20 4l-9 9' }),
        h('path', { key: 'c', d: 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5' }),
      ])
    }
    function iconSettings(size) {
      return svg(size, [
        h('circle', { key: 'c', cx: 12, cy: 12, r: 3.1 }),
        h('path', { key: 'g', d: 'M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06-2.37 2.37-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20h-3.34v-.04a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06-2.37-2.37.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4v-3.34h.04a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.37-2.37.06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1.03-1.56V4h3.34v.04a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.37 2.37-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.03H20v3.34h-.04a1.7 1.7 0 0 0-1.56 1.03z' }),
      ])
    }

    function iconWarning(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M12 3.8 21 20H3z' }),
        h('path', { key: 'b', d: 'M12 9.5v4.6' }),
        h('circle', { key: 'c', cx: 12, cy: 17.2, r: .9, fill: 'currentColor', stroke: 'none' }),
      ])
    }

    function iconFilter(size) {
      return svg(size, [h('path', { key: 'a', d: 'M3.5 6h17M6.5 12h11M10 18h4' })])
    }
    //#endregion

    //#region styles
    const CSS = [
      '.ap-page{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--ap-bg, var(--dsw-alias-bg-base));color:var(--ap-text, var(--dsw-alias-label-primary));font-family:inherit;font-size:1em;line-height:var(--ap-line,1.7);-webkit-font-smoothing:antialiased}',
      '.ap-page *,.ap-settings *{box-sizing:border-box}',
      '.ap-page svg{flex:none}',
      '.ap-btn svg,.ap-seg-btn svg,.ap-search-icon svg{width:1em;height:1em}',
      '.ap-iconbtn svg{width:1.1em;height:1.1em}',
      '.ap-card-icon svg{width:1.1em;height:1.1em}',
      '.ap-state-icon svg{width:1.2em;height:1.2em}',
      '.ap-pinned-title svg{width:.9em;height:.9em}',
      '.ap-head{flex:none;padding:1.1em 1.75em .75em;border-bottom:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-bg, var(--dsw-alias-bg-base))}',
      '.ap-head-inner,.ap-content{max-width:1040px;margin:0 auto}',
      '.ap-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:1em;flex-wrap:wrap}',
      '.ap-title{margin:0;font-size:1.35em;font-weight:650;letter-spacing:.01em;line-height:1.25;overflow-wrap:anywhere}',
      '.ap-sub{margin-top:.2em;font-size:max(11px,.85em);color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-stats{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.ap-toolbar{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;margin-top:.9em}',
      '.ap-seg{display:inline-flex;flex-wrap:wrap;max-width:100%;padding:.15em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.6em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1))}',
      '.ap-seg-btn{appearance:none;border:none;background:transparent;color:var(--ap-muted, var(--dsw-alias-label-secondary));font:inherit;font-size:.9em;line-height:1.1;min-height:2em;padding:.35em .7em;border-radius:.45em;cursor:pointer;display:inline-flex;align-items:center;gap:.45em;transition:background .12s ease,color .12s ease}',
      '.ap-seg-btn:hover{color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-seg-btn[data-active="true"]{background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));color:var(--ap-text, var(--dsw-alias-label-primary));box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      '.ap-seg-count{font-size:max(11px,.8em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
      '.ap-seg-btn[data-active="true"] .ap-seg-count{color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-search{position:relative;flex:1 1 13em;min-width:10em;max-width:19em}',
      '.ap-search input{width:100%;height:2.35em;padding:0 .7em 0 2.1em;border-radius:.5em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:.9em;outline:none;transition:border-color .12s ease}',
      '.ap-search input:focus{border-color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-search input::placeholder{color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-search-icon{position:absolute;left:.7em;top:50%;transform:translateY(-50%);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));pointer-events:none;display:flex}',
      '.ap-btn{appearance:none;display:inline-flex;align-items:center;gap:.4em;height:2.35em;padding:0 .75em;border-radius:.5em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:.9em;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease}',
      '.ap-btn:hover:not(:disabled){background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-btn:disabled{opacity:.5;cursor:default}',
      '.ap-btn:focus-visible,.ap-seg-btn:focus-visible,.ap-card:focus-visible,.ap-iconbtn:focus-visible,.ap-linkbtn:focus-visible,.ap-settings-switch:focus-visible,.ap-settings-segbtn:focus-visible,.ap-settings-preset:focus-visible{outline:2px solid var(--ap-accent, var(--dsw-alias-brand-primary));outline-offset:2px}',
      '.ap-btn[data-active="true"]{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-body{flex:1;min-height:0;overflow:auto;padding:.4em 1.75em 4.5em;scrollbar-gutter:stable}',
      '.ap-pinned{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border-radius:.75em;padding:.8em 1em .9em;margin:1em 0 .4em}',
      '.ap-pinned-title{display:flex;align-items:center;gap:.45em;font-size:max(11px,.85em);font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--ap-muted, var(--dsw-alias-label-secondary));margin-bottom:.6em}',
      '.ap-turn{border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding:var(--ap-turn-pad,1.2em) 0 .65em}',
      '.ap-pinned + .ap-turn{border-top:none;padding-top:.75em}',
      '.ap-turn-head{display:flex;align-items:center;gap:.6em;flex-wrap:wrap;margin-bottom:.6em}',
      '.ap-turn-no{font-size:1em;font-weight:650;overflow-wrap:anywhere}',
      '.ap-turn-time{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
      '.ap-turn-meta{font-size:max(11px,.82em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:999px;padding:.08em .55em;line-height:1.5}',
      '.ap-turn-meta-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-secondary)}',
      '.ap-turn-changes{display:inline-flex;align-items:center;gap:.3em;font-size:max(11px,.82em);padding:.1em .4em}',
      '.ap-group{border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding:var(--ap-turn-pad,1.2em) 0 .35em}',
      '.ap-group:first-of-type{border-top:none;padding-top:.35em}',
      '.ap-pinned + .ap-group{border-top:none;padding-top:.75em}',
      '.ap-group-head{display:flex;align-items:center;gap:.55em;width:100%;min-width:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:0 0 .45em;cursor:pointer}',
      '.ap-group-head:hover .ap-group-title{color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-group-head:focus-visible{outline:2px solid var(--ap-accent, var(--dsw-alias-brand-primary));outline-offset:2px;border-radius:.35em}',
      '.ap-group-chevron{display:flex;flex:none;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));transition:transform .12s ease}',
      '.ap-group-chevron[data-open="true"]{transform:rotate(90deg)}',
      '.ap-group-titles{display:flex;flex-direction:column;gap:.08em;flex:1 1 12em;min-width:0}',
      '.ap-group-title{font-size:1em;font-weight:650;line-height:1.4;overflow-wrap:anywhere}',
      '.ap-group-sub{font-size:max(11px,.82em);line-height:1.5;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38em}',
      '.ap-group-chips{display:flex;align-items:center;justify-content:flex-end;gap:.35em;flex-wrap:wrap;font-size:max(11px,.82em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));flex:none;max-width:52%}',
      '.ap-chip-status[data-status="running"],.ap-chip-status[data-status="in_progress"],.ap-chip-status[data-status="active"]{color:var(--dsw-alias-state-business-primary);border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-chip-status[data-status="failed"],.ap-chip-status[data-status="aborted"],.ap-chip-status[data-status="blocked"],.ap-chip-status[data-status="error"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-secondary)}',
      '.ap-chip-status[data-status="completed"],.ap-chip-status[data-status="done"],.ap-chip-status[data-status="ended"]{color:var(--dsw-alias-state-success-primary,var(--ap-muted, var(--dsw-alias-label-secondary)))}',
      '.ap-chip-sub{color:var(--ap-accent, var(--dsw-alias-brand-primary));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-group-scope{max-width:15em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ap-group-body{padding:.15em 0 .35em}',
      '.ap-group-load{height:2em;font-size:max(11px,.85em);margin:.1em 0 .55em}',
      '.ap-group-loading,.ap-group-note{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.35em 0}',
      '.ap-group-unassigned .ap-group-title{color:var(--ap-muted, var(--dsw-alias-label-secondary));font-weight:600}',
      '.ap-page-sidebar .ap-group{padding-top:1em}',
      '.ap-page-sidebar .ap-group-sub{display:none}',
      '.ap-page-sidebar .ap-group-chips{max-width:60%}',
      '.ap-page-sidebar .ap-group-title{font-size:.95em}',
      '.ap-page-sidebar .ap-group-head{padding-bottom:.35em}',
      '.ap-page-sidebar .ap-group-body{padding-top:0}',
      '.ap-reply{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border-radius:.75em;padding:var(--ap-reply-pad,.85em) 1em;margin-bottom:var(--ap-gap,.55em)}',
      '.ap-reply-head{display:flex;align-items:center;justify-content:space-between;gap:.5em;flex-wrap:wrap;margin-bottom:.35em}',
      '.ap-reply-label{font-size:max(11px,.8em);font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-reply-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:1em;line-height:var(--ap-line,1.7);color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-reply-text[data-clamped="true"]{max-height:14em;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent)}',
      // Markdown 正文按块排版，关掉纯文本的 pre-wrap；纯文本模式仍保留原样。
      '.ap-reply-text.ap-md{white-space:normal}',
      '.ap-md > :first-child{margin-top:0}',
      '.ap-md > :last-child{margin-bottom:0}',
      '.ap-md .ap-md-p{margin:0 0 .55em}',
      '.ap-md .ap-md-h1,.ap-md .ap-md-h2,.ap-md .ap-md-h3,.ap-md .ap-md-h4{margin:.9em 0 .4em;line-height:1.35;font-weight:700;color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-md .ap-md-h1{font-size:1.3em}',
      '.ap-md .ap-md-h2{font-size:1.18em}',
      '.ap-md .ap-md-h3{font-size:1.08em}',
      '.ap-md .ap-md-h4{font-size:1em}',
      '.ap-md .ap-md-list,.ap-md .ap-md-sublist{margin:.2em 0 .6em;padding-left:1.45em}',
      '.ap-md .ap-md-list:last-child,.ap-md .ap-md-sublist:last-child{margin-bottom:.1em}',
      '.ap-md li{margin:.18em 0}',
      '.ap-md .ap-md-list li::marker,.ap-md .ap-md-sublist li::marker{color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-md .ap-md-inline{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:max(11px,.88em);padding:.1em .32em;border-radius:.3em;background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));border:1px solid var(--ap-border, var(--dsw-alias-border-l1));white-space:pre-wrap}',
      '.ap-md .ap-md-codeblock{position:relative;margin:.55em 0;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.5em;background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));overflow:hidden}',
      '.ap-md .ap-md-lang{position:absolute;top:.35em;right:.55em;font-size:max(11px,.72em);line-height:1.4;letter-spacing:.04em;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));pointer-events:none;text-transform:lowercase}',
      '.ap-md .ap-md-pre{margin:0;padding:.7em .85em;overflow:auto}',
      '.ap-md .ap-md-pre code{display:block;background:transparent;border:none;padding:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:max(12px,.86em);line-height:1.55;white-space:pre;color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-md .ap-md-quote{margin:.5em 0;padding:.15em 0 .15em .8em;border-left:3px solid var(--ap-border-strong, var(--dsw-alias-border-l2));color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-md a{color:var(--ap-link, var(--dsw-alias-link));text-decoration:underline;text-underline-offset:2px}',
      '.ap-md a:hover{text-decoration-thickness:2px}',
      '.ap-md .ap-md-hr{border:none;border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));margin:.85em 0}',
      '.ap-md del{color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-md .ap-md-tablewrap{max-width:100%;overflow-x:auto;margin:.55em 0}',
      '.ap-md .ap-md-table{border-collapse:collapse;width:100%;font-size:.94em;line-height:1.5}',
      '.ap-md .ap-md-th,.ap-md .ap-md-td{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding:.32em .55em;text-align:left;vertical-align:top}',
      '.ap-md .ap-md-th{background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));font-weight:650}',
      '.ap-md .ap-md-align-center{text-align:center}',
      '.ap-md .ap-md-align-right{text-align:right}',
      '.ap-linkbtn{appearance:none;border:none;background:transparent;color:var(--ap-link, var(--dsw-alias-link));font:inherit;font-size:max(11px,.85em);padding:.1em .3em;border-radius:.3em;cursor:pointer}',
      '.ap-linkbtn:hover{text-decoration:underline}',
      '.ap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(17em,1fr));gap:var(--ap-gap,.55em)}',
      '.ap-card{position:relative;display:flex;align-items:flex-start;gap:.65em;min-width:0;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border-radius:.65em;padding:var(--ap-card-pad,.6em) .75em;transition:border-color .12s ease,background .12s ease}',
      '.ap-card-hit{position:absolute;inset:0;z-index:0;width:100%;border:none;border-radius:inherit;background:transparent;padding:0;cursor:pointer}',
      '.ap-card-hit:focus-visible{outline:2px solid var(--ap-accent, var(--dsw-alias-brand-primary));outline-offset:-2px}',
      '.ap-card:hover{border-color:var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2))}',
      '.ap-card[data-hidden="true"]{opacity:.72;filter:grayscale(.35)}',
      '.ap-card-icon{position:relative;z-index:1;flex:none;width:2.2em;height:2.2em;border-radius:.5em;display:flex;align-items:center;justify-content:center;background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));color:var(--ap-muted, var(--dsw-alias-label-secondary));pointer-events:none}',
      '.ap-card-main{position:relative;z-index:1;flex:1;min-width:0;padding-right:.15em;pointer-events:none}',
      '.ap-card-name{font-size:.95em;font-weight:550;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-card-path{appearance:none;display:block;max-width:100%;border:none;background:transparent;padding:0;text-align:left;font:inherit;font-size:max(11px,.85em);line-height:1.4;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.05em;pointer-events:auto;cursor:copy}',
      '.ap-card-path:hover{color:var(--ap-accent, var(--dsw-alias-brand-primary));text-decoration:underline}',
      '.ap-card-desc{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-card-meta{display:flex;align-items:center;gap:.4em;flex-wrap:wrap;margin-top:.25em;font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
      '.ap-chip{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:999px;padding:0 .45em;line-height:1.55}',
      '.ap-chip-accent{color:var(--dsw-alias-state-business-primary);border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-turn-no-artifacts{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));background:var(--ap-surface, var(--dsw-alias-bg-layer-1))}',
      '.ap-card-actions{position:absolute;right:.3em;top:.3em;z-index:2;display:flex;align-items:center;gap:.05em;padding:.05em .05em .05em .65em;border-radius:.5em;background:linear-gradient(90deg,transparent,var(--ap-surface-2, var(--dsw-alias-bg-layer-2)) 32%);opacity:.4;transition:opacity .12s ease}',
      '.ap-card:hover .ap-card-actions,.ap-card:focus-within .ap-card-actions{opacity:1}',
      '.ap-card-actions .ap-iconbtn{opacity:1}',
      '.ap-iconbtn{appearance:none;border:none;background:transparent;color:var(--ap-muted, var(--dsw-alias-label-secondary));width:1.7em;height:1.7em;border-radius:.4em;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}',
      '.ap-iconbtn:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover));color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-iconbtn[data-on="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.ap-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5.5em 1.5em;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-state-icon{width:3em;height:3em;border-radius:.8em;display:flex;align-items:center;justify-content:center;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border:1px solid var(--ap-border, var(--dsw-alias-border-l1));color:var(--ap-subtle, var(--dsw-alias-label-tertiary));margin-bottom:.9em}',
      '.ap-state-title{font-size:1.05em;font-weight:600;color:var(--ap-text, var(--dsw-alias-label-primary));margin-bottom:.35em}',
      '.ap-state-body{font-size:.9em;max-width:30em;line-height:1.65}',
      '.ap-state-actions{margin-top:.9em;display:flex;gap:.5em;flex-wrap:wrap;justify-content:center}',
      '.ap-error{border:1px solid var(--dsw-alias-state-error-secondary);background:var(--ap-surface, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary);border-radius:.65em;padding:.65em .85em;font-size:.9em;margin:.9em 0 .15em;display:flex;align-items:center;gap:.6em;justify-content:space-between;flex-wrap:wrap}',
      '.ap-error span{overflow-wrap:anywhere}',
      '.ap-skel{height:.8em;border-radius:.4em;background:var(--ap-skeleton, var(--dsw-alias-bg-skeleton));animation:ap-pulse 1.2s ease-in-out infinite}',
      '.ap-skel-card{height:5em;border-radius:.65em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border:1px solid var(--ap-border, var(--dsw-alias-border-l1))}',
      '.ap-skel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(17em,1fr));gap:var(--ap-gap,.55em);margin-top:.8em}',
      '.ap-skel-lines{display:flex;flex-direction:column;gap:.5em;margin-top:1.4em}',
      '.ap-loadmore{display:flex;justify-content:center;align-items:center;padding:1.4em .5em .4em}',
      '.ap-loadmore-done{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-toast{position:absolute;left:50%;bottom:1.6em;transform:translateX(-50%);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);font-size:.9em;padding:.55em .95em;border-radius:.5em;box-shadow:0 6px 22px rgba(0,0,0,.18);z-index:20;max-width:calc(100% - 2em);overflow-wrap:anywhere}',
      '.ap-spin{animation:ap-spin .9s linear infinite;transform-origin:12px 12px}',
      '@keyframes ap-spin{to{transform:rotate(360deg)}}',
      '@keyframes ap-pulse{0%,100%{opacity:.45}50%{opacity:.9}}',
      '@media (hover:none){.ap-card-actions{opacity:1;position:static;background:none;padding:0}.ap-card{flex-wrap:wrap}.ap-card-main{flex-basis:calc(100% - 3.2em)}}',
      '@media (max-width:720px){.ap-card-actions .ap-card-star{display:none}.ap-card-actions{opacity:1}}',
      '@media (max-width:720px){.ap-head{padding:.9em 1em .65em}.ap-body{padding:.25em 1em 4em}.ap-sub{display:none}.ap-search{max-width:none}}',
      '.ap-page-sidebar .ap-head{padding:.65em .7em .45em}',
      '.ap-page-sidebar .ap-title{font-size:1em}',
      '.ap-page-sidebar .ap-stats{white-space:normal}',
      '.ap-page-sidebar .ap-toolbar{gap:.35em;margin-top:.55em}',
      '.ap-page-sidebar .ap-search{flex:1 1 100%;min-width:0;max-width:none}',
      '.ap-page-sidebar .ap-btn{padding:0 .5em}',
      '.ap-page-sidebar .ap-seg{max-width:100%}',
      '.ap-page-sidebar .ap-body{padding:.1em .7em 2.5em}',
      '.ap-page-sidebar .ap-grid{grid-template-columns:1fr}',
      // Wide right-pane layouts, chosen from the measured container width
      // (never window.innerWidth): two artifact columns from 480px, and the
      // reply beside its assets from 720px.
      '.ap-turn-body{min-width:0}',
      '.ap-page-sidebar.ap-layout-two-column .ap-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.ap-page-sidebar.ap-layout-split .ap-turn-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:var(--ap-gap,.55em);align-items:start}',
      '.ap-page-sidebar.ap-layout-split .ap-turn-body > .ap-reply{margin-bottom:0}',
      '.ap-page-sidebar.ap-layout-split .ap-turn-body-files{grid-template-columns:minmax(0,1fr)}',
      '.ap-page-sidebar.ap-layout-split .ap-grid{grid-template-columns:1fr}',
      '.ap-page-sidebar .ap-turn{padding-top:1em}',
      '.ap-page-sidebar .ap-reply{padding:.65em .8em}',
      '.ap-page-sidebar .ap-pinned{margin-top:.7em;padding:.65em .8em}',
      '.ap-page-sidebar .ap-state{padding:3em 1em}',
      '.ap-page-sidebar .ap-toast{max-width:calc(100% - 1.4em);white-space:normal}',
      '.ap-title-actions{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;justify-content:flex-end}',
      '.ap-tabmenu{position:relative;z-index:32}',
      '.ap-tabmenu-panel{position:absolute;right:0;top:calc(100% + .35em);min-width:13em;max-width:min(20em,calc(100vw - 3em));max-height:70vh;overflow:auto;background:var(--ap-overlay, var(--dsw-alias-bg-overlay));border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.5em;padding:.3em;box-shadow:0 8px 28px rgba(0,0,0,.2);z-index:32}',
      '.ap-tabmenu-item{display:flex;align-items:center;gap:.55em;width:100%;border:none;background:transparent;color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:.9em;text-align:left;padding:.5em .6em;border-radius:.35em;cursor:pointer;white-space:normal}',
      '.ap-tabmenu-item:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-menu-backdrop{position:fixed;inset:0;z-index:31}',
      '.ap-all{display:flex;flex-direction:column;gap:.8em;min-height:0}',
      '.ap-all-bar{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-all-progress{font-variant-numeric:tabular-nums;color:var(--dsw-alias-state-business-primary);border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:999px;padding:.1em .6em;line-height:1.6}',
      '.ap-all-degraded{color:var(--dsw-alias-state-warn-primary);border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:999px;padding:.1em .6em;line-height:1.6}',
      '.ap-all-body{display:grid;grid-template-columns:minmax(16em,22em) minmax(0,1fr);gap:1em;align-items:start;min-height:0}',
      '.ap-all-tree{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.75em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));padding:.45em;max-height:calc(100vh - 17em);overflow:auto;min-width:0}',
      '.ap-ws + .ap-ws{margin-top:.35em;border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding-top:.35em}',
      '.ap-ws-head{display:flex;align-items:center;gap:.45em;width:100%;border:none;background:transparent;color:inherit;font:inherit;font-size:.9em;text-align:left;padding:.3em .35em;border-radius:.4em;cursor:pointer;min-width:0}',
      '.ap-ws-head:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-ws-chevron{display:flex;flex:none;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));transition:transform .12s ease}',
      '.ap-ws-chevron[data-open="true"]{transform:rotate(90deg)}',
      '.ap-ws-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:.05em}',
      '.ap-ws-title{font-weight:600;overflow-wrap:anywhere;line-height:1.4}',
      '.ap-ws-sub{font-size:max(11px,.8em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-ws-count{font-size:max(11px,.8em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums;flex:none}',
      '.ap-ws-body{padding:.15em 0 .3em}',
      '.ap-sess{display:flex;align-items:flex-start;gap:.35em;width:100%;border:none;background:transparent;color:inherit;font:inherit;font-size:.88em;text-align:left;padding:.3em .4em;border-radius:.45em;cursor:pointer;min-width:0}',
      '.ap-sess:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-sess[data-active="true"]{background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));box-shadow:inset 2px 0 0 var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-sess[data-child="true"]{margin-left:1.1em;width:calc(100% - 1.1em)}',
      '.ap-sess-chevron{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:none;width:1.3em;height:1.3em;margin-top:.1em;padding:0;border:none;border-radius:.3em;background:transparent;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));cursor:pointer;transition:transform .12s ease,background .12s ease}',
      '.ap-sess-chevron:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-sess-chevron[data-open="true"]{transform:rotate(90deg)}',
      '.ap-sess-chevron[data-leaf="true"]{visibility:hidden}',
      '.ap-sess-main{appearance:none;border:none;background:transparent;color:inherit;font:inherit;font-size:max(11px,.88em);text-align:left;padding:0;cursor:pointer;flex:1;min-width:0;display:flex;flex-direction:column;gap:.1em}',
      '.ap-sess-title{font-weight:550;line-height:1.4;overflow-wrap:anywhere}',
      '.ap-sess-meta{display:flex;align-items:center;gap:.3em;flex-wrap:wrap;font-size:max(11px,.8em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
      '.ap-sess-badge{font-size:max(11px,.72em);border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:999px;padding:0 .4em;line-height:1.6;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-sess-badge-current{color:var(--ap-accent, var(--dsw-alias-brand-primary));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-sess-badge-sub{color:var(--dsw-alias-state-business-primary);border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-sess-badge-archived{color:var(--dsw-alias-state-warn-primary)}',
      '.ap-all-panel{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.75em;padding:.85em 1em 1.1em;min-width:0;min-height:12em}',
      '.ap-all-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6em;flex-wrap:wrap;margin-bottom:.65em}',
      '.ap-all-panel-title{font-size:1.02em;font-weight:650;line-height:1.4;overflow-wrap:anywhere}',
      '.ap-all-panel-sub{font-size:max(11px,.82em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));overflow-wrap:anywhere;line-height:1.55;margin-top:.1em}',
      '.ap-all-panel-actions{display:flex;align-items:center;gap:.4em;flex-wrap:wrap;justify-content:flex-end}',
      '.ap-all-note{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));line-height:1.6;padding:.5em 0}',
      '.ap-all-empty{padding:2.2em 1em;text-align:center;color:var(--ap-muted, var(--dsw-alias-label-secondary));font-size:.9em}',
      '.ap-page-sidebar .ap-all-body{grid-template-columns:1fr;gap:.7em}',
      '.ap-page-sidebar .ap-all-tree{max-height:15em}',
      '.ap-page-sidebar .ap-all-panel{padding:.65em .7em .9em}',
      '@media (max-width:900px){.ap-all-body{grid-template-columns:1fr}.ap-all-tree{max-height:15em}}',
      '.ap-settings{max-width:760px;display:flex;flex-direction:column;gap:1.1em;color:var(--ap-text, var(--dsw-alias-label-primary));font-size:1em;line-height:1.55}',
      '.ap-settings-title{margin:0;font-size:1.15em;font-weight:600;line-height:1.45}',
      '.ap-settings-intro{margin:0;font-size:max(11px,.85em);line-height:1.65;color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-settings-group{display:flex;flex-direction:column;gap:.9em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.75em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));padding:1em 1.1em}',
      '.ap-settings-group-title{font-size:1em;font-weight:600;line-height:1.4}',
      '.ap-settings-group-help{font-size:max(11px,.82em);line-height:1.6;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));margin-top:-.25em}',
      '.ap-settings-row{display:flex;align-items:flex-start;justify-content:space-between;gap:1.1em;flex-wrap:wrap}',
      '.ap-settings-row + .ap-settings-row{border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding-top:.9em}',
      '.ap-settings-main{min-width:0;display:flex;flex-direction:column;gap:.2em;flex:1 1 16em}',
      '.ap-settings-label{font-size:1em;line-height:1.5;font-weight:500}',
      '.ap-settings-help{font-size:max(11px,.82em);line-height:1.6;color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-settings-control{flex:none;display:flex;align-items:center;gap:.5em;flex-wrap:wrap;justify-content:flex-end;max-width:100%}',
      '.ap-settings-seg{display:inline-flex;flex-wrap:wrap;max-width:100%;padding:.15em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.55em;background:var(--ap-bg, var(--dsw-alias-bg-base))}',
      '.ap-settings-segbtn{appearance:none;border:none;background:transparent;color:var(--ap-muted, var(--dsw-alias-label-secondary));font:inherit;font-size:.9em;min-height:2em;padding:.35em .8em;border-radius:.45em;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease}',
      '.ap-settings-segbtn:hover{color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-settings-segbtn[data-active="true"]{background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));color:var(--ap-text, var(--dsw-alias-label-primary));box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      '.ap-settings-input{height:2.2em;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.5em;background:var(--ap-bg, var(--dsw-alias-bg-base));color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:.9em;padding:0 .65em;outline:none}',
      '.ap-settings-input:focus{border-color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-settings-input[type=number]{width:5.5em}',
      '.ap-settings-input-wide{width:17em;max-width:100%}',
      '.ap-settings-unit{font-size:max(11px,.82em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-settings-scale-control{display:flex;flex-direction:column;gap:.35em;align-items:flex-end;max-width:100%}',
      '.ap-settings-scale{display:flex;align-items:center;gap:.75em;flex-wrap:wrap;justify-content:flex-end;max-width:100%}',
      '.ap-settings-scale input[type=range]{width:14em;max-width:100%;accent-color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-settings-scale-value{font-variant-numeric:tabular-nums;font-size:1em;font-weight:600;min-width:2.6em;text-align:right}',
      '.ap-settings-presets{display:flex;gap:.4em;flex-wrap:wrap;margin-top:.45em;justify-content:flex-end}',
      '.ap-settings-preset{appearance:none;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:var(--ap-bg, var(--dsw-alias-bg-base));color:var(--ap-muted, var(--dsw-alias-label-secondary));font:inherit;font-size:max(11px,.85em);min-height:1.95em;padding:.25em .6em;border-radius:.45em;cursor:pointer;white-space:nowrap}',
      '.ap-settings-preset:hover{color:var(--ap-text, var(--dsw-alias-label-primary));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-settings-preset[data-active="true"]{background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));color:var(--ap-text, var(--dsw-alias-label-primary));border-color:var(--ap-border-strong, var(--dsw-alias-border-l2))}',
      '.ap-settings-actual{font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));margin-top:.35em}',
      '.ap-settings-preview{border:1px dashed var(--ap-border, var(--dsw-alias-border-l1));border-radius:.5em;background:var(--ap-bg, var(--dsw-alias-bg-base));color:var(--ap-muted, var(--dsw-alias-label-secondary));padding:.65em .8em;line-height:1.6;overflow-wrap:anywhere}',
      '.ap-settings-forced{padding:1.1em 1.2em;border-radius:.9em;background:var(--ap-bg, var(--dsw-alias-bg-base));color:var(--ap-text, var(--dsw-alias-label-primary));box-shadow:inset 0 0 0 1px var(--ap-border, var(--dsw-alias-border-l1))}',
      '.ap-theme-swatches{display:flex;align-items:center;gap:.5em;flex-wrap:wrap}',
      '.ap-theme-swatch{appearance:none;position:relative;width:1.55em;height:1.55em;padding:0;border-radius:999px;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-swatch, var(--dsw-alias-brand-primary));cursor:pointer;transition:transform .12s ease}',
      '.ap-theme-swatch:hover{transform:scale(1.08)}',
      '.ap-theme-swatch[data-active="true"]{box-shadow:0 0 0 2px var(--ap-text, var(--dsw-alias-label-primary)),inset 0 0 0 2px var(--ap-surface, var(--dsw-alias-bg-layer-1))}',
      '.ap-theme-swatch:focus-visible{outline:2px solid var(--ap-accent, var(--dsw-alias-brand-primary));outline-offset:2px}',
      '.ap-theme-preview{border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.6em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));color:var(--ap-text, var(--dsw-alias-label-primary));padding:.75em .9em;display:flex;flex-direction:column;gap:.4em}',
      '.ap-theme-preview-title{font-weight:650;font-size:.98em;line-height:1.4}',
      '.ap-theme-preview-body{font-size:.88em;line-height:1.6;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-theme-preview-actions{display:flex;align-items:center;gap:.55em;flex-wrap:wrap;margin-top:.15em}',
      '.ap-theme-preview-btn{display:inline-flex;align-items:center;border:1px solid var(--ap-accent, var(--dsw-alias-brand-primary));background:var(--ap-accent, var(--dsw-alias-brand-primary));color:var(--ap-accent-fg, #fff);font:inherit;font-size:max(11px,.85em);line-height:1;padding:.5em .85em;border-radius:.45em}',
      '.ap-theme-preview-chip{font-size:max(11px,.8em);line-height:1.6;color:var(--ap-accent, var(--dsw-alias-brand-primary));border:1px solid var(--ap-accent, var(--dsw-alias-brand-primary));border-radius:999px;padding:0 .6em}',
      '.ap-settings-switch{appearance:none;position:relative;width:2.75em;height:1.5em;border-radius:999px;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));cursor:pointer;transition:background .15s ease,border-color .15s ease;flex:none;padding:0}',
      '.ap-settings-switch span{position:absolute;top:.125em;left:.125em;width:1.125em;height:1.125em;border-radius:50%;background:var(--dsw-alias-switch-thumb);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s ease}',
      '.ap-settings-switch[data-on="true"]{background:var(--ap-accent, var(--dsw-alias-brand-primary));border-color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-settings-switch[data-on="true"] span{transform:translateX(1.25em)}',
      '.ap-settings-foot{display:flex;justify-content:space-between;align-items:center;gap:.75em;flex-wrap:wrap;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));font-size:max(11px,.82em);line-height:1.6}',
      // batch 2: per-artifact menu, gallery/lightbox, export menu, floating bar
      '.ap-card-menu{position:absolute;right:.3em;top:calc(100% - .15em);z-index:34;min-width:12.5em;max-width:min(20em,calc(100vw - 2em));background:var(--ap-overlay, var(--dsw-alias-bg-overlay));border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.5em;padding:.25em;box-shadow:0 8px 28px rgba(0,0,0,.22)}',
      '.ap-card-menu-item,.ap-menu-item{display:flex;align-items:center;gap:.5em;width:100%;border:none;background:transparent;color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:.9em;text-align:left;padding:.45em .55em;border-radius:.35em;cursor:pointer;white-space:nowrap}',
      '.ap-card-menu-item:hover,.ap-menu-item:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-menu-backdrop-card{position:fixed;inset:0;z-index:33}',
      '.ap-menu-note{font-size:max(11px,.78em);line-height:1.5;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.4em .55em .3em;border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));margin-top:.2em;white-space:normal}',
      '.ap-menu-note[data-warn="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.ap-exportmenu{position:relative;z-index:35}',
      '.ap-exportmenu-panel{position:absolute;right:0;top:calc(100% + .35em);min-width:16em;max-width:min(23em,calc(100vw - 2em));background:var(--ap-overlay, var(--dsw-alias-bg-overlay));border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.5em;padding:.3em;box-shadow:0 8px 28px rgba(0,0,0,.2);z-index:35}',
      '.ap-gallery{display:flex;flex-direction:column;gap:.7em}',
      '.ap-gallery-head{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;font-size:max(11px,.85em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary))}',
      '.ap-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.5em,1fr));gap:.55em}',
      '.ap-thumb{position:relative;display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;border:1px solid var(--ap-border, var(--dsw-alias-border-l1));border-radius:.6em;background:var(--ap-surface, var(--dsw-alias-bg-layer-1));overflow:hidden;cursor:pointer;padding:0}',
      '.ap-thumb:hover{border-color:var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2))}',
      '.ap-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
      '.ap-thumb-name{position:absolute;left:0;right:0;bottom:0;padding:.3em .45em;font-size:max(11px,.72em);line-height:1.4;color:var(--ap-text, var(--dsw-alias-label-primary));background:linear-gradient(180deg,transparent,var(--ap-surface-2, var(--dsw-alias-bg-layer-2)) 45%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-thumb-failed{display:flex;flex-direction:column;align-items:center;gap:.35em;padding:.6em;font-size:max(11px,.75em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));text-align:center;overflow-wrap:anywhere}',
      '.ap-lightbox{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--ap-mask, var(--dsw-alias-bg-mask, rgba(0,0,0,.62)));padding:2.5em 3.5em}',
      '.ap-lightbox-figure{margin:0;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;gap:.6em;min-height:0}',
      '.ap-lightbox img{max-width:100%;max-height:calc(100vh - 8em);object-fit:contain;border-radius:.5em;background:var(--ap-bg, var(--dsw-alias-bg-base))}',
      '.ap-lightbox-caption{font-size:max(11px,.85em);line-height:1.5;color:var(--ap-muted, var(--dsw-alias-label-secondary));max-width:60em;text-align:center;overflow-wrap:anywhere}',
      '.ap-lightbox-btn{position:absolute;appearance:none;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-overlay, var(--dsw-alias-bg-overlay));color:var(--ap-text, var(--dsw-alias-label-primary));width:2.6em;height:2.6em;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:81}',
      '.ap-lightbox-btn:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-lightbox-close{top:1em;right:1em}',
      '.ap-lightbox-prev{left:1em;top:50%;transform:translateY(-50%)}',
      '.ap-lightbox-next{right:1em;top:50%;transform:translateY(-50%)}',
      '.ap-lightbox-btn:disabled{opacity:.35;cursor:default}',
      '.ap-settings *:focus-visible,.ap-page *:focus-visible{outline:2px solid var(--ap-accent, var(--dsw-alias-brand-primary));outline-offset:2px}',
      '.ap-toolbar-zone{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;min-width:0}',
      '.ap-toolbar-actions{margin-left:auto;justify-content:flex-end}',
      '.ap-filter-wrap{position:relative;display:flex}',
      '.ap-page-sidebar .ap-filter-wrap{width:100%}',
      '.ap-page-sidebar .ap-pop{left:0;right:0;min-width:0;max-width:none}',
      '.ap-pop{position:absolute;top:calc(100% + .35em);right:0;z-index:36;min-width:16.5em;max-width:min(23em,calc(100vw - 2em));display:flex;flex-direction:column;gap:.1em;background:var(--ap-overlay, var(--dsw-alias-bg-overlay));border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.55em;padding:.4em;box-shadow:0 6px 20px rgba(0,0,0,.22)}',
      '.ap-pop-head{font-size:max(11px,.8em);font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.35em .5em .2em}',
      '.ap-pop-sub{font-size:max(11px,.82em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.1em .5em .2em}',
      '.ap-pop-row{appearance:none;display:flex;align-items:center;justify-content:space-between;gap:.6em;width:100%;border:none;background:transparent;color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:max(11px,.9em);text-align:left;padding:.45em .5em;border-radius:.35em;cursor:pointer}',
      '.ap-pop-row:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-pop-row[aria-pressed="true"]{color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-pop-check{width:1.1em;display:inline-flex;justify-content:center;color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-pop-divider{height:1px;background:var(--ap-border, var(--dsw-alias-border-l1));margin:.3em .15em}',
      '.ap-pop-note{font-size:max(11px,.78em);line-height:1.55;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.35em .5em .1em;white-space:normal}',
      '.ap-pop-seg{display:flex;gap:.3em;flex-wrap:wrap;padding:.1em .5em .35em}',
      '.ap-moremenu{position:relative}',
      '.ap-moremenu-panel{position:absolute;right:0;top:calc(100% + .35em);z-index:36;min-width:15.5em;max-width:min(22em,calc(100vw - 2em));background:var(--ap-overlay, var(--dsw-alias-bg-overlay));border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.5em;padding:.3em;box-shadow:0 8px 28px rgba(0,0,0,.22)}',
      '.ap-moremenu-label{font-size:max(11px,.78em);letter-spacing:.05em;text-transform:uppercase;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));padding:.4em .55em .15em}',
      '.ap-drawer-backdrop{position:fixed;inset:0;z-index:90;display:flex;justify-content:flex-end;background:var(--ap-mask, var(--dsw-alias-bg-mask, rgba(0,0,0,.45)))}',
      '.ap-drawer{width:min(380px,92vw);height:100%;display:flex;flex-direction:column;min-height:0;background:var(--ap-bg, var(--dsw-alias-bg-base));border-left:1px solid var(--ap-border, var(--dsw-alias-border-l1));box-shadow:-12px 0 36px rgba(0,0,0,.28);outline:none}',
      '.ap-drawer-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:.6em;padding:.85em 1em;border-bottom:1px solid var(--ap-border, var(--dsw-alias-border-l1))}',
      '.ap-drawer-title{font-size:1.05em;font-weight:650;line-height:1.4}',
      '.ap-drawer-body{flex:1;min-height:0;overflow:auto;padding:1em 1.05em 3em}',
      '.ap-drawer .ap-settings{max-width:none}',
      '.ap-onboard{display:flex;align-items:flex-start;gap:.7em;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));background:var(--ap-surface, var(--dsw-alias-bg-layer-1));border-radius:.7em;padding:.75em .9em;margin:.9em 0 .2em}',
      '.ap-onboard-icon{flex:none;width:2.2em;height:2.2em;border-radius:.55em;display:flex;align-items:center;justify-content:center;background:var(--ap-surface-3, var(--dsw-alias-bg-layer-3));color:var(--ap-accent, var(--dsw-alias-brand-primary))}',
      '.ap-onboard-main{flex:1;min-width:0}',
      '.ap-onboard-title{font-weight:650;line-height:1.4}',
      '.ap-onboard-body{font-size:max(11px,.85em);line-height:1.6;color:var(--ap-muted, var(--dsw-alias-label-secondary));margin-top:.15em;max-width:52em}',
      '.ap-onboard-actions{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;margin-top:.5em}',
      '.ap-empty-sample{border:1px dashed var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:.5em;padding:.55em .75em;margin-top:.8em;text-align:left;max-width:32em;font-size:max(11px,.85em);line-height:1.7;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-empty-sample-title{font-weight:650;color:var(--ap-text, var(--dsw-alias-label-primary));margin-bottom:.2em}',
      '.ap-filter-chips{display:flex;align-items:center;justify-content:center;gap:.4em;flex-wrap:wrap;margin-top:.7em;max-width:36em}',
      '.ap-filter-chip{display:inline-flex;align-items:center;gap:.25em;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:999px;padding:.1em .25em .1em .6em;font-size:max(11px,.82em);line-height:1.6;color:var(--ap-text, var(--dsw-alias-label-primary));background:var(--ap-surface, var(--dsw-alias-bg-layer-1))}',
      '.ap-chip-remove{appearance:none;border:none;background:transparent;color:var(--ap-muted, var(--dsw-alias-label-secondary));width:1.4em;height:1.4em;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.ap-chip-remove:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover));color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-state-details{margin-top:.7em;font-size:max(11px,.78em);color:var(--ap-subtle, var(--dsw-alias-label-tertiary));max-width:34em;text-align:left}',
      '.ap-state-details summary{cursor:pointer;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-state-code{display:block;margin-top:.35em;padding:.45em .6em;border-radius:.4em;background:var(--ap-surface-2, var(--dsw-alias-bg-layer-2));border:1px solid var(--ap-border, var(--dsw-alias-border-l1));white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.ap-state-copied{margin-top:.5em;font-size:max(11px,.82em);color:var(--dsw-alias-state-success-primary)}',
      '.ap-settings-subtitle{font-size:1em;font-weight:600;line-height:1.4;border-top:1px solid var(--ap-border, var(--dsw-alias-border-l1));padding-top:.9em;margin-top:.2em}',
      '@media (prefers-reduced-motion: reduce){.ap-page *,.ap-settings *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}.ap-spin,.ap-skel{animation:none!important}}',
    ].join('\n')
    // The floating bar renders in `shell.overlay`, outside the panel's own
    // <style>, so its rules travel with the component.
    const DOCK_CSS = [
      '.ap-dock{position:fixed;right:18px;bottom:18px;z-index:70;display:flex;align-items:center;border:1px solid var(--ap-border-strong, var(--dsw-alias-border-l2));border-radius:999px;background:var(--ap-overlay, var(--dsw-alias-bg-overlay));box-shadow:0 8px 26px rgba(0,0,0,.2);overflow:hidden;pointer-events:auto}',
      '.ap-dock-main{appearance:none;border:none;background:transparent;color:var(--ap-text, var(--dsw-alias-label-primary));font:inherit;font-size:max(11px,.85em);display:flex;align-items:center;gap:.4em;padding:.5em .7em .5em .8em;cursor:pointer;white-space:nowrap}',
      '.ap-dock-main:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover))}',
      '.ap-dock-main svg{width:1em;height:1em;color:var(--ap-muted, var(--dsw-alias-label-secondary))}',
      '.ap-dock-close{appearance:none;border:none;border-left:1px solid var(--ap-border, var(--dsw-alias-border-l1));background:transparent;color:var(--ap-subtle, var(--dsw-alias-label-tertiary));display:flex;align-items:center;justify-content:center;padding:.45em .5em;cursor:pointer}',
      '.ap-dock-close:hover{background:var(--ap-hover, var(--dsw-alias-interactive-bg-hover));color:var(--ap-text, var(--dsw-alias-label-primary))}',
      '.ap-dock-close svg{width:.85em;height:.85em}',
      '@media (max-width:720px){.ap-dock{bottom:76px;right:12px}}',
    ].join('\n')
    //#endregion


    //#region ui primitives (UI P0)
    const ONBOARDING_KEY = 'dsh-artifacts-panel.onboarded.v1'
    const onboardingListeners = new Set()
    let onboardingSeen = null

    function readOnboardingSeen() {
      if (onboardingSeen !== null) return onboardingSeen
      try {
        onboardingSeen = window.localStorage.getItem(ONBOARDING_KEY) === '1'
      } catch (error) {
        onboardingSeen = false
      }
      return onboardingSeen
    }

    // Passing false clears the flag so the card shows again (settings row).
    function setOnboardingSeen(value) {
      onboardingSeen = value === true
      try {
        window.localStorage.setItem(ONBOARDING_KEY, onboardingSeen ? '1' : '0')
      } catch (error) {
        // A private-mode failure only costs the one-time hint.
      }
      for (const listener of Array.from(onboardingListeners)) {
        try { listener(onboardingSeen) } catch (error) { /* a stale subscriber is harmless */ }
      }
      return onboardingSeen
    }

    function useOnboarding() {
      const [seen, setSeen] = React.useState(readOnboardingSeen)
      React.useEffect(function () {
        onboardingListeners.add(setSeen)
        return function () { onboardingListeners.delete(setSeen) }
      }, [])
      return [seen, function (value) { setOnboardingSeen(value) }]
    }

    function focusableIn(container) {
      if (!container || typeof container.querySelectorAll !== 'function') return []
      let found = []
      try {
        found = Array.prototype.slice.call(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      } catch (error) {
        return []
      }
      return found.filter(function (node) {
        return node && node.tabIndex !== -1 && node.hidden !== true && node.getAttribute('aria-hidden') !== 'true'
      })
    }

    // Keeps Tab inside an open layer, moves focus in on open and returns it to
    // the trigger on close. Escape is opt-out because the lightbox owns its own
    // arrow/Escape handler.
    function useFocusTrap(active, containerRef, onClose, options) {
      const opts = options || {}
      React.useEffect(function () {
        if (!active) return undefined
        const previous = typeof document !== 'undefined' && document.activeElement ? document.activeElement : null
        const container = containerRef ? containerRef.current : null
        const list = focusableIn(container)
        const target = opts.initialFocus === 'container' ? container : (list[0] || container)
        if (target && typeof target.focus === 'function') {
          try { target.focus() } catch (error) { /* detached layer */ }
        }
        function onKey(event) {
          if (event.key === 'Escape' && opts.escape !== false) {
            event.preventDefault()
            if (typeof onClose === 'function') onClose()
            return
          }
          if (event.key !== 'Tab') return
          const current = containerRef ? containerRef.current : null
          const items = focusableIn(current)
          if (items.length === 0) {
            event.preventDefault()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          const activeNode = typeof document !== 'undefined' ? document.activeElement : null
          if (event.shiftKey && (activeNode === first || !activeNode || (current && !current.contains(activeNode)))) {
            event.preventDefault()
            if (last && typeof last.focus === 'function') last.focus()
          } else if (!event.shiftKey && activeNode === last) {
            event.preventDefault()
            if (first && typeof first.focus === 'function') first.focus()
          }
        }
        window.addEventListener('keydown', onKey, true)
        return function () {
          window.removeEventListener('keydown', onKey, true)
          if (previous && typeof previous.focus === 'function') {
            try { previous.focus() } catch (error) { /* the trigger is gone */ }
          }
        }
      }, [active, opts.initialFocus, opts.escape])
    }

    const SORT_MODES = ['default', 'time', 'name']

    function compareFilesByMode(left, right, mode) {
      const a = left || {}
      const b = right || {}
      if (mode === 'name') {
        return String(a.name || basename(a.path) || '').localeCompare(String(b.name || basename(b.path) || ''), 'zh-Hans-CN')
      }
      if (mode === 'time') return (Number(b.time) || 0) - (Number(a.time) || 0)
      return 0
    }

    function sortFiles(files, mode) {
      if (mode !== 'time' && mode !== 'name') return files || []
      return (files || []).slice().sort(function (left, right) { return compareFilesByMode(left, right, mode) })
    }

    function sortRows(rows, mode) {
      return sortFiles(rows, mode)
    }

    function errorSummary(t, code, sessionId) {
      const raw = code ? String(code) : ''
      if (!sessionId || raw === 'NO_SESSION') return { title: t('no.session'), body: t('error.noSessionBody'), code: raw === 'NO_SESSION' ? raw : '' }
      const kind = classifyIndexError(raw)
      if (kind === 'unavailable') return { title: t('error.title'), body: t('error.serviceBody'), code: raw }
      return { title: t('error.title'), body: t('error.body'), code: raw }
    }

    // Diagnostics never include workspace paths or file names: only the plugin
    // version, the visible settings and the bare error code.
    function diagnosticsText(settings, error) {
      const state = settings || {}
      return [
        'dsh-artifacts-panel 0.2.0',
        'theme=' + String(state.themeMode || 'inherit') + ' accent=' + String(state.accentColor || 'default'),
        'font=' + String(state.fontScale || 1.5) + ' density=' + String(state.density || 'standard'),
        'content=replies:' + String(state.showReplies) + ',docs:' + String(state.showDocs) + ',images:' + String(state.showImages) + ',files:' + String(state.showFiles),
        'noise=hideNoArtifacts:' + String(state.hideTurnsWithoutArtifacts) + ',hideShort:' + String(state.hideShortReplies),
        'page=' + String(state.pageSize) + ' dimension=' + String(state.defaultDimension || 'auto'),
        'host=' + (typeof navigator !== 'undefined' && navigator.userAgent ? String(navigator.userAgent) : 'unknown'),
        'error=' + (error ? String(error) : 'none'),
      ].join('\n')
    }

    function EmptyNew(props) {
      const t = props.t
      const [sample, setSample] = React.useState(false)
      return h('div', { className: 'ap-state ap-empty', 'data-state': 'new' },
        h('div', { className: 'ap-state-icon' }, iconFile(24)),
        h('div', { className: 'ap-state-title' }, t('empty.newTitle')),
        h('div', { className: 'ap-state-body' }, t('empty.newBody')),
        sample ? h('div', { className: 'ap-empty-sample' },
          h('div', { className: 'ap-empty-sample-title' }, t('empty.sampleTitle')),
          h('ul', null,
            h('li', null, t('empty.sampleReply')),
            h('li', null, t('empty.sampleDoc')),
            h('li', null, t('empty.sampleImage')))) : null,
        h('div', { className: 'ap-state-actions' },
          h('button', {
            type: 'button', className: 'ap-btn', 'data-empty-action': 'sample',
            onClick: function () { setSample(function (value) { return !value }) },
          }, t('empty.sample')),
          h('button', {
            type: 'button', className: 'ap-btn', 'data-empty-action': 'settings',
            onClick: props.onSettings,
          }, t('empty.settings'))))
    }

    function EmptyFiltered(props) {
      const t = props.t
      const chips = props.chips || []
      return h('div', { className: 'ap-state ap-empty', 'data-state': 'filtered' },
        h('div', { className: 'ap-state-icon' }, iconSearch(24)),
        h('div', { className: 'ap-state-title' }, t('empty.filteredTitle')),
        h('div', { className: 'ap-state-body' }, t('empty.filteredBody')),
        chips.length > 0 ? h('div', { className: 'ap-filter-chips', role: 'list' }, chips.map(function (chip) {
          return h('span', { key: chip.key, className: 'ap-filter-chip', role: 'listitem' },
            h('span', null, chip.label),
            h('button', {
              type: 'button', className: 'ap-chip-remove',
              title: t('empty.removeFilter', { label: chip.label }),
              'aria-label': t('empty.removeFilter', { label: chip.label }),
              onClick: chip.onRemove,
            }, iconClose(10)))
        })) : null,
        h('div', { className: 'ap-state-actions' },
          props.onShowAll ? h('button', {
            type: 'button', className: 'ap-btn', 'data-empty-action': 'show-all',
            onClick: props.onShowAll,
          }, t('showAll.off')) : null,
          h('button', {
            type: 'button', className: 'ap-btn', 'data-empty-action': 'clear',
            onClick: props.onClear,
          }, t('empty.clearAll'))))
    }

    function ErrorState(props) {
      const t = props.t
      const [copied, setCopied] = React.useState('')
      function copyDiagnostics() {
        copyText(props.diagnostics || '').then(function () {
          setCopied(t('error.diagCopied'))
        }, function () {
          setCopied(t('error.diagFailed'))
        })
      }
      return h('div', { className: 'ap-state ap-state-error', 'data-state': 'error' },
        h('div', { className: 'ap-state-icon' }, iconWarning(24)),
        h('div', { className: 'ap-state-title' }, props.title),
        h('div', { className: 'ap-state-body' }, props.body),
        h('div', { className: 'ap-state-actions' },
          h('button', { type: 'button', className: 'ap-btn', 'data-error-action': 'retry', onClick: props.onRetry }, t('error.retry')),
          h('button', { type: 'button', className: 'ap-btn', 'data-error-action': 'diagnostics', onClick: copyDiagnostics }, t('error.copyDiag'))),
        copied ? h('div', { className: 'ap-state-copied', role: 'status' }, copied) : null,
        props.code ? h('details', { className: 'ap-state-details' },
          h('summary', null, t('error.details')),
          h('code', { className: 'ap-state-code' }, t('error.code', { code: props.code }))) : null)
    }

    function OnboardingCard(props) {
      const t = props.t
      return h('div', { className: 'ap-onboard', role: 'note', 'data-onboarding': 'true' },
        h('div', { className: 'ap-onboard-icon' }, iconFolder(16)),
        h('div', { className: 'ap-onboard-main' },
          h('div', { className: 'ap-onboard-title' }, t('onboarding.title')),
          h('div', { className: 'ap-onboard-body' }, t('onboarding.body')),
          h('div', { className: 'ap-onboard-actions' },
            h('button', { type: 'button', className: 'ap-btn', 'data-onboarding-action': 'dismiss', onClick: props.onDismiss }, t('onboarding.dismiss')),
            h('button', { type: 'button', className: 'ap-linkbtn', 'data-onboarding-action': 'settings', onClick: props.onSettings }, t('onboarding.settings')))),
        h('button', {
          type: 'button', className: 'ap-iconbtn',
          title: t('gallery.close'), 'aria-label': t('gallery.close'),
          onClick: props.onDismiss,
        }, iconClose(12)))
    }
    //#endregion

    //#region view
    function GalleryThumb(props) {
      const t = props.t
      const [failed, setFailed] = React.useState(false)
      return h('button', {
        type: 'button', className: 'ap-thumb', title: props.file.path,
        'aria-label': t('gallery.open') + (props.file.name ? ' · ' + props.file.name : ''),
        onClick: function () { props.onOpen() },
      },
      failed
        ? h('div', { className: 'ap-thumb-failed' }, iconImage(20), h('span', null, t('gallery.failed')), h('span', null, props.file.name || props.file.path))
        : h('img', {
          src: props.src, alt: props.file.name || props.file.path, loading: 'lazy', decoding: 'async',
          onError: function () { setFailed(true) },
        }),
      h('span', { className: 'ap-thumb-name' }, props.file.name || props.file.path))
    }

    function GalleryImage(props) {
      const [failed, setFailed] = React.useState(false)
      if (failed) {
        return h('div', { className: 'ap-thumb-failed' }, iconImage(30), h('span', null, props.t('gallery.failed')), h('span', null, props.file.path))
      }
      return h('img', {
        src: props.src,
        alt: props.file.name || props.file.path,
        onError: function () { setFailed(true) },
      })
    }

    function ImageGallery(props) {
      const t = props.t
      const items = props.items || []
      if (items.length === 0) {
        return h('div', { className: 'ap-state' },
          h('div', { className: 'ap-state-icon' }, iconImage(22)),
          h('div', { className: 'ap-state-title' }, t('gallery.empty')),
          h('div', { className: 'ap-state-body' }, t('empty.filteredBody')))
      }
      return h('div', { className: 'ap-gallery' },
        h('div', { className: 'ap-gallery-head' }, iconGallery(14), h('span', null, t('gallery.title') + ' · ' + items.length)),
        h('div', { className: 'ap-gallery-grid' }, items.map(function (item, index) {
          return h(GalleryThumb, {
            key: String(item.turn) + '|' + item.file.path + '|' + index,
            file: item.file,
            turn: item.turn,
            t: t,
            src: props.src(item.file),
            onOpen: function () { props.onOpen(index) },
          })
        })))
    }

    function GalleryLightbox(props) {
      const t = props.t
      const items = props.items || []
      const index = props.index
      const item = items[index]
      // The lightbox is a dark stage regardless of the panel theme: pin the
      // dark palette on its own root and keep the mask dark in light mode.
      const lightboxStyle = Object.assign({}, themeVariables(Object.assign({}, props.settings, { themeMode: 'dark' })), { '--ap-mask': 'rgba(0,0,0,.62)' })
      const trapRef = React.useRef(null)
      // Escape is handled below (it also owns the arrow keys), so the trap only
      // keeps Tab inside and restores focus to the thumbnail on close.
      useFocusTrap(Boolean(item), trapRef, props.onClose, { escape: false, initialFocus: 'container' })
      React.useEffect(function () {
        function onKey(event) {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            props.onStep(-1)
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            props.onStep(1)
          }
        }
        window.addEventListener('keydown', onKey)
        return function () { window.removeEventListener('keydown', onKey) }
      }, [props.onClose, props.onStep])
      if (!item) return null
      return h('div', {
        className: 'ap-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('gallery.title'),
        style: lightboxStyle, ref: trapRef, tabIndex: -1,
        onClick: function () { props.onClose() },
      },
      h('button', {
        type: 'button', className: 'ap-lightbox-btn ap-lightbox-close',
        title: t('gallery.close'), 'aria-label': t('gallery.close'),
        onClick: function (event) { event.stopPropagation(); props.onClose() },
      }, iconClose(16)),
      h('button', {
        type: 'button', className: 'ap-lightbox-btn ap-lightbox-prev', disabled: index <= 0,
        title: t('gallery.prev'), 'aria-label': t('gallery.prev'),
        onClick: function (event) { event.stopPropagation(); props.onStep(-1) },
      }, iconChevronLeft(16)),
      h('figure', { className: 'ap-lightbox-figure', onClick: function (event) { event.stopPropagation() } },
        h(GalleryImage, { src: props.src(item.file), file: item.file, t: t }),
        h('figcaption', { className: 'ap-lightbox-caption' },
          (item.file.name || item.file.path) + ' · ' + t('gallery.counter', { index: index + 1, total: items.length }),
          h('div', null, item.file.path))),
      h('button', {
        type: 'button', className: 'ap-lightbox-btn ap-lightbox-next', disabled: index >= items.length - 1,
        title: t('gallery.next'), 'aria-label': t('gallery.next'),
        onClick: function (event) { event.stopPropagation(); props.onStep(1) },
      }, iconChevron(16)))
    }

    function FloatingBar(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const settings = useSettings()
      const [dismissed, setDismissed] = React.useState(false)
      const selection = typeof props.useSelection === 'function' ? props.useSelection() : null
      const sessionId = selection && selection.sessionId ? String(selection.sessionId) : ''
      const [count, setCount] = React.useState({ sessionId: '', status: 'idle', value: 0 })
      React.useEffect(function () {
        if (settings.showFloatingBar !== true || dismissed || !sessionId || typeof props.loadCount !== 'function') return undefined
        const controller = new AbortController()
        let active = true
        let busy = false
        function pull() {
          if (!active || busy) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          busy = true
          Promise.resolve()
            .then(function () { return props.loadCount(sessionId, controller.signal) })
            .then(function (value) {
              if (!active) return
              setCount({ sessionId: sessionId, status: 'ready', value: value && Number.isFinite(value.count) ? value.count : 0 })
            }, function () {
              if (active) setCount({ sessionId: sessionId, status: 'error', value: 0 })
            })
            .then(function () { busy = false })
        }
        pull()
        const timer = window.setInterval(pull, 30000)
        return function () {
          active = false
          window.clearInterval(timer)
          controller.abort()
        }
      }, [settings.showFloatingBar, dismissed, sessionId])
      if (settings.showFloatingBar !== true || dismissed) return null
      const ready = count.sessionId === sessionId && count.status === 'ready'
      return [h('style', { key: 'dock-css' }, DOCK_CSS), h('div', { key: 'dock', className: 'ap-dock', 'data-artifacts-dock': 'true', style: themeVariables(settings) },
        h('button', {
          type: 'button', className: 'ap-dock-main',
          title: t('dock.open'), 'aria-label': t('dock.open'),
          onClick: function () {
            try {
              if (typeof props.openPanel === 'function') props.openPanel()
            } catch (error) {
              // A sidebar that is not ready yet must not break the page.
            }
          },
        }, iconFolder(14), h('span', null, ready ? t('dock.count', { count: count.value }) : t('dock.label'))),
        h('button', {
          type: 'button', className: 'ap-dock-close',
          title: t('dock.close'), 'aria-label': t('dock.close'),
          onClick: function () { setDismissed(true) },
        }, iconClose(12)))]
    }

    // Auto-open is a convenience, not a navigation: it only fires on the first
    // mount of a conversation (or when a different conversation opens), only
    // while the right column is collapsed, and it never surfaces a toast. The
    // runtime owns the actual placement/dedupe, so the first failure is silent.
    function AutoOpenSidebar(props) {
      const settings = useSettings()
      const selection = typeof props.useSelection === 'function' ? props.useSelection() : null
      const sessionId = selection && selection.sessionId ? String(selection.sessionId) : ''
      const opened = React.useRef(null)
      React.useEffect(function () {
        if (!sessionId) return undefined
        if (opened.current === null) opened.current = new Set()
        if (opened.current.has(sessionId)) return undefined
        opened.current.add(sessionId)
        if (settings.autoOpenSidebar !== true) return undefined
        try {
          if (typeof props.ensureSidebar === 'function') props.ensureSidebar()
        } catch (error) {
          // A host that refuses the auto-open must not interrupt the session.
        }
        return undefined
      }, [sessionId, settings.autoOpenSidebar])
      return null
    }

    // The shell overlay carries two independent occupants: the dismissible
    // floating bar and the always-on auto-open watcher (which renders nothing).
    function ShellOverlay(props) {
      return [
        h(AutoOpenSidebar, {
          key: 'auto-open',
          useSelection: props.useSelection,
          ensureSidebar: props.ensureArtifactsSidebar,
        }),
        h(FloatingBar, Object.assign({ key: 'floating-bar' }, props)),
      ]
    }

    // Wide right-pane breakpoints. The SidebarArtifacts seat measures its own
    // container (ResizeObserver) and maps the width to one of these layouts;
    // the window viewport is never consulted because the pane width is what
    // the cards actually have to live in.
    const SIDEBAR_TWO_COLUMN_WIDTH = 480
    const SIDEBAR_SPLIT_WIDTH = 720

    function sidebarLayoutForWidth(width) {
      const next = Number(width)
      if (!Number.isFinite(next) || next < SIDEBAR_TWO_COLUMN_WIDTH) return 'single'
      if (next < SIDEBAR_SPLIT_WIDTH) return 'two-column'
      return 'split'
    }

    function measureElementWidth(element) {
      if (!element) return 0
      try {
        if (typeof element.getBoundingClientRect === 'function') {
          const measured = element.getBoundingClientRect().width
          if (Number.isFinite(measured) && measured > 0) return measured
        }
        const fallback = Number(element.clientWidth)
        if (Number.isFinite(fallback) && fallback > 0) return fallback
      } catch (error) {
        // A detached or foreign element has no usable box; treat it as unmeasured.
      }
      return 0
    }

    function resolveSidebarWidth(measureWidth, element) {
      if (typeof measureWidth === 'function') {
        try {
          const injected = Number(measureWidth())
          if (Number.isFinite(injected) && injected > 0) return injected
        } catch (error) {
          // The injected measurer may be gone; fall back to the element box.
        }
      }
      return measureElementWidth(element)
    }

    function readSidebarProbe(props) {
      const fallback = { expanded: false, artifactsActive: false }
      try {
        if (typeof props.probeSidebar !== 'function') return fallback
        const value = props.probeSidebar()
        if (!value || typeof value !== 'object') return fallback
        return { expanded: value.expanded === true, artifactsActive: value.artifactsActive === true }
      } catch (error) {
        return fallback
      }
    }

    function ArtifactsView(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const sessionId = props.sessionId || ''
      const compact = props.variant === 'sidebar'
      const settings = useSettings()
      const loadRef = React.useRef(props.loadArtifacts)
      const openRef = React.useRef(props.openArtifact)
      loadRef.current = props.loadArtifacts
      openRef.current = props.openArtifact

      const [data, setData] = React.useState({ status: 'loading', turns: [], team: { tasks: [], members: [] }, runs: [], children: [], sessions: {}, error: null, updatedAt: 0 })
      const [scope, setScope] = React.useState('session')
      const [allIndex, setAllIndex] = React.useState({ status: 'idle', data: null, error: '' })
      const [indexTick, setIndexTick] = React.useState(0)
      const [refreshKey, setRefreshKey] = React.useState(0)
      const [filter, setFilter] = React.useState('all')
      const [query, setQuery] = React.useState('')
      const [showHidden, setShowHidden] = React.useState(false)
      const [showAllTurns, setShowAllTurns] = React.useState(false)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [filterOpen, setFilterOpen] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [sortMode, setSortMode] = React.useState('default')
      const [onboarded, setOnboarded] = useOnboarding()
      const [extraPages, setExtraPages] = React.useState(0)
      const [userDimension, setUserDimension] = React.useState(null)
      const [expandedGroups, setExpandedGroups] = React.useState(function () { return props.initialExpandedGroups || {} })
      const [childVersion, setChildVersion] = React.useState(0)
      const [childLoading, setChildLoading] = React.useState({})
      const [pollTick, setPollTick] = React.useState(0)
      const childCache = React.useRef(new Map())
      const childQueue = React.useRef({ active: 0, pending: [] })
      const childAborts = React.useRef(new Set())
      const seededChildRows = React.useRef(false)
      if (!seededChildRows.current) {
        seededChildRows.current = true
        if (props.initialChildRows) {
          for (const childId of Object.keys(props.initialChildRows)) {
            childCache.current.set(childId, { rows: props.initialChildRows[childId] || [], at: Date.now(), pending: false })
          }
        }
      }
      const [prefs, setPrefs] = React.useState(function () { return readPrefs(sessionId) })
      const [expanded, setExpanded] = React.useState({})
      // The toolbar's sidebar entry is state aware: "collapse" while the
      // artifact tab is the expanded pane, "open" otherwise. The host owns the
      // layout gestures, so a light 1s probe keeps the label in step; a host
      // without the probe simply keeps the "open" label.
      const [sidebarState, setSidebarState] = React.useState(function () { return readSidebarProbe(props) })
      React.useEffect(function () {
        if (typeof props.probeSidebar !== 'function') return undefined
        let mounted = true
        function sync() {
          if (!mounted) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          const next = readSidebarProbe(props)
          setSidebarState(function (previous) {
            if (previous.expanded === next.expanded && previous.artifactsActive === next.artifactsActive) return previous
            return next
          })
        }
        sync()
        const timer = window.setInterval(sync, 1000)
        return function () {
          mounted = false
          window.clearInterval(timer)
        }
      }, [props.probeSidebar])
      const [toast, setToast] = React.useState('')
      const toastTimer = React.useRef(null)
      // batch 2 state: file-action menu, change summaries, export menu, image
      // view, lightbox and the two host capability probes.
      const [cardMenu, setCardMenu] = React.useState(null)
      const [moreOpen, setMoreOpen] = React.useState(false)
      const [imageView, setImageView] = React.useState(null)
      const [lightbox, setLightbox] = React.useState(null)
      const [, setSummaryVersion] = React.useState(0)
      const [desktopReady, setDesktopReady] = React.useState(null)
      const [markdownReady, setMarkdownReady] = React.useState(null)
      const [exportBusy, setExportBusy] = React.useState(false)
      const changeSummaries = React.useRef(new Map())
      const filterRef = React.useRef(null)
      const moreRef = React.useRef(null)
      const cardMenuRef = React.useRef(null)
      const settingsRef = React.useRef(null)
      const titleMenuRef = React.useRef(null)

      // Focus traps: the filter popover, the toolbar ⋯ menu, the per-card menu
      // and the settings drawer all keep Tab inside and return focus on close.
      useFocusTrap(filterOpen, filterRef, function () { setFilterOpen(false) })
      useFocusTrap(moreOpen, moreRef, function () { setMoreOpen(false) })
      useFocusTrap(cardMenu !== null, cardMenuRef, function () { setCardMenu(null) })
      useFocusTrap(settingsOpen, settingsRef, function () { setSettingsOpen(false) })
      useFocusTrap(menuOpen, titleMenuRef, function () { setMenuOpen(false) })

      React.useEffect(function () {
        return function () {
          if (toastTimer.current !== null) clearTimeout(toastTimer.current)
        }
      }, [])

      React.useEffect(function () {
        return function () {
          for (const controller of childAborts.current) {
            try { controller.abort() } catch (error) { /* already settled */ }
          }
          childAborts.current.clear()
          childQueue.current.pending.length = 0
        }
      }, [])

      React.useEffect(function () {
        setPrefs(readPrefs(sessionId))
      }, [sessionId])

      React.useEffect(function () {
        // A different session gets its own dimension pick and collapsed groups,
        // so the previous session's manual choices never leak across.
        setUserDimension(null)
        setExpandedGroups({})
        setExtraPages(0)
      }, [sessionId])

      React.useEffect(function () {
        if (settings.crossSessionIndex !== true && scope === 'all') setScope('session')
      }, [settings.crossSessionIndex, scope])

      React.useEffect(function () {
        if (scope !== 'all' || settings.crossSessionIndex !== true) return undefined
        if (!sessionId || typeof props.readIndexFile !== 'function') {
          setAllIndex({ status: 'missing', data: null, error: '' })
          return undefined
        }
        let cancelled = false
        let busy = false
        const controller = new AbortController()
        function pull() {
          if (busy || cancelled) return
          busy = true
          setAllIndex(function (previous) {
            return previous.data
              ? { status: 'ready', data: previous.data, error: '' }
              : { status: 'loading', data: null, error: '' }
          })
          Promise.resolve()
            .then(function () { return props.readIndexFile(indexFilePath(), controller.signal) })
            .then(function (result) {
              if (cancelled) return
              if (!result || typeof result.text !== 'string') throw new Error('BAD_INDEX')
              const parsed = normalizeIndexPayload(result.text)
              rememberIndexStats(parsed)
              setAllIndex({ status: 'ready', data: parsed, error: '' })
              setIndexTick(function (value) { return value + 1 })
            })
            .catch(function (error) {
              if (cancelled || (error && error.name === 'AbortError')) return
              const message = error && error.message ? String(error.message) : String(error)
              const kind = message === 'BAD_INDEX' ? 'invalid' : classifyIndexError(error)
              // Keep the raw message for the folded <details>; the title/body
              // come from the classified status, never from this string.
              setAllIndex(function (previous) { return { status: kind, data: previous.data, error: message } })
            })
            .then(function () { busy = false })
        }
        pull()
        const timer = window.setInterval(function () {
          if (document.visibilityState !== 'hidden') pull()
        }, INDEX_POLL_INTERVAL)
        return function () {
          cancelled = true
          window.clearInterval(timer)
          controller.abort()
        }
      }, [scope, refreshKey, sessionId, settings.crossSessionIndex])

      React.useEffect(function () {
        if (!sessionId) {
          setData({ status: 'error', turns: [], team: { tasks: [], members: [] }, runs: [], children: [], sessions: {}, error: 'NO_SESSION', updatedAt: 0 })
          return undefined
        }
        let cancelled = false
        let busy = false
        const records = new Map()
        const abort = new AbortController()
        setData(function (prev) {
          return { status: prev.turns.length > 0 ? 'refreshing' : 'loading', turns: prev.turns, team: prev.team, runs: prev.runs, children: prev.children, sessions: prev.sessions, error: null, updatedAt: prev.updatedAt }
        })
        function fail(error) {
          if (cancelled || (error && error.name === 'AbortError')) return
          const message = error && error.message ? error.message : String(error)
          setData(function (prev) {
            if (prev.turns.length > 0) return { status: 'ready', turns: prev.turns, team: prev.team, runs: prev.runs, children: prev.children, sessions: prev.sessions, error: message, updatedAt: prev.updatedAt }
            return { status: 'error', turns: [], team: { tasks: [], members: [] }, runs: [], children: [], sessions: {}, error: message, updatedAt: 0 }
          })
        }
        function pull(full) {
          if (busy || cancelled) return
          busy = true
          let request
          try {
            request = loadRef.current(full, abort.signal)
          } catch (error) {
            busy = false
            fail(error)
            return
          }
          Promise.resolve(request).then(function (page) {
            if (cancelled) return
            let changed = full
            if (full) records.clear()
            const list = page && Array.isArray(page.records) ? page.records : []
            for (const record of list) {
              const event = record && record.event ? record.event : record
              if (!event || typeof event.seq !== 'number') continue
              if (!records.has(event.seq)) changed = true
              records.set(event.seq, event)
            }
            if (!changed) {
              setData(function (prev) { return prev.status === 'refreshing' ? { status: 'ready', turns: prev.turns, team: prev.team, runs: prev.runs, children: prev.children, sessions: prev.sessions, error: null, updatedAt: Date.now() } : prev })
              setPollTick(function (value) { return value + 1 })
              return
            }
            if (records.size > 4000) {
              const seqs = Array.from(records.keys()).sort(function (left, right) { return left - right })
              for (let index = 0; index < seqs.length - 4000; index += 1) records.delete(seqs[index])
            }
            const folded = foldSession(records.values(), props.cwd)
            setData({ status: 'ready', turns: folded.turns, team: folded.team, runs: folded.runs, children: folded.children, sessions: page && page.sessions ? page.sessions : {}, error: null, updatedAt: Date.now() })
            setPollTick(function (value) { return value + 1 })
          }).catch(fail).then(function () {
            busy = false
          })
        }
        pull(true)
        const timer = window.setInterval(function () {
          if (document.visibilityState !== 'hidden') pull(false)
        }, POLL_INTERVAL)
        return function () {
          cancelled = true
          window.clearInterval(timer)
          abort.abort()
        }
      }, [sessionId, refreshKey])

      React.useEffect(function () {
        setExtraPages(0)
      }, [sessionId, filter, query, showAllTurns, settings])

      React.useEffect(function () {
        // Reveal/open are only offered after the Host confirms a desktop can act
        // on workspace paths; a rejected or failed probe hides them.
        if (typeof props.probeWorkspacePath !== 'function') {
          setDesktopReady(false)
          return undefined
        }
        let active = true
        Promise.resolve().then(function () { return props.probeWorkspacePath() }).then(function (value) {
          if (active) setDesktopReady(value === true)
        }, function () {
          if (active) setDesktopReady(false)
        })
        return function () { active = false }
      }, [props.probeWorkspacePath, sessionId])

      React.useEffect(function () {
        // The full-Markdown route is a Host capability; when it is absent the
        // copy entry stays hidden instead of failing after a click.
        setMarkdownReady(null)
        if (typeof props.probeMarkdown !== 'function') {
          setMarkdownReady(false)
          return undefined
        }
        const controller = new AbortController()
        let active = true
        Promise.resolve().then(function () { return props.probeMarkdown(controller.signal) }).then(function (value) {
          if (active) setMarkdownReady(value === true)
        }, function () {
          if (active) setMarkdownReady(false)
        })
        return function () {
          active = false
          controller.abort()
        }
      }, [props.probeMarkdown, sessionId])

      React.useEffect(function () {
        // Load each announced turn's changed-file list once, two at a time. The
        // list carries the file index the official review tab navigates to.
        if (!props.capabilities || props.capabilities.changesReview !== true) return undefined
        if (typeof props.fetchChangesSummary !== 'function') return undefined
        const controller = new AbortController()
        let active = true
        const wanted = []
        for (const turn of renderedTurns) {
          if (!turn.changes || turn.changes.length === 0) continue
          for (const change of turn.changes) {
            const entry = changeSummaries.current.get(String(change.seq))
            if (entry && (entry.pending || (entry.at && Date.now() - entry.at < 60000))) continue
            wanted.push(change)
          }
        }
        let cursor = 0
        let running = 0
        function drain() {
          if (!active) return
          while (running < 2 && cursor < wanted.length) {
            const change = wanted[cursor]
            cursor += 1
            running += 1
            changeSummaries.current.set(String(change.seq), { pending: true, ok: false, files: [], at: 0 })
            Promise.resolve()
              .then(function () { return props.fetchChangesSummary(change.seq, controller.signal) })
              .then(function (summary) {
                if (!active) return
                changeSummaries.current.set(String(change.seq), {
                  pending: false,
                  ok: true,
                  files: summary && Array.isArray(summary.files) ? summary.files : [],
                  turn: summary && summary.turn,
                  at: Date.now(),
                })
                setSummaryVersion(function (value) { return value + 1 })
              }, function () {
                if (!active) return
                changeSummaries.current.set(String(change.seq), { pending: false, ok: false, files: [], at: Date.now() })
                setSummaryVersion(function (value) { return value + 1 })
              })
              .then(function () {
                running -= 1
                drain()
              })
          }
        }
        drain()
        return function () {
          active = false
          controller.abort()
        }
      }, [data.turns, props.fetchChangesSummary])

      React.useEffect(function () {
        setCardMenu(null)
        setMoreOpen(false)
        setLightbox(null)
        setImageView(null)
        setFilterOpen(false)
        setSettingsOpen(false)
      }, [sessionId])

      React.useEffect(function () {
        if (!cardMenu && !moreOpen && lightbox === null) return undefined
        function onKey(event) {
          if (event.key !== 'Escape') return
          setCardMenu(null)
          setMoreOpen(false)
          if (lightbox !== null) setLightbox(null)
        }
        // A fixed-positioned card menu is anchored to the card's old viewport
        // rect; any scroll or resize closes it instead of letting it drift.
        function onViewportChange() {
          setCardMenu(null)
          setMoreOpen(false)
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('scroll', onViewportChange, true)
        window.addEventListener('resize', onViewportChange)
        return function () {
          window.removeEventListener('keydown', onKey)
          window.removeEventListener('scroll', onViewportChange, true)
          window.removeEventListener('resize', onViewportChange)
        }
      }, [cardMenu, moreOpen, lightbox])

      const starSet = React.useMemo(function () { return new Set(prefs.stars) }, [prefs.stars])
      const hiddenSet = React.useMemo(function () { return new Set(prefs.hidden) }, [prefs.hidden])
      const keywordList = React.useMemo(function () { return parseKeywords(settings.ignoreKeywords) }, [settings.ignoreKeywords])

      function showToast(message) {
        setToast(message)
        if (toastTimer.current !== null) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(function () { setToast('') }, 2200)
      }

      // Only one layer is open at a time; the settings drawer is the deepest.
      function openSettingsDrawer() {
        setFilterOpen(false)
        setMoreOpen(false)
        setMenuOpen(false)
        setCardMenu(null)
        setSettingsOpen(true)
      }

      function closeSettingsDrawer() {
        setSettingsOpen(false)
      }

      function toggleFilterPopover() {
        setMoreOpen(false)
        setMenuOpen(false)
        setCardMenu(null)
        setFilterOpen(function (value) { return !value })
      }

      function toggleMoreMenu() {
        setFilterOpen(false)
        setMenuOpen(false)
        setCardMenu(null)
        setMoreOpen(function (value) { return !value })
      }

      function closeMoreMenu() {
        setMoreOpen(false)
      }

      function togglePref(kind, path) {
        setPrefs(function (prev) {
          const list = prev[kind]
          const next = list.indexOf(path) === -1 ? list.concat([path]) : list.filter(function (item) { return item !== path })
          const nextPrefs = { stars: prev.stars, hidden: prev.hidden }
          nextPrefs[kind] = next
          writePrefs(sessionId, nextPrefs)
          return nextPrefs
        })
      }

      function openArtifact(path, ownerSessionId) {
        try {
          if (ownerSessionId && ownerSessionId !== sessionId && typeof props.openArtifactFor === 'function') {
            props.openArtifactFor(ownerSessionId, path)
            return
          }
          openRef.current(path)
        } catch (error) {
          showToast(t('preview.failed'))
        }
      }

      function copyPath(path) {
        copyText(path).then(function () { showToast(t('copied')) }, function () { showToast(t('copy.failed')) })
      }

      function enqueueChildTask(task) {
        const queue = childQueue.current
        queue.pending.push(task)
        function drain() {
          while (queue.active < 2 && queue.pending.length > 0) {
            const next = queue.pending.shift()
            queue.active += 1
            Promise.resolve().then(next).then(function () {
              queue.active -= 1
              drain()
            }, function () {
              queue.active -= 1
              drain()
            })
          }
        }
        drain()
      }

      function ensureChild(childId) {
        if (!childId || typeof props.loadChildArtifacts !== 'function') return
        const cached = childCache.current.get(childId)
        if (cached && cached.pending) return
        const session = data.sessions ? data.sessions[childId] : undefined
        const running = Boolean(session && session.running)
        if (cached && !running && cached.at && Date.now() - cached.at < 15000) return
        const previousRows = cached ? cached.rows : []
        childCache.current.set(childId, { rows: previousRows, at: cached ? cached.at : 0, pending: true })
        setChildLoading(function (prev) {
          const next = Object.assign({}, prev)
          next[childId] = (next[childId] || 0) + 1
          return next
        })
        const controller = new AbortController()
        childAborts.current.add(controller)
        enqueueChildTask(function () {
          return Promise.resolve()
            .then(function () { return props.loadChildArtifacts(childId, 'unknown', controller.signal) })
            .then(function (records) {
              const folded = foldSession(records || [], props.cwd)
              const rows = []
              for (const turn of folded.turns) {
                for (const file of turn.files) rows.push(Object.assign({}, file, { turn: turn.turn }))
              }
              childCache.current.set(childId, { rows: rows, at: Date.now(), pending: false })
              setChildVersion(function (value) { return value + 1 })
            })
            .catch(function (error) {
              if (error && error.name === 'AbortError') {
                childCache.current.set(childId, { rows: previousRows, at: cached ? cached.at : 0, pending: false })
                return
              }
              childCache.current.set(childId, { rows: previousRows, at: Date.now(), pending: false, error: true })
              setChildVersion(function (value) { return value + 1 })
            })
            .then(function () {
              childAborts.current.delete(controller)
              setChildLoading(function (prev) {
                const next = Object.assign({}, prev)
                if (next[childId]) {
                  next[childId] -= 1
                  if (next[childId] <= 0) delete next[childId]
                }
                return next
              })
            })
        })
      }

      function ensureGroupChildren(group) {
        if (!settings.showSubagents) return
        for (const childId of group.childIds || []) ensureChild(childId)
      }

      function toggleGroup(group) {
        const nextOpen = !isGroupOpen(group)
        setExpandedGroups(function (prev) {
          const next = Object.assign({}, prev)
          next[group.key] = nextOpen
          return next
        })
        if (nextOpen) ensureGroupChildren(group)
      }

      function loadGroupChildren(group) {
        setExpandedGroups(function (prev) {
          const next = Object.assign({}, prev)
          next[group.key] = true
          return next
        })
        ensureGroupChildren(group)
      }

      const counts = React.useMemo(function () {
        const next = { all: 0, doc: 0, image: 0, file: 0 }
        for (const turn of data.turns) {
          for (const file of turn.files) {
            if (!kindEnabled(file.kind, settings)) continue
            if (!showHidden && hiddenSet.has(file.path)) continue
            next.all += 1
            next[file.kind] = (next[file.kind] || 0) + 1
          }
        }
        return next
      }, [data.turns, hiddenSet, showHidden, settings])

      const visibleTurns = React.useMemo(function () {
        return selectVisibleTurns(data.turns, {
          settings: settings,
          filter: filter,
          query: query,
          showHidden: showHidden,
          hiddenSet: hiddenSet,
          showAllTurns: showAllTurns,
          keywordList: keywordList,
        })
      }, [data.turns, filter, query, showHidden, hiddenSet, settings, showAllTurns, keywordList])

      const dimension = resolveDimension(data.team, data.runs, userDimension || settings.defaultDimension)
      const isTurnsDimension = dimension === 'turns'
      const childRowsMap = React.useMemo(function () {
        const map = {}
        for (const [childId, entry] of childCache.current) map[childId] = entry.rows || []
        return map
      }, [childVersion])
      const groupResult = React.useMemo(function () {
        if (dimension === 'turns') return []
        try {
          return buildGroups({
            dimension: dimension,
            turns: data.turns,
            team: data.team,
            runs: data.runs,
            children: data.children,
            settings: settings,
            hiddenSet: hiddenSet,
            filter: filter,
            query: query,
            showHidden: showHidden,
            showSubagents: settings.showSubagents,
            showUnassigned: settings.showUnassigned,
            childRows: childRowsMap,
            labels: { unassigned: t('group.unassigned') },
          })
        } catch (error) {
          // A malformed record must never take down the whole conversation view.
          return []
        }
      }, [dimension, data, settings, hiddenSet, filter, query, showHidden, childRowsMap, t])

      let displayFileCount = 0
      if (isTurnsDimension) {
        for (const turn of visibleTurns) displayFileCount += turn.files.length
      } else {
        for (const group of groupResult) displayFileCount += group.rows.length
      }
      const itemCount = isTurnsDimension ? visibleTurns.length : groupResult.length
      const pageSize = settings.pageSize === 'all' ? Infinity : settings.pageSize
      const pageLimit = Number.isFinite(pageSize) ? pageSize * (1 + extraPages) : Infinity
      const groupLimit = GROUPS_PAGE * (1 + extraPages)
      const renderedTurns = isTurnsDimension ? (Number.isFinite(pageLimit) ? visibleTurns.slice(0, pageLimit) : visibleTurns) : []
      const renderedGroups = isTurnsDimension ? [] : groupResult.slice(0, groupLimit)
      const remainingItems = itemCount - (isTurnsDimension ? renderedTurns.length : renderedGroups.length)
      const statsText = isTurnsDimension
        ? t('stats', { turns: visibleTurns.length, files: displayFileCount, updated: data.updatedAt ? formatTime(data.updatedAt) : '—' })
        : t('stats.groups', { groups: groupResult.length, files: displayFileCount, updated: data.updatedAt ? formatTime(data.updatedAt) : '—' })
      const allStatsText = allIndex.status === 'ready' && allIndex.data
        ? t('all.stats', {
          sessions: allIndex.data.sessions ? Object.keys(allIndex.data.sessions).length : allIndex.data.totals.sessions,
          files: allIndex.data.totals.files,
          updated: allIndex.data.generatedAt ? formatTime(allIndex.data.generatedAt) : '—',
        })
        : t('all.preparing')
      const activeFilterCount = (filter !== 'all' ? 1 : 0) + (query.trim() !== '' ? 1 : 0) + (showHidden ? 1 : 0) + (settings.hideTurnsWithoutArtifacts === true ? 1 : 0) + (showAllTurns ? 1 : 0)
      const headerStatsText = (scope === 'all' ? allStatsText : statsText) +
        (activeFilterCount > 0 ? ' · ' + t('stats.filtered', { count: activeFilterCount }) : '')

      const pinned = React.useMemo(function () {
        const result = []
        if (dimension === 'turns') {
          for (const turn of visibleTurns) {
            for (const file of turn.files) {
              if (starSet.has(file.path)) result.push({ file: file, turn: turn.turn })
            }
          }
        } else {
          for (const group of groupResult) {
            for (const file of group.rows) {
              if (starSet.has(file.path)) result.push({ file: file, turn: file.turn })
            }
          }
        }
        if (sortMode === 'default') return result
        return result.slice().sort(function (left, right) { return compareFilesByMode(left.file, right.file, sortMode) })
      }, [dimension, visibleTurns, groupResult, starSet, sortMode])

      const galleryList = React.useMemo(function () {
        const items = galleryItems(visibleTurns)
        if (sortMode === 'default') return items
        return items.slice().sort(function (left, right) { return compareFilesByMode(left.file, right.file, sortMode) })
      }, [visibleTurns, sortMode])
      const effectiveImageView = imageView || (settings.imageView === 'gallery' ? 'gallery' : 'list')
      const showGallery = isTurnsDimension && filter === 'image' && effectiveImageView === 'gallery'

      const groupResultRef = React.useRef(groupResult)
      groupResultRef.current = groupResult
      React.useEffect(function () {
        if (dimension === 'turns' || !settings.showSubagents) return
        for (const group of groupResultRef.current) {
          if (expandedGroups[group.key] !== true) continue
          for (const childId of group.childIds || []) {
            const session = data.sessions ? data.sessions[childId] : undefined
            if (session && session.running) ensureChild(childId)
          }
        }
      }, [pollTick, dimension, expandedGroups, settings.showSubagents])

      const activeFilterKind = filter === 'doc' ? t('filter.docs') : (filter === 'image' ? t('filter.images') : (filter === 'file' ? t('filter.files') : ''))
      // Chips list exactly the conditions that are narrowing the list, each
      // removable on its own; the empty state renders them.
      const emptyChips = []
      if (filter !== 'all') emptyChips.push({ key: 'filter', label: t('filter.chip.kind', { value: activeFilterKind }), onRemove: function () { setFilter('all') } })
      if (query.trim() !== '') emptyChips.push({ key: 'query', label: t('filter.chip.query', { value: query.trim() }), onRemove: function () { setQuery('') } })
      if (showHidden) emptyChips.push({ key: 'hidden', label: t('filter.chip.showHidden'), onRemove: function () { setShowHidden(false) } })
      if (settings.hideTurnsWithoutArtifacts === true) emptyChips.push({ key: 'onlyArtifacts', label: t('filter.onlyArtifacts'), onRemove: function () { setSettings({ hideTurnsWithoutArtifacts: false }) } })
      if (showAllTurns) emptyChips.push({ key: 'showAll', label: t('filter.showAllTurns'), onRemove: function () { setShowAllTurns(false) } })

      function clearFilters() {
        setFilter('all')
        setQuery('')
        setShowHidden(false)
        setShowAllTurns(false)
        // The noise toggle is a setting, but it also hides turns: clearing the
        // empty state must be able to lift it too.
        if (settings.hideTurnsWithoutArtifacts === true) setSettings({ hideTurnsWithoutArtifacts: false })
      }

      function downloadManifest(links) {
        const text = manifestText(t, sessionId, visibleTurns, links
          ? { links: true, fileUrl: props.fileUrl, note: t('export.degraded') }
          : {})
        try {
          const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = 'artifacts-' + (sessionId ? String(sessionId).slice(0, 8) : 'session') + '-' + new Date().toISOString().slice(0, 10) + '.md'
          anchor.click()
          window.setTimeout(function () { URL.revokeObjectURL(url) }, 1500)
        } catch (error) {
          showToast(t('export.bundleFailed'))
        }
      }

      function exportManifest() {
        downloadManifest(false)
      }

      function exportManifestWithLinks() {
        downloadManifest(true)
        showToast(t('export.degraded'))
      }

      function runExport(id) {
        setMoreOpen(false)
        if (id === 'manifest') {
          exportManifest()
          return
        }
        if (id === 'degradedManifest') {
          exportManifestWithLinks()
          return
        }
        if (exportBusy) return
        if (id === 'bundle') {
          if (typeof props.fetchSessionLogZip !== 'function') {
            exportManifestWithLinks()
            return
          }
          setExportBusy(true)
          Promise.resolve()
            .then(function () { return props.fetchSessionLogZip() })
            .then(function () { showToast(t('export.bundleStarted')) }, function () { showToast(t('export.bundleFailed')) })
            .then(function () { setExportBusy(false) })
          return
        }
        if (id === 'copyMarkdown') {
          if (typeof props.copySessionMarkdown !== 'function') return
          setExportBusy(true)
          Promise.resolve()
            .then(function () { return props.copySessionMarkdown() })
            .then(function () { showToast(t('export.copyDone')) }, function () { showToast(t('export.copyFailed')) })
            .then(function () { setExportBusy(false) })
        }
      }

      function changeEntryForTurn(turn) {
        if (!turn || !Array.isArray(turn.changes)) return null
        for (let index = turn.changes.length - 1; index >= 0; index -= 1) {
          const entry = changeSummaries.current.get(String(turn.changes[index].seq))
          if (entry && entry.ok) return { seq: turn.changes[index].seq, entry: entry }
        }
        return null
      }

      function changeIndexFor(file, turn) {
        const found = changeEntryForTurn(turn)
        if (!found) return -1
        const target = normalizePath(resolveAgainst(props.cwd, file.path))
        for (let index = 0; index < found.entry.files.length; index += 1) {
          const candidate = found.entry.files[index]
          if (!candidate || typeof candidate.path !== 'string') continue
          if (normalizePath(resolveAgainst(props.cwd, candidate.path)) === target) return index
          if (typeof candidate.display === 'string' && candidate.display !== '' && normalizePath(resolveAgainst(props.cwd, candidate.display)) === target) return index
        }
        return -1
      }

      function openChangesFor(file, turn) {
        const found = changeEntryForTurn(turn)
        const fallback = turn && Array.isArray(turn.changes) && turn.changes.length > 0 ? turn.changes[turn.changes.length - 1].seq : 0
        const seq = found ? found.seq : fallback
        const index = file ? changeIndexFor(file, turn) : 0
        if (!seq || !turn || typeof props.openChangesReview !== 'function') {
          showToast(t('file.failed'))
          return
        }
        try {
          if (props.openChangesReview(seq, turn.turn, index < 0 ? 0 : index) === false) showToast(t('file.failed'))
        } catch (error) {
          showToast(t('file.failed'))
        }
      }

      function cardMenuKey(file, turn) {
        return (file.childId ? file.childId + '|' : '') + file.path + '|' + (turn ? turn.turn : 0)
      }

      function cardMenuItems(file, turn) {
        const caps = props.capabilities || {}
        const absolute = resolveAgainst(props.cwd, file.path)
        return artifactMenuModel(t, {
          caps: {
            workspacePath: caps.workspacePath === true,
            desktop: desktopReady === true,
            saveAs: caps.saveAs === true,
          },
          absolutePath: isAbsolutePath(absolute),
          download: caps.fileActions === true || Boolean(mediaUrl(absolute)),
          changeIndex: changeIndexFor(file, turn),
          prefs: { starred: starSet.has(file.path), hidden: hiddenSet.has(file.path) },
          canOpenChild: Boolean(file.childId && typeof props.openSession === 'function'),
        })
      }

      function runFileAction(id, file, turn) {
        setCardMenu(null)
        if (id === 'reveal' || id === 'open') {
          Promise.resolve()
            .then(function () { return props.openPath(file.path, id === 'reveal' ? 'reveal' : 'open') })
            .then(function () { /* native actions report nothing on success */ }, function () { showToast(t('file.failed')) })
          return
        }
        if (id === 'copy') {
          copyPath(file.path)
          return
        }
        if (id === 'star' || id === 'unstar') {
          togglePref('stars', file.path)
          return
        }
        if (id === 'hide' || id === 'unhide') {
          togglePref('hidden', file.path)
          return
        }
        if (id === 'openChild') {
          try {
            if (props.openSession(file.childId) === false) showToast(t('sidebar.actionUnavailable'))
          } catch (error) {
            showToast(t('sidebar.actionUnavailable'))
          }
          return
        }
        if (id === 'download' || id === 'saveAs') {
          Promise.resolve()
            .then(function () { return props.downloadArtifact(file, id === 'saveAs' ? 'saveAs' : 'download') })
            .then(function () { /* the browser or desktop owns the save feedback */ }, function () { showToast(t('file.failed')) })
          return
        }
        if (id === 'changes') openChangesFor(file, turn)
      }

      function openCardMenu(event, file, turn) {
        event.preventDefault()
        event.stopPropagation()
        setMoreOpen(false)
        const key = cardMenuKey(file, turn)
        let rect = null
        try {
          if (event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function') {
            rect = event.currentTarget.getBoundingClientRect()
          }
        } catch (error) {
          rect = null
        }
        setCardMenu(function (previous) {
          return previous && previous.key === key ? null : { key: key, file: file, turn: turn, rect: rect }
        })
      }

      function cardMenuStyle() {
        if (!cardMenu || !cardMenu.rect) return undefined
        const rect = cardMenu.rect
        const width = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1280
        const height = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 800
        return {
          position: 'fixed',
          right: 'auto',
          left: Math.max(8, Math.min(rect.left, width - 248)) + 'px',
          top: Math.max(8, Math.min(rect.bottom + 4, height - 248)) + 'px',
          maxHeight: '60vh',
          overflow: 'auto',
        }
      }

      function card(file, turn, ownerSessionId) {
        const starred = starSet.has(file.path)
        const hidden = hiddenSet.has(file.path)
        const cardKey = cardMenuKey(file, turn)
        const menuItems = cardMenuItems(file, turn)
        const menuOpenForCard = cardMenu !== null && cardMenu.key === cardKey
        const actions = [
          h('button', {
            key: 'star', type: 'button', className: 'ap-iconbtn ap-card-star', 'data-on': starred ? 'true' : 'false',
            title: starred ? t('action.unstar') : t('action.star'),
            'aria-label': starred ? t('action.unstar') : t('action.star'),
            'aria-pressed': starred ? 'true' : 'false',
            onClick: function (event) { event.stopPropagation(); togglePref('stars', file.path) },
          }, starred ? iconStarFilled(14) : iconStar(14)),
          h('button', {
            key: 'menu', type: 'button', className: 'ap-iconbtn ap-card-more',
            title: t('action.more'), 'aria-label': t('action.more'),
            'aria-haspopup': 'menu', 'aria-expanded': menuOpenForCard ? 'true' : 'false',
            onClick: function (event) { openCardMenu(event, file, turn) },
          }, iconMore(14)),
        ]
        // The card itself is a plain container: one transparent full-card
        // <button> opens the artifact, so the star/⋯ buttons and the copy-path
        // button are siblings, never nested inside an interactive ancestor.
        return h('div', {
          key: cardKey,
          className: 'ap-card',
          title: file.path,
          'data-hidden': hidden ? 'true' : 'false',
          'data-menu-open': menuOpenForCard ? 'true' : 'false',
          onContextMenu: function (event) { openCardMenu(event, file, turn) },
        },
        h('button', {
          type: 'button', className: 'ap-card-hit',
          'aria-label': t('card.open', { name: file.name || file.path }),
          onClick: function () { openArtifact(file.path, ownerSessionId) },
        }),
        h('div', { className: 'ap-card-icon', 'aria-hidden': 'true' }, kindIcon(file.kind)),
        h('div', { className: 'ap-card-main' },
          h('div', { className: 'ap-card-name' }, file.name || file.path),
          h('button', {
            type: 'button', className: 'ap-card-path',
            title: file.path, 'aria-label': t('action.copy') + ' · ' + file.path,
            onClick: function (event) { event.stopPropagation(); copyPath(file.path) },
          }, middleEllipsis(file.path, 44)),
          h('div', { className: 'ap-card-meta' },
            h('span', { className: 'ap-chip' }, t('kind.' + file.kind)),
            file.source === 'presented' ? h('span', { className: 'ap-chip ap-chip-accent' }, t('source.presented')) : null,
            file.childId ? h('span', { className: 'ap-chip ap-chip-sub', title: file.childId }, t('badge.subagent') + (file.childName ? ' · ' + file.childName : '')) : null,
            h('span', null, t('turn.short', { n: turn.turn })),
            file.description ? h('span', { className: 'ap-card-desc', title: file.description }, file.description) : null
          )
        ),
        h('div', { className: 'ap-card-actions' }, actions),
        menuOpenForCard && menuItems.length > 0 ? h('div', {
          className: 'ap-card-menu', role: 'menu', style: cardMenuStyle(), ref: cardMenuRef,
          onClick: function (event) { event.stopPropagation() },
          onContextMenu: function (event) { event.preventDefault(); event.stopPropagation() },
        }, menuItems.map(function (item) {
          return h('button', {
            key: item.id, type: 'button', className: 'ap-card-menu-item', role: 'menuitem',
            onClick: function (event) { event.stopPropagation(); runFileAction(item.id, file, turn) },
          }, menuIcon(item.id), h('span', null, item.label))
        })) : null)
      }

      // Markdown applies to the final-reply body only. The artifact cards keep
      // their plain labels, and diff / tool-output / log views never come
      // through here, so those stay raw monospace text. Copy and export read
      // turn.reply directly (see manifestText), so they still emit Markdown.
      function replyTextNode(text, clamped) {
        const clampedFlag = clamped ? 'true' : 'false'
        if (settings.renderMarkdown !== true) {
          return h('div', { className: 'ap-reply-text', 'data-clamped': clampedFlag }, text)
        }
        return h('div', {
          className: 'ap-reply-text ap-md',
          'data-clamped': clampedFlag,
          dangerouslySetInnerHTML: { __html: renderMarkdownHtml(text) },
        })
      }

      function turnSection(turn) {
        // Replies clamp to roughly six to eight lines so a long, file-free turn
        // still reads as one compact card with an explicit expand control.
        const longReply = turn.reply.length > 700 || turn.reply.split('\n').length > 8
        const isExpanded = expanded[turn.turn] === true
        const hasReply = turn.reply.trim() !== ''
        // The body wrapper is what the wide (>=720px) right pane turns into two
        // columns: reply on the left, artifact cards on the right.
        const bodyClass = 'ap-turn-body' + (hasReply ? '' : ' ap-turn-body-files')
        return h('section', { className: 'ap-turn', key: 'turn-' + turn.turn },
          h('div', { className: 'ap-turn-head' },
            h('span', { className: 'ap-turn-no' }, t('turn.label', { n: turn.turn })),
            turn.startTime || turn.endTime ? h('span', { className: 'ap-turn-time' }, formatTime(turn.endTime || turn.startTime)) : null,
            turn.files.length > 0 ? h('span', { className: 'ap-turn-meta' }, t('turn.files', { count: turn.files.length })) : null,
            turn.noArtifacts === true ? h('span', { className: 'ap-chip ap-turn-no-artifacts', title: t('turn.noArtifactsHint') }, t('turn.noArtifacts')) : null,
            turn.reason === 'error' || turn.reason === 'aborted' || turn.reason === 'interrupted' ? h('span', { className: 'ap-turn-meta ap-turn-meta-error' }, t('turn.failed')) : null,
            turn.changes && turn.changes.length > 0 && props.capabilities && props.capabilities.changesReview === true
              ? h('button', {
                type: 'button', className: 'ap-linkbtn ap-turn-changes',
                title: t('action.changesHint'), 'aria-label': t('action.changesHint'),
                onClick: function () { openChangesFor(null, turn) },
              }, iconDiff(12), h('span', null, t('action.changes')))
              : null
          ),
          h('div', { className: bodyClass },
            hasReply ? h('div', { className: 'ap-reply' },
              h('div', { className: 'ap-reply-head' },
                h('span', { className: 'ap-reply-label' }, t('reply.label')),
                longReply ? h('button', {
                  type: 'button', className: 'ap-linkbtn',
                  onClick: function () { setExpanded(function (prev) { const next = Object.assign({}, prev); next[turn.turn] = !isExpanded; return next }) },
                }, isExpanded ? t('reply.collapse') : t('reply.expand')) : null
              ),
              replyTextNode(turn.reply, longReply && !isExpanded)
            ) : null,
            turn.files.length > 0 ? h('div', { className: 'ap-grid' }, sortFiles(turn.files, sortMode).map(function (file) { return card(file, turn) })) : null))
      }

      function segButton(id, label, count) {
        return h('button', {
          type: 'button', className: 'ap-seg-btn', 'data-active': filter === id ? 'true' : 'false',
          'aria-pressed': filter === id ? 'true' : 'false',
          onClick: function () { setFilter(id) },
        }, h('span', null, label), count !== undefined ? h('span', { className: 'ap-seg-count' }, String(count)) : null)
      }

      function scopeButton(id, label) {
        return h('button', {
          type: 'button', className: 'ap-seg-btn', 'data-active': scope === id ? 'true' : 'false',
          'aria-pressed': scope === id ? 'true' : 'false',
          onClick: function () {
            setScope(id)
            setExtraPages(0)
          },
        }, h('span', null, label))
      }

      function dimensionButton(id) {
        return h('button', {
          key: 'dim-' + id, type: 'button', className: 'ap-seg-btn',
          'data-active': dimension === id ? 'true' : 'false',
          'aria-pressed': dimension === id ? 'true' : 'false',
          onClick: function () {
            setUserDimension(id)
            setExtraPages(0)
          },
        }, h('span', null, t('dimension.' + id)))
      }

      function statusLabel(status) {
        if (!status) return ''
        const key = 'status.' + status
        const text = t(key)
        return typeof text === 'string' && text !== '' && text !== key ? text : status
      }

      function isGroupOpen(group) {
        const flag = expandedGroups[group.key]
        if (flag === true) return true
        if (flag === false) return false
        return !compact
      }

      function groupHeader(group) {
        const open = isGroupOpen(group)
        const rows = group.rows || []
        const childIds = group.childIds || []
        const childRowCount = rows.filter(function (row) { return Boolean(row.childId) }).length
        const childBusy = childIds.some(function (childId) { return (childLoading[childId] || 0) > 0 })
        const childFetched = childIds.length > 0 && childIds.every(function (childId) {
          const entry = childCache.current.get(childId)
          return Boolean(entry && !entry.pending && entry.at)
        })
        const childFailed = childIds.some(function (childId) {
          const entry = childCache.current.get(childId)
          return Boolean(entry && entry.error && (entry.rows || []).length === 0)
        })
        const canLoad = settings.showSubagents && childIds.length > 0 && childRowCount === 0 && !childBusy && !childFetched
        const chips = []
        if (group.status) {
          chips.push(h('span', { key: 'status', className: 'ap-chip ap-chip-status', 'data-status': group.status }, statusLabel(group.status)))
        }
        if (!compact) {
          if (group.owner) chips.push(h('span', { key: 'owner', className: 'ap-chip ap-chip-extra' }, t('group.owner', { name: group.owner })))
          if ((group.members || []).length > (group.owner ? 1 : 0)) {
            chips.push(h('span', { key: 'members', className: 'ap-chip ap-chip-extra' }, t('group.members', { count: group.members.length })))
          }
          if (group.kind === 'task' && (group.writeScopes || []).length > 0) {
            const scopes = group.writeScopes
            for (const scope of scopes.slice(0, 2)) {
              chips.push(h('span', { key: 'scope-' + scope, className: 'ap-chip ap-chip-extra ap-group-scope', title: scope }, scope))
            }
            if (scopes.length > 2) {
              chips.push(h('span', { key: 'scope-more', className: 'ap-chip ap-chip-extra' }, t('group.moreScopes', { count: scopes.length - 2 })))
            }
          }
        }
        chips.push(h('span', { key: 'count', className: 'ap-chip ap-chip-count' }, t('turn.files', { count: rows.length })))
        if (!compact && childIds.length > 0) {
          chips.push(h('span', { key: 'children', className: 'ap-chip ap-chip-extra' }, t('group.childCount', { count: childIds.length })))
        }
        const subtitle = group.kind === 'unassigned' ? t('group.unassignedHint') : group.subtitle
        const body = []
        if (open) {
          if (childBusy) body.push(h('div', { key: 'child-loading', className: 'ap-group-loading' }, t('group.loadingChildren')))
          if (canLoad) {
            body.push(h('button', {
              key: 'child-load', type: 'button', className: 'ap-btn ap-group-load',
              onClick: function () { loadGroupChildren(group) },
            }, t('group.loadChildren', { count: childIds.length })))
          }
          body.push(rows.length > 0
            ? h('div', { key: 'grid', className: 'ap-grid' }, sortRows(rows, sortMode).map(function (row) { return card(row, { turn: row.turn }) }))
            : (childBusy || canLoad ? null : h('div', { key: 'note', className: 'ap-group-note' }, childFailed ? t('group.childFailed') : t('group.noChildren'))))
        }
        return h('section', {
          key: group.key,
          className: 'ap-group' + (group.kind === 'unassigned' ? ' ap-group-unassigned' : ''),
          'data-kind': group.kind,
        },
        h('button', {
          type: 'button', className: 'ap-group-head',
          'aria-expanded': open ? 'true' : 'false',
          title: group.subtitle || group.title,
          onClick: function () { toggleGroup(group) },
        },
        h('span', { className: 'ap-group-chevron', 'data-open': open ? 'true' : 'false' }, iconChevron(14)),
        h('span', { className: 'ap-group-titles' },
          h('span', { className: 'ap-group-title' }, group.title),
          subtitle ? h('span', { className: 'ap-group-sub' }, subtitle) : null),
        h('span', { className: 'ap-group-chips' }, chips)),
        body.length > 0 ? h('div', { className: 'ap-group-body' }, body) : null)
      }

      const loading = data.status === 'loading'
      const refreshing = data.status === 'refreshing'
      const content = []
      if (loading) {
        content.push(h('div', { key: 'loading' },
          h('div', { className: 'ap-skel-lines' },
            h('div', { className: 'ap-skel', style: { width: '38%' } }),
            h('div', { className: 'ap-skel', style: { width: '82%' } }),
            h('div', { className: 'ap-skel', style: { width: '64%' } })),
          h('div', { className: 'ap-skel-grid' },
            h('div', { className: 'ap-skel-card' }), h('div', { className: 'ap-skel-card' }), h('div', { className: 'ap-skel-card' }))))
      } else if (data.status === 'error') {
        const info = errorSummary(t, data.error, sessionId)
        content.push(h(ErrorState, {
          key: 'error', t: t,
          title: info.title, body: info.body, code: info.code,
          diagnostics: diagnosticsText(settings, data.error),
          onRetry: function () { setRefreshKey(function (value) { return value + 1 }) },
        }))
      } else if (isTurnsDimension && visibleTurns.length === 0) {
        // Three distinct states: first use (nothing collected yet), filtered
        // empty (list hidden by our own controls, chips can lift each one) and
        // the error state above.
        if (data.turns.length === 0) {
          content.push(h(EmptyNew, { key: 'empty-new', t: t, onSettings: openSettingsDrawer }))
        } else {
          content.push(h(EmptyFiltered, {
            key: 'empty-filtered', t: t,
            chips: emptyChips,
            onClear: clearFilters,
            onShowAll: showAllTurns ? null : function () { setShowAllTurns(true) },
          }))
        }
      } else if (!isTurnsDimension && groupResult.length === 0) {
        if (data.turns.length === 0) {
          content.push(h(EmptyNew, { key: 'empty-new-dimension', t: t, onSettings: openSettingsDrawer }))
        } else {
          content.push(h(EmptyFiltered, {
            key: 'empty-filtered-dimension', t: t,
            chips: emptyChips,
            onClear: function () { setUserDimension('turns'); setExtraPages(0); clearFilters() },
            onShowAll: showAllTurns ? null : function () { setShowAllTurns(true) },
          }))
        }
      } else {
        if (pinned.length > 0 && !showGallery) {
          content.push(h('div', { key: 'pinned', className: 'ap-pinned' },
            h('div', { className: 'ap-pinned-title' }, iconPin(12), h('span', null, t('pinned.title') + ' · ' + pinned.length)),
            h('div', { className: 'ap-grid' }, pinned.map(function (entry) { return card(entry.file, { turn: entry.turn }) }))))
        }
        if (showGallery) {
          content.push(h(ImageGallery, {
            key: 'gallery',
            t: t,
            items: galleryList,
            src: function (file) { return typeof props.gallerySrc === 'function' ? props.gallerySrc(file.path) : fileAddress(sessionId, file.path) },
            onOpen: function (index) { setLightbox(index) },
          }))
        } else if (isTurnsDimension) {
          for (const turn of renderedTurns) content.push(turnSection(turn))
          if (remainingItems > 0) {
            content.push(h('div', { key: 'loadmore', className: 'ap-loadmore' },
              h('button', {
                type: 'button', className: 'ap-btn',
                onClick: function () { setExtraPages(function (value) { return value + 1 }) },
              }, t('pagination.loadOlder', { count: remainingItems }))))
          } else if (settings.pageSize !== 'all' && visibleTurns.length > settings.pageSize) {
            content.push(h('div', { key: 'loadmore-done', className: 'ap-loadmore' },
              h('span', { className: 'ap-loadmore-done' }, t('pagination.shownAll', { count: visibleTurns.length }))))
          }
        } else {
          for (const group of renderedGroups) content.push(groupHeader(group))
          if (remainingItems > 0) {
            content.push(h('div', { key: 'loadmore-groups', className: 'ap-loadmore' },
              h('button', {
                type: 'button', className: 'ap-btn',
                onClick: function () { setExtraPages(function (value) { return value + 1 }) },
              }, t('pagination.loadGroups', { count: remainingItems }))))
          }
        }
      }

      function runSidebarAction(name) {
        setMenuOpen(false)
        const actions = props.sidebarActions
        if (!actions || typeof actions[name] !== 'function') {
          showToast(t('sidebar.actionUnavailable'))
          return
        }
        try {
          const result = actions[name]()
          if (result === false) showToast(t('sidebar.actionUnavailable'))
          if (result === 'split-unavailable') showToast(t('sidebar.splitUnavailable'))
        } catch (error) {
          showToast(t('sidebar.actionUnavailable'))
        }
      }

      function openSidebarTab() {
        try {
          if (typeof props.openSidebar === 'function') props.openSidebar()
          else showToast(t('sidebar.failed'))
        } catch (error) {
          showToast(t('sidebar.failed'))
        }
      }

      function collapseSidebarTab() {
        try {
          if (typeof props.collapseSidebar !== 'function') {
            showToast(t('sidebar.failed'))
            return
          }
          if (props.collapseSidebar() !== false) setSidebarState({ expanded: false, artifactsActive: false })
        } catch (error) {
          showToast(t('sidebar.failed'))
        }
      }


      function filterToggleRow(label, help, active, onToggle) {
        return h('button', {
          type: 'button', className: 'ap-pop-row',
          'aria-pressed': active ? 'true' : 'false',
          title: help || label,
          onClick: onToggle,
        }, h('span', null, label), h('span', { className: 'ap-pop-check', 'aria-hidden': 'true' }, active ? '✓' : ''))
      }

      function filterSegRow(label, options, value, onChange) {
        return h('div', null,
          h('div', { className: 'ap-pop-sub' }, label),
          h('div', { className: 'ap-pop-seg', role: 'group', 'aria-label': label }, (options || []).map(function (option) {
            return h('button', {
              key: String(option.value), type: 'button', className: 'ap-seg-btn',
              'data-active': String(value) === String(option.value) ? 'true' : 'false',
              'aria-pressed': String(value) === String(option.value) ? 'true' : 'false',
              onClick: function () { onChange(option.value) },
            }, option.label)
          })))
      }

      // One popover replaces the three eye toggles + gallery switch: every
      // content/visibility/view control lives here, the toolbar keeps a count.
      function renderFilterPopover() {
        const sessionScope = scope === 'session'
        const sortOptions = [
          { value: 'default', label: t('filter.sort.default') },
          { value: 'time', label: t('filter.sort.time') },
          { value: 'name', label: t('filter.sort.name') },
        ]
        const viewOptions = [
          { value: 'list', label: t('action.list') },
          { value: 'gallery', label: t('action.gallery') },
        ]
        return h('div', { className: 'ap-pop', role: 'dialog', 'aria-label': t('filter.heading'), ref: filterRef },
          h('div', { className: 'ap-pop-head' }, t('filter.heading')),
          sessionScope && isTurnsDimension ? filterToggleRow(t('filter.onlyArtifacts'), t('filter.onlyArtifacts.help'), settings.hideTurnsWithoutArtifacts === true, function () {
            setSettings({ hideTurnsWithoutArtifacts: settings.hideTurnsWithoutArtifacts !== true })
          }) : null,
          sessionScope && isTurnsDimension ? filterToggleRow(t('filter.showAllTurns'), t('filter.showAllTurns.help'), showAllTurns, function () {
            setShowAllTurns(function (value) { return !value })
          }) : null,
          sessionScope && prefs.hidden.length > 0 ? filterToggleRow(t('filter.showHidden'), t('hidden.show', { count: prefs.hidden.length }), showHidden, function () {
            setShowHidden(function (value) { return !value })
          }) : null,
          filter === 'image' && sessionScope && isTurnsDimension ? filterSegRow(t('gallery.viewLabel'), viewOptions, effectiveImageView, function (value) { setImageView(value) }) : null,
          filterSegRow(t('filter.sort'), sortOptions, sortMode, function (value) { setSortMode(value) }),
          h('div', { className: 'ap-pop-divider' }),
          h('button', {
            type: 'button', className: 'ap-pop-row', 'data-filter-action': 'clear',
            disabled: activeFilterCount === 0,
            onClick: function () { clearFilters(); setFilterOpen(false) },
          }, h('span', null, t('filter.clear'))),
          h('div', { className: 'ap-pop-note' }, t('filter.subtitle')))
      }

      // The single export entry point: export items + settings live in ⋯.
      function renderMoreMenu() {
        const rows = []
        if (scope === 'session') {
          const menu = exportMenuModel(t, {
            sessionLogDownload: props.capabilities ? props.capabilities.sessionLogDownload === true : false,
            markdown: markdownReady === true,
          })
          rows.push(h('div', { key: 'export-label', className: 'ap-moremenu-label' }, t('export.menuTitle')))
          for (const item of menu.items) {
            rows.push(h('button', {
              key: item.id, type: 'button', className: 'ap-menu-item', role: 'menuitem',
              'data-export-action': item.id,
              onClick: function () { runExport(item.id) },
            }, iconDownload(14), h('span', null, item.label)))
          }
          if (menu.degraded) rows.push(h('div', { key: 'degraded', className: 'ap-menu-note', 'data-warn': 'true' }, t('export.degraded')))
          rows.push(h('div', { key: 'divider', className: 'ap-pop-divider' }))
        }
        rows.push(h('button', {
          key: 'settings', type: 'button', className: 'ap-menu-item', role: 'menuitem',
          'data-more-action': 'settings',
          onClick: function () { setMoreOpen(false); openSettingsDrawer() },
        }, iconSettings(14), h('span', null, t('more.settings'))))
        return h('div', { className: 'ap-moremenu-panel', role: 'menu' }, rows)
      }
      const layout = props.layout === 'two-column' || props.layout === 'split' ? props.layout : (compact ? 'single' : 'page')
      // The first-run card only appears while the panel has something to show
      // (not during the skeleton or an error), once per machine.
      const onboardingVisible = onboarded !== true && scope === 'session' && data.status !== 'loading' && data.status !== 'error'
      const rootStyle = Object.assign({ fontSize: 'calc(' + settings.fontScale + ' * 1em)' }, densityVariables(settings.density), themeVariables(settings))
      return h('div', {
        className: (compact ? 'ap-page ap-page-sidebar' : 'ap-page') + ' ap-layout-' + layout,
        'data-layout': layout,
        ref: props.rootRef,
        style: rootStyle,
      },
        h('style', null, CSS),
        h('div', { className: 'ap-head' },
          h('div', { className: 'ap-head-inner' },
            h('div', { className: 'ap-title-row' },
              h('div', null,
                h('h1', { className: 'ap-title' }, t('title')),
                compact ? null : h('div', { className: 'ap-sub' }, t('subtitle'))),
              h('div', { className: 'ap-title-actions' },
                h('div', { className: 'ap-stats' }, headerStatsText),
                compact && props.sidebarActions ? h('div', { className: 'ap-tabmenu' },
                  h('button', {
                    type: 'button', className: 'ap-iconbtn',
                    'aria-haspopup': 'menu', 'aria-expanded': menuOpen ? 'true' : 'false',
                    title: t('sidebar.menu'), 'aria-label': t('sidebar.menu'),
                    onClick: function () { setMenuOpen(function (value) { return !value }) },
                  }, iconMore(16)),
                  menuOpen ? h('div', { className: 'ap-tabmenu-panel', role: 'menu', ref: titleMenuRef },
                    h('button', { type: 'button', className: 'ap-tabmenu-item', role: 'menuitem', onClick: function () { runSidebarAction('float') } }, iconSidebar(14), h('span', null, t('sidebar.float'))),
                    h('button', { type: 'button', className: 'ap-tabmenu-item', role: 'menuitem', onClick: function () { runSidebarAction('fullscreen') } }, iconExpand(14), h('span', null, t('sidebar.fullscreen'))),
                    h('button', { type: 'button', className: 'ap-tabmenu-item', role: 'menuitem', onClick: function () { runSidebarAction('split') } }, iconSplit(14), h('span', null, t('sidebar.split')))) : null) : null)),
            h('div', { className: 'ap-toolbar' },
              // identity: what am I looking at
              h('div', { className: 'ap-toolbar-zone ap-toolbar-identity' },
                h('div', { className: 'ap-seg ap-scopeseg', role: 'group', 'aria-label': t('scope.label') },
                  scopeButton('session', t('scope.session')),
                  settings.crossSessionIndex === true ? scopeButton('all', t('scope.all')) : null),
                scope === 'session' ? h('div', { className: 'ap-seg ap-dimseg', role: 'group', 'aria-label': t('dimension.label') },
                  dimensionButton('turns'), dimensionButton('tasks'), dimensionButton('runs')) : null),
              // filter: what content is shown + search + the merged filter popover
              h('div', { className: 'ap-toolbar-zone ap-toolbar-filter' },
                h('div', { className: 'ap-seg', role: 'group', 'aria-label': t('title') },
                  segButton('all', t('filter.all'), scope === 'session' ? counts.all : undefined),
                  segButton('doc', t('filter.docs'), scope === 'session' ? counts.doc : undefined),
                  segButton('image', t('filter.images'), scope === 'session' ? counts.image : undefined),
                  segButton('file', t('filter.files'), scope === 'session' ? counts.file : undefined)),
                h('label', { className: 'ap-search' },
                  h('span', { className: 'ap-search-icon' }, iconSearch(14)),
                  h('input', {
                    type: 'search', value: query, placeholder: scope === 'all' ? t('all.search.placeholder') : t('search.placeholder'),
                    'aria-label': t('search.placeholder'),
                    onChange: function (event) { setQuery(event.target.value) },
                  })),
                h('div', { className: 'ap-filter-wrap' },
                  h('button', {
                    type: 'button', className: 'ap-btn ap-filterbtn',
                    'data-active': activeFilterCount > 0 ? 'true' : 'false',
                    'data-filter-open': filterOpen ? 'true' : 'false',
                    'aria-haspopup': 'dialog', 'aria-expanded': filterOpen ? 'true' : 'false',
                    'aria-label': t('filter.open') + (activeFilterCount > 0 ? ' · ' + t('filter.activeCount', { count: activeFilterCount }) : ''),
                    title: t('filter.open'),
                    onClick: toggleFilterPopover,
                  }, iconFilter(14), compact ? null : h('span', null, t('filter.open')),
                    activeFilterCount > 0 ? h('span', { className: 'ap-seg-count' }, String(activeFilterCount)) : h('span', { className: 'ap-filter-caret', 'aria-hidden': 'true' }, '▾')),
                  filterOpen ? renderFilterPopover() : null)),
              // actions: refresh / settings / sidebar / export-and-more
              h('div', { className: 'ap-toolbar-zone ap-toolbar-actions' },
                h('button', {
                  type: 'button', className: 'ap-btn', disabled: scope === 'all' ? allIndex.status === 'loading' : refreshing,
                  title: (scope === 'all' ? allIndex.status === 'loading' : refreshing) ? t('refreshing') : t('refresh'),
                  'aria-label': t('refresh'),
                  onClick: function () { setRefreshKey(function (value) { return value + 1 }) },
                }, iconRefresh(14, scope === 'all' ? allIndex.status === 'loading' : refreshing), compact ? null : h('span', null, t('refresh'))),
                h('button', {
                  type: 'button', className: 'ap-btn',
                  title: t('settings.open'), 'aria-label': t('settings.open'), 'data-settings-open': 'true',
                  onClick: openSettingsDrawer,
                }, iconSettings(14), compact ? null : h('span', null, t('settings.open'))),
                compact ? null : (function () {
                  const collapsing = sidebarState.expanded === true && sidebarState.artifactsActive === true
                  return h('button', {
                    type: 'button', className: 'ap-btn',
                    'data-sidebar-state': collapsing ? 'collapse' : 'open',
                    'aria-pressed': collapsing ? 'true' : 'false',
                    title: collapsing ? t('sidebar.collapseHint') : t('sidebar.open'),
                    'aria-label': collapsing ? t('sidebar.collapse') : t('sidebar.open'),
                    onClick: collapsing ? collapseSidebarTab : openSidebarTab,
                  }, iconSidebar(14), h('span', null, collapsing ? t('sidebar.collapse') : t('sidebar.open')))
                })(),
                h('div', { className: 'ap-moremenu', ref: moreRef },
                  h('button', {
                    type: 'button', className: 'ap-btn',
                    'data-active': moreOpen ? 'true' : 'false',
                    title: t('more.menu'), 'aria-label': t('more.menu'),
                    'aria-haspopup': 'menu', 'aria-expanded': moreOpen ? 'true' : 'false',
                    onClick: toggleMoreMenu,
                  }, iconMore(14), compact ? null : h('span', null, t('more.menu'))),
                  moreOpen ? renderMoreMenu() : null)))
            )),
        h('div', { className: 'ap-body' },
          scope === 'all'
            ? h('div', { className: 'ap-content' },
              h(AllSessionsView, {
                t: t,
                index: allIndex.data,
                status: allIndex.status,
                error: allIndex.error,
                sessionId: sessionId,
                settings: settings,
                query: query,
                filter: filter,
                hiddenSet: hiddenSet,
                isArchived: props.isArchived,
                readIndexFile: props.readIndexFile,
                openSessionById: props.openSessionById,
                renderCard: card,
                sortMode: sortMode,
                onRetry: function () { setRefreshKey(function (value) { return value + 1 }) },
                tick: pollTick + indexTick,
              }))
            : h('div', { className: 'ap-content' },
              onboardingVisible ? h(OnboardingCard, {
                key: 'onboarding', t: t,
                onDismiss: function () { setOnboarded(true) },
                onSettings: openSettingsDrawer,
              }) : null,
              data.error && data.turns.length > 0 ? h('div', { className: 'ap-error' },
                h('span', { title: String(data.error) }, t('error.banner', { message: errorSummary(t, data.error, sessionId).body })),
                h('button', { type: 'button', className: 'ap-linkbtn', onClick: function () { setRefreshKey(function (value) { return value + 1 }) } }, t('error.retry'))) : null,
              content)),
        filterOpen ? h('div', { className: 'ap-menu-backdrop-card', onClick: function () { setFilterOpen(false) } }) : null,
        menuOpen && compact ? h('div', { className: 'ap-menu-backdrop', onClick: function () { setMenuOpen(false) } }) : null,
        cardMenu !== null ? h('div', { className: 'ap-menu-backdrop-card', onClick: function () { setCardMenu(null) } }) : null,
        moreOpen ? h('div', { className: 'ap-menu-backdrop-card', onClick: function () { setMoreOpen(false) } }) : null,
        settingsOpen ? h('div', {
          className: 'ap-drawer-backdrop',
          onClick: function (event) { if (event.target === event.currentTarget) closeSettingsDrawer() },
        },
        h('aside', {
          className: 'ap-drawer', role: 'dialog', 'aria-modal': 'true',
          'aria-label': t('settings.title'), tabIndex: -1, ref: settingsRef,
          onClick: function (event) { event.stopPropagation() },
        },
        h('div', { className: 'ap-drawer-head' },
          h('div', { className: 'ap-drawer-title' }, t('settings.title')),
          h('button', {
            type: 'button', className: 'ap-iconbtn ap-drawer-close',
            title: t('gallery.close'), 'aria-label': t('gallery.close'),
            onClick: closeSettingsDrawer,
          }, iconClose(14))),
        h('div', { className: 'ap-drawer-body' }, h(SettingsPage, { t: t, embedded: true })))) : null,
        lightbox !== null && galleryList.length > 0 ? h(GalleryLightbox, {
          t: t,
          items: galleryList,
          index: Math.min(lightbox, galleryList.length - 1),
          settings: settings,
          src: function (file) { return typeof props.gallerySrc === 'function' ? props.gallerySrc(file.path) : fileAddress(sessionId, file.path) },
          onClose: function () { setLightbox(null) },
          onStep: function (step) {
            setLightbox(function (previous) {
              const next = (previous === null ? 0 : previous) + step
              if (next < 0) return 0
              if (next >= galleryList.length) return galleryList.length - 1
              return next
            })
          },
        }) : null,
        toast ? h('div', { className: 'ap-toast', role: 'status' }, toast) : null)
    }

    function AllSessionsView(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const index = props.index || null
      const settings = props.settings || getSettings()
      const query = props.query || ''
      const filter = props.filter || 'all'
      const hiddenSet = props.hiddenSet || new Set()
      const isArchived = typeof props.isArchived === 'function' ? props.isArchived : function () { return false }
      const reader = props.readIndexFile
      const currentSessionId = props.sessionId || ''
      const [cacheVersion, setCacheVersion] = React.useState(0)
      const [selectedSid, setSelectedSid] = React.useState('')
      const [collapsed, setCollapsed] = React.useState({})
      const [includeArchived, setIncludeArchived] = React.useState(false)
      const [includeSubagents, setIncludeSubagents] = React.useState(true)
      const [panelLimit, setPanelLimit] = React.useState(60)
      const [searchBusy, setSearchBusy] = React.useState(0)
      const cacheRef = React.useRef(new Map())
      const indexRef = React.useRef(null)

      React.useEffect(function () {
        const previous = indexRef.current
        if (previous && index) {
          for (const sid of Object.keys(index.sessions)) {
            const before = previous.sessions[sid]
            if (!before || before.n !== index.sessions[sid].n) cacheRef.current.delete(sid)
          }
        }
        indexRef.current = index
      }, [index])

      function loadRows(sid, options) {
        const opts = options || {}
        if (typeof reader !== 'function') return Promise.reject(new Error('INDEX_READER_UNAVAILABLE'))
        const cache = cacheRef.current
        const previous = cache.get(sid)
        if (previous && previous.pending) return previous.promise
        const fresh = Boolean(previous && previous.rows && previous.at && Date.now() - previous.at < INDEX_CACHE_TTL)
        if (fresh && opts.force !== true) return Promise.resolve(previous.rows)
        const entry = {
          rows: previous && previous.rows ? previous.rows : [],
          at: previous ? previous.at : 0,
          version: previous ? previous.version : '',
          pending: true,
          error: '',
          promise: null,
        }
        const promise = Promise.resolve()
          .then(function () { return reader(sessionIndexFilePath(sid), opts.signal) })
          .then(function (result) {
            if (!result || typeof result.text !== 'string') throw new Error('BAD_SESSION_INDEX')
            const version = result.version || ''
            const unchanged = previous && previous.rows && version !== '' && previous.version === version
            entry.rows = unchanged ? previous.rows : parseSessionIndexPayload(result.text, sid).rows
            entry.version = version
            entry.at = Date.now()
            entry.pending = false
            if (!unchanged) setCacheVersion(function (value) { return value + 1 })
            return entry.rows
          }, function (error) {
            entry.pending = false
            entry.error = error && error.message ? String(error.message) : String(error)
            setCacheVersion(function (value) { return value + 1 })
            throw error
          })
        entry.promise = promise
        cache.set(sid, entry)
        return promise
      }

      const tree = React.useMemo(function () {
        try {
          return buildAllSessionTree(index, {
            query: query,
            filter: filter,
            settings: settings,
            hiddenSet: hiddenSet,
            showHidden: false,
            includeArchived: includeArchived,
            includeSubagents: includeSubagents,
            cache: cacheRef.current,
            isArchived: isArchived,
          })
        } catch (error) {
          return { workspaces: [], total: 0 }
        }
      }, [index, query, filter, settings, hiddenSet, includeArchived, includeSubagents, cacheVersion, props.tick])

      const nodeById = React.useMemo(function () {
        const map = new Map()
        function visit(node) {
          map.set(node.id, node)
          for (const child of node.children) visit(child)
        }
        for (const workspace of tree.workspaces) for (const node of workspace.sessions) visit(node)
        return map
      }, [tree])

      function firstSessionId() {
        for (const workspace of tree.workspaces) {
          if (workspace.sessions.length > 0) return workspace.sessions[0].id
        }
        return ''
      }

      const activeSid = selectedSid && nodeById.has(selectedSid) ? selectedSid : firstSessionId()
      const activeNode = activeSid ? nodeById.get(activeSid) : null

      React.useEffect(function () {
        if (!index || !activeSid || typeof reader !== 'function') return undefined
        const controller = new AbortController()
        loadRows(activeSid, { signal: controller.signal }).catch(function () { /* surfaced in the panel */ })
        return function () { controller.abort() }
      }, [index, activeSid, reader])

      React.useEffect(function () {
        setPanelLimit(60)
      }, [activeSid, query, filter])

      React.useEffect(function () {
        const needle = query.trim().toLowerCase()
        if (!index || needle === '' || typeof reader !== 'function') {
          setSearchBusy(0)
          return undefined
        }
        const controller = new AbortController()
        let stopped = false
        let cursor = 0
        let active = 0
        const ids = Object.keys(index.sessions).filter(function (sid) {
          const meta = index.sessions[sid]
          if (!meta || meta.c <= 0) return false
          if (!includeSubagents && meta.p) return false
          if (!includeArchived && isArchived(sid)) return false
          return true
        }).slice(0, INDEX_SEARCH_LIMIT)
        setSearchBusy(ids.length)
        function drain() {
          if (stopped) return
          while (active < 3 && cursor < ids.length) {
            const sid = ids[cursor]
            cursor += 1
            active += 1
            loadRows(sid, { signal: controller.signal }).catch(function () { /* one unreadable session must not stop the search */ }).then(function () {
              active -= 1
              if (!stopped) setSearchBusy(function (value) { return Math.max(0, value - 1) })
              drain()
            })
          }
        }
        drain()
        return function () {
          stopped = true
          controller.abort()
          setSearchBusy(0)
        }
      }, [index, query, includeArchived, includeSubagents])

      function toggleCollapse(key) {
        setCollapsed(function (previous) {
          const next = Object.assign({}, previous)
          if (next[key] === true) delete next[key]
          else next[key] = true
          return next
        })
      }

      function selectSession(sid) {
        setSelectedSid(sid)
        setPanelLimit(60)
      }

      function sessionTitle(node) {
        return t('all.session.label', { id: String(node.id).slice(0, 8) })
      }

      function sessionBadges(node) {
        const badges = []
        if (node.id === currentSessionId) badges.push(h('span', { key: 'current', className: 'ap-sess-badge ap-sess-badge-current' }, t('all.session.current')))
        if (node.meta.p) badges.push(h('span', { key: 'sub', className: 'ap-sess-badge ap-sess-badge-sub' }, t('all.session.subagent')))
        if (isArchived(node.id)) badges.push(h('span', { key: 'archived', className: 'ap-sess-badge ap-sess-badge-archived' }, t('all.session.archived')))
        return badges
      }

      function renderNode(node, isChild) {
        const open = collapsed[node.id] !== true
        const hasChildren = node.children.length > 0
        return h('div', { key: 'sess-' + node.id },
          // Real buttons, not a role=button wrapper: the chevron expands and
          // the title selects, so both are Tab-reachable and nested-interactive
          // free (aria-expanded lives on the chevron).
          h('div', {
            className: 'ap-sess',
            'data-active': node.id === activeSid ? 'true' : 'false',
            'data-child': isChild ? 'true' : 'false',
            title: node.meta.w || node.id,
          },
          h('button', {
            type: 'button', className: 'ap-sess-chevron',
            'data-open': open ? 'true' : 'false',
            'data-leaf': hasChildren ? 'false' : 'true',
            'aria-expanded': hasChildren ? (open ? 'true' : 'false') : undefined,
            'aria-label': hasChildren ? (open ? t('all.session.collapse') : t('all.session.expand')) : undefined,
            disabled: !hasChildren,
            onClick: function (event) {
              event.stopPropagation()
              if (hasChildren) toggleCollapse(node.id)
            },
          }, iconChevron(12)),
          h('button', {
            type: 'button', className: 'ap-sess-main',
            'aria-current': node.id === activeSid ? 'true' : undefined,
            onClick: function () { selectSession(node.id) },
          },
          h('span', { className: 'ap-sess-title' }, (isChild ? '↳ ' : '') + sessionTitle(node)),
          h('span', { className: 'ap-sess-meta' },
            h('span', null, t('all.session.count', { files: node.meta.c, turns: node.meta.t })),
            node.meta.u ? h('span', null, formatTime(node.meta.u)) : null,
            sessionBadges(node)))),
          hasChildren && open ? h('div', null, node.children.map(function (child) { return renderNode(child, true) })) : null)
      }

      function renderWorkspace(workspace) {
        const key = 'ws:' + workspace.key
        const open = collapsed[key] !== true
        return h('div', { className: 'ap-ws', key: key },
          h('button', {
            type: 'button', className: 'ap-ws-head',
            'aria-expanded': open ? 'true' : 'false',
            onClick: function () { toggleCollapse(key) },
          },
          h('span', { className: 'ap-ws-chevron', 'data-open': open ? 'true' : 'false' }, iconChevron(12)),
          h('span', { className: 'ap-ws-main' },
            h('span', { className: 'ap-ws-title' }, workspace.title || t('all.workspace.unnamed')),
            workspace.root ? h('span', { className: 'ap-ws-sub', title: workspace.root }, workspace.root) : null),
          h('span', { className: 'ap-ws-count' }, t('all.workspace.count', { sessions: workspace.count }))),
          open ? h('div', { className: 'ap-ws-body' }, workspace.sessions.map(function (node) { return renderNode(node, false) })) : null)
      }

      const activeMeta = activeSid && index ? index.sessions[activeSid] : null
      const activeEntry = activeSid ? cacheRef.current.get(activeSid) : null
      const activeRows = activeEntry && Array.isArray(activeEntry.rows) ? activeEntry.rows : []
      const needle = query.trim().toLowerCase()
      const visibleRows = activeRows.filter(function (row) {
        return rowMatches(row, needle, filter, settings, hiddenSet, false)
      })
      const shownRows = sortRows(visibleRows, props.sortMode).slice(0, panelLimit)

      function retryIndex() {
        if (typeof props.onRetry === 'function') props.onRetry()
      }

      function renderState() {
        if (props.status === 'loading' || props.status === 'idle') {
          return h('div', { className: 'ap-skel-lines' },
            h('div', { className: 'ap-skel', style: { width: '38%' } }),
            h('div', { className: 'ap-skel', style: { width: '82%' } }),
            h('div', { className: 'ap-skel', style: { width: '64%' } }))
        }
        // Three failure classes get distinct copy: missing service, missing
        // index file (host backfills it), denied path. The raw message stays
        // folded in <details> so it never reads like the product crashed.
        let title = t('all.missing.title')
        let body = t('all.missing.body')
        let icon = iconFolder(22)
        if (props.status === 'unavailable') {
          title = t('all.unavailable.title')
          body = t('all.unavailable.body')
          icon = iconWarning(22)
        } else if (props.status === 'denied') {
          title = t('all.denied.title')
          body = t('all.denied.body')
          icon = iconWarning(22)
        } else if (props.status === 'invalid') {
          title = t('all.invalid.title')
          body = t('all.invalid.body')
        } else if (props.status === 'error') {
          title = t('all.error.title')
          body = t('all.error.body')
          icon = iconWarning(22)
        }
        return h('div', { className: 'ap-state ap-all-state', 'data-state': props.status || 'missing' },
          h('div', { className: 'ap-state-icon' }, icon),
          h('div', { className: 'ap-state-title' }, title),
          h('div', { className: 'ap-state-body' }, body),
          props.error ? h('details', { className: 'ap-state-details' },
            h('summary', null, t('all.details')),
            h('code', { className: 'ap-state-code' }, String(props.error))) : null,
          h('div', { className: 'ap-state-actions' },
            h('button', { type: 'button', className: 'ap-btn', onClick: retryIndex }, t('all.retry'))))
      }

      if (props.status !== 'ready' || !index) {
        return h('div', { className: 'ap-all' }, renderState())
      }

      const bar = [
        h('button', {
          key: 'archived', type: 'button', className: 'ap-btn',
          'data-active': includeArchived ? 'true' : 'false',
          'aria-pressed': includeArchived ? 'true' : 'false',
          onClick: function () { setIncludeArchived(function (value) { return !value }) },
        }, t('all.filters.archived')),
        h('button', {
          key: 'subagents', type: 'button', className: 'ap-btn',
          'data-active': includeSubagents ? 'true' : 'false',
          'aria-pressed': includeSubagents ? 'true' : 'false',
          onClick: function () { setIncludeSubagents(function (value) { return !value }) },
        }, t('all.filters.subagents')),
      ]
      if (index.backfill && index.backfill.running) {
        bar.push(h('span', { key: 'progress', className: 'ap-all-progress' }, t('all.progress', { done: index.backfill.done, total: index.backfill.total })))
      }
      if (index.mode === 'projection') {
        bar.push(h('span', { key: 'degraded', className: 'ap-all-degraded' }, t('all.degraded')))
      }
      if (index.generatedAt) {
        bar.push(h('span', { key: 'updated' }, t('all.updated', { time: formatTime(index.generatedAt) })))
      }
      if (needle && searchBusy > 0) {
        bar.push(h('span', { key: 'searching' }, t('all.search.running', { count: searchBusy })))
      }

      const panel = []
      if (!activeSid) {
        panel.push(h('div', { key: 'empty', className: 'ap-all-empty' }, t('all.empty')))
      } else {
        const heading = sessionTitle({ id: activeSid })
        panel.push(h('div', { key: 'head', className: 'ap-all-panel-head' },
          h('div', null,
            h('div', { className: 'ap-all-panel-title' }, heading),
            h('div', { className: 'ap-all-panel-sub' },
              (activeMeta && activeMeta.w ? activeMeta.w + ' · ' : '') + (activeMeta ? t('all.session.count', { files: activeMeta.c, turns: activeMeta.t }) : ''),
              activeMeta && activeMeta.u ? ' · ' + formatTime(activeMeta.u) : '')),
          h('div', { className: 'ap-all-panel-actions' },
            typeof props.openSessionById === 'function'
              ? h('button', {
                type: 'button', className: 'ap-btn',
                onClick: function () {
                  try { props.openSessionById(activeSid) } catch (error) { /* workspace refusal must not close the panel */ }
                },
              }, iconExternal(14), h('span', null, t('all.session.open')))
              : null,
            h('button', {
              type: 'button', className: 'ap-btn',
              onClick: function () {
                loadRows(activeSid, { force: true }).catch(function () { /* surfaced below */ })
              },
            }, iconRefresh(14), h('span', null, t('refresh'))))))
        if (activeEntry && activeEntry.pending) {
          panel.push(h('div', { key: 'loading', className: 'ap-all-note' }, t('all.session.loading')))
        } else if (activeEntry && activeEntry.error) {
          const kind = classifyIndexError(activeEntry.error)
          panel.push(h('div', { key: 'failed', className: 'ap-all-note' },
            t('all.session.failed') + ' · ' + (kind === 'unavailable' ? t('all.session.serviceUnavailable') : kind === 'denied' ? t('all.denied.title') : String(activeEntry.error))))
        } else if (shownRows.length === 0) {
          panel.push(h('div', { key: 'empty', className: 'ap-all-empty' }, needle ? t('all.session.searchEmpty') : t('all.session.empty')))
        } else {
          panel.push(h('div', { key: 'grid', className: 'ap-grid' }, shownRows.map(function (row) {
            return props.renderCard(row, { turn: row.turn }, activeSid)
          })))
          if (visibleRows.length > shownRows.length) {
            panel.push(h('div', { key: 'more', className: 'ap-loadmore' },
              h('button', {
                type: 'button', className: 'ap-btn',
                onClick: function () { setPanelLimit(function (value) { return value + 60 }) },
              }, t('all.loadMore', { count: visibleRows.length - shownRows.length }))))
          }
        }
      }
      panel.unshift(h('div', { key: 'bar', className: 'ap-all-bar' }, bar))

      const treeBody = tree.workspaces.length > 0
        ? tree.workspaces.map(renderWorkspace)
        : h('div', { className: 'ap-all-empty' }, t('all.empty'))

      return h('div', { className: 'ap-all' },
        h('div', { className: 'ap-all-body' },
          h('div', { className: 'ap-all-tree' }, treeBody),
          h('div', { className: 'ap-all-panel' }, panel)))
    }

    function SettingsSeg(props) {
      return h('div', { className: 'ap-settings-seg', role: 'group', 'aria-label': props.label },
        props.options.map(function (option) {
          return h('button', {
            key: String(option.value), type: 'button', className: 'ap-settings-segbtn',
            'data-active': String(props.value) === String(option.value) ? 'true' : 'false',
            onClick: function () { props.onChange(option.value) },
          }, option.label)
        }))
    }

    function SettingsSwitch(props) {
      return h('button', {
        type: 'button', className: 'ap-settings-switch', role: 'switch',
        'aria-checked': props.value ? 'true' : 'false', 'data-on': props.value ? 'true' : 'false',
        'aria-label': props.label, title: props.label,
        onClick: function () { props.onChange(!props.value) },
      }, h('span'))
    }

    function SettingsRow(props) {
      return h('div', { className: 'ap-settings-row' },
        h('div', { className: 'ap-settings-main' },
          h('div', { className: 'ap-settings-label' }, props.label),
          props.help ? h('div', { className: 'ap-settings-help' }, props.help) : null),
        h('div', { className: 'ap-settings-control' }, props.children))
    }

    function SettingsGroup(props) {
      return h('div', { className: 'ap-settings-group' },
        h('div', { className: 'ap-settings-group-title' }, props.title),
        props.help ? h('div', { className: 'ap-settings-group-help' }, props.help) : null,
        props.children)
    }

    function SettingsPage(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const settings = useSettings()
      const [indexStats] = React.useState(readIndexStats)
      const [indexDirValue, setIndexDirValue] = React.useState(readIndexDirOverride)
      const [rebuildStatus, setRebuildStatus] = React.useState('')
      function updateIndexDir(value) {
        setIndexDirValue(value)
        writeIndexDirOverride(value)
      }
      function rebuildIndex() {
        if (rebuildStatus === 'busy') return
        setRebuildStatus('busy')
        if (typeof fetch !== 'function') {
          setRebuildStatus('unavailable')
          return
        }
        fetch(INDEX_ROUTE_PREFIX + '/rebuild', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
          .then(function (response) {
            if (response && (response.status === 202 || response.ok === true)) setRebuildStatus('done')
            else setRebuildStatus('unavailable')
          }, function () {
            setRebuildStatus('unavailable')
          })
      }
      const scalePresets = FONT_PRESETS.map(function (value) {
        return { value: value, label: formatScale(value) }
      })
      const hostPx = useHostFontPixels()
      const actualPx = Math.round(hostPx * settings.fontScale)
      const densityOptions = [
        { value: 'compact', label: t('settings.density.compact') },
        { value: 'standard', label: t('settings.density.standard') },
        { value: 'relaxed', label: t('settings.density.relaxed') },
      ]
      const pageOptions = [
        { value: 10, label: t('settings.page.10') },
        { value: 20, label: t('settings.page.20') },
        { value: 50, label: t('settings.page.50') },
        { value: 'all', label: t('settings.page.all') },
      ]
      const dimensionOptions = [
        { value: 'auto', label: t('dimension.auto') },
        { value: 'turns', label: t('dimension.turns') },
        { value: 'tasks', label: t('dimension.tasks') },
        { value: 'runs', label: t('dimension.runs') },
      ]
      const imageViewOptions = [
        { value: 'list', label: t('settings.view.list') },
        { value: 'gallery', label: t('settings.view.gallery') },
      ]
      const themeOptions = [
        { value: 'inherit', label: t('settings.theme.mode.inherit') },
        { value: 'dark', label: t('settings.theme.mode.dark') },
        { value: 'light', label: t('settings.theme.mode.light') },
      ]
      function update(patch) { setSettings(patch) }
      function switchRow(label, help, key) {
        return h(SettingsRow, { key: key, label: label, help: help },
          h(SettingsSwitch, {
            value: settings[key] === true,
            label: label,
            onChange: function (value) {
              const patch = {}
              patch[key] = value
              update(patch)
            },
          }))
      }
      const embedded = props.embedded === true
      return h('section', {
        className: settings.themeMode === 'inherit' ? 'ap-settings' : 'ap-settings ap-settings-forced',
        style: themeVariables(settings),
      },
        embedded ? null : h('style', null, CSS),
        embedded ? null : h('h2', { className: 'ap-settings-title' }, t('settings.title')),
        h('p', { className: 'ap-settings-intro' }, t('settings.intro')),
        // 1/6 — type and density (theme lives under the same card)
        h(SettingsGroup, { title: t('settings.section.font'), help: t('settings.font.groupHelp') },
          h(SettingsRow, { label: t('settings.fontSize.label'), help: t('settings.fontSize.help') },
            h('div', { className: 'ap-settings-scale-control' },
              h('div', { className: 'ap-settings-scale' },
                h('input', {
                  type: 'range', min: String(MIN_FONT_SCALE), max: String(MAX_FONT_SCALE), step: '0.1',
                  value: String(settings.fontScale), 'aria-label': t('settings.fontSize.label'),
                  onChange: function (event) { update({ fontScale: normalizeFontScale(event.target.value) }) },
                }),
                h('span', { className: 'ap-settings-scale-value' }, formatScale(settings.fontScale))),
              h('div', { className: 'ap-settings-presets' },
                scalePresets.map(function (option) {
                  return h('button', {
                    key: String(option.value), type: 'button', className: 'ap-settings-preset',
                    'data-active': Math.abs(option.value - settings.fontScale) < 0.001 ? 'true' : 'false',
                    onClick: function () { update({ fontScale: option.value }) },
                  }, option.label)
                })),
              h('div', { className: 'ap-settings-actual' }, t('settings.fontScale.actual', { px: actualPx })))),
          h(SettingsRow, { label: t('settings.density.label'), help: t('settings.density.help') },
            h(SettingsSeg, {
              label: t('settings.density.label'), options: densityOptions, value: settings.density,
              onChange: function (value) { update({ density: value }) },
            })),
          h('div', { className: 'ap-settings-preview', style: { fontSize: settings.fontScale + 'em' } },
            h('span', null, t('settings.fontSize.preview') + ' · ' + formatScale(settings.fontScale))),
          h('div', { className: 'ap-settings-subtitle' }, t('settings.section.theme')),
          h('div', { className: 'ap-settings-help' }, t('settings.theme.help')),
          h(SettingsRow, { label: t('settings.theme.mode'), help: t('settings.theme.mode.help') },
            h(SettingsSeg, {
              label: t('settings.theme.mode'), options: themeOptions, value: settings.themeMode,
              onChange: function (value) { update({ themeMode: value }) },
            })),
          h(SettingsRow, { label: t('settings.theme.accent'), help: t('settings.theme.accent.help') },
            h('div', { className: 'ap-theme-swatches', role: 'radiogroup', 'aria-label': t('settings.theme.accent') },
              ACCENT_CHOICES.map(function (id) {
                const label = t('settings.accent.' + id)
                const active = settings.accentColor === id
                return h('button', {
                  key: id, type: 'button', className: 'ap-theme-swatch', role: 'radio',
                  'data-accent': id, 'data-active': active ? 'true' : 'false',
                  'aria-checked': active ? 'true' : 'false', 'aria-label': label, title: label,
                  style: { '--ap-swatch': accentSwatchColor(settings, id) },
                  onClick: function () { update({ accentColor: id }) },
                })
              }))),
          h('div', { className: 'ap-theme-preview' },
            h('div', { className: 'ap-theme-preview-title' }, t('settings.theme.previewTitle')),
            h('div', { className: 'ap-theme-preview-body' }, t('settings.theme.previewBody')),
            h('div', { className: 'ap-theme-preview-actions' },
              h('span', { className: 'ap-theme-preview-btn' }, t('settings.theme.previewButton')),
              h('span', { className: 'ap-theme-preview-chip' }, t('settings.theme.previewChip'))))),
        // 2/6 — included content + default image view
        h(SettingsGroup, { title: t('settings.section.content'), help: t('settings.content.help') },
          switchRow(t('settings.content.replies'), null, 'showReplies'),
          switchRow(t('settings.content.docs'), null, 'showDocs'),
          switchRow(t('settings.content.images'), null, 'showImages'),
          switchRow(t('settings.content.files'), null, 'showFiles'),
          h('div', { className: 'ap-settings-help' }, t('settings.sourceLimit')),
          h(SettingsRow, { label: t('settings.imageView.label'), help: t('settings.imageView.help') },
            h(SettingsSeg, {
              label: t('settings.imageView.label'), options: imageViewOptions, value: settings.imageView,
              onChange: function (value) { update({ imageView: value }) },
            }))),
        // 3/6 — noise filters
        h(SettingsGroup, { title: t('settings.section.noise'), help: t('settings.noise.groupHelp') },
          switchRow(t('settings.noise.hideNoArtifacts'), t('settings.noise.hideNoArtifacts.help'), 'hideTurnsWithoutArtifacts'),
          switchRow(t('settings.noise.hideShort'), t('settings.noise.hideShort.help'), 'hideShortReplies'),
          h(SettingsRow, { label: t('settings.noise.threshold'), help: t('settings.noise.threshold.help') },
            h('input', {
              type: 'number', min: 0, max: 200, className: 'ap-settings-input',
              value: String(settings.shortReplyThreshold),
              'aria-label': t('settings.noise.threshold'),
              onChange: function (event) {
                const next = Number(event.target.value)
                update({ shortReplyThreshold: Number.isFinite(next) ? Math.max(0, Math.min(200, Math.round(next))) : 0 })
              },
            }),
            h('span', { className: 'ap-settings-unit' }, t('settings.noise.unit'))),
          h(SettingsRow, { label: t('settings.noise.keywords'), help: t('settings.noise.keywords.help') },
            h('input', {
              type: 'text', className: 'ap-settings-input ap-settings-input-wide',
              value: settings.ignoreKeywords, placeholder: DEFAULT_SETTINGS.ignoreKeywords,
              'aria-label': t('settings.noise.keywords'),
              onChange: function (event) { update({ ignoreKeywords: event.target.value }) },
            }))),
        // 4/6 — grouping and subagents
        h(SettingsGroup, { title: t('settings.section.grouping'), help: t('settings.grouping.groupHelp') },
          h(SettingsRow, { label: t('settings.defaultDimension.label'), help: t('settings.defaultDimension.help') },
            h(SettingsSeg, {
              label: t('settings.defaultDimension.label'), options: dimensionOptions, value: settings.defaultDimension,
              onChange: function (value) { update({ defaultDimension: value }) },
            })),
          switchRow(t('settings.showSubagents'), t('settings.showSubagents.help'), 'showSubagents'),
          switchRow(t('settings.showUnassigned'), t('settings.showUnassigned.help'), 'showUnassigned')),
        // 5/6 — view, floating bar, first-run guide and pagination
        h(SettingsGroup, { title: t('settings.section.view'), help: t('settings.view.groupHelp') },
          switchRow(t('settings.renderMarkdown'), t('settings.renderMarkdown.help'), 'renderMarkdown'),
          switchRow(t('settings.floatingBar'), t('settings.floatingBar.help'), 'showFloatingBar'),
          switchRow(t('settings.autoOpenSidebar'), t('settings.autoOpenSidebar.help'), 'autoOpenSidebar'),
          h(SettingsRow, { label: t('settings.onboarding.label'), help: t('settings.onboarding.help') },
            h('button', {
              type: 'button', className: 'ap-btn', 'data-settings-action': 'onboarding-reset',
              onClick: function () { setOnboardingSeen(false) },
            }, t('settings.onboarding.reset'))),
          h('div', { className: 'ap-settings-subtitle' }, t('settings.section.pagination')),
          h('div', { className: 'ap-settings-help' }, t('settings.pageSize.help')),
          h(SettingsRow, { label: t('settings.pageSize.label') },
            h(SettingsSeg, {
              label: t('settings.pageSize.label'), options: pageOptions, value: settings.pageSize,
              onChange: function (value) { update({ pageSize: value }) },
            }))),
        // 6/6 — cross-session index
        h(SettingsGroup, { title: t('settings.section.crossSession'), help: t('settings.crossSession.groupHelp') },
          switchRow(t('settings.crossSession'), t('settings.crossSession.help'), 'crossSessionIndex'),
          h(SettingsRow, { label: t('settings.indexDir.label'), help: t('settings.indexDir.help') },
            h('input', {
              type: 'text', className: 'ap-settings-input ap-settings-input-wide',
              value: indexDirValue, placeholder: t('settings.indexDir.placeholder'),
              'aria-label': t('settings.indexDir.label'),
              onChange: function (event) { updateIndexDir(event.target.value) },
            })),
          h(SettingsRow, { label: t('settings.rebuild.label'), help: t('settings.rebuild.help') },
            h('button', {
              type: 'button', className: 'ap-btn', 'data-settings-action': 'index-rebuild',
              disabled: rebuildStatus === 'busy', onClick: rebuildIndex,
            }, rebuildStatus === 'busy' ? t('settings.rebuild.busy') : t('settings.rebuild.action'))),
          rebuildStatus !== '' && rebuildStatus !== 'busy'
            ? h('div', { className: 'ap-settings-help', role: 'status' }, t('settings.rebuild.' + rebuildStatus))
            : null,
          h('div', { className: 'ap-settings-help' }, t('settings.promptGuidance.help')),
          h(SettingsRow, { label: t('settings.indexCapacity'), help: t('settings.indexCapacity.help') },
            h('span', { className: 'ap-settings-unit' }, t('settings.indexCapacityValue'))),
          h(SettingsRow, { label: t('settings.indexLast') },
            h('span', { className: 'ap-settings-unit' }, indexStats && (indexStats.generatedAt || indexStats.at)
              ? t('settings.indexLastValue', {
                time: formatTime((indexStats.backfill && indexStats.backfill.finishedAt) || indexStats.generatedAt || indexStats.at),
                sessions: indexStats.totals && indexStats.totals.sessions !== undefined ? indexStats.totals.sessions : 0,
                files: indexStats.totals && indexStats.totals.files !== undefined ? indexStats.totals.files : 0,
              })
              : t('settings.indexNever'))),
          h('div', { className: 'ap-settings-help' }, t('settings.indexCleanup'))),
        h('div', { className: 'ap-settings-foot' },
          h('span', null, t('settings.foot')),
          h('button', { type: 'button', className: 'ap-btn', onClick: resetSettings }, t('settings.reset'))))
    }

    function SidebarArtifacts(props) {
      // The framework injects useTabInfo for the sidebar.right.pane.tab seat.
      const useTabInfo = props.useTabInfo
      const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : null
      const tab = tabInfo && tabInfo.tab ? tabInfo.tab : null
      const openArtifact = React.useCallback(function (path) {
        if (tab && tab.actions && typeof tab.actions.openResource === 'function') {
          tab.actions.openResource(fileAddress(props.sessionId, path))
        } else if (typeof props.openArtifact === 'function') {
          props.openArtifact(path)
        }
      }, [tab, props.sessionId, props.openArtifact])
      const actionSource = props.sidebarActions
      const sidebarActions = tab && tabInfo.panel && actionSource ? {
        float: function () { return actionSource.float(tab.id) },
        fullscreen: function () { return actionSource.fullscreen() },
        split: function () { return actionSource.split(tabInfo.panel.id) },
      } : null
      // The pane is user-resizable, so the layout follows its own measured
      // width instead of the window: single column under 480px, a two-column
      // card grid from 480px and reply + assets side by side from 720px.
      const rootRef = React.useRef(null)
      const [width, setWidth] = React.useState(function () { return resolveSidebarWidth(props.measureWidth, null) })
      React.useEffect(function () {
        function apply() {
          const next = resolveSidebarWidth(props.measureWidth, rootRef.current)
          if (!(next > 0)) return
          setWidth(function (previous) { return Math.abs(previous - next) < 1 ? previous : next })
        }
        apply()
        if (typeof ResizeObserver !== 'function') return undefined
        const element = rootRef.current
        if (!element) return undefined
        let observer
        try {
          observer = new ResizeObserver(apply)
          observer.observe(element)
        } catch (error) {
          return undefined
        }
        return function () {
          try { observer.disconnect() } catch (error) { /* the observer is already gone */ }
        }
      }, [props.measureWidth])
      const layout = sidebarLayoutForWidth(width)
      return h(ArtifactsView, Object.assign({}, props, {
        variant: 'sidebar',
        layout: layout,
        rootRef: rootRef,
        openArtifact: openArtifact,
        sidebarActions: sidebarActions,
      }))
    }

    //#endregion

    const plugin = {
      // Minimal set: every `ctx.<service>.<member>` path the client touches.
      // `remote.workspaceFiles` backs the cross-session index reader; without
      // it Cordis throws on property access instead of returning undefined.
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'remote', 'remote.session', 'remote.workspaceFiles', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }) }, 'artifacts-panel: dictionaries')
        const t = ctx.locale.bind(NS)

        function cwdOf(sessionId) {
          try {
            const snapshot = ctx.sessions.list.getSnapshot()
            return snapshot && snapshot.byId ? snapshot.byId[sessionId] && snapshot.byId[sessionId].cwd : undefined
          } catch (error) {
            return undefined
          }
        }

        function safeService(name) {
          try {
            return typeof ctx.get === 'function' ? ctx.get(name) : undefined
          } catch (error) {
            return undefined
          }
        }

        // Every optional host capability is detected here, once per session
        // injection; the UI hides an entry instead of offering a call that fails.
        function featureCaps() {
          const fileActions = safeService('fileActions')
          const tabs = safeService('sidebarRightTabs')
          const log = safeService('sessionLogDownload')
          const sessionRemote = ctx.remote && ctx.remote.session ? ctx.remote.session : undefined
          let changesReview = false
          try {
            changesReview = Boolean(tabs && typeof tabs.get === 'function' && tabs.get('changes-review'))
          } catch (error) {
            changesReview = false
          }
          return {
            fileActions: Boolean(fileActions && typeof fileActions.save === 'function'),
            saveAs: Boolean(fileActions && fileActions.canSaveAs === true && typeof fileActions.save === 'function'),
            workspacePath: Boolean(sessionRemote && typeof sessionRemote.canOpenWorkspacePath === 'function' && typeof sessionRemote.openWorkspacePath === 'function'),
            changesReview: changesReview,
            sessionLogDownload: Boolean(log && typeof log.download === 'function'),
          }
        }

        function makeSessionInjection(sessionId) {
          return {
            sessionId: sessionId,
            cwd: cwdOf(sessionId),
            loadArtifacts: function (full, signal) {
              const request = {
                address: { kind: 'session', sessionId: sessionId },
                maxMessages: full ? 400 : 30,
              }
              if (full) request.turnWindow = { minMessages: 120, minTurns: 20 }
              return Promise.resolve(ctx.remote.session.events(request, signal)).then(function (raw) {
                const page = unwrapRemote(raw)
                let sessions = {}
                try {
                  const snapshot = ctx.sessions.list.getSnapshot()
                  sessions = snapshot && snapshot.byId ? snapshot.byId : {}
                } catch (error) {
                  sessions = {}
                }
                return {
                  records: page && Array.isArray(page.records) ? page.records : [],
                  hasMore: Boolean(page && page.hasMore),
                  cursor: page ? page.cursor : undefined,
                  sessions: sessions,
                }
              })
            },
            openArtifact: function (path) {
              ctx.sidebarRight.openResource(fileAddress(sessionId, path))
            },
            openArtifactFor: function (ownerSessionId, path) {
              if (!ownerSessionId || !SESSION_ID_RE.test(ownerSessionId)) return
              ctx.sidebarRight.openResource(fileAddress(ownerSessionId, path))
            },
            readIndexFile: function (absolutePath, signal) {
              const target = String(absolutePath || '')
              // Normal path: the Host serves the index over a same-origin HTTP
              // route, so the browser never needs to know an absolute directory.
              if (isIndexRouteTarget(target)) return fetchIndexResource(target, signal)
              // Legacy/fallback path: an explicit absolute directory override is
              // read through remote.workspaceFiles. The access is guarded so a
              // missing injection degrades to the typed unavailable state.
              let remote
              try {
                remote = ctx.remote ? ctx.remote.workspaceFiles : undefined
              } catch (error) {
                remote = undefined
              }
              if (!remote || typeof remote.read !== 'function') {
                return Promise.reject(new Error('WORKSPACE_FILES_UNAVAILABLE'))
              }
              try {
                const request = remote.read(sessionId, target, { offset: 1 }, signal)
                return Promise.resolve(request).then(unwrapRemote)
              } catch (error) {
                return Promise.reject(new Error('WORKSPACE_FILES_UNAVAILABLE'))
              }
            },
            isArchived: function (targetSessionId) {
              try {
                const workspaces = typeof ctx.get === 'function' ? ctx.get('workspaces') : undefined
                const snapshot = workspaces && workspaces.list && typeof workspaces.list.getSnapshot === 'function'
                  ? workspaces.list.getSnapshot()
                  : null
                const archived = snapshot && Array.isArray(snapshot.archivedSessionIds) ? snapshot.archivedSessionIds : []
                return archived.indexOf(targetSessionId) !== -1
              } catch (error) {
                return false
              }
            },
            loadChildArtifacts: function (childId, mode, signal) {
              const request = {
                address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: childId, mode: mode || 'unknown' },
                maxMessages: 60,
              }
              return Promise.resolve(ctx.remote.session.events(request, signal)).then(function (raw) {
                const page = unwrapRemote(raw)
                return page && Array.isArray(page.records) ? page.records : []
              })
            },
            openSession: function (childId) {
              try {
                if (ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === 'function') {
                  ctx.uiWorkspace.openSession(childId)
                  return true
                }
              } catch (error) {
                // A drill-down that the workspace refuses must not close the panel.
              }
              return false
            },
            openSessionById: function (targetId) {
              try {
                if (targetId && ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === 'function') {
                  ctx.uiWorkspace.openSession(targetId)
                  return true
                }
              } catch (error) {
                // A drill-down that the workspace refuses must not close the panel.
              }
              return false
            },
            // batch 2: host capabilities for diff review, file actions, export
            // and the image gallery. Nothing here computes diffs or reads bytes
            // through its own route.
            capabilities: featureCaps(),
            probeWorkspacePath: function () {
              const remote = ctx.remote && ctx.remote.session ? ctx.remote.session : undefined
              if (!remote || typeof remote.canOpenWorkspacePath !== 'function') return Promise.resolve(false)
              return Promise.resolve(remote.canOpenWorkspacePath()).then(function (result) {
                if (result === true) return true
                if (!result) return false
                if (result.ok === true) return result.value === true
                return false
              }, function () { return false })
            },
            probeMarkdown: function (signal) {
              return Promise.resolve()
                .then(function () { return fetch(sessionMarkdownRoute(sessionId), { signal: signal, credentials: 'same-origin' }) })
                .then(function (response) {
                  if (!response || response.ok !== true) return false
                  try {
                    if (response.body && typeof response.body.cancel === 'function') {
                      const cancelled = response.body.cancel()
                      if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(function () { /* the probe only needed the status */ })
                    }
                  } catch (error) {
                    // The route answered; the body is irrelevant to the probe.
                  }
                  return true
                }, function () { return false })
            },
            copySessionMarkdown: function () {
              return Promise.resolve()
                .then(function () { return fetch(sessionMarkdownRoute(sessionId), { credentials: 'same-origin' }) })
                .then(function (response) {
                  if (!response || response.ok !== true) throw new Error('HTTP ' + (response ? response.status : 'unavailable'))
                  return response.text()
                })
                .then(function (text) {
                  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
                  if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE')
                  return Promise.resolve(clipboard.writeText(text)).then(function () { return true })
                })
            },
            fetchSessionLogZip: function () {
              const service = safeService('sessionLogDownload')
              if (!service || typeof service.download !== 'function') return Promise.reject(new Error('UNAVAILABLE'))
              return Promise.resolve(service.download(sessionId))
            },
            fetchChangesSummary: function (seq, signal) {
              return Promise.resolve()
                .then(function () { return fetch(changesSummaryRoute(sessionId, seq), { signal: signal, credentials: 'same-origin' }) })
                .then(function (response) {
                  if (!response || response.ok !== true) throw new Error('HTTP ' + (response ? response.status : 'unavailable'))
                  return response.json()
                })
            },
            openChangesReview: function (seq, turn, index) {
              const seqNumber = Number(seq)
              const turnNumber = Number(turn)
              if (!Number.isFinite(seqNumber) || !Number.isFinite(turnNumber) || seqNumber < 0 || turnNumber < 1) return false
              const targetIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0
              try {
                if (typeof ctx.sidebarRight.openResource !== 'function') return false
                ctx.sidebarRight.openResource(changesReviewAddress(sessionId, seqNumber, turnNumber), { params: { index: targetIndex } })
                return true
              } catch (error) {
                return false
              }
            },
            openPath: function (path, action) {
              const remote = ctx.remote && ctx.remote.session ? ctx.remote.session : undefined
              if (!remote || typeof remote.openWorkspacePath !== 'function') return Promise.reject(new Error('UNAVAILABLE'))
              const target = resolveAgainst(cwdOf(sessionId), path)
              const request = action === 'reveal' ? { path: target, action: 'reveal' } : { path: target }
              return Promise.resolve(remote.openWorkspacePath(request)).then(function (result) {
                if (result && (result.ok === true || result.opened === true || result.value)) return true
                throw new Error('FAILED')
              })
            },
            downloadArtifact: function (file, mode) {
              const path = file.path
              const absolute = resolveAgainst(cwdOf(sessionId), path)
              const name = file.name || basename(path)
              const mediaType = mediaTypeFor(name)
              const fileActions = safeService('fileActions')
              let filesRemote
              try {
                filesRemote = ctx.remote && ctx.remote.workspaceFiles ? ctx.remote.workspaceFiles : undefined
              } catch (error) {
                filesRemote = undefined
              }
              const useActions = Boolean(fileActions && typeof fileActions.save === 'function' && filesRemote && typeof filesRemote.readBytes === 'function' && (mode !== 'saveAs' || fileActions.canSaveAs === true))
              if (useActions) {
                const source = { name: name, mediaType: mediaType }
                const url = mediaUrl(absolute)
                if (url) source.url = url
                source.read = function (signal) {
                  return Promise.resolve(filesRemote.readBytes(sessionId, path, {}, signal)).then(function (result) {
                    if (!result || result.ok !== true || !result.value) throw new Error('READ_FAILED')
                    return new Blob([new Uint8Array(result.value.data)], { type: mediaType })
                  })
                }
                return Promise.resolve(fileActions.save(source, mode === 'saveAs' ? 'saveAs' : 'download')).then(function (result) {
                  return result && result.status ? result.status : 'requested'
                })
              }
              if (mode === 'saveAs') return Promise.reject(new Error('SAVE_AS_UNAVAILABLE'))
              const url = mediaUrl(absolute)
              if (!url) return Promise.reject(new Error('NO_URL'))
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = name
              anchor.click()
              return Promise.resolve('requested')
            },
            fileUrl: function (path) {
              return mediaUrl(resolveAgainst(cwdOf(sessionId), path)) || ''
            },
            gallerySrc: function (path) {
              const absolute = resolveAgainst(cwdOf(sessionId), path)
              return mediaUrl(absolute) || fileAddress(sessionId, path)
            },
          }
        }

        ctx.effect(function () {
          return ctx.sidebarRightTabs.register({
            id: SIDEBAR_TAB_ID,
            kind: SIDEBAR_KIND,
            title: function () { return t('title') },
            guide: [{
              id: 'artifacts',
              title: function () { return t('title') },
              description: function () { return t('sidebar.guide.description') },
            }],
          })
        }, 'artifacts-panel: sidebar tab type')

        ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register({
            name: 'conversation.view',
            id: 'artifacts',
            order: 45,
            locale: NS,
            label: function () { return t('view.artifacts') },
            inject: function (sessionId) {
              return Object.assign(makeSessionInjection(sessionId), {
                variant: 'page',
                openSidebar: function () { ctx.sidebarRight.openTab(SIDEBAR_KIND) },
                collapseSidebar: function () {
                  try {
                    if (typeof ctx.sidebarRight.toggleExpanded !== 'function') return false
                    ctx.sidebarRight.toggleExpanded()
                    return true
                  } catch (error) {
                    return false
                  }
                },
                // Read-only probe for the toolbar label. The host layout store
                // is not exposed to plugins, so this is polled lightly (1s) by
                // the view; missing capabilities mean "collapsed".
                probeSidebar: function () {
                  let expanded = false
                  let artifactsActive = false
                  try {
                    if (typeof ctx.sidebarRight.isExpanded === 'function') expanded = ctx.sidebarRight.isExpanded() === true
                  } catch (error) {
                    expanded = false
                  }
                  try {
                    const active = typeof ctx.sidebarRight.active === 'function' ? ctx.sidebarRight.active() : undefined
                    artifactsActive = Boolean(active && active.kind === SIDEBAR_KIND)
                  } catch (error) {
                    artifactsActive = false
                  }
                  return { expanded: expanded, artifactsActive: artifactsActive }
                },
              })
            },
          }, ArtifactsView)
        })

        ctx.slots.inject('sidebar.right.pane.tab', function () {
          return ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: SIDEBAR_TAB_ID,
            locale: NS,
            inject: function (sessionId) {
              return Object.assign(makeSessionInjection(sessionId), {
                variant: 'sidebar',
                sidebarActions: {
                  float: function (tabId) {
                    if (typeof ctx.sidebarRight.float !== 'function') return false
                    ctx.sidebarRight.float(tabId)
                    return true
                  },
                  fullscreen: function () {
                    if (typeof ctx.sidebarRight.toggleFullscreen !== 'function') return false
                    let target
                    try {
                      target = typeof ctx.sidebarRight.commandTarget === 'function' && typeof document !== 'undefined'
                        ? ctx.sidebarRight.commandTarget(document.activeElement)
                        : undefined
                    } catch (error) {
                      target = undefined
                    }
                    if (!target) return false
                    ctx.sidebarRight.toggleFullscreen(target)
                    return true
                  },
                  split: function (paneId) {
                    if (typeof ctx.sidebarRight.split !== 'function') return false
                    const created = ctx.sidebarRight.split(paneId)
                    return created === undefined ? 'split-unavailable' : true
                  },
                },
              })
            },
          }, SidebarArtifacts)
        })

        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-artifacts-panel/floating-bar',
            locale: NS,
            inject: function () {
              return {
                useSelection: function () {
                  const workspace = safeService('uiWorkspace')
                  const selection = workspace && workspace.selection ? workspace.selection : null
                  return useStoreSnapshot(selection, null)
                },
                openPanel: function () {
                  try {
                    const right = ctx.sidebarRight
                    if (!right || typeof right.openTab !== 'function') return false
                    // Open/reveal the artifacts tab first, then make sure the
                    // column is actually expanded: revealing a tab in a
                    // floating panel may leave the docked column collapsed.
                    right.openTab(SIDEBAR_KIND)
                    if (typeof right.isExpanded === 'function' && right.isExpanded() !== true && typeof right.toggleExpanded === 'function') {
                      right.toggleExpanded()
                    }
                    return true
                  } catch (error) {
                    return false
                  }
                },
                // Auto-open entry: only acts while the column is collapsed so a
                // tab the user already opened is never replaced.
                ensureArtifactsSidebar: function () {
                  try {
                    const right = ctx.sidebarRight
                    if (!right || typeof right.openTab !== 'function') return false
                    if (typeof right.isExpanded === 'function' && right.isExpanded() === true) return false
                    right.openTab(SIDEBAR_KIND, { revealIfOpened: true })
                    return true
                  } catch (error) {
                    return false
                  }
                },
                loadCount: function (targetSessionId, signal) {
                  if (!targetSessionId || !ctx.remote || !ctx.remote.session || typeof ctx.remote.session.events !== 'function') {
                    return Promise.reject(new Error('session events unavailable'))
                  }
                  const request = {
                    address: { kind: 'session', sessionId: targetSessionId },
                    maxMessages: 400,
                  }
                  return Promise.resolve(ctx.remote.session.events(request, signal)).then(function (raw) {
                    const page = unwrapRemote(raw)
                    const records = page && Array.isArray(page.records) ? page.records : []
                    const folded = foldSession(records, cwdOf(targetSessionId))
                    let count = 0
                    for (const turn of folded.turns) count += turn.files.length
                    return { count: count, turns: folded.turns.length }
                  })
                },
              }
            },
          }, ShellOverlay)
        })

        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-artifacts-panel',
            order: 60,
            label: function () { return t('settings.title') },
            locale: NS,
          }, SettingsPage)
        })
      },
    }
    // Non-enumerable test hook for tools/render-harness.cjs; the live loader
    // only looks at inject/apply, so this never changes runtime behaviour.
    try {
      Object.defineProperty(plugin, '__testing', {
        value: {
          foldSession: foldSession,
          buildGroups: buildGroups,
          selectVisibleTurns: selectVisibleTurns,
          normalizeSettings: normalizeSettings,
          DEFAULT_SETTINGS: DEFAULT_SETTINGS,
          setSettings: setSettings,
          resetSettings: resetSettings,
          themeVariables: themeVariables,
          hostThemeMode: hostThemeMode,
          THEME_TOKENS: THEME_TOKENS,
          ACCENT_PRESETS: ACCENT_PRESETS,
          ACCENT_CHOICES: ACCENT_CHOICES,
          THEME_MODES: THEME_MODES,
          resolveDimension: resolveDimension,
          buildAllSessionTree: buildAllSessionTree,
          normalizeIndexPayload: normalizeIndexPayload,
          parseSessionIndexPayload: parseSessionIndexPayload,
          classifyIndexError: classifyIndexError,
          readIndexDirOverride: readIndexDirOverride,
          writeIndexDirOverride: writeIndexDirOverride,
          indexFilePath: indexFilePath,
          sessionIndexFilePath: sessionIndexFilePath,
          fetchIndexResource: fetchIndexResource,
          INDEX_ROUTE_PREFIX: INDEX_ROUTE_PREFIX,
          INDEX_DIR_KEY: INDEX_DIR_KEY,
          middleEllipsis: middleEllipsis,
          escapeHtml: escapeHtml,
          safeMarkdownHref: safeMarkdownHref,
          markdownInline: markdownInline,
          renderMarkdownHtml: renderMarkdownHtml,
          sortFiles: sortFiles,
          compareFilesByMode: compareFilesByMode,
          SORT_MODES: SORT_MODES,
          EmptyNew: EmptyNew,
          EmptyFiltered: EmptyFiltered,
          ErrorState: ErrorState,
          OnboardingCard: OnboardingCard,
          diagnosticsText: diagnosticsText,
          errorSummary: errorSummary,
          readOnboardingSeen: readOnboardingSeen,
          setOnboardingSeen: setOnboardingSeen,
          ONBOARDING_KEY: ONBOARDING_KEY,
          AllSessionsView: AllSessionsView,
          changesReviewAddress: changesReviewAddress,
          changesSummaryRoute: changesSummaryRoute,
          sessionMarkdownRoute: sessionMarkdownRoute,
          manifestText: manifestText,
          artifactMenuModel: artifactMenuModel,
          exportMenuModel: exportMenuModel,
          galleryItems: galleryItems,
          ImageGallery: ImageGallery,
          GalleryLightbox: GalleryLightbox,
          GalleryThumb: GalleryThumb,
          FloatingBar: FloatingBar,
          ShellOverlay: ShellOverlay,
          AutoOpenSidebar: AutoOpenSidebar,
          SidebarArtifacts: SidebarArtifacts,
          sidebarLayoutForWidth: sidebarLayoutForWidth,
          SIDEBAR_TWO_COLUMN_WIDTH: SIDEBAR_TWO_COLUMN_WIDTH,
          SIDEBAR_SPLIT_WIDTH: SIDEBAR_SPLIT_WIDTH,
        },
        enumerable: false,
        configurable: true,
      })
    } catch (error) {
      // A missing test hook must never break plugin loading.
    }
    return plugin
  },
})

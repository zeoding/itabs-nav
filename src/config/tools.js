/**
 * 内置工具卡统一配置（唯一真相源）
 *
 * 原先「工具卡」元数据散落在 4 处、各自维护、极易漂移：
 *   1. App.vue            TOOL_PRESETS（name/url/icon）+ TOOL_TITLE_KEYS（任务栏标题 key）
 *   2. stores/sites.js    seedIfEmpty 的默认首页工具 + ensureWallpaperCard
 *   3. views/sites/SiteEditor.vue         WIDGETS + FALLBACK_WIDGET_TEXT
 *   4. views/dialogs/WidgetPreviewDialog.vue  FALLBACK_WIDGET_TEXT
 *
 * 现统一收口到本文件；新增一个工具只需在此追加一条，并在
 * WidgetPreviewDialog 里补一行对应的预览组件映射即可。
 *
 * 字段约定：
 *   - kind        工具类型，同时是站点 url 的 action 后缀（action:<kind>）
 *   - name        展示名（中文兜底，卡片/种子数据用）
 *   - icon        emoji 图标
 *   - desc        一句话描述
 *   - titleKey    任务栏/预览标题的 i18n key
 *   - categoryKey 分类标签的 i18n key
 *   - category    逻辑分类（当前恒为 'tool'，供 widget 对象透传）
 */

/** 站点 url 约定：工具卡用 action: 协议前缀 */
export const TOOL_ACTION_PREFIX = 'action:'

/** 工具 action url 构造 */
export function toolActionUrl(kind) {
  return `${TOOL_ACTION_PREFIX}${kind}`
}

export const TOOLS = [
  {
    kind: 'split-text',
    name: '文本分割',
    icon: '✂️',
    desc: '按分隔符拆分 / 去重 / 分组 / 导出 xlsx',
    titleKey: 'widgets.splitText',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'free-email',
    name: '免费邮箱',
    icon: '📫',
    desc: '基于 duckmail.sbs 的临时邮箱，接收验证码/通知',
    titleKey: 'widgets.freeEmail',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'wallpaper',
    name: '壁纸库',
    icon: '🖼️',
    desc: 'Wallhaven 精选壁纸：搜索 / 预览 / 一键设为桌面壁纸',
    titleKey: 'widgets.wallpaper',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'week-report',
    name: '周报统计',
    icon: '📊',
    desc: '上传周报 xlsx，按部门/变更类型统计并生成图表',
    titleKey: 'widgets.weekReport',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'encode-decode',
    name: '编码解码',
    icon: '🔐',
    desc: 'Base64 / URL / Hex / 哈希 / AES / RSA 等编码与加解密',
    titleKey: 'widgets.encodeDecode',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'qr-code',
    name: '二维码',
    icon: '🏁',
    desc: '生成二维码（可下载）／识别图片中的二维码',
    titleKey: 'widgets.qrCode',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'content-diff',
    name: '内容对比',
    icon: '🔀',
    desc: '两段文本/代码逐行对比，高亮新增、删除与修改',
    titleKey: 'widgets.contentDiff',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
  {
    kind: 'pdf-merge',
    name: 'PDF工具',
    icon: '📄',
    desc: '多份 PDF 合并、按页码范围拆分、添加文字水印，本地处理可预览',
    titleKey: 'widgets.pdfMerge',
    categoryKey: 'siteEditor.widgetCats.tool',
    category: 'tool',
  },
]

/** kind → 工具定义 */
export const TOOLS_BY_KIND = Object.fromEntries(TOOLS.map((t) => [t.kind, t]))

/** 全部工具 kind（与 TOOLS 同源，供 db 校验派生） */
export const TOOL_KINDS = TOOLS.map((t) => t.kind)

/** 工具卡判定：kind 是否属于内置工具（单一真相源在此，db 不再重复定义） */
export function isToolKind(kind) {
  return TOOL_KINDS.includes(kind)
}

/** 新用户默认首页除「百度」外附带的工具卡（顺序即卡片顺序） */
export const SEED_TOOL_KINDS = ['split-text', 'free-email', 'wallpaper', 'week-report']

/**
 * @thesvg/icons 动态加载器
 * - 用 Vite 的 import.meta.glob 显式列举需要用到的图标
 * - 运行时按 slug 动态 import
 * - 失败 fallback：返回 null
 * - 站点图标约定：icon 字段存 `thesvg:<slug>`（如 'thesvg:github'），
 *   IDB 只存短字符串不膨胀，渲染时由 SiteCard 按需加载
 */
const modules = import.meta.glob([
  '/node_modules/@thesvg/icons/dist/baidu.js',
  '/node_modules/@thesvg/icons/dist/bing.js',
  '/node_modules/@thesvg/icons/dist/google.js',
  '/node_modules/@thesvg/icons/dist/duckduckgo.js',
  '/node_modules/@thesvg/icons/dist/sogou.js',
  '/node_modules/@thesvg/icons/dist/yandex.js',
  '/node_modules/@thesvg/icons/dist/wechat.js',
  // 种子站点 logo
  '/node_modules/@thesvg/icons/dist/github.js',
  '/node_modules/@thesvg/icons/dist/vue.js',
  '/node_modules/@thesvg/icons/dist/mozilla.js',
  // 站点图标预设（SiteEditor 勾选，与 SITE_ICON_PRESETS 保持一致）
  '/node_modules/@thesvg/icons/dist/bilibili.js',
  '/node_modules/@thesvg/icons/dist/zhihu.js',
  '/node_modules/@thesvg/icons/dist/douban.js',
  '/node_modules/@thesvg/icons/dist/csdn.js',
  '/node_modules/@thesvg/icons/dist/juejin.js',
  '/node_modules/@thesvg/icons/dist/xiaohongshu.js',
  '/node_modules/@thesvg/icons/dist/kuaishou.js',
  '/node_modules/@thesvg/icons/dist/taobao.js',
  '/node_modules/@thesvg/icons/dist/alipay.js',
  '/node_modules/@thesvg/icons/dist/qq.js',
  '/node_modules/@thesvg/icons/dist/gitee.js',
  '/node_modules/@thesvg/icons/dist/react.js',
  '/node_modules/@thesvg/icons/dist/youtube.js',
  '/node_modules/@thesvg/icons/dist/twitter.js',
  '/node_modules/@thesvg/icons/dist/facebook.js',
  '/node_modules/@thesvg/icons/dist/instagram.js',
  '/node_modules/@thesvg/icons/dist/telegram.js',
  '/node_modules/@thesvg/icons/dist/discord.js',
  '/node_modules/@thesvg/icons/dist/microsoft.js',
  '/node_modules/@thesvg/icons/dist/apple.js',
  '/node_modules/@thesvg/icons/dist/python.js',
])

/** 站点 icon 的 thesvg 前缀 */
export const THESVG_PREFIX = 'thesvg:'

/**
 * 解析站点 icon 中的 thesvg slug
 * @returns slug（如 'github'），非 thesvg 图标返回 null
 */
export function parseThesvgIcon(icon) {
  if (typeof icon !== 'string' || !icon.startsWith(THESVG_PREFIX)) return null
  const slug = icon.slice(THESVG_PREFIX.length).trim().toLowerCase()
  return slug || null
}

/**
 * 站点图标预设（SiteEditor 勾选用）
 * - slug 必须在上方 glob 中显式列出，否则动态 import 不到
 */
export const SITE_ICON_PRESETS = [
  { slug: 'baidu', name: '百度' },
  { slug: 'bing', name: '必应' },
  { slug: 'google', name: 'Google' },
  { slug: 'github', name: 'GitHub' },
  { slug: 'gitee', name: 'Gitee' },
  { slug: 'vue', name: 'Vue' },
  { slug: 'react', name: 'React' },
  { slug: 'mozilla', name: 'MDN' },
  { slug: 'python', name: 'Python' },
  { slug: 'bilibili', name: '哔哩哔哩' },
  { slug: 'zhihu', name: '知乎' },
  { slug: 'douban', name: '豆瓣' },
  { slug: 'csdn', name: 'CSDN' },
  { slug: 'juejin', name: '掘金' },
  { slug: 'xiaohongshu', name: '小红书' },
  { slug: 'kuaishou', name: '快手' },
  { slug: 'taobao', name: '淘宝' },
  { slug: 'alipay', name: '支付宝' },
  { slug: 'qq', name: 'QQ' },
  { slug: 'wechat', name: '微信' },
  { slug: 'youtube', name: 'YouTube' },
  { slug: 'twitter', name: 'X' },
  { slug: 'facebook', name: 'Facebook' },
  { slug: 'instagram', name: 'Instagram' },
  { slug: 'telegram', name: 'Telegram' },
  { slug: 'discord', name: 'Discord' },
  { slug: 'microsoft', name: '微软' },
  { slug: 'apple', name: 'Apple' },
]

/**
 * 加载 SVG 字符串
 * @param {string} slug - @thesvg/icons 里的 slug（如 'baidu', 'google'）
 * @returns {Promise<string|null>}
 */
export async function loadEngineSvg(slug) {
  if (!slug) return null
  const key = `/node_modules/@thesvg/icons/dist/${slug}.js`
  const loader = modules[key]
  if (!loader) {
    return null
  }
  try {
    const mod = await loader()
    return mod.default?.svg || mod.svg || null
  } catch {
    return null
  }
}

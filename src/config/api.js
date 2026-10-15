/**
 * API 端点统一配置（唯一收口）
 *
 * 约定：
 * - 所有对外网络地址只允许出现在此文件（含第三方 API、CDN、数据服务）
 * - 组件 / store 一律 `import { XXX_API } from '@/config/api'`，禁止手写 URL
 * - 换镜像/域名只改这里；uapis 系接口共用 UAPIS_BASE，一行切换
 * - i18n 里的示例占位、种子数据、关于页链接不算 API，不收口
 */

// ===================== 基础域名（一行切换镜像） =====================
/** uapis.cn 聚合接口族共用前缀 */
export const UAPIS_BASE = 'https://uapis.cn/api/v1'
/** 热榜备选源域名 */
export const IMSYY_HOT_BASE = 'https://api-hot.imsyy.top'

// ===================== 天气 API =====================
export const WEATHER_API = {
  /**
   * 当前天气端点
   * 调用方按需追加 extended/forecast/hourly/indices/lang 参数
   */
  current: (city) => `${UAPIS_BASE}/misc/weather?city=${encodeURIComponent(city)}`,
}

// ===================== IP 定位 API =====================
export const NET_API = {
  /** IP 归属地（commercial 源，返回 region/district/lng/lat） */
  myip: (source = 'commercial') => `${UAPIS_BASE}/network/myip?source=${source}`,
}

// ===================== 热榜 API =====================
/**
 * 热榜主 API：uapis.cn
 * 备选 API：api-hot.imsyy.top
 *
 * 字段名：title / url / hot
 * 返回结构：{ code: 200, data: { list: [...] } } 或类似
 */
export const HOT_API = {
  /** 多个备选端点（按优先级） */
  endpoints: {
    uapis: {
      url: (type) => `${UAPIS_BASE}/misc/hotboard?type=${type}`,
      parser: 'uapis',
    },
    imsyy: {
      url: (type) => `${IMSYY_HOT_BASE}/${type}`,
      parser: 'imsyy',
    },
  },
  /** 支持的热榜源（stores/hot.js 由此派生 SOURCES，新增源只需加一行） */
  sources: {
    baidu: { name: '百度', color: '#2932E1' },
    weibo: { name: '微博', color: '#E6162D' },
    zhihu: { name: '知乎', color: '#0084FF' },
    douyin: { name: '抖音', color: '#000000' },
    bilibili: { name: 'B站', color: '#FB7299' },
  },
}

// ===================== 一言 API =====================
export const SAYING_API = {
  /** 默认请求参数（分类/模式） */
  defaultParams: { mode: 'random', category: '哲学' },
  /** 随机一言（调用方需透传 params，见 stores/saying.js） */
  random: () => `${UAPIS_BASE}/saying/random`,
}

// ===================== 逆地理 API =====================
export const GEO_API = {
  /** Nominatim 反向地理（浏览器直调；User-Agent 系 forbidden header，由浏览器自动处理） */
  reverse: (lat, lng) =>
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh&zoom=10`,
}

// ===================== 壁纸 API =====================
export const WALLPAPER_API = {
  /** picsum 随机壁纸（seed 变化即换图，顺带破缓存） */
  random: (seed) => `https://picsum.photos/1920/1080?random=${seed}`,
}

// ===================== 壁纸库 API（Wallhaven） =====================
/**
 * Wallhaven 壁纸搜索（无需 API Key 即可调用，默认仅返回 sfw 内容）
 * - 文档：https://wallhaven.cc/help/api
 * - GET /search?q=&categories=111&purity=100&sorting=toplist&order=desc&page=1
 * - categories：general/anime/people 三位开关（111 = 全选）
 * - purity：100 = 仅 sfw（无 Key 时强制 sfw，传 100 即可）
 * - sorting：toplist / date_added / views / favorites / random
 * - 返回：{ data: [{ id, url(详情页), path(原图), thumbs:{small,large}, resolution, category, views, favorites }], meta: { current_page, last_page, ... } }
 * - 调用方经 http.get(URL, { params }) 透传查询参数
 */
export const WALLHAVEN_API = {
  /**
   * 搜索端点（调用方透传 params：q / categories / purity / sorting / order / page）
   * - 主源为 Netlify 反代：部分网络环境直连 wallhaven.cc 不通，由代理解决可用性
   * - officialSearch：官方直连兜底，代理失效时降级重试（见 WallpaperPreview.load）
   */
  search: () => 'https://delicate-sprite-b04369.netlify.app/api/wallhaven/search',
  officialSearch: () => 'https://wallhaven.cc/api/v1/search',
  /** 默认查询参数（sfw + 全分类） */
  defaultParams: { categories: '111', purity: '100', order: 'desc' },
}

// ===================== 网站图标 =====================
/**
 * 站点自有 favicon（不经任何第三方中转）
 * - 直接取目标站点的 /favicon.ico，无外部依赖、不泄露浏览行为
 * - 加载失败时调用方回退字母头像（见 SiteCard imgFailed）
 */
export const FAVICON_API = {
  /** 由页面 URL 推导其站点 favicon（保留原协议，避免混合内容） */
  pageIcon(pageUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(pageUrl) ? pageUrl : `https://${pageUrl}`)
      return `${u.origin}/favicon.ico`
    } catch {
      return ''
    }
  },
}

// ===================== 搜索引擎 =====================
/**
 * 搜索引擎提交地址（slug → 搜索 URL 前缀）
 * - settings store 的 eng() 助手基于此表组装引擎对象
 * - 新增引擎：此表加一行 + settings store COMMON_ENGINES 加一项
 */
export const SEARCH_ENGINES = {
  baidu: { url: 'https://www.baidu.com/s?wd=' },
  bing: { url: 'https://www.bing.com/search?q=' },
  google: { url: 'https://www.google.com/search?q=' },
  duckduckgo: { url: 'https://duckduckgo.com/?q=' },
  sogou: { url: 'https://www.sogou.com/web?query=' },
  so360: { url: 'https://www.so.com/s?q=' },
  quark: { url: 'https://quark.sm.cn/s?q=' },
  yandex: { url: 'https://yandex.com/search/?text=' },
  wechat: { url: 'https://weixin.sogou.com/weixin?type=2&query=' },
}
/** 未知 slug 回退 */
export const DEFAULT_SEARCH_URL = 'https://www.google.com/search?q='

// ===================== Mock 模式 =====================
const USE_MOCK = false // 调试用：true = 全部走 mock（实际项目用环境变量）
if (USE_MOCK) {
  console.warn('[API] Mock 模式已启用')
  // 这里可以替换所有端点为 mock 地址
}

export default {
  UAPIS_BASE,
  IMSYY_HOT_BASE,
  WEATHER_API,
  NET_API,
  HOT_API,
  SAYING_API,
  GEO_API,
  WALLPAPER_API,
  WALLHAVEN_API,
  FAVICON_API,
  SEARCH_ENGINES,
  DEFAULT_SEARCH_URL,
}

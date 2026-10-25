import { FAVICON_API } from '@/config/api'

/**
 * 网址导航预设数据（SiteEditor「网址导航」tab 使用）
 *
 * - icon: 'thesvg:<slug>'（@thesvg/icons 白名单内，矢量清晰）
 *         或站点 favicon URL（SiteCard / 选择器按 URL 走 <img>，失败回退首字母）
 * - name: 站点专名，不做 i18n；desc 为简短中文描述
 * - hot:  「热门」聚合 tab 的入选标记（跨分类精选）
 * - 新增条目须保证 slug 唯一、url 为规范 https 地址
 */

/** favicon 快捷方式（站点根 /favicon.ico，见 FAVICON_API.pageIcon） */
const fav = (url) => FAVICON_API.pageIcon(url)

/** 分类 key（顺序即 tab 顺序，「热门」聚合 tab 固定在首位，不入此列） */
export const DIRECTORY_CATS = [
  'search',
  'ai',
  'news',
  'tech',
  'media',
  'study',
  'work',
  'social',
  'pic',
  'shop',
  'game',
]

export const DIRECTORY_SITES = [
  /* ---- 搜索 ---- */
  { slug: 'baidu', name: '百度', url: 'https://www.baidu.com', desc: '全球最大中文搜索引擎', cat: 'search', icon: 'thesvg:baidu', hot: true },
  { slug: 'bing', name: '必应', url: 'https://www.bing.com', desc: '微软旗下搜索引擎，每日一图', cat: 'search', icon: 'thesvg:bing' },
  { slug: 'google', name: 'Google', url: 'https://www.google.com', desc: '全球使用最广的搜索引擎', cat: 'search', icon: 'thesvg:google' },
  { slug: 'sogou', name: '搜狗搜索', url: 'https://www.sogou.com', desc: '搜狗旗下综合搜索引擎', cat: 'search', icon: 'thesvg:sogou' },
  { slug: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com', desc: '注重隐私、无广告跟踪的搜索', cat: 'search', icon: 'thesvg:duckduckgo' },
  { slug: 'so-360', name: '360搜索', url: 'https://www.so.com', desc: '360 旗下综合搜索服务', cat: 'search', icon: fav('https://www.so.com') },

  /* ---- AI ---- */
  { slug: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', desc: 'OpenAI 旗下 AI 对话助手', cat: 'ai', icon: fav('https://chatgpt.com'), hot: true },
  { slug: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', desc: '深度求索 AI 大模型对话', cat: 'ai', icon: fav('https://chat.deepseek.com') },
  { slug: 'kimi', name: 'Kimi', url: 'https://www.kimi.com', desc: '月之暗面 AI 助手，擅长长文本', cat: 'ai', icon: fav('https://www.kimi.com') },
  { slug: 'doubao', name: '豆包', url: 'https://www.doubao.com', desc: '字节跳动 AI 智能助手', cat: 'ai', icon: fav('https://www.doubao.com') },
  { slug: 'tongyi', name: '通义千问', url: 'https://tongyi.aliyun.com', desc: '阿里云 AI 大模型', cat: 'ai', icon: fav('https://tongyi.aliyun.com') },
  { slug: 'yiyan', name: '文心一言', url: 'https://yiyan.baidu.com', desc: '百度旗下 AI 大模型', cat: 'ai', icon: fav('https://yiyan.baidu.com') },
  { slug: 'claude', name: 'Claude', url: 'https://claude.ai', desc: 'Anthropic 旗下 AI 助手', cat: 'ai', icon: fav('https://claude.ai') },
  { slug: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', desc: 'Google 旗下 AI 助手', cat: 'ai', icon: fav('https://gemini.google.com') },
  { slug: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co', desc: '全球最大 AI 模型社区', cat: 'ai', icon: fav('https://huggingface.co') },

  /* ---- 资讯 ---- */
  { slug: 'thepaper', name: '澎湃新闻', url: 'https://www.thepaper.cn', desc: '专注时政与思想的原创新闻', cat: 'news', icon: fav('https://www.thepaper.cn') },
  { slug: 'jiemian', name: '界面新闻', url: 'https://www.jiemian.com', desc: '商业财经新闻报道', cat: 'news', icon: fav('https://www.jiemian.com') },
  { slug: '36kr', name: '36氪', url: 'https://www.36kr.com', desc: '科技创投媒体', cat: 'news', icon: fav('https://www.36kr.com') },
  { slug: 'huxiu', name: '虎嗅', url: 'https://www.huxiu.com', desc: '科技与商业深度报道', cat: 'news', icon: fav('https://www.huxiu.com') },
  { slug: 'ithome', name: 'IT之家', url: 'https://www.ithome.com', desc: '数字科技资讯门户', cat: 'news', icon: fav('https://www.ithome.com'), hot: true },
  { slug: 'news163', name: '网易新闻', url: 'https://news.163.com', desc: '网易旗下新闻门户', cat: 'news', icon: fav('https://news.163.com') },

  /* ---- 科技开发 ---- */
  { slug: 'github', name: 'GitHub', url: 'https://github.com', desc: '全球最大代码托管平台', cat: 'tech', icon: 'thesvg:github', hot: true },
  { slug: 'gitee', name: 'Gitee', url: 'https://gitee.com', desc: '国内代码托管协作平台', cat: 'tech', icon: 'thesvg:gitee' },
  { slug: 'juejin', name: '稀土掘金', url: 'https://juejin.cn', desc: '中文开发者技术社区', cat: 'tech', icon: 'thesvg:juejin' },
  { slug: 'csdn', name: 'CSDN', url: 'https://www.csdn.net', desc: '中文开发者技术社区', cat: 'tech', icon: 'thesvg:csdn' },
  { slug: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com', desc: '全球最大程序员问答社区', cat: 'tech', icon: fav('https://stackoverflow.com') },
  { slug: 'v2ex', name: 'V2EX', url: 'https://v2ex.com', desc: '创意工作者技术社区', cat: 'tech', icon: fav('https://v2ex.com') },
  { slug: 'mdn', name: 'MDN Web Docs', url: 'https://developer.mozilla.org', desc: 'Web 开发者权威文档', cat: 'tech', icon: 'thesvg:mozilla' },
  { slug: 'oschina', name: '开源中国', url: 'https://www.oschina.net', desc: '开源技术资讯与社区', cat: 'tech', icon: fav('https://www.oschina.net') },

  /* ---- 影音娱乐 ---- */
  { slug: 'bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '年轻人高频次视频社区', cat: 'media', icon: 'thesvg:bilibili', hot: true },
  { slug: 'qqvideo', name: '腾讯视频', url: 'https://v.qq.com', desc: '腾讯旗下长视频平台', cat: 'media', icon: fav('https://v.qq.com') },
  { slug: 'iqiyi', name: '爱奇艺', url: 'https://www.iqiyi.com', desc: '综合长视频平台', cat: 'media', icon: fav('https://www.iqiyi.com') },
  { slug: 'youku', name: '优酷', url: 'https://www.youku.com', desc: '阿里旗下长视频平台', cat: 'media', icon: fav('https://www.youku.com') },
  { slug: 'douyin', name: '抖音', url: 'https://www.douyin.com', desc: '字节跳动短视频平台', cat: 'media', icon: fav('https://www.douyin.com'), hot: true },
  { slug: 'kuaishou', name: '快手', url: 'https://www.kuaishou.com', desc: '短视频社交平台', cat: 'media', icon: 'thesvg:kuaishou' },
  { slug: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', desc: '全球最大视频平台', cat: 'media', icon: 'thesvg:youtube', hot: true },
  { slug: 'music163', name: '网易云音乐', url: 'https://music.163.com', desc: '网易旗下音乐社区', cat: 'media', icon: fav('https://music.163.com') },

  /* ---- 学习教育 ---- */
  { slug: 'icourse163', name: '中国大学MOOC', url: 'https://www.icourse163.org', desc: '高校公开课慕课平台', cat: 'study', icon: fav('https://www.icourse163.org') },
  { slug: 'xuetangx', name: '学堂在线', url: 'https://www.xuetangx.com', desc: '清华大学发起慕课平台', cat: 'study', icon: fav('https://www.xuetangx.com') },
  { slug: 'leetcode', name: '力扣 LeetCode', url: 'https://leetcode.cn', desc: '算法题库与面试准备', cat: 'study', icon: fav('https://leetcode.cn') },
  { slug: 'duolingo', name: '多邻国', url: 'https://www.duolingo.com', desc: '游戏化外语学习', cat: 'study', icon: fav('https://www.duolingo.com') },
  { slug: 'coursera', name: 'Coursera', url: 'https://www.coursera.org', desc: '全球名校在线课程', cat: 'study', icon: fav('https://www.coursera.org') },
  { slug: 'cnki', name: '中国知网', url: 'https://www.cnki.net', desc: '学术文献数据库', cat: 'study', icon: fav('https://www.cnki.net') },

  /* ---- 效率办公 ---- */
  { slug: 'docs-qq', name: '腾讯文档', url: 'https://docs.qq.com', desc: '腾讯在线协作文档', cat: 'work', icon: fav('https://docs.qq.com') },
  { slug: 'shimo', name: '石墨文档', url: 'https://shimo.im', desc: '轻量在线协作文档', cat: 'work', icon: fav('https://shimo.im') },
  { slug: 'mubu', name: '幕布', url: 'https://mubu.com', desc: '大纲笔记与思维导图', cat: 'work', icon: fav('https://mubu.com') },
  { slug: 'processon', name: 'ProcessOn', url: 'https://www.processon.com', desc: '在线流程图与思维导图', cat: 'work', icon: fav('https://www.processon.com') },
  { slug: 'canva', name: 'Canva 可画', url: 'https://www.canva.cn', desc: '在线平面设计工具', cat: 'work', icon: fav('https://www.canva.cn') },
  { slug: 'deepl', name: 'DeepL', url: 'https://www.deepl.com', desc: '高质量 AI 翻译工具', cat: 'work', icon: fav('https://www.deepl.com') },
  { slug: 'tinypng', name: 'TinyPNG', url: 'https://tinypng.com', desc: '图片智能无损压缩', cat: 'work', icon: fav('https://tinypng.com') },
  { slug: 'notion', name: 'Notion', url: 'https://www.notion.so', desc: '一体化笔记与协作空间', cat: 'work', icon: fav('https://www.notion.so') },

  /* ---- 社交社区 ---- */
  { slug: 'weibo', name: '微博', url: 'https://weibo.com', desc: '中文社交媒体平台', cat: 'social', icon: fav('https://weibo.com'), hot: true },
  { slug: 'zhihu', name: '知乎', url: 'https://www.zhihu.com', desc: '中文问答知识社区', cat: 'social', icon: 'thesvg:zhihu', hot: true },
  { slug: 'douban', name: '豆瓣', url: 'https://www.douban.com', desc: '书影音评分与兴趣社区', cat: 'social', icon: 'thesvg:douban' },
  { slug: 'xiaohongshu', name: '小红书', url: 'https://www.xiaohongshu.com', desc: '生活方式分享社区', cat: 'social', icon: 'thesvg:xiaohongshu', hot: true },
  { slug: 'weixin-mp', name: '微信公众平台', url: 'https://mp.weixin.qq.com', desc: '微信公众号内容平台', cat: 'social', icon: 'thesvg:wechat' },
  { slug: 'x', name: 'X (Twitter)', url: 'https://x.com', desc: '全球实时社交平台', cat: 'social', icon: 'thesvg:twitter' },
  { slug: 'telegram', name: 'Telegram', url: 'https://web.telegram.org', desc: '即时通讯与频道', cat: 'social', icon: 'thesvg:telegram' },
  { slug: 'reddit', name: 'Reddit', url: 'https://www.reddit.com', desc: '全球兴趣社区论坛', cat: 'social', icon: fav('https://www.reddit.com') },

  /* ---- 图片设计 ---- */
  { slug: 'unsplash', name: 'Unsplash', url: 'https://unsplash.com', desc: '免费高清摄影图库', cat: 'pic', icon: fav('https://unsplash.com') },
  { slug: 'pexels', name: 'Pexels', url: 'https://www.pexels.com', desc: '免费商用图片与视频', cat: 'pic', icon: fav('https://www.pexels.com') },
  { slug: 'dribbble', name: 'Dribbble', url: 'https://dribbble.com', desc: '设计师作品社区', cat: 'pic', icon: fav('https://dribbble.com') },
  { slug: 'behance', name: 'Behance', url: 'https://www.behance.net', desc: 'Adobe 旗下设计社区', cat: 'pic', icon: fav('https://www.behance.net') },
  { slug: 'gaoding', name: '稿定设计', url: 'https://www.gaoding.com', desc: '在线平面设计模板', cat: 'pic', icon: fav('https://www.gaoding.com') },
  { slug: 'huaban', name: '花瓣网', url: 'https://huaban.com', desc: '图片灵感收集工具', cat: 'pic', icon: fav('https://huaban.com') },
  { slug: 'iconfont', name: '阿里图标库', url: 'https://www.iconfont.cn', desc: '阿里巴巴矢量图标库', cat: 'pic', icon: fav('https://www.iconfont.cn') },
  { slug: 'pixabay', name: 'Pixabay', url: 'https://pixabay.com', desc: '免费版权图片视频', cat: 'pic', icon: fav('https://pixabay.com') },

  /* ---- 购物生活 ---- */
  { slug: 'taobao', name: '淘宝', url: 'https://www.taobao.com', desc: '综合网购平台', cat: 'shop', icon: 'thesvg:taobao', hot: true },
  { slug: 'jd', name: '京东', url: 'https://www.jd.com', desc: '自营电商与快捷物流', cat: 'shop', icon: fav('https://www.jd.com'), hot: true },
  { slug: 'tmall', name: '天猫', url: 'https://www.tmall.com', desc: '品牌旗舰店集合', cat: 'shop', icon: fav('https://www.tmall.com') },
  { slug: 'pdd', name: '拼多多', url: 'https://www.pinduoduo.com', desc: '社交拼团电商', cat: 'shop', icon: fav('https://www.pinduoduo.com') },
  { slug: 'suning', name: '苏宁易购', url: 'https://www.suning.com', desc: '综合电器网购', cat: 'shop', icon: fav('https://www.suning.com') },
  { slug: 'vip', name: '唯品会', url: 'https://www.vip.com', desc: '品牌特卖平台', cat: 'shop', icon: fav('https://www.vip.com') },
  { slug: 'rail12306', name: '铁路12306', url: 'https://www.12306.cn', desc: '官方火车票购票平台', cat: 'shop', icon: fav('https://www.12306.cn') },
  { slug: 'ctrip', name: '携程', url: 'https://www.ctrip.com', desc: '机票酒店旅行服务', cat: 'shop', icon: fav('https://www.ctrip.com') },

  /* ---- 游戏 ---- */
  { slug: 'steam', name: 'Steam', url: 'https://store.steampowered.com', desc: '全球最大 PC 游戏平台', cat: 'game', icon: fav('https://store.steampowered.com') },
  { slug: 'epic', name: 'Epic Games', url: 'https://store.epicgames.com', desc: 'Epic 游戏商城，每周免费领', cat: 'game', icon: fav('https://store.epicgames.com') },
  { slug: 'taptap', name: 'TapTap', url: 'https://www.taptap.cn', desc: '手游评分下载社区', cat: 'game', icon: fav('https://www.taptap.cn') },
  { slug: '4399', name: '4399小游戏', url: 'https://www.4399.com', desc: '在线小游戏合集', cat: 'game', icon: fav('https://www.4399.com') },
  { slug: 'mihoyo', name: '米哈游', url: 'https://www.mihoyo.com', desc: '原神等游戏官方网站', cat: 'game', icon: fav('https://www.mihoyo.com') },
]

/** 重复性自检（开发期防护）：slug / url 必须唯一 */
if (import.meta.env.DEV) {
  const seen = new Set()
  for (const s of DIRECTORY_SITES) {
    if (seen.has(s.slug) || seen.has(s.url)) {
      throw new Error(`[directory] 重复条目: ${s.slug} / ${s.url}`)
    }
    seen.add(s.slug)
    seen.add(s.url)
  }
}

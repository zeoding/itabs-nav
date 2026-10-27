import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'
import { SEARCH_ENGINES, DEFAULT_SEARCH_URL, WALLPAPER_API } from '@/config/api'

/**
 * 全局设置 Store（原 useSettings 迁移至 Pinia）
 * 持久化到 IndexedDB，icon 存 slug 避免库膨胀
 * 搜索引擎地址见 @/config/api SEARCH_ENGINES
 */

/** 用 slug 创建引擎对象（自定义 url 也支持） */
function eng(slug, name, key, customUrl) {
  return {
    key: key || slug,
    name,
    icon: slug,
    url: customUrl || SEARCH_ENGINES[slug]?.url || DEFAULT_SEARCH_URL,
  }
}

const DEFAULT_ENGINES = [
  eng('baidu', '百度', 'baidu'),
  eng('bing', '必应', 'bing'),
  eng('google', 'Google', 'google'),
  eng('duckduckgo', 'Duck', 'duck'),
]

/** 弹窗里供用户管理的"常用引擎"清单 */
export const COMMON_ENGINES = [
  eng('baidu', '百度', 'baidu'),
  eng('bing', '必应', 'bing'),
  eng('google', 'Google', 'google'),
  eng('duckduckgo', 'Duck', 'duck'),
  eng('sogou', '搜狗', 'sogou'),
  eng('yandex', 'Yandex', 'yandex'),
  eng('wechat', '微信', 'weixin'),
]

const DEFAULTS = {
  wallpaperMode: 'random',
  wallpaper: '',
  wallpaperRefreshHours: 12,
  engines: DEFAULT_ENGINES,
  currentEngineKey: 'baidu',
  gridColumns: 'auto',
  themeColor: '#6366f1',
  language: 'zh-CN',
  themeMode: 'auto',
}

/** 随机壁纸可选刷新间隔（小时） */
export const WALLPAPER_REFRESH_OPTIONS = [1, 4, 8, 12]

/** 本地兜底壁纸：自定义/随机壁纸加载失败时顶上（public/ 下，已进 SW 预缓存） */
const WALLPAPER_FALLBACK = `${import.meta.env.BASE_URL}wallhaven-yqkl97.jpg`

/** 定时器 store 级单例 */
let wallpaperTimer = null

/** 预设主题色 */
export const THEME_PRESETS = [
  { key: 'indigo', name: '靛蓝', value: '#6366f1' },
  { key: 'violet', name: '紫罗兰', value: '#8b5cf6' },
  { key: 'rose', name: '玫瑰', value: '#f43f5e' },
  { key: 'emerald', name: '翡翠', value: '#10b981' },
  { key: 'amber', name: '琥珀', value: '#f59e0b' },
  { key: 'sky', name: '天蓝', value: '#0ea5e9' },
]

/** 对外暴露默认值，供"重置设置"使用 */
export const SETTINGS_DEFAULTS = DEFAULTS

/** 系统深色偏好（模块级单例） */
const systemDark = ref(false)
let mediaHooked = false
function hookSystemTheme(onChange) {
  if (mediaHooked || typeof window === 'undefined' || !window.matchMedia) return
  mediaHooked = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  const handler = (e) => {
    systemDark.value = e.matches
    onChange?.()
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler)
  else if (typeof mq.addListener === 'function') mq.addListener(handler)
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({ ...DEFAULTS })
  const wallpaperSeed = ref(Date.now())

  function refreshHours() {
    const h = Number(settings.value.wallpaperRefreshHours)
    return WALLPAPER_REFRESH_OPTIONS.includes(h) ? h : 12
  }

  function stopWallpaperTimer() {
    if (wallpaperTimer) {
      clearInterval(wallpaperTimer)
      wallpaperTimer = null
    }
  }

  function scheduleWallpaperTimer() {
    stopWallpaperTimer()
    if (settings.value.wallpaperMode !== 'random') return
    wallpaperTimer = setInterval(() => {
      wallpaperSeed.value = Date.now()
    }, refreshHours() * 3600 * 1000)
  }

  function refreshWallpaper() {
    if (settings.value.wallpaperMode !== 'random') return
    wallpaperSeed.value = Date.now()
  }

  function applyThemeColor() {
    if (typeof document === 'undefined') return
    const c = settings.value.themeColor
    if (c) document.documentElement.style.setProperty('--color-accent', c)
  }

  const isDark = computed(
    () => settings.value.themeMode === 'dark' || (settings.value.themeMode !== 'light' && systemDark.value)
  )

  function applyTheme() {
    if (typeof document === 'undefined') return
    if (isDark.value) document.documentElement.dataset.theme = 'dark'
    else document.documentElement.removeAttribute('data-theme')
  }

  hookSystemTheme(() => {
    if (settings.value.themeMode === 'auto') applyTheme()
  })

  async function load() {
    // 一次性读全表再合并，避免按 key 逐条 getSetting 的多次 IDB 往返
    const rows = await db.getAllSettings()
    const stored = new Map(rows.map((r) => [r.key, r.value]))
    const next = {}
    for (const key of Object.keys(DEFAULTS)) {
      // 区分"存过 null"与"没存过"：存过则用存储值，否则回退默认
      next[key] = stored.has(key) ? stored.get(key) : DEFAULTS[key]
    }
    settings.value = next
    applyThemeColor()
    applyTheme()
    scheduleWallpaperTimer()
  }

  /* 高频 set（如 color picker 拖动时每秒数十次 input）按 key 防抖落库：
     内存态与 CSS 变量仍即时生效，避免每次 input 都开一次 IndexedDB 事务 */
  const pendingSaves = new Map()
  function persistDebounced(key, value) {
    const prev = pendingSaves.get(key)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      pendingSaves.delete(key)
      db.setSetting(key, value).catch(() => {
        /* 落库失败不影响内存态，下次修改会重试 */
      })
    }, 300)
    pendingSaves.set(key, timer)
  }

  function set(key, value) {
    // 直接改属性，避免整体替换对象导致所有依赖 settings 的计算属性重算
    settings.value[key] = value
    persistDebounced(key, value)
    if (key === 'themeColor') applyThemeColor()
    if (key === 'themeMode') applyTheme()
    if (key === 'wallpaperMode' || key === 'wallpaperRefreshHours') {
      if (settings.value.wallpaperMode === 'random') wallpaperSeed.value = Date.now()
      scheduleWallpaperTimer()
    }
  }

  async function applyEngineChanges({ add = [], remove = [] } = {}) {
    const current = settings.value.engines
    const removeSet = new Set(remove)
    const next = current.filter((e) => !removeSet.has(e.key))
    const nextKeys = new Set(next.map((e) => e.key))
    for (const e of add) {
      if (!nextKeys.has(e.key)) {
        next.push(e)
        nextKeys.add(e.key)
      }
    }
    let cur = settings.value.currentEngineKey
    if (removeSet.has(cur)) {
      cur = next[0]?.key || ''
    }
    // 就地改属性（同 set 的注释）：整体替换会让 backgroundStyle 等所有
    // 依赖 settings 的 computed 全部重算
    settings.value.engines = next
    settings.value.currentEngineKey = cur
    await Promise.all([
      db.setSetting('engines', next),
      db.setSetting('currentEngineKey', cur),
    ])
    return { engines: next, currentEngineKey: cur }
  }

  async function setCurrentEngine(key) {
    await set('currentEngineKey', key)
  }

  /** 探活缓存：url -> 是否可用；同一地址（含相同 seed 的随机图）不重复请求 */
  const wallpaperProbeCache = new Map()
  /** 当前壁纸是否探活失败；失败时 backgroundStyle 顶本地兜底图 */
  const wallpaperBroken = ref(false)

  /** 当前生效的壁纸 URL；gradient 模式返回空串 */
  const requestedWallpaper = computed(() => {
    const { wallpaperMode, wallpaper } = settings.value
    if (wallpaperMode === 'image' && wallpaper) return wallpaper
    if (wallpaperMode === 'random') return WALLPAPER_API.random(wallpaperSeed.value)
    return ''
  })

  /** 背景图加载失败不派发任何事件，用 Image 预加载探活 */
  function probeWallpaper(url) {
    const cached = wallpaperProbeCache.get(url)
    if (cached !== undefined) {
      wallpaperBroken.value = !cached
      return
    }
    if (typeof Image === 'undefined') return
    const img = new Image()
    img.onload = () => {
      wallpaperProbeCache.set(url, true)
      if (requestedWallpaper.value === url) wallpaperBroken.value = false
    }
    img.onerror = () => {
      wallpaperProbeCache.set(url, false)
      if (requestedWallpaper.value === url) wallpaperBroken.value = true
    }
    img.src = url
  }

  watch(
    requestedWallpaper,
    (url) => {
      wallpaperBroken.value = false // 先按可用展示，探活失败同 tick 内会被缓存/回调纠正
      if (url) probeWallpaper(url)
    },
    { immediate: true }
  )

  /* 断网恢复后清缓存重探当前壁纸，自动解除兜底态 */
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      const url = requestedWallpaper.value
      if (!url) return
      wallpaperProbeCache.delete(url)
      wallpaperBroken.value = false
      probeWallpaper(url)
    })
  }

  const backgroundStyle = computed(() => {
    const url = requestedWallpaper.value
    if (url) {
      return {
        backgroundImage: `url(${wallpaperBroken.value ? WALLPAPER_FALLBACK : url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }
    }
    if (isDark.value) {
      return {
        backgroundImage: 'linear-gradient(135deg, #0b1120 0%, #1e1b4b 100%)',
      }
    }
    return {
      backgroundImage: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
    }
  })

  return {
    settings,
    load,
    set,
    applyEngineChanges,
    setCurrentEngine,
    applyThemeColor,
    backgroundStyle,
    wallpaperSeed,
    scheduleWallpaperTimer,
    stopWallpaperTimer,
    refreshWallpaper,
    isDark,
    applyTheme,
  }
})

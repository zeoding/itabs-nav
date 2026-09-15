import { ref, computed } from 'vue'
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
    const entries = await Promise.all(
      Object.keys(DEFAULTS).map(async (key) => {
        const value = await db.getSetting(key, DEFAULTS[key])
        return [key, value]
      })
    )
    settings.value = Object.fromEntries(entries)
    applyThemeColor()
    applyTheme()
    scheduleWallpaperTimer()
  }

  async function set(key, value) {
    settings.value = { ...settings.value, [key]: value }
    await db.setSetting(key, value)
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
    settings.value = { ...settings.value, engines: next, currentEngineKey: cur }
    await Promise.all([
      db.setSetting('engines', next),
      db.setSetting('currentEngineKey', cur),
    ])
    return { engines: next, currentEngineKey: cur }
  }

  async function setCurrentEngine(key) {
    await set('currentEngineKey', key)
  }

  const backgroundStyle = computed(() => {
    const { wallpaperMode, wallpaper } = settings.value
    const seed = wallpaperSeed.value
    if (wallpaperMode === 'image' && wallpaper) {
      return {
        backgroundImage: `url(${wallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }
    }
    if (wallpaperMode === 'random') {
      return {
        backgroundImage: `url(${WALLPAPER_API.random(seed)})`,
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

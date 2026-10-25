import { ref } from 'vue'
import { defineStore } from 'pinia'
import http from '@/utils/http'
import { HOT_API } from '@/config/api'
import { getLanguage } from '@/composables/useI18n'
import { getDaily, getAny, setDaily } from '@/utils/dailyCache'

/**
 * 热榜源配置
 * - 结构完全同构（每个源都是「uapis 主源 + imsyy 备源」），由 HOT_API.sources 派生，
 *   新增热榜源只需在 config/api.js 的 HOT_API.sources 加一行
 * - endpoints 按优先级排列，load() 依次尝试直到解析出非空列表
 */
const ENDPOINT_BUILDERS = [
  { parser: 'uapis', url: (type) => HOT_API.endpoints.uapis.url(type) },
  { parser: 'imsyy', url: (type) => HOT_API.endpoints.imsyy.url(type) },
]

const SOURCES = Object.fromEntries(
  Object.entries(HOT_API.sources).map(([key, meta]) => [
    key,
    {
      key,
      name: meta.name,
      color: meta.color,
      endpoints: ENDPOINT_BUILDERS.map(({ parser, url }) => ({ parser, url: url(key) })),
    },
  ])
)

/** 全部失败时使用空数据（按源 key 生成，避免手工枚举漂移） */
const FALLBACK = Object.fromEntries(Object.keys(HOT_API.sources).map((k) => [k, []]))

function parseVvhan(json) {
  if (!json || !json.success || !Array.isArray(json.data)) return null
  return json.data.slice(0, 30).map((item) => ({
    title: item.title || '',
    url: item.url || '#',
    hot: Number(item.hot?.replace(/[^\d]/g, '') || item.hot || 0),
  }))
}

function parseImsyy(json) {
  if (!json || json.code !== 200 || !Array.isArray(json.data)) return null
  return json.data.slice(0, 30).map((item) => ({
    title: item.title || '',
    url: item.url || '#',
    hot: Number(String(item.hot || '').replace(/[^\d]/g, '')) || 0,
  }))
}

function parseUapis(json) {
  if (!json) return null
  if (json.code !== undefined && json.code !== 200 && json.code !== 0) return null
  if (json.retcode !== undefined && json.retcode !== 200 && json.retcode !== 0) return null
  const candidates = []
  if (Array.isArray(json.data)) {
    candidates.push(json.data)
  } else if (json.data && typeof json.data === 'object') {
    if (Array.isArray(json.data.list)) candidates.push(json.data.list)
    if (Array.isArray(json.data.items)) candidates.push(json.data.items)
    if (Array.isArray(json.data.records)) candidates.push(json.data.records)
    if (Array.isArray(json.data.entries)) candidates.push(json.data.entries)
  }
  if (Array.isArray(json.result)) candidates.push(json.result)
  if (Array.isArray(json.list)) candidates.push(json.list)
  const list = candidates.find((c) => c.length > 0)
  if (!list) return null
  return list.slice(0, 30).map((item) => {
    const title = item.title || item.word || item.keyword || item.name || ''
    const url = item.url || item.link || item.mobileUrl || item.mobile_url || '#'
    const hotRaw = item.hot ?? item.heat ?? item.score ?? item.hot_value ?? item.readCount ?? 0
    const hot = Number(String(hotRaw).replace(/[^\d]/g, '')) || 0
    return { title, url, hot }
  }).filter((it) => it.title)
}

const PARSERS = {
  vvhan: parseVvhan,
  imsyy: parseImsyy,
  uapis: parseUapis,
}

/** 格式化热度数字 */
export function formatHot(n) {
  if (!n) return '0'
  if (getLanguage() !== 'en') {
    if (n < 10000) return String(n)
    if (n < 100000000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
    return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
  }
  if (n < 1000) return String(n)
  if (n < 1000000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  if (n < 1000000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
}

function hotCacheKey(source) {
  return `itabs.cache.hot.${source}`
}

function normalizeHotArgs(source, force) {
  let s = source
  let f = force
  if (typeof s === 'boolean') {
    f = s
    s = undefined
  } else if (s && typeof s === 'object') {
    f = s.force ?? s.refresh ?? false
    s = s.source
  }
  if (f && typeof f === 'object') f = f.force ?? f.refresh ?? false
  return { source: s, force: !!f }
}

/** 热榜 Store（原 useHot 迁移至 Pinia） */
export const useHotStore = defineStore('hot', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const currentSource = ref('weibo')
  const lastUpdated = ref(null)
  const fromCache = ref(false)
  const usedFallback = ref(false)
  const failedEndpoints = ref([])
  const currentEndpoint = ref(null)
  const sourceList = Object.values(SOURCES)

  async function httpGet(url) {
    return http.get(url)
  }

  async function load(source, force) {
    const args = normalizeHotArgs(source, force)
    source = args.source || currentSource.value
    force = args.force
    if (!SOURCES[source]) return
    // 同源请求进行中且非强制刷新：复用在途请求（防首屏与弹窗并发双请求）；
    // 切换到其他源不受影响，照常发起
    if (loading.value && !force && source === currentSource.value) return
    currentSource.value = source
    if (!force) {
      const hit = await getDaily(hotCacheKey(source))
      if (hit && Array.isArray(hit.payload?.items) && hit.payload.items.length) {
        data.value = hit.payload.items
        lastUpdated.value = hit.savedAt ? new Date(hit.savedAt) : new Date()
        fromCache.value = true
        error.value = null
        usedFallback.value = false
        failedEndpoints.value = []
        currentEndpoint.value = hit.payload.endpoint || null
        return hit.payload.items
      }
    }
    loading.value = true
    error.value = null
    usedFallback.value = false
    failedEndpoints.value = []
    currentEndpoint.value = null

    const sourceConfig = SOURCES[source]
    let result = null
    let lastError = null

    for (const endpoint of sourceConfig.endpoints) {
      try {
        const json = await httpGet(endpoint.url)
        const parser = PARSERS[endpoint.parser]
        if (parser) {
          const parsed = parser(json, source)
          if (parsed && parsed.length > 0) {
            result = parsed
            currentEndpoint.value = endpoint.url
            break
          }
        }
      } catch (e) {
        const msg = e.message || 'unknown'
        console.warn(`[hot] ${source} @ ${endpoint.url} 失败:`, msg)
        failedEndpoints.value.push(`${endpoint.parser}:${msg}`)
        lastError = e
      }
    }

    /** 兜底命中的缓存时间（复用同一次读，避免下面再查一遍 IDB） */
    let staleSavedAt = null
    if (!result) {
      const stale = await getAny(hotCacheKey(source))
      if (stale && Array.isArray(stale.payload?.items) && stale.payload.items.length) {
        result = stale.payload.items
        currentEndpoint.value = stale.payload.endpoint || null
        fromCache.value = true
        staleSavedAt = stale.savedAt || null
      } else {
        console.warn(`[hot] ${source} 所有端点失败，使用兜底数据`)
        result = FALLBACK[source] || []
        fromCache.value = false
      }
      usedFallback.value = true
      if (lastError) error.value = lastError.message
    } else {
      fromCache.value = false
    }

    const items = result.slice(0, 15)
    data.value = items
    const now = new Date()
    lastUpdated.value = now
    loading.value = false
    if (result && !usedFallback.value) {
      await setDaily(hotCacheKey(source), { items, endpoint: currentEndpoint.value })
    } else if (result && usedFallback.value && fromCache.value && staleSavedAt) {
      lastUpdated.value = new Date(staleSavedAt)
    }
    return items
  }

  return {
    sourceList,
    data,
    loading,
    error,
    currentSource,
    lastUpdated,
    fromCache,
    usedFallback,
    load,
  }
})

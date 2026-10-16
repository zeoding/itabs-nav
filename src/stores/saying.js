import { ref } from 'vue'
import { defineStore } from 'pinia'
import http from '@/utils/http'
import { SAYING_API } from '@/config/api'
import { getDaily, getAny, setDaily } from '@/utils/dailyCache'

const { mode: MODE, category: CATEGORY } = SAYING_API.defaultParams
const CACHE_KEY = 'itabs.cache.saying'

function normalize(payload) {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload.item && typeof payload.item === 'object' ? payload.item : payload
  const content = obj.content
  if (typeof content !== 'string' || !content.trim()) return null
  return {
    content,
    source: obj.source || '',
    category: obj.category || '',
  }
}

let autoLoaded = false

/** 一言 Store（原 useSaying 迁移至 Pinia） */
export const useSayingStore = defineStore('saying', () => {
  const saying = ref('')
  const source = ref('')
  const loading = ref(false)
  const error = ref(null)
  const ready = ref(false)
  const fromCache = ref(false)
  const lastUpdated = ref(null)

  async function load(force = false) {
    if (loading.value) return
    if (!force) {
      const hit = await getDaily(CACHE_KEY)
      if (hit?.payload?.content) {
        saying.value = hit.payload.content
        source.value = hit.payload.source || ''
        ready.value = true
        fromCache.value = true
        lastUpdated.value = hit.savedAt || null
        return
      }
    }
    loading.value = true
    error.value = null
    try {
      const data = await http.get(SAYING_API.random(), {
        params: { mode: MODE, category: CATEGORY },
      })
      const norm = normalize(data)
      if (!norm || !norm.content) {
        throw new Error('响应格式不符合预期')
      }
      saying.value = norm.content
      source.value = norm.source || ''
      ready.value = true
      fromCache.value = false
      lastUpdated.value = Date.now()
      await setDaily(CACHE_KEY, { content: norm.content, source: norm.source, category: norm.category })
    } catch (e) {
      const stale = await getAny(CACHE_KEY)
      if (stale?.payload?.content) {
        saying.value = stale.payload.content
        source.value = stale.payload.source || ''
        ready.value = true
        fromCache.value = true
        lastUpdated.value = stale.savedAt || null
      }
      error.value = e?.message || String(e)
      console.warn('[saying] 拉取名言失败：', e)
    } finally {
      loading.value = false
    }
  }

  /** 首个挂载者调用一次即可（替代原来 composable 内 onMounted） */
  function ensureAutoLoad() {
    if (!autoLoaded) {
      autoLoaded = true
      load(false)
    }
  }

  return {
    saying,
    source,
    loading,
    ready,
    // 与 hot / weather 两个 store 对齐：错误与缓存状态一并暴露，
    // 否则 load() 里对 error 的赋值落在一个 UI 读不到的地方（失败被静默吞掉）
    error,
    fromCache,
    lastUpdated,
    ensureAutoLoad,
    refresh: () => load(true),
  }
})

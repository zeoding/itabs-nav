import { getCache, setCache, purgeStaleCache } from '@/db'
import { formatYMD as todayStr } from '@/utils/datetime'

/**
 * 每日缓存工具（IndexedDB `cache` 表）
 *
 * 目标：天气 / 热榜等低频变化数据，每天首次进入才请求网络，
 * 当天内再次打开 / 刷新页面直接读缓存，手动刷新才强制走网络。
 *
 * 存储结构：{ key, date: 'YYYY-MM-DD', savedAt: number, payload: any }
 * 老版本 localStorage（`key` 本身即 localStorage key）命中时自动迁入 IDB。
 */

function safeParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isValidWrap(wrap) {
  return wrap && typeof wrap === 'object' && 'payload' in wrap
}

/** 读 localStorage 遗留并迁入 IDB（一次性，命中后清理遗留） */
async function migrateLegacy(key) {
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  const wrap = safeParse(raw)
  if (!isValidWrap(wrap)) return null
  try {
    await setCache(key, { date: wrap.date, savedAt: wrap.savedAt, payload: wrap.payload })
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  return wrap
}

async function readEntry(key) {
  try {
    const row = await getCache(key)
    if (row && isValidWrap(row)) return row
  } catch {
    /* ignore，回退遗留 */
  }
  return migrateLegacy(key)
}

/** 读当天缓存：日期不是今天则视为 miss，返回 null */
export async function getDaily(key) {
  const wrap = await readEntry(key)
  if (!wrap) return null
  if (wrap.date !== todayStr()) return null
  return wrap
}

/** 读任意缓存（含过期，用于网络失败时兜底展示） */
export async function getAny(key) {
  return readEntry(key)
}

/** 过期清理防重入：每天至多跑一次（模块级，页面刷新后重置也无妨） */
let lastPurgeDate = null

async function purgeExpired() {
  const today = todayStr()
  if (lastPurgeDate === today) return
  lastPurgeDate = today
  try {
    await purgeStaleCache(today)
  } catch {
    /* 清理失败不影响本次写入 */
  }
}

export async function setDaily(key, payload) {
  try {
    const wrap = { date: todayStr(), savedAt: Date.now(), payload }
    await setCache(key, wrap)
    // 顺带清理过期行：cache 表只写不删会无限积累（weather 缓存按城市/语言成行）
    purgeExpired()
    return wrap
  } catch {
    return null
  }
}

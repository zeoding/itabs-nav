import { reactive } from 'vue'
import { compareVersion } from '@/utils/version'

/**
 * 版本更新检查（全局单例，设计参考 useMessage / useTip：composable + Host 组件分离）
 * - 远程元信息：构建产物 dist/version.json（vite.config versionMetaPlugin 生成）
 * - 本地构建标识：vite define 注入的 __APP_VERSION__ / __BUILD_TIME__
 * - 判定顺序（关键）：
 *   1) buildTime：主判据。每次构建自动递增，不依赖人工改版本号，
 *      能覆盖「同一版本号多次发布」的情况（本项目当前就是如此）
 *   2) version：次级判据。兼容托管方 version.json 陈旧 / 手工改版本号未重建
 * - 提示控制：「稍后」按**版本号**记录，遇到更新版本时自动失效；
 *   「忽略此版本」写 localStorage，重启也不再提示该版本
 * - 静默失败：file:// 打开 / 离线 / 托管平台未部署 version.json 均不提示
 */
const LS_KEY_IGNORED = 'itabs-nav:update-ignored'
const LS_KEY_LAST_CHECK = 'itabs-nav:update-last-check'
const START_DELAY = 8 * 1000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000
// 标签页回到可见时的补检间隔：比轮询短，兼顾常驻标签页不漏更新又不过频
const VISIBLE_RECHECK_GAP = 30 * 60 * 1000

/** 本地构建时间戳（vite define 注入；缺失时按 0 处理并退化为版本号判据） */
const LOCAL_VERSION = String(__APP_VERSION__)
const LOCAL_BUILD_TIME = Number(__BUILD_TIME__) || 0

export const updateState = reactive({
  /** 待展示的新版本信息 { version, notes, buildTime } | null */
  available: null,
  /**
   * 本次会话内用户点过「稍后」的版本号（未点过为 null）
   * 按版本记录而非布尔值：否则一个标签页里点过「稍后」后，
   * 后续发布的更高版本会被永久拦截，直到用户手动刷新页面。
   */
  dismissedVersion: null,
})

let started = false
let stopped = false
let timer = null

function lsGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式等写入失败不影响主流程 */
  }
}

/** 版本号归一化（忽略 v 前缀）：用于「稍后 / 忽略」的比较与存储 */
function normalizeVersion(v) {
  return String(v || '').replace(/^v/i, '')
}

/** 拉取远程 version.json（时间戳参数绕过 HTTP 缓存） */
async function fetchRemoteMeta() {
  const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data || typeof data.version !== 'string') throw new Error('invalid version.json')
  return data
}

/**
 * 执行一次检查
 * @param {object} [opts]
 * @param {boolean} [opts.manual] 关于页手动触发：不受「会话内已稍后」限制
 * @returns {Promise<'latest'|'available'|'ignored'|'dismissed'|'error'>}
 */
async function check(opts = {}) {
  try {
    const meta = await fetchRemoteMeta()
    lsSet(LS_KEY_LAST_CHECK, String(Date.now()))

    const remoteBuildTime = Number(meta.buildTime) || 0
    const remoteVersion = normalizeVersion(meta.version)
    const localVersion = normalizeVersion(LOCAL_VERSION)

    // 1) 主判据：构建时间戳。远端更晚 ⇒ 部署了新的构建产物
    let hasUpdate = remoteBuildTime > LOCAL_BUILD_TIME
    // 2) 次级判据：版本号（远端 buildTime 缺失或陈旧时兜底）
    if (!hasUpdate) hasUpdate = compareVersion(remoteVersion, localVersion) > 0
    if (!hasUpdate) return 'latest'

    // 3) 该版本已被「忽略此版本」：持久化跳过（更高版本仍会提示）
    if (remoteVersion === normalizeVersion(lsGet(LS_KEY_IGNORED))) return 'ignored'

    // 4) 该版本已被「稍后提醒」：本次会话不再自动弹出（手动检查时仍可再次查看）
    if (!opts.manual && normalizeVersion(updateState.dismissedVersion || '') === remoteVersion) {
      return 'dismissed'
    }

    updateState.available = {
      version: meta.version,
      notes: typeof meta.notes === 'string' ? meta.notes : '',
      buildTime: remoteBuildTime,
    }
    return 'available'
  } catch {
    return 'error'
  }
}

/** 标签页回到可见：距上次检查超过间隔才补检（常驻标签页的主要更新感知途径） */
function onVisible() {
  if (document.visibilityState !== 'visible') return
  const last = Number(lsGet(LS_KEY_LAST_CHECK)) || 0
  if (Date.now() - last < VISIBLE_RECHECK_GAP) return
  check()
}

/** App 挂载后启动（幂等） */
function start() {
  if (started) return
  started = true
  stopped = false
  async function tick() {
    await check()
    // stop() 无法取消已在进行中的 check，这里补一道自检，避免卸载后续期定时器
    if (stopped) return
    timer = setTimeout(tick, CHECK_INTERVAL)
  }
  timer = setTimeout(tick, START_DELAY)
  document.addEventListener('visibilitychange', onVisible)
}

function stop() {
  stopped = true
  clearTimeout(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  started = false
}

/** 「稍后提醒」：本次会话不再自动弹出（仅针对当前这个版本） */
function dismiss() {
  if (updateState.available) {
    updateState.dismissedVersion = normalizeVersion(updateState.available.version)
  }
  updateState.available = null
}

/** 「忽略此版本」：持久化，重启也不再提示该版本 */
function ignoreVersion(version) {
  lsSet(LS_KEY_IGNORED, normalizeVersion(version))
  updateState.available = null
}

/** 「立即刷新」：产物均为 hash 文件名，刷新即完成更新 */
function reload() {
  location.reload()
}

export function useUpdateChecker() {
  return { updateState, start, stop, check, dismiss, ignoreVersion, reload }
}

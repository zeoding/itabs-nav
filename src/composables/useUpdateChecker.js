import { reactive } from 'vue'
import { compareVersion } from '@/utils/version'

/**
 * 版本更新检查（全局单例，设计参考 useMessage / useTip：composable + Host 组件分离）
 * - 远程元信息：构建产物 dist/version.json（vite.config versionMetaPlugin 生成）
 * - 本地版本：vite define 注入的 __APP_VERSION__（取自 package.json）
 * - 触发时机：启动延迟首检（避开首屏资源竞争）+ 6h 轮询 + 标签页回到可见时补检
 * - 提示控制：「稍后」本次会话不再弹；「忽略此版本」写 localStorage，重启也不弹
 * - 静默失败：file:// 打开 / 离线 / 托管平台未部署 version.json 均不提示
 */
const LS_KEY_IGNORED = 'itabs-nav:update-ignored'
const LS_KEY_LAST_CHECK = 'itabs-nav:update-last-check'
const START_DELAY = 8 * 1000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000
// 标签页回到可见时的补检间隔：比轮询短，兼顾常驻标签页不漏更新又不过频
const VISIBLE_RECHECK_GAP = 30 * 60 * 1000

export const updateState = reactive({
  /** 待展示的新版本信息 { version, notes, buildTime } | null */
  available: null,
  /** 本次会话内用户点过「稍后」：会话内不再自动弹出 */
  dismissed: false,
})

let started = false
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
 * @param {boolean} [opts.manual] 关于页手动触发：不受「会话内已关闭」限制
 * @returns {Promise<'latest'|'available'|'error'>}
 */
async function check(opts = {}) {
  try {
    const meta = await fetchRemoteMeta()
    lsSet(LS_KEY_LAST_CHECK, String(Date.now()))
    if (compareVersion(meta.version, __APP_VERSION__) <= 0) return 'latest'
    if (meta.version === lsGet(LS_KEY_IGNORED)) return 'latest'
    if (updateState.dismissed && !opts.manual) return 'latest'
    updateState.available = {
      version: meta.version,
      notes: typeof meta.notes === 'string' ? meta.notes : '',
      buildTime: Number(meta.buildTime) || 0,
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
  async function tick() {
    await check()
    timer = setTimeout(tick, CHECK_INTERVAL)
  }
  timer = setTimeout(tick, START_DELAY)
  document.addEventListener('visibilitychange', onVisible)
}

function stop() {
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisible)
  started = false
}

/** 「稍后提醒」：本次会话不再自动弹出 */
function dismiss() {
  updateState.available = null
  updateState.dismissed = true
}

/** 「忽略此版本」：持久化，重启也不再提示该版本 */
function ignoreVersion(version) {
  lsSet(LS_KEY_IGNORED, version)
  updateState.available = null
}

/** 「立即刷新」：产物均为 hash 文件名，刷新即完成更新 */
function reload() {
  location.reload()
}

export function useUpdateChecker() {
  return { updateState, start, stop, check, dismiss, ignoreVersion, reload }
}

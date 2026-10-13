import { ref } from 'vue'
import { defineStore } from 'pinia'
import { setSetting, getSetting, migrateSetting } from '@/db'

/**
 * 轻量 UI 偏好 Store（数据源是 IndexedDB `settings` 表）
 * - snow：飘雪开关，默认开（遗留 localStorage `itab.snow === '0'` 为关）
 * - sidebarCollapsed：侧栏收起，默认展开（遗留 `itab.sidebar.collapsed === '1'` 为收起）
 * - minimalist：精简模式（只留搜索框），默认关；本项为新增设置，无遗留 localStorage 键
 *
 * 首屏体验：IndexedDB 是异步的，首绘若按默认值渲染、等 IDB 回填再纠正，
 * 会触发位移动画（搜索框下移/侧栏显隐），造成刷新闪跳。
 * 因此用同步 localStorage 做镜像：初始化时同步预读保证首绘即正确，
 * 写入时同步写穿，IDB 仍是跨端/备份的真相源（回填时以 IDB 为准并对齐镜像）。
 */
const LS_MIRROR = {
  snow: 'itabs-nav.ui.snow',
  sidebarCollapsed: 'itabs-nav.ui.sidebarCollapsed',
  minimalist: 'itabs-nav.ui.minimalist',
}

function readMirror(key) {
  try {
    const raw = localStorage.getItem(LS_MIRROR[key])
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    /* localStorage 不可用时视为无镜像 */
  }
  return null
}

function writeMirror(key, value) {
  try {
    localStorage.setItem(LS_MIRROR[key], value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export const useUiStore = defineStore('ui', () => {
  // 同步预读：首绘即正确，避免异步回填造成闪跳
  const snowOn = ref(readMirror('snow') ?? true)
  const sidebarCollapsed = ref(readMirror('sidebarCollapsed') ?? false)
  const minimalist = ref(readMirror('minimalist') ?? false)
  /** 首屏回填完成标记（App 用它门控过渡动画） */
  const uiReady = ref(false)

  // 异步回填（含 localStorage 遗留迁移）：以 IDB 为准，完成后对齐镜像
  // - fallback 传同步预读值：IDB 不可用时保留镜像选择，不回退到默认
  const readyPromise = (async () => {
    try {
      const [snow, collapsed, mini] = await Promise.all([
        migrateSetting('snow', 'itab.snow', snowOn.value, (legacy) => legacy !== '0'),
        migrateSetting('sidebarCollapsed', 'itab.sidebar.collapsed', sidebarCollapsed.value, (legacy) => legacy === '1'),
        getSetting('minimalist', minimalist.value),
      ])
      snowOn.value = !!snow
      sidebarCollapsed.value = !!collapsed
      minimalist.value = !!mini
      writeMirror('snow', snowOn.value)
      writeMirror('sidebarCollapsed', sidebarCollapsed.value)
      writeMirror('minimalist', minimalist.value)
    } catch {
      /* ignore */
    } finally {
      uiReady.value = true
    }
  })()

  function waitReady() {
    return readyPromise
  }

  async function setSnow(on) {
    snowOn.value = !!on
    writeMirror('snow', snowOn.value)
    try {
      await setSetting('snow', snowOn.value)
    } catch {
      /* ignore */
    }
  }

  function toggleSnow() {
    return setSnow(!snowOn.value)
  }

  async function setSidebarCollapsed(collapsed) {
    sidebarCollapsed.value = !!collapsed
    writeMirror('sidebarCollapsed', sidebarCollapsed.value)
    try {
      await setSetting('sidebarCollapsed', sidebarCollapsed.value)
    } catch {
      /* ignore */
    }
  }

  function toggleSidebarCollapsed() {
    return setSidebarCollapsed(!sidebarCollapsed.value)
  }

  async function setMinimalist(on) {
    minimalist.value = !!on
    writeMirror('minimalist', minimalist.value)
    try {
      await setSetting('minimalist', minimalist.value)
    } catch {
      /* ignore */
    }
  }

  function toggleMinimalist() {
    return setMinimalist(!minimalist.value)
  }

  /** 重载持久化偏好（重置 / 备份恢复后与 IndexedDB 对齐，并同步镜像） */
  async function reload() {
    try {
      const [snow, collapsed, mini] = await Promise.all([
        getSetting('snow', true),
        getSetting('sidebarCollapsed', false),
        getSetting('minimalist', false),
      ])
      snowOn.value = !!(snow ?? true)
      sidebarCollapsed.value = !!collapsed
      minimalist.value = !!mini
      writeMirror('snow', snowOn.value)
      writeMirror('sidebarCollapsed', sidebarCollapsed.value)
      writeMirror('minimalist', minimalist.value)
    } catch {
      /* ignore */
    }
  }

  return {
    snowOn,
    sidebarCollapsed,
    minimalist,
    uiReady,
    waitReady,
    toggleSnow,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    setMinimalist,
    toggleMinimalist,
    reload,
  }
})

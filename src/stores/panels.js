import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { setSetting, migrateSetting } from '@/db'

/**
 * 自定义面板 Store（数据已迁入 IndexedDB `settings` 表）
 * - 同 key + 同默认值，多组件共享
 * - 跨 tab 通过 BroadcastChannel 同步（localStorage 时代的 storage 事件已不再适用）
 */
export const PANELS_KEY = 'customPanels'
/** @deprecated 仅兼容旧引用，实际已不再读写 localStorage */
export const PANEL_STORAGE_KEY = 'itab.rail.custom'

export const DEFAULT_CUSTOM_PANELS = [
  { id: 'c1', icon: 'RiStarLine', title: '收藏' },
  { id: 'c2', icon: 'RiBookLine', title: '学习' },
]

function sanitize(list) {
  if (!Array.isArray(list)) return [...DEFAULT_CUSTOM_PANELS]
  return list.filter((p) => p && typeof p.id === 'string')
}

async function loadPanels() {
  const raw = await migrateSetting(
    PANELS_KEY,
    PANEL_STORAGE_KEY,
    [...DEFAULT_CUSTOM_PANELS],
    (legacy) => {
      const parsed = JSON.parse(legacy)
      if (!Array.isArray(parsed)) throw new Error('invalid legacy panels')
      return parsed
    }
  )
  const clean = sanitize(raw)
  // 兼容脏数据：读到空数组时回退默认（与旧 localStorage 行为一致）
  return clean.length ? clean : [...DEFAULT_CUSTOM_PANELS]
}

async function persist(list) {
  try {
    await setSetting(PANELS_KEY, list)
  } catch {
    /* ignore（IDB 不可用时仅内存生效） */
  }
}

let channelHooked = false
let channel = null
function getChannel() {
  if (channelHooked) return channel
  channelHooked = true
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('itabs-panels')
    }
  } catch {
    channel = null
  }
  return channel
}

export const usePanelsStore = defineStore('panels', () => {
  // 注意：不要直接返回 DEFAULT 常量引用，避免调用方误改常量
  const customPanels = ref([...DEFAULT_CUSTOM_PANELS])

  // 异步补齐 IDB 数据（含 localStorage 遗留迁移），不阻塞 store 创建
  loadPanels().then((list) => {
    customPanels.value = list
  })

  const ch = getChannel()
  if (ch && !ch.onmessage) {
    ch.onmessage = (e) => {
      if (Array.isArray(e.data)) customPanels.value = sanitize(e.data)
    }
  }

  const panelOrder = computed(() => ['home', ...customPanels.value.map((p) => p.id)])

  /** 全量替换（供 Sidebar 增删改后调用） */
  function setCustomPanels(list) {
    const arr = sanitize(Array.isArray(list) ? list : [])
    customPanels.value = arr
    persist(arr)
    try {
      getChannel()?.postMessage(arr)
    } catch {
      /* ignore */
    }
  }

  /** 同页/跨 tab 刷新 */
  async function refreshPanels() {
    customPanels.value = await loadPanels()
  }

  return {
    customPanels,
    panelOrder,
    setCustomPanels,
    refreshPanels,
  }
})

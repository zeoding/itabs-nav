import { ref } from 'vue'
import { defineStore } from 'pinia'
import { setSetting, migrateSetting } from '@/db'

/**
 * 轻量 UI 偏好 Store（数据已迁入 IndexedDB `settings` 表）
 * - snow：飘雪开关，默认开（遗留 localStorage `itab.snow === '0'` 为关）
 * - sidebarCollapsed：侧栏收起，默认展开（遗留 `itab.sidebar.collapsed === '1'` 为收起）
 */
export const useUiStore = defineStore('ui', () => {
  const snowOn = ref(true)
  const sidebarCollapsed = ref(false)

  // 异步补齐（含 localStorage 遗留迁移），先按默认值渲染再纠正
  migrateSetting('snow', 'itab.snow', true, (legacy) => legacy !== '0').then((v) => {
    snowOn.value = !!v
  })
  migrateSetting('sidebarCollapsed', 'itab.sidebar.collapsed', false, (legacy) => legacy === '1').then((v) => {
    sidebarCollapsed.value = !!v
  })

  async function setSnow(on) {
    snowOn.value = !!on
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
    try {
      await setSetting('sidebarCollapsed', sidebarCollapsed.value)
    } catch {
      /* ignore */
    }
  }

  function toggleSidebarCollapsed() {
    return setSidebarCollapsed(!sidebarCollapsed.value)
  }

  return {
    snowOn,
    sidebarCollapsed,
    toggleSnow,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  }
})

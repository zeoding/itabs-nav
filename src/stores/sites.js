import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'

/**
 * 站点列表 Store（原 useSites 迁移至 Pinia）
 * - 跨面板共享同一份数据
 * - currentPanel 决定当前显示哪些站点
 * - 持久化仍走 IndexedDB（src/db），Pinia 只做内存单例
 */

let seeded = false

/**
 * 拖拽重排当前面板时写入的 order 基数。
 * 展示按面板过滤、只依赖面板内相对顺序，基数本身不影响显示；
 * 取 1000 只是让重排过的面板与其他未重排面板的小 order 值（1..n）拉开距离，便于排查。
 */
const PANEL_MOVE_ORDER_BASE = 1000

export const useSitesStore = defineStore('sites', () => {
  const sites = ref([]) // 当前面板的站点
  const allSites = ref([]) // 全部站点（用于计数等）
  const currentPanel = ref('home') // 当前面板 key
  const loading = ref(true)

  async function seedIfEmpty() {
    if (seeded) return
    const all = await db.getAllSites()
    if (all.length > 0) {
      seeded = true
      return
    }
    const seedSites = [
      { name: '百度', url: 'https://www.baidu.com', icon: 'thesvg:baidu' },
      { name: 'GitHub', url: 'https://github.com', icon: 'thesvg:github' },
      { name: 'Google', url: 'https://www.google.com', icon: 'thesvg:google' },
      // 壁纸库默认上桌面（工具卡，点击开弹窗）
      { name: '壁纸库', url: 'action:wallpaper', icon: '🖼️', kind: 'wallpaper' },
    ]
    for (const site of seedSites) {
      await db.addSite({ ...site, panel: 'home' })
    }
    seeded = true
  }

  /**
   * 老用户补种壁纸库卡片（seedIfEmpty 只对空库生效，已有数据的浏览器走这里）。
   * - settings 标记 'tool-seed-wallpaper' 保证只执行一次（用户手动删除后不再打扰）
   * - 卡片追加到 home 面板末尾
   */
  async function ensureWallpaperCard() {
    try {
      const done = await db.getSetting('tool-seed-wallpaper', undefined)
      if (done !== undefined) return
      const all = await db.getAllSites()
      if (!all.some((s) => s.kind === 'wallpaper')) {
        await db.addSite({
          name: '壁纸库',
          url: 'action:wallpaper',
          icon: '🖼️',
          panel: 'home',
          kind: 'wallpaper',
        })
      }
      await db.setSetting('tool-seed-wallpaper', true)
    } catch {
      /* 补种失败不阻塞站点加载 */
    }
  }

  function applyFilter() {
    sites.value = allSites.value
      .filter((s) => (s.panel || 'home') === currentPanel.value)
      .map((s, i) => ({ ...s, _panelOrder: i }))
  }

  async function load() {
    loading.value = true
    try {
      await seedIfEmpty()
      await ensureWallpaperCard()
      allSites.value = await db.getAllSites()
      applyFilter()
    } finally {
      loading.value = false
    }
  }

  /** 切到某个面板（watch currentPanel 自动过滤） */
  function setPanel(panel) {
    currentPanel.value = panel
    applyFilter()
  }

  async function add(site) {
    await db.addSite({ ...site, panel: site.panel || currentPanel.value })
    await load()
  }

  async function update(site) {
    await db.updateSite(site)
    await load()
  }

  async function remove(id) {
    await db.deleteSite(id)
    await load()
  }

  /** 拖拽排序：仅在当前面板内 */
  async function move(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    const currentList = [...sites.value]
    const [moved] = currentList.splice(fromIndex, 1)
    currentList.splice(toIndex, 0, moved)
    const otherList = allSites.value.filter(
      (s) => (s.panel || 'home') !== currentPanel.value
    )
    const merged = [
      ...otherList,
      ...currentList.map((s, i) => ({ ...s, order: PANEL_MOVE_ORDER_BASE + i })),
    ]
    await db.reorderSites(merged)
    await load()
  }

  /** 清空当前面板下所有站点 */
  async function clearCurrentPanel() {
    await db.clearPanel(currentPanel.value)
    await load()
  }

  return {
    sites,
    allSites,
    currentPanel,
    loading,
    load,
    setPanel,
    add,
    update,
    remove,
    move,
    clearCurrentPanel,
  }
})

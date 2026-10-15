import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'
import { TOOLS_BY_KIND, SEED_TOOL_KINDS, toolActionUrl } from '@/config/tools'

/**
 * 站点列表 Store（原 useSites 迁移至 Pinia）
 * - 跨面板共享同一份数据
 * - currentPanel 决定当前显示哪些站点
 * - 持久化仍走 IndexedDB（src/db），Pinia 只做内存单例
 */

let seeded = false
/** 补种壁纸库卡片只在本会话检查一次，避免每次 load 都重读 setting + 全表扫描 */
let wallpaperChecked = false

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
    // 首页默认：百度 + 内置小组件（元数据统一取自 @/config/tools）
    const seedSites = [
      { name: '百度', url: 'https://www.baidu.com', icon: 'thesvg:baidu' },
      ...SEED_TOOL_KINDS.map((kind) => {
        const tool = TOOLS_BY_KIND[kind]
        return { name: tool.name, url: toolActionUrl(kind), icon: tool.icon, kind }
      }),
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
    if (wallpaperChecked) return
    try {
      const done = await db.getSetting('tool-seed-wallpaper', undefined)
      if (done !== undefined) {
        wallpaperChecked = true
        return
      }
      const all = await db.getAllSites()
      if (!all.some((s) => s.kind === 'wallpaper')) {
        const wallpaper = TOOLS_BY_KIND.wallpaper
        await db.addSite({
          name: wallpaper.name,
          url: toolActionUrl('wallpaper'),
          icon: wallpaper.icon,
          panel: 'home',
          kind: 'wallpaper',
        })
      }
      await db.setSetting('tool-seed-wallpaper', true)
      wallpaperChecked = true
    } catch {
      /* 补种失败不阻塞站点加载（下次 load 再试） */
    }
  }

  function applyFilter() {
    // 复制一层避免 sites 与 allSites 共享引用（拖拽/编辑时误改全量列表）
    sites.value = allSites.value
      .filter((s) => (s.panel || 'home') === currentPanel.value)
      .map((s) => ({ ...s }))
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

  /**
   * 把一条已落库的记录同步进内存（不重读整表）。
   * - 就地替换 allSites 中的同 id 项（不存在则追加），再重算当前面板视图
   * - 排序键与 db.getAllSites 保持一致（order 升序，缺省按 0）
   */
  function syncOne(site) {
    const idx = allSites.value.findIndex((s) => s.id === site.id)
    if (idx === -1) allSites.value.push(site)
    else allSites.value[idx] = site
    allSites.value.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    applyFilter()
  }

  /** 从内存中移除一条（不重读整表） */
  function dropOne(id) {
    const idx = allSites.value.findIndex((s) => s.id === id)
    if (idx !== -1) allSites.value.splice(idx, 1)
    applyFilter()
  }

  /** 切到某个面板（watch currentPanel 自动过滤） */
  function setPanel(panel) {
    currentPanel.value = panel
    applyFilter()
  }

  /**
   * 新增站点：addSite 返回新主键，直接用它的返回值回填内存。
   * 注意 order 由 db 侧按当前最大值 +1 生成，故这里按 id 定位即可。
   */
  async function add(site) {
    const id = await db.addSite({ ...site, panel: site.panel || currentPanel.value })
    const created = await db.getSite(id)
    if (created) syncOne(created)
    else await load()
  }

  async function update(site) {
    await db.updateSite(site)
    syncOne({ ...site })
  }

  async function remove(id) {
    await db.deleteSite(id)
    dropOne(id)
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
    const reordered = currentList.map((s, i) => ({
      ...s,
      order: PANEL_MOVE_ORDER_BASE + i,
    }))
    await db.reorderSites([...otherList, ...reordered])
    // 排序只改 order 字段：把新 order 就地写回内存即可，无需重读整表
    const orderById = new Map(reordered.map((s) => [s.id, s.order]))
    allSites.value = allSites.value.map((s) =>
      orderById.has(s.id) ? { ...s, order: orderById.get(s.id) } : s
    )
    allSites.value.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    applyFilter()
  }

  /** 清空当前面板下所有站点 */
  async function clearCurrentPanel() {
    const panel = currentPanel.value
    await db.clearPanel(panel)
    allSites.value = allSites.value.filter((s) => (s.panel || 'home') !== panel)
    applyFilter()
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
    /** 清空全部数据后调用：重置种子标志，让下次 load 重新播种默认首页与壁纸卡 */
    resetSeed() {
      seeded = false
      wallpaperChecked = false
    },
  }
})

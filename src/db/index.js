import Dexie from 'dexie'
import { toRaw } from 'vue'
import { $t } from '@/composables/useI18n'
import { TOOL_KINDS } from '@/config/tools'

/**
 * IndexedDB 数据层（基于 Dexie 封装）
 *
 * 数据库结构：
 *   - sites    快捷方式表（id 自增，order 字段控制排序，size 字段控制网格大小）
 *   - settings 设置表（key-value：外观/引擎/语言 + 面板/城市/UI偏好/工具草稿）
 *   - todos    待办表（id 自增，含软删除与回收站）
 *   - events   日程事件表（id 自增，date 索引；当前只读，写链路已移除）
 *   - cache    每日缓存表（key-value：天气/热榜/一言，{ date, savedAt, payload }，不进备份）
 *   - widgets  旧版本遗留表（v4 引入，v5 回退；表本身保留，不主动删）
 *
 * 版本演进：
 *   v1: sites, settings
 *   v2: + todos, events
 *   v3: + sites.panel 索引
 *   v4: + widgets（已被回退，但用户的浏览器里可能仍是 v4 schema）
 *   v5: 接受 v4 schema，平滑过渡，不再依赖 widgets 表
 *   v6: 当前——+ cache 表（localStorage 每日缓存整体迁入 IndexedDB）
 */
const DB_NAME = 'itabs-nav-db'

/** 站点可用的网格尺寸（行x列） */
export const SITE_SIZES = ['1x1', '1x2', '2x1', '2x2', '2x4', '4x2']
export const DEFAULT_SITE_SIZE = '1x1'

/**
 * 站点类型(kind)
 *  - 'web'        普通外链(默认,点击打开 url)
 *  - 'split-text' 内置工具:文本分割(点击打开弹窗)
 *  - 'free-email' 内置工具:免费邮箱(点击打开弹窗)
 *  - 'wallpaper'  内置工具:壁纸库(点击打开弹窗)
 *  - 'week-report' 内置工具:周报统计(点击打开弹窗)
 *  - 'encode-decode' 内置工具:编码解码/加密解密(点击打开弹窗)
 *  - 'qr-code'    内置工具:二维码生成/解码(点击打开弹窗)
 * 其它取值保留向后兼容:旧数据读不到 kind 时回退到 'web'
 */
/**
 * 工具卡 kind 集合（单一真相源见 @/config/tools TOOLS）
 * - 普通网址类站点：点击 → openExternal(url)
 * - 工具卡片类站点：点击 → emit('action') 由父组件打开对应弹窗
 *
 * 分层约定：db 只「消费」TOOL_KINDS 做写入校验（保证落库的 kind 合法），
 * 不对外 re-export，也不定义 isToolKind —— 判定逻辑属业务语义，归 @/config/tools。
 * 需要的调用方请直接从 `@/config/tools` 引入。
 */
export const SITE_KINDS = ['web', ...TOOL_KINDS]
export const DEFAULT_SITE_KIND = 'web'

let dbInstance = null

/**
 * 获取（惰性初始化）Dexie 数据库实例。
 * 使用新版 Dexie 链式 API：
 *   new Dexie(name).version(n).stores({...}).upgrade(tx => ...)
 * version() 链式调用会按声明顺序自动执行新旧 schema 升级，
 * 无需再像 idb 那样手写 oldVersion 分支判断。
 */
function getDB() {
  if (dbInstance) return dbInstance

  const db = new Dexie(DB_NAME)

  // v1: sites + settings
  db.version(1).stores({
    sites: '++id, order',
    settings: 'key',
  })

  // v2: + todos, events
  db.version(2).stores({
    sites: '++id, order',
    settings: 'key',
    todos: '++id, createdAt',
    events: '++id, date',
  })

  // v3: + sites.panel 索引（Dexie 通过重声明 stores 自动加索引，无需 upgrade）
  db.version(3).stores({
    sites: '++id, order, panel',
    settings: 'key',
    todos: '++id, createdAt',
    events: '++id, date',
  })

  // v4: 旧版本曾引入 widgets 表，保留以便老用户数据无损
  db.version(4).stores({
    sites: '++id, order, panel',
    settings: 'key',
    todos: '++id, createdAt',
    events: '++id, date',
    widgets: '++id',
  })

  // v5: 接受 v4 schema 并平滑过渡；不再依赖 widgets，但仍保留表
  db.version(5).stores({
    sites: '++id, order, panel',
    settings: 'key',
    todos: '++id, createdAt',
    events: '++id, date',
    widgets: '++id',
  })

  // v6: + cache 表（localStorage 每日缓存整体迁入 IndexedDB；不进备份）
  db.version(6).stores({
    sites: '++id, order, panel',
    settings: 'key',
    todos: '++id, createdAt',
    events: '++id, date',
    widgets: '++id',
    cache: 'key',
  })

  dbInstance = db
  return dbInstance
}

/* ---------------- 站点 CRUD ---------------- */

/** 补全默认字段（兼容老数据） */
function fillDefaults(site) {
  if (!SITE_SIZES.includes(site.size)) site.size = DEFAULT_SITE_SIZE
  if (!site.panel) site.panel = 'home'
  // 老数据没有 kind 字段,默认当作普通外链
  if (!SITE_KINDS.includes(site.kind)) site.kind = DEFAULT_SITE_KIND
  return site
}

/**
 * 把对象脱壳成 IndexedDB 可结构化克隆的「普通对象」。
 *
 * 背景：Pinia/Vue 的 reactive / ref 会把对象包成 Proxy，Proxy 本身
 * 不可被 IDB 的结构化克隆（否则会抛 DataCloneError）。`{ ...obj }`
 * 浅展开只能去掉 Proxy 外壳，但对**包含 Proxy 字段**的对象仍不安全。
 *
 * 优先 structuredClone(toRaw(obj))：现代浏览器均支持，比 JSON 往返快
 * （拖拽排序会对每行调用一次），且保留 Date/undefined 等类型；
 * 含不可克隆值（Function/Symbol）或环境过旧时回退 JSON 往返。
 */
function toPlain(obj) {
  if (obj == null) return obj
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(toRaw(obj))
    } catch {
      /* fallthrough：回退 JSON 往返 */
    }
  }
  return JSON.parse(JSON.stringify(obj))
}

export async function getAllSites() {
  const db = getDB()
  const sites = await db.table('sites').toArray()
  return sites
    .map(fillDefaults)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * 按主键读单条站点（含默认值补全）
 * 供 store 在新增后回填单条记录，避免为此重读整表。
 */
export async function getSite(id) {
  const db = getDB()
  const row = await db.table('sites').get(id)
  return row ? fillDefaults(row) : null
}

/** 删除整个面板（含其下所有站点） */
export async function clearPanel(panel) {
  const db = getDB()
  const p = panel || 'home'
  await db.transaction('rw', 'sites', async () => {
    const table = db.table('sites')
    // 常规路径：走 panel 索引取主键，避免全表载入（v3 起 panel 已建索引）
    const ids = await table.where('panel').equals(p).primaryKeys()
    // 兼容无 panel 字段的极老数据（fillDefaults 视其为 'home'，索引匹配不到）
    if (p === 'home') {
      const legacy = await table.filter((s) => !s.panel).primaryKeys()
      ids.push(...legacy)
    }
    await table.bulkDelete(ids)
  })
}

export async function addSite({ name, url, icon, size, panel, kind }) {
  const db = getDB()
  const maxOrder = await getMaxOrder(db)
  // 防御性脱壳：调用方可能传入 Pinia 响应式对象
  return db.table('sites').add(toPlain({
    name,
    url,
    icon: icon || '',
    size: SITE_SIZES.includes(size) ? size : DEFAULT_SITE_SIZE,
    panel: panel || 'home',
    kind: SITE_KINDS.includes(kind) ? kind : DEFAULT_SITE_KIND,
    order: maxOrder + 1,
  }))
}

export async function updateSite(site) {
  const db = getDB()
  // 保证写入的 size 与 kind 合法；并脱壳响应式 Proxy
  const next = toPlain({
    ...site,
    size: SITE_SIZES.includes(site.size) ? site.size : DEFAULT_SITE_SIZE,
    kind: SITE_KINDS.includes(site.kind) ? site.kind : DEFAULT_SITE_KIND,
  })
  return db.table('sites').put(next)
}

export async function deleteSite(id) {
  const db = getDB()
  return db.table('sites').delete(id)
}

/**
 * 批量重写排序：传入按新顺序排列的站点数组
 */
export async function reorderSites(orderedSites) {
  const db = getDB()
  const rows = orderedSites.map((site, index) =>
    toPlain(fillDefaults({ ...site, order: index + 1 }))
  )
  await db.table('sites').bulkPut(rows)
}

/**
 * 取当前最大 order：走 'order' 索引取末位，避免全表载入内存。
 * order 缺失的记录不进该索引，但其排序权重本就是 0（见 getAllSites 的 ?? 0 回退），
 * 不影响最大值判定。
 */
async function getMaxOrder(db) {
  const last = await db.table('sites').orderBy('order').last()
  return last?.order ?? 0
}

/* ---------------- 设置 key-value ---------------- */

const NO_FALLBACK = Symbol('no-fallback')

export async function getSetting(key, fallback = NO_FALLBACK) {
  const db = getDB()
  const row = await db.table('settings').get(key)
  // 用 sentinel 区分"未传 fallback"（返回 null）与"显式传了 undefined/null"：
  // migrateSetting 用 getSetting(key, undefined) 探测键是否存在。
  if (row) return row.value
  return fallback === NO_FALLBACK ? null : fallback
}

/**
 * 一次性读取全部 settings 行（[{ key, value }]）
 * 供 settings store 首屏加载，避免按 key 逐条 getSetting 的多次 IDB 往返
 */
export async function getAllSettings() {
  const db = getDB()
  return db.table('settings').toArray()
}

export async function setSetting(key, value) {
  const db = getDB()
  // 防御性脱壳：value 可能是对象（panel 配置 / UI 偏好等）
  return db.table('settings').put({ key, value: toPlain(value) })
}

/* ---------------- 每日缓存 key-value（cache 表，不进备份） ---------------- */

/** 读缓存条目：{ key, date, savedAt, payload } | undefined */
export async function getCache(key) {
  const db = getDB()
  return db.table('cache').get(key)
}

export async function setCache(key, wrap) {
  const db = getDB()
  return db.table('cache').put(toPlain({ key, ...wrap }))
}

/**
 * 清理 cache 表中日期不是 today 的过期行。
 * - 每日缓存过期后只读不删，会缓慢积累（weather 缓存 key 含城市/语言，
 *   每换一个城市就多一行，跨年后全部变死数据），由 setDaily 顺带调用
 * - cache 表很小，全表 filter 可接受；调用方自行防重入（每天至多一次）
 */
export async function purgeStaleCache(today) {
  const db = getDB()
  const table = db.table('cache')
  const stale = await table.filter((row) => row && row.date !== today).primaryKeys()
  if (stale.length) await table.bulkDelete(stale)
  return stale.length
}

/**
 * localStorage 遗留值一次性迁移：
 * - IDB 已有值则直接丢弃遗留（以 IDB 为准）
 * - IDB 为空且遗留存在则写入 IDB，并清理遗留 key
 * @returns 迁移后的值（IDB 值 / 遗留值 / fallback）
 */
export async function migrateSetting(key, legacyKey, fallback = null, parse = (v) => v) {
  const cur = await getSetting(key, undefined)
  let legacy
  try {
    legacy = localStorage.getItem(legacyKey)
  } catch {
    /* localStorage 不可用时视为无遗留值 */
  }
  if (cur !== undefined) {
    if (legacy != null) {
      try {
        localStorage.removeItem(legacyKey)
      } catch {
        /* ignore */
      }
    }
    return cur
  }
  if (legacy != null) {
    try {
      const value = parse(legacy)
      await setSetting(key, value)
      localStorage.removeItem(legacyKey)
      return value
    } catch {
      /* 解析失败则回退默认 */
    }
  }
  return fallback
}

/* ---------------- 待办 CRUD ---------------- */

/**
 * 一次读取 todos 表并拆分 active/deleted
 * - 全表只 toArray 一次，active/deleted 各自排序
 * - 原 getAllTodos / getDeletedTodos 两个导出是它的前身（各自全表扫描），
 *   已无调用方，故删除，统一走本函数
 */
export async function getTodosSplit() {
  const db = getDB()
  const all = await db.table('todos').toArray()
  return {
    active: all.filter((t) => !t.deleted).sort(sortByOrderThenCreated),
    deleted: all.filter((t) => t.deleted).sort((a, b) => (b.deletedAt ?? b.createdAt ?? 0) - (a.deletedAt ?? a.createdAt ?? 0)),
  }
}

/**
 * 排序：优先按显式 order，缺字段回退到 createdAt（稳定排序）
 */
function sortByOrderThenCreated(a, b) {
  const ao = a.order
  const bo = b.order
  const aHas = typeof ao === 'number'
  const bHas = typeof bo === 'number'
  if (aHas && bHas) return ao - bo
  if (aHas) return -1
  if (bHas) return 1
  return (a.createdAt ?? 0) - (b.createdAt ?? 0)
}

export async function addTodo({ text }) {
  const db = getDB()
  return db.table('todos').add(toPlain({
    text,
    done: false,
    deleted: false,
    createdAt: Date.now(),
  }))
}

/** 按主键读单条待办（供 store 新增后回填，避免重读整表） */
export async function getTodo(id) {
  const db = getDB()
  return db.table('todos').get(id)
}

export async function updateTodo(todo) {
  const db = getDB()
  // 防御性脱壳：todo 可能来自 Pinia store 的响应式对象
  return db.table('todos').put(toPlain(todo))
}

/** 软删除：标记 deleted=true，写 deletedAt 时间戳 */
export async function deleteTodo(id) {
  const db = getDB()
  await db.transaction('rw', 'todos', async () => {
    const row = await db.table('todos').get(id)
    if (!row) return
    row.deleted = true
    row.deletedAt = Date.now()
    await db.table('todos').put(toPlain(row))
  })
}

/** 恢复：清除 deleted 标记 */
export async function restoreTodo(id) {
  const db = getDB()
  await db.transaction('rw', 'todos', async () => {
    const row = await db.table('todos').get(id)
    if (!row) return
    row.deleted = false
    row.deletedAt = null
    await db.table('todos').put(toPlain(row))
  })
}

/** 永久删除（从回收站清空） */
export async function purgeTodo(id) {
  const db = getDB()
  return db.table('todos').delete(id)
}

/**
 * 批量设置多条 todo 的 done 状态
 * - 读取每条最新记录后再 put，避免覆盖其他字段（text/order/deleted 等）
 */
export async function setTodosDone(ids, done) {
  if (!ids || ids.length === 0) return
  const db = getDB()
  await db.transaction('rw', 'todos', async () => {
    const table = db.table('todos')
    const rows = await Promise.all(ids.map((id) => table.get(id)))
    const next = rows
      .filter(Boolean)
      .map((row) => toPlain({ ...row, done: !!done }))
    await table.bulkPut(next)
  })
}

/**
 * 批量软删除 / 恢复（deleted 标记）
 * - 单事务内完成，替代 store 侧 N 次独立事务 + 全表重读
 * - deleted=true 时写 deletedAt 时间戳；恢复时清空
 */
export async function setTodosDeleted(ids, deleted) {
  if (!ids || ids.length === 0) return
  const db = getDB()
  await db.transaction('rw', 'todos', async () => {
    const table = db.table('todos')
    const rows = await Promise.all(ids.map((id) => table.get(id)))
    const stamp = Date.now()
    const next = rows
      .filter(Boolean)
      .map((row) => toPlain({
        ...row,
        deleted: !!deleted,
        deletedAt: deleted ? stamp : null,
      }))
    await table.bulkPut(next)
  })
}

/** 批量永久删除（清空回收站 / 多选彻底删除） */
export async function purgeTodos(ids) {
  if (!ids || ids.length === 0) return
  const db = getDB()
  await db.table('todos').bulkDelete(ids)
}

/**
 * 批量重写顺序：传入按新顺序排列的 todo 数组
 * - 给每条写 order = index（与 sites 表保持一致）
 * - 兼容缺字段的旧数据
 */
export async function reorderTodos(orderedTodos) {
  const db = getDB()
  const rows = orderedTodos.map((todo, index) => toPlain({ ...todo, order: index }))
  await db.table('todos').bulkPut(rows)
}

/* ---------------- 日程事件（只读：日历点标展示；写链路已移除，见 stores/events.js） ---------------- */

export async function getAllEvents() {
  const db = getDB()
  return db.table('events').toArray()
}

/** 清空全部数据（用于"重置"按钮） */
export async function clearAll() {
  const db = getDB()
  const storeNames = ['sites', 'settings', 'todos', 'events', 'cache']
  // widgets 视为遗留表，重置时一并清空避免残留
  await db.transaction('rw', storeNames, async () => {
    await Promise.all(storeNames.map((n) => db.table(n).clear()))
  })
}

/* ---------------- 备份 / 恢复 ---------------- */

/** 导出全部数据为可序列化的备份对象 */
export async function exportBackup() {
  const db = getDB()
  const [sites, settings, todos, events] = await Promise.all([
    db.table('sites').toArray(),
    db.table('settings').toArray(),
    // 待办含回收站，一并备份
    db.table('todos').toArray(),
    db.table('events').toArray(),
  ])
  return {
    app: 'itabs-nav',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { sites, settings, todos, events },
  }
}

/** 校验备份文件结构 */
export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (payload.app !== 'itabs-nav' || !payload.data) return false
  const { sites, settings, todos, events } = payload.data
  return (
    Array.isArray(sites) &&
    Array.isArray(settings) &&
    Array.isArray(todos) &&
    Array.isArray(events)
  )
}

/**
 * 导入备份：清空现有库后整体写入
 * settings 为 [{key,value}]，其余表保留原 id 直接 put
 */
export async function importBackup(payload) {
  if (!validateBackup(payload)) {
    throw new Error($t('settings.data.invalidFile'))
  }
  const db = getDB()
  const { sites, settings, todos, events } = payload.data
  const storeNames = ['sites', 'settings', 'todos', 'events']
  await db.transaction('rw', storeNames, async () => {
    await Promise.all(storeNames.map((n) => db.table(n).clear()))
    await Promise.all([
      db.table('sites').bulkPut(sites),
      db.table('settings').bulkPut(settings),
      db.table('todos').bulkPut(todos),
      db.table('events').bulkPut(events),
    ])
  })
}
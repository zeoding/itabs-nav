import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'

/**
 * 待办 Store（原 useTodos 迁移至 Pinia）
 * - Pinia 本身即单例，原 EventTarget bus 不再需要
 * - active: 未删除的 / deleted: 回收站
 *
 * 性能约定：写入后不再 `load()` 全表重读（todos 表含回收站会随使用持续增长，
 * 每次增删都全表扫描 + 双排序代价为 O(n)）。改为就地维护两个列表，
 * 仅在确实无法推断新状态时才回退到 load()。
 */

/** 排序：与 db.sortByOrderThenCreated 保持一致（order 优先，缺省回退 createdAt） */
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

/** 回收站排序：按删除时间倒序 */
function sortByDeletedAt(a, b) {
  return (b.deletedAt ?? b.createdAt ?? 0) - (a.deletedAt ?? a.createdAt ?? 0)
}

export const useTodosStore = defineStore('todos', () => {
  const todos = ref([])
  const deleted = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const { active, deleted: removed } = await db.getTodosSplit()
      todos.value = active
      deleted.value = removed
    } finally {
      loading.value = false
    }
  }

  /** 移动一条待办到回收站（内存侧） */
  function moveToDeleted(id, deletedAt) {
    const idx = todos.value.findIndex((x) => x.id === id)
    if (idx === -1) return
    const [row] = todos.value.splice(idx, 1)
    deleted.value = [{ ...row, deleted: true, deletedAt }, ...deleted.value]
      .sort(sortByDeletedAt)
  }

  /** 从回收站恢复到待办列表（内存侧） */
  function restoreFromDeleted(id) {
    const idx = deleted.value.findIndex((x) => x.id === id)
    if (idx === -1) return
    const [row] = deleted.value.splice(idx, 1)
    todos.value = [...todos.value, { ...row, deleted: false, deletedAt: null }]
      .sort(sortByOrderThenCreated)
  }

  async function add(text) {
    const id = await db.addTodo({ text: text.trim() })
    const created = await db.getTodo(id)
    if (created) {
      todos.value = [...todos.value, created].sort(sortByOrderThenCreated)
    } else {
      await load()
    }
  }

  async function toggle(id) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    const next = { ...t, done: !t.done }
    await db.updateTodo(next)
    const idx = todos.value.findIndex((x) => x.id === id)
    if (idx !== -1) todos.value[idx] = next
  }

  async function update(id, patch) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    const next = { ...t, ...patch }
    await db.updateTodo(next)
    const idx = todos.value.findIndex((x) => x.id === id)
    if (idx !== -1) todos.value[idx] = next
  }

  async function remove(id) {
    await db.deleteTodo(id)
    moveToDeleted(id, Date.now())
  }

  async function restore(id) {
    await db.restoreTodo(id)
    restoreFromDeleted(id)
  }

  async function purge(id) {
    await db.purgeTodo(id)
    const idx = deleted.value.findIndex((x) => x.id === id)
    if (idx !== -1) deleted.value.splice(idx, 1)
  }

  async function removeMany(ids) {
    if (!ids || ids.length === 0) return
    await db.setTodosDeleted(ids, true)
    const stamp = Date.now()
    for (const id of ids) moveToDeleted(id, stamp)
  }

  async function restoreMany(ids) {
    if (!ids || ids.length === 0) return
    await db.setTodosDeleted(ids, false)
    for (const id of ids) restoreFromDeleted(id)
  }

  async function purgeMany(ids) {
    if (!ids || ids.length === 0) return
    await db.purgeTodos(ids)
    const drop = new Set(ids)
    deleted.value = deleted.value.filter((x) => !drop.has(x.id))
  }

  async function reorder(orderedTodos) {
    if (!orderedTodos || orderedTodos.length === 0) return
    await db.reorderTodos(orderedTodos)
    // order 由数组下标决定：就地改写并重排，无需重读整表
    const orderById = new Map(orderedTodos.map((t, i) => [t.id, i]))
    todos.value = todos.value
      .map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id) } : t))
      .sort(sortByOrderThenCreated)
  }

  async function toggleMany(ids, done) {
    if (!ids || ids.length === 0) return
    await db.setTodosDone(ids, !!done)
    const mark = new Set(ids)
    todos.value = todos.value.map((t) =>
      mark.has(t.id) ? { ...t, done: !!done } : t
    )
  }

  const remaining = computed(() => todos.value.filter((t) => !t.done).length)
  const deletedCount = computed(() => deleted.value.length)
  const doneCount = computed(() => todos.value.filter((t) => t.done).length)

  return {
    todos,
    deleted,
    loading,
    load,
    add,
    toggle,
    update,
    remove,
    restore,
    purge,
    removeMany,
    restoreMany,
    purgeMany,
    toggleMany,
    reorder,
    remaining,
    deletedCount,
    doneCount,
  }
})

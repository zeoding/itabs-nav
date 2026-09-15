import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'

/**
 * 待办 Store（原 useTodos 迁移至 Pinia）
 * - Pinia 本身即单例，原 EventTarget bus 不再需要
 * - active: 未删除的 / deleted: 回收站
 */
export const useTodosStore = defineStore('todos', () => {
  const todos = ref([])
  const deleted = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const [a, d] = await Promise.all([db.getAllTodos(), db.getDeletedTodos()])
      todos.value = a
      deleted.value = d
    } finally {
      loading.value = false
    }
  }

  async function add(text) {
    await db.addTodo({ text: text.trim() })
    await load()
  }

  async function toggle(id) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    await db.updateTodo({ ...t, done: !t.done })
    await load()
  }

  async function update(id, patch) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    await db.updateTodo({ ...t, ...patch })
    await load()
  }

  async function remove(id) {
    await db.deleteTodo(id)
    await load()
  }

  async function restore(id) {
    await db.restoreTodo(id)
    await load()
  }

  async function purge(id) {
    await db.purgeTodo(id)
    await load()
  }

  async function removeMany(ids) {
    if (!ids || ids.length === 0) return
    await Promise.all(ids.map((id) => db.deleteTodo(id)))
    await load()
  }

  async function restoreMany(ids) {
    if (!ids || ids.length === 0) return
    await Promise.all(ids.map((id) => db.restoreTodo(id)))
    await load()
  }

  async function purgeMany(ids) {
    if (!ids || ids.length === 0) return
    await Promise.all(ids.map((id) => db.purgeTodo(id)))
    await load()
  }

  async function reorder(orderedTodos) {
    if (!orderedTodos || orderedTodos.length === 0) return
    await db.reorderTodos(orderedTodos)
    await load()
  }

  async function toggleMany(ids, done) {
    if (!ids || ids.length === 0) return
    await db.setTodosDone(ids, !!done)
    await load()
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

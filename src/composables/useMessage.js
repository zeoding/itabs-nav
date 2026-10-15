import { ref } from 'vue'

/**
 * 全局消息（轻量 toast）
 * - 调用：const message = useMessage(); message.success('已复制'); message.error('失败')
 *   四种类型：success / error / info / warning
 * - 单例：所有组件共用一个消息队列
 * - 自动消失：默认 2200ms
 * - 最多并发 5 条：超出后最早的先消失
 * - 点击消息立即消失
 *
 * 设计参考 useConfirm：composable + Host 组件分离
 */

const MAX_VISIBLE = 5
const DEFAULT_DURATION = 2200

// 全局状态（模块级单例）
const queue = ref([])
let nextId = 1
/** 定时器放独立 Map（不挂到 reactive item 上，避免无谓响应式） */
const timers = new Map()

function clearTimer(id) {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
}

function push(type, content, duration = DEFAULT_DURATION) {
  const id = nextId++
  const item = {
    id,
    type,             // 'success' | 'error' | 'info' | 'warning'
    content,
    duration,
    leaving: false,
  }
  queue.value.push(item)
  // 超出上限：移除最早的
  while (queue.value.length > MAX_VISIBLE) {
    const first = queue.value.shift()
    if (first) clearTimer(first.id)
  }
  // 自动消失
  timers.set(id, setTimeout(() => {
    remove(id)
  }, duration))
  return id
}

function remove(id) {
  const idx = queue.value.findIndex((m) => m.id === id)
  if (idx < 0) return
  const item = queue.value[idx]
  if (!item) return
  clearTimer(id)
  // 先标记 leaving 触发淡出动画，再移除
  item.leaving = true
  setTimeout(() => {
    const i = queue.value.findIndex((m) => m.id === id)
    if (i >= 0) queue.value.splice(i, 1)
  }, 180)
}

export function useMessage() {
  return {
    queue,
    success(content, duration) { return push('success', content, duration) },
    error(content, duration)   { return push('error',   content, duration) },
    info(content, duration)    { return push('info',    content, duration) },
    warning(content, duration) { return push('warning', content, duration) },
    dismiss(id) { remove(id) },
  }
}
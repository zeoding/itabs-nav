import { ref } from 'vue'

/**
 * 全局消息（轻量 toast）
 * - 调用：const message = useMessage(); message.success('已复制'); message.error('失败')
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
    if (first) clearTimeout(first._timer)
  }
  // 自动消失
  item._timer = setTimeout(() => {
    remove(id)
  }, duration)
  return id
}

function remove(id) {
  const idx = queue.value.findIndex((m) => m.id === id)
  if (idx < 0) return
  const item = queue.value[idx]
  if (!item) return
  clearTimeout(item._timer)
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
    dismiss(id) { remove(id) },
  }
}
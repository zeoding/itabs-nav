import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 按 ESC 关闭弹窗/抽屉
 * - 只在 open=true 时响应
 * - 多次调用安全（卸载时自动清理）
 *
 * @param {import('vue').Ref<boolean> | import('vue').ComputedRef<boolean>} openRef
 * @param {() => void} onClose
 */
export function useEscapeClose(openRef, onClose) {
  function onKeydown(e) {
    if (e.key !== 'Escape') return
    // 只在打开状态响应
    if (!openRef.value) return
    // 防止和其它 ESC 处理冲突（如 fullscreen）
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown, true) // 捕获阶段优先
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown, true)
  })
}

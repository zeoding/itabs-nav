import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 点击外部关闭（document 级监听统一收口）
 * - getTargets() 返回需要「豁免」的元素列表；列表为空时不触发回调，
 *   等价于各组件原先的 `if (!open) return` 守卫
 * - 事件默认 mousedown，与原实现一致（比 click 早，避免先触发页面其他
 *   click 处理再关闭造成的状态抖动）
 * - 多次调用安全（卸载时自动清理）
 *
 * @param {() => Array<Element | null | undefined>} getTargets
 * @param {() => void} onClickOutside
 * @param {{ event?: 'mousedown' | 'click' }} [opts]
 */
export function useClickOutside(getTargets, onClickOutside, opts = {}) {
  const eventName = opts.event || 'mousedown'
  function handler(e) {
    const targets = getTargets()
    if (!targets || targets.length === 0) return
    for (const el of targets) {
      if (el && (el === e.target || el.contains(e.target))) return
    }
    onClickOutside()
  }

  onMounted(() => {
    document.addEventListener(eventName, handler)
  })
  onBeforeUnmount(() => {
    document.removeEventListener(eventName, handler)
  })
}

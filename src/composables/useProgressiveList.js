import { computed, ref, watch, onBeforeUnmount } from 'vue'

/**
 * 长列表渐进渲染：只渲染前 limit 项，滚动接近底部时按 step 追加。
 *
 * 为什么不做真虚拟滚动：本项目的长列表（站点网格 / 待办双列网格）
 * 行高不定且带拖拽重排、ResizeObserver 测量，虚拟滚动需要固定行高
 * 并重写布局与拖拽逻辑，风险远大于收益；渐进渲染不改布局、不碰
 * 交互，只把 DOM 数量上限压住、把首屏渲染压力分摊到滚动过程中。
 *
 * - 源数组变短（切 tab / 过滤 / 删除）时自动收紧 limit
 * - sentinel 经 IntersectionObserver 触发追加；列表渲染完时自动隐藏
 *
 * @param {() => Array} source 响应式源数组
 * @param {{ initial?: number, step?: number, root?: () => Element | null }} [opts]
 *   root：滚动容器（IntersectionObserver root），缺省用视口
 * @returns {{
 *   visible: import('vue').ComputedRef<Array>,
 *   sentinelRef: import('vue').Ref<Element | null>,
 *   exhausted: import('vue').ComputedRef<boolean>,
 *   total: import('vue').ComputedRef<number>,
 * }}
 */
export function useProgressiveList(source, opts = {}) {
  const initial = opts.initial ?? 120
  const step = opts.step ?? 60
  const limit = ref(initial)

  const total = computed(() => source().length)
  const visible = computed(() => source().slice(0, limit.value))
  const exhausted = computed(() => limit.value >= total.value)

  // 数据集变短时收紧窗口，避免 limit 长期停留在旧的高位
  watch(total, (n, old) => {
    if (n < old) {
      limit.value = Math.max(initial, Math.min(limit.value, n + step))
    }
  })

  const sentinelRef = ref(null)
  let observer = null

  function ensureObserver() {
    if (typeof IntersectionObserver === 'undefined') return
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !exhausted.value) {
          limit.value += step
        }
      },
      { root: opts.root ? opts.root() : null, rootMargin: '600px 0px' }
    )
    if (sentinelRef.value) observer.observe(sentinelRef.value)
  }

  // sentinel 经 v-if 挂载/卸载，ref 变化时重挂观察器
  watch(sentinelRef, ensureObserver, { immediate: true })

  onBeforeUnmount(() => observer?.disconnect())

  return { visible, sentinelRef, exhausted, total }
}

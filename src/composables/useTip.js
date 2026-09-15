import { reactive } from 'vue'

/**
 * 全局 tooltip 单例状态（v-tip 指令写入，TipHost 读取渲染）
 * - 替代原生 title：样式可控、支持 i18n 动态文本、自动翻面
 */
export const tipState = reactive({
  visible: false,
  text: '',
  x: 0,
  y: 0,
  /** 'top' | 'bottom' */
  placement: 'top',
  /** 锚点真实中心（视口坐标，不钳位） */
  anchorX: 0,
  /** 箭头在 tooltip 内的 left 偏移（px），null = 居中，由 TipHost 实测后回填 */
  arrowX: null,
})

let showTimer = null
let anchorEl = null

const SHOW_DELAY = 350 // hover 多久后显示（对标原生 title 的延迟感）
const GAP = 10 // 与锚点元素的间距

function place(el) {
  const r = el.getBoundingClientRect()
  // 锚点真实中心：箭头最终要对准这里
  tipState.anchorX = r.left + r.width / 2
  // 初排先按估算半宽 120 钳位，TipHost 实测真实宽度后会再校准 x/arrowX
  const EST_HALF = 120
  tipState.x = Math.min(
    Math.max(tipState.anchorX, EST_HALF),
    Math.max(window.innerWidth - EST_HALF, EST_HALF)
  )
  tipState.arrowX = null
  // 上方空间不够则翻到下方
  if (r.top < 64) {
    tipState.placement = 'bottom'
    tipState.y = r.bottom + GAP
  } else {
    tipState.placement = 'top'
    tipState.y = r.top - GAP
  }
}

function clearTimer() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

export function showTip(el, text) {
  const content = String(text ?? '').trim()
  if (!content) {
    hideTip()
    return
  }
  anchorEl = el
  clearTimer()
  showTimer = setTimeout(() => {
    // 元素已卸载则放弃
    if (!anchorEl || !anchorEl.isConnected) return
    tipState.text = content
    place(anchorEl)
    tipState.visible = true
  }, SHOW_DELAY)
}

export function refreshTip(text) {
  const content = String(text ?? '').trim()
  if (!content) {
    hideTip()
    return
  }
  tipState.text = content
  if (anchorEl && tipState.visible) place(anchorEl)
}

export function hideTip(fromEl) {
  clearTimer()
  if (fromEl && fromEl !== anchorEl) return
  anchorEl = null
  tipState.visible = false
}

/** 全局隐藏（滚动/点击时调用，避免 tooltip 滞留） */
export function hideTipForce() {
  clearTimer()
  anchorEl = null
  tipState.visible = false
}

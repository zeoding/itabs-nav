/**
 * v-tip 自定义指令：替代原生 title 属性
 * 用法：
 *   <button v-tip="'静态文本'">…</button>
 *   <button v-tip="动态表达式">…</button>
 * - 悬停/聚焦 350ms 后显示，离开/点击/滚动隐藏
 * - 上方空间不足自动翻到下方
 */
import { showTip, refreshTip, hideTip, hideTipForce } from '@/composables/useTip'

function getText(binding) {
  return binding.value
}

function attach(el, binding) {
  const onEnter = () => showTip(el, getText(binding))
  const onLeave = () => hideTip(el)
  const onClick = () => hideTip(el)
  const onFocus = () => showTip(el, getText(binding))
  const onBlur = () => hideTip(el)
  el.addEventListener('mouseenter', onEnter)
  el.addEventListener('mouseleave', onLeave)
  el.addEventListener('click', onClick)
  el.addEventListener('focus', onFocus)
  el.addEventListener('blur', onBlur)
  el.__tipCleanup__ = () => {
    el.removeEventListener('mouseenter', onEnter)
    el.removeEventListener('mouseleave', onLeave)
    el.removeEventListener('click', onClick)
    el.removeEventListener('focus', onFocus)
    el.removeEventListener('blur', onBlur)
  }
}

export const vTip = {
  mounted(el, binding) {
    attach(el, binding)
  },
  updated(el, binding) {
    // 文本变化时若正显示则同步（无需重新计时）
    if (binding.value !== binding.oldValue) refreshTip(getText(binding))
  },
  unmounted(el) {
    el.__tipCleanup__?.()
    hideTip(el)
  },
}

/** 全局一次性监听：滚动/触摸时隐藏 tooltip（App 启动时调用一次） */
let hooked = false
export function hookTipGlobalHide() {
  if (hooked) return
  hooked = true
  window.addEventListener('scroll', hideTipForce, { capture: true, passive: true })
  window.addEventListener('touchstart', hideTipForce, { capture: true, passive: true })
  window.addEventListener('resize', hideTipForce)
}

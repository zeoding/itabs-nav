
<script setup>
/**
 * 全局 tooltip 宿主（配合 v-tip 指令）
 * - App.vue 挂载一次，Teleport 到 body
 * - fixed 定位 + 居中位移，深色玻璃丸，pointer-events 穿透
 * - 显示后实测自身宽度：泡泡钳位在视口内，箭头动态对准锚点真中心
 */
import { ref, computed, watch, nextTick } from 'vue'
import { tipState } from '@/composables/useTip'

const tipEl = ref(null)
const EDGE_PAD = 8 // 泡泡与视口边缘最小间距
const ARROW_PAD = 12 // 箭头与泡泡边缘最小间距（箭头半宽 6 + 余量）

const tipStyle = computed(() => {
  const style = {
    left: `${tipState.x}px`,
    top: `${tipState.y}px`,
  }
  if (tipState.arrowX != null) style['--tip-arrow-x'] = `${tipState.arrowX}px`
  return style
})

/** 实测校准：泡泡不溢出视口，箭头指向锚点 */
async function calibrate() {
  await nextTick()
  const el = tipEl.value
  if (!el || !tipState.visible) return
  const w = el.offsetWidth
  if (!w) return
  const half = w / 2
  const minCX = half + EDGE_PAD
  const maxCX = Math.max(window.innerWidth - half - EDGE_PAD, minCX)
  const cx = Math.min(Math.max(tipState.anchorX, minCX), maxCX)
  tipState.x = cx
  // 箭头 left 是相对泡泡左边缘：锚点中心 - 泡泡左边缘 = (anchorX - cx) + half
  tipState.arrowX = Math.min(Math.max(tipState.anchorX - cx + half, ARROW_PAD), Math.max(w - ARROW_PAD, ARROW_PAD))
}

watch([() => tipState.visible, () => tipState.text], ([v]) => {
  if (v) calibrate()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tip-fade">
      <div
        v-if="tipState.visible"
        ref="tipEl"
        class="tip-host"
        :class="`tip-${tipState.placement}`"
        :style="tipStyle"
        role="tooltip"
        aria-hidden="true"
      >{{ tipState.text }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.tip-host {
  position: fixed;
  z-index: 20000;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  /* 中文不断字、只在空格/标点处换行，超长无断点字符串才强制断行，避免阶梯状 */
  word-break: keep-all;
  overflow-wrap: break-word;
  color: #fff;
  background: rgba(31, 41, 55, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 20px rgba(31, 41, 55, 0.3);
  pointer-events: none;
  white-space: normal;

  /* 小箭头：指向锚点元素（left 由 JS 实测回填 --tip-arrow-x，缺省居中） */
  &::after {
    content: '';
    position: absolute;
    left: var(--tip-arrow-x, 50%);
    transform: translateX(-50%);
    border: 6px solid transparent;
  }
}

.tip-top {
  transform: translate(-50%, -100%);

  &::after {
    top: 100%;
    border-top-color: rgba(31, 41, 55, 0.92);
    border-bottom: 0;
  }
}

.tip-bottom {
  transform: translate(-50%, 0);

  &::after {
    bottom: 100%;
    border-bottom-color: rgba(31, 41, 55, 0.92);
    border-top: 0;
  }
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}
</style>

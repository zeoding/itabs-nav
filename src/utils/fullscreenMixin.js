/**
 * 弹窗全屏能力 composable（共享）
 *
 * 用法：
 *   import { useDialogFullscreen } from '@/utils/fullscreenMixin'
 *   const { isFullscreen, toggleFullscreen } = useDialogFullscreen(openRef)
 *
 * 模板：
 *   <div :class="['dialog', { 'is-fullscreen': isFullscreen }]">
 *   <button @click="toggleFullscreen">{{ isFullscreen ? '⤡' : '⤢' }}</button>
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export function useDialogFullscreen(openRef) {
  const isFullscreen = ref(false)

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value
  }

  function onKey(e) {
    if (e.key === 'Escape' && isFullscreen.value) {
      // Esc 仅退出全屏，不关闭弹窗
      e.stopPropagation()
      isFullscreen.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKey, true)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey, true)
  })

  // 关闭弹窗时重置
  if (openRef) {
    watch(openRef, (v) => {
      if (!v) isFullscreen.value = false
    })
  }

  return { isFullscreen, toggleFullscreen }
}

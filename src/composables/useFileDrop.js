import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 文件拖拽导入（HTML5 Drag & Drop）+ 可选剪贴板粘贴
 *
 * 背景：二维码解码与周报导入两处各自维护了一份**逐字相同**的拖拽逻辑
 * （连 dragDepth 计数抵消冒泡的注释都一样），只有「拿到文件后做什么」不同。
 * 这里把机制收口，调用方只负责传一个 onFile 回调。
 *
 * 要点：
 * - dragDepth 计数：dragenter/dragleave 会因子元素冒泡成对触发，
 *   不计数会导致遮罩闪烁，故用计数抵消
 * - 只接管真正拖入文件的拖拽（dataTransfer.types 含 'Files'），
 *   避免拖动选中文字时误亮遮罩
 * - 粘贴为可选能力：提供 pasteWhen 才会挂 window 监听，
 *   并在组件卸载时自动解除（无需调用方手动管理）
 *
 * @param {(file: File) => void} onFile 拿到文件后的处理（拖拽与粘贴共用）
 * @param {object} [opts]
 * @param {() => boolean} [opts.pasteWhen] 返回 false 时忽略粘贴；不传则不启用粘贴
 * @param {string} [opts.pasteMime='image/'] 粘贴时接受的 MIME 前缀
 * @returns {{ isDragging: import('vue').Ref<boolean>, onDragEnter: Function,
 *   onDragLeave: Function, onDrop: Function, onPaste: Function, reset: Function }}
 */
export function useFileDrop(onFile, opts = {}) {
  const isDragging = ref(false)
  /** 拖拽进入计数（子元素冒泡会产生成对的 enter/leave） */
  let dragDepth = 0

  /** 强制复位（拖拽取消 / 组件切换时调用，避免遮罩卡住） */
  function reset() {
    dragDepth = 0
    isDragging.value = false
  }

  function onDragEnter(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragDepth++
    isDragging.value = true
  }

  function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) isDragging.value = false
  }

  function onDrop(e) {
    reset()
    const file = e.dataTransfer?.files?.[0]
    if (file) onFile(file)
  }

  /** 剪贴板粘贴：取第一个匹配 MIME 的文件项 */
  function onPaste(e) {
    if (opts.pasteWhen && !opts.pasteWhen()) return
    const items = e.clipboardData?.items
    if (!items) return
    const prefix = opts.pasteMime || 'image/'
    for (const it of items) {
      if (it.type?.startsWith(prefix)) {
        const file = it.getAsFile()
        if (file) {
          onFile(file)
          e.preventDefault()
        }
        return
      }
    }
  }

  // 仅当启用粘贴时才挂全局监听
  if (opts.pasteWhen) {
    onMounted(() => window.addEventListener('paste', onPaste))
    onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
  }

  return { isDragging, onDragEnter, onDragLeave, onDrop, onPaste, reset }
}

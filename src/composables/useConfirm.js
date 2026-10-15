import { ref } from 'vue'
import { $t } from '@/composables/useI18n'

/**
 * 全局确认弹窗 composable
 * - 提供 confirm({ title, message, okText, cancelText, danger }) -> Promise<boolean>
 * - 任何组件都可调用，无需 ref 传递
 * - App 顶层挂一个 <ConfirmHost /> 即可
 */
const visible = ref(false)
const options = ref({
  title: $t('confirm.title'),
  message: '',
  okText: $t('confirm.ok'),
  cancelText: $t('confirm.cancel'),
  danger: false,
})
/** 当前待应答请求的 resolver */
let resolver = null
/**
 * 并发请求队列：确认框是单例，若同一时刻发起多个 confirm()，
 * 旧实现会直接覆盖 resolver 导致前一个 Promise 永不 resolve（泄漏）。
 * 改为排队，前一个应答后再展示下一个。
 */
const queue = []

function showNext() {
  const req = queue.shift()
  if (!req) {
    resolver = null
    visible.value = false
    return
  }
  resolver = req.resolve
  options.value = req.options
  visible.value = true
}

function finish(value) {
  const resolve = resolver
  resolver = null
  if (resolve) resolve(value)
  showNext()
}

export function useConfirm() {
  function confirm(opts = {}) {
    const normalized = {
      title: opts.title || $t('confirm.title'),
      message: opts.message || '',
      okText: opts.okText || $t('confirm.ok'),
      cancelText: opts.cancelText || $t('confirm.cancel'),
      danger: !!opts.danger,
    }
    return new Promise((resolve) => {
      queue.push({ options: normalized, resolve })
      if (!visible.value && !resolver) showNext()
    })
  }

  function ok() {
    finish(true)
  }
  function cancel() {
    finish(false)
  }

  return { confirm, ok, cancel, visible, options }
}

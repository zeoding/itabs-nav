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
let resolver = null

export function useConfirm() {
  function confirm(opts = {}) {
    options.value = {
      title: opts.title || $t('confirm.title'),
      message: opts.message || '',
      okText: opts.okText || $t('confirm.ok'),
      cancelText: opts.cancelText || $t('confirm.cancel'),
      danger: !!opts.danger,
    }
    visible.value = true
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  function ok() {
    if (resolver) resolver(true)
    resolver = null
    visible.value = false
  }
  function cancel() {
    if (resolver) resolver(false)
    resolver = null
    visible.value = false
  }

  return { confirm, ok, cancel, visible, options }
}

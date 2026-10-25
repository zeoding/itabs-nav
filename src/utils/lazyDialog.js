import { defineAsyncComponent } from 'vue'
import DialogAsyncLoading from '@/components/feedback/DialogAsyncLoading.vue'

/**
 * 弹窗/编辑器统一懒加载工厂（defineAsyncComponent 样板收敛）
 * - 默认 delay 200ms：chunk 在此时间内加载完成则不闪 loading
 * - 默认 loading 用 DialogAsyncLoading：fixed 覆盖层占位（真弹窗也是 fixed
 *   覆盖层；若用普通块级占位会参与文档流，把页面内容顶开造成布局抖动）
 * - 弹窗内容区内的占位（如 widget 预览）可通过 loading 传入自定义组件
 *
 * @param {() => Promise<import('vue').Component>} loader
 * @param {{ delay?: number, loading?: import('vue').Component }} [opts]
 */
export function lazyDialog(loader, opts = {}) {
  return defineAsyncComponent({
    loader,
    delay: opts.delay ?? 200,
    loadingComponent: opts.loading ?? DialogAsyncLoading,
  })
}

<script setup>
/**
 * 顶层异步弹窗的 loading 占位
 * - 弹窗本体是 fixed 覆盖层，加载期间却只有占位组件参与文档流；
 *   若占位是普通块级元素，会把页面内容顶开、加载完再跳回（布局抖动）
 * - 因此占位自身也用 fixed 居中覆盖层，加载完成后无缝替换成真弹窗
 */
import AsyncLoading from './AsyncLoading.vue'
</script>

<template>
  <div class="dialog-async-loading">
    <AsyncLoading />
  </div>
</template>

<style scoped lang="less">
.dialog-async-loading {
  position: fixed;
  inset: 0;
  z-index: var(--dlg-z, 10000);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 加载期拦截底层点击，避免占位期间误触页面 */
  pointer-events: auto;
}
</style>

<script setup>
/**
 * 异步组件的 loading 占位
 * - 用 defineAsyncComponent({ loadingComponent: AsyncLoading }) 接入
 * - 居中旋转圆 + 提示文字，避免点击后空白闪烁
 */
</script>

<template>
  <div class="async-loading">
    <div class="spinner" aria-hidden="true"></div>
    <span class="hint">Loading…</span>
  </div>
</template>

<style scoped lang="less">
.async-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  min-width: 220px;
  min-height: 160px;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: @radius-circle;
  border: 2.5px solid color-mix(in srgb, @accent 18%, transparent);
  border-top-color: @accent;
  animation: spin 0.8s linear infinite;
}

.hint {
  font-size: 12px;
  color: @text-soft;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
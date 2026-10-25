<script setup>
/**
 * 「每日一言」页脚（悬浮版 · 极简风）
 * - 固定页面最底部、水平居中
 * - 无背景框，纯靠文字 + text-shadow 在任意壁纸上都清晰可读
 * - content 支持换行
 * - hover 时 source 淡入、复制/刷新按钮淡入 —— 不改变布局（位置与尺寸不变）
 * - 点击正文：刷新
 * - 点击按钮：各自执行，stopPropagation
 */
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSayingStore } from '@/stores/saying'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { copyText } from '@/utils/clipboard'
import { RiFileCopyLine, RiCheckLine, RiRefreshLine } from '@remixicon/vue'

const sayingStore = useSayingStore()
const { saying, source, loading, ready } = storeToRefs(sayingStore)
const { refresh, ensureAutoLoad } = sayingStore
onMounted(() => ensureAutoLoad())
const message = useMessage()

const copied = ref(false)

function buildCopyText() {
  if (!saying.value) return ''
  return source.value
    ? `「${saying.value}」\n—— ${source.value}`
    : `「${saying.value}」`
}

async function onCopy(e) {
  // 阻止冒泡到 footer（避免触发 onFooterClick 刷新）
  e.stopPropagation()
  e.preventDefault()
  const text = buildCopyText()
  if (!text) return
  const ok = await copyText(text)
  if (ok) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1200)
    message.success($t('saying.copied'))
  } else {
    message.error($t('saying.copyFail'))
  }
}

function onRefresh(e) {
  e.stopPropagation()
  e.preventDefault()
  refresh()
}

function onFooterClick() {
  refresh()
}
</script>

<template>
  <footer
    v-if="ready && saying"
    class="saying-footer"
  >
    <div
      class="saying-content"
      :class="{ refreshing: loading }"
      role="button"
      v-tip="loading ? $t('saying.refreshing') : $t('saying.tapHint')"
      @click="onFooterClick"
    >
      <p class="saying-text">{{ $t('saying.format', { s: saying }) }}</p>
      <p v-if="source" class="saying-source">—— {{ source }}</p>
    </div>

    <div class="saying-actions" @click.stop>
      <button
        class="saying-icon-btn"
        v-tip="copied ? $t('saying.copiedTitle') : $t('saying.copy')"
        :aria-label="copied ? $t('saying.copiedTitle') : $t('saying.copy')"
        @click="onCopy"
      >
        <RiFileCopyLine v-if="!copied" size="14" aria-hidden="true" />
        <RiCheckLine v-else size="14" aria-hidden="true" />
      </button>
      <button
        class="saying-icon-btn"
        :disabled="loading"
        v-tip="$t('saying.another')"
        :aria-label="$t('saying.another')"
        @click="onRefresh"
      >
        <RiRefreshLine size="14" aria-hidden="true" />
      </button>
    </div>
  </footer>
</template>

<style scoped lang="less">
.saying-footer {
  /* 悬浮贴底、水平居中（不依赖 flex 内容宽度） */
  position: fixed;
  left: 0;
  right: 0;
  bottom: 8px;
  margin: 0 auto;
  z-index: 50;
  width: max-content;          /* 宽度仅按内容收缩，不受 actions 影响 */
  max-width: min(80vw, 720px);

  /* 用 flex 让内部文字块居中；actions 用定位脱离流，不影响 footer宽度 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  /* 无背景框 */
  background: transparent;
  border: none;
  color: #ffffff;

  /* footer 本身不接受点击；只有 content（文字）和 actions（按钮）响应 */
  cursor: default;
  user-select: none;

  &:hover {
    .saying-source,
    .saying-actions {
      opacity: 1;
    }
  }
}

/* ============================================================
   文字块 —— content 上、source 下，纯透明度淡入 source
   - 设为定位上下文：actions 绝对定位以此为基准
   ============================================================ */
.saying-content {
  position: relative;             /* 定位锚点：紧贴文字块右侧 */
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;                /* 文字块可点击刷新 */

  /* 刷新中：脉冲 */
  &.refreshing {
    cursor: progress;
    animation: saying-pulse 1.2s ease-in-out infinite;
  }
}

@keyframes saying-pulse {
  0%, 100% { opacity: 0.95; }
  50%      { opacity: 0.65; }
}

.saying-text {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  color: #ffffff;
  white-space: pre-wrap;
  word-break: break-word;
  text-shadow:
    0 0 1px rgba(0, 0, 0, 0.85),
    0 1px 2px rgba(0, 0, 0, 0.7),
    0 2px 6px rgba(0, 0, 0, 0.55),
    0 4px 12px rgba(0, 0, 0, 0.35);
}

.saying-source {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  text-shadow:
    0 0 1px rgba(0, 0, 0, 0.85),
    0 1px 2px rgba(0, 0, 0, 0.55),
    0 2px 6px rgba(0, 0, 0, 0.35);
}

/* ============================================================
   操作按钮 —— 相对 .saying-content 绝对定位
   - 紧贴文字块右侧外（不占 footer 宽度，不影响居中）
   - 默认透明但仍接收事件：
       - hover 桥：鼠标移到 actions 区域（即使不可见）→ hit-test 在 actions 上 → actions 是 footer 子元素 → footer :hover 触发 → actions 淡入
       - 这避免了"鼠标穿越 footer 边界时 hover 丢失"的体验断层
   ============================================================ */
.saying-actions {
  position: absolute;
  top: 50%;
  left: 100%;                  /* 文字块右边缘外 */
  transform: translate(8px, -50%);   /* 向右偏移 8px + 垂直居中 */

  display: inline-flex;
  align-items: center;
  gap: 4px;

  opacity: 0;
  transition: opacity 0.2s ease;
  /* 始终接收事件 —— 自身作为 hover 桥，让 :hover 不掉 */
  pointer-events: auto;
}

.saying-icon-btn {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: @radius-circle;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.28);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  text-shadow:
    0 0 1px rgba(0, 0, 0, 0.85),
    0 1px 2px rgba(0, 0, 0, 0.6);
  transition:
    background 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.45);
    border-color: rgba(255, 255, 255, 0.6);
    transform: scale(1.08);
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
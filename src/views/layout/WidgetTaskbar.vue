<script setup>
/**
 * 小组件任务栏（类 Windows 任务栏）
 * - 小组件弹窗最小化后在此承接：左侧为已最小化的窗口，点击还原
 * - 每日一言固定最右侧（与 SayingFooter 共享同一份每日缓存数据，不重复请求）
 * - 仅在有最小化窗口时由父级挂载；关闭/还原经事件通知父级
 */
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSayingStore } from '@/stores/saying'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import {
  RiFileCopyLine,
  RiCheckLine,
  RiRefreshLine,
  RiCloseLine,
} from '@remixicon/vue'

const props = defineProps({
  /** 被最小化的 widget：{ key, icon, ... } */
  widget: { type: Object, default: null },
  /** 任务栏上显示的窗口标题（父级传入本地化文案） */
  title: { type: String, default: '' },
})
const emit = defineEmits(['restore', 'close'])

/* 每日一言（共享 store，与页脚同一份数据） */
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
  e.stopPropagation()
  const text = buildCopyText()
  if (!text) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = true
    setTimeout(() => { copied.value = false }, 1200)
    message.success($t('saying.copied'))
  } catch (err) {
    console.error('[WidgetTaskbar] 复制失败', err)
    message.error($t('saying.copyFail'))
  }
}

function onRefresh(e) {
  e.stopPropagation()
  refresh()
}
</script>

<template>
  <div class="taskbar">
    <!-- 左：已最小化的窗口 -->
    <div class="task-apps">
      <div
        v-if="widget"
        class="task-app is-active"
        role="button"
        tabindex="0"
        v-tip="$t('taskbar.restoreTitle')"
        @click="emit('restore')"
        @keydown.enter="emit('restore')"
      >
        <span class="task-emoji" aria-hidden="true">{{ widget.icon }}</span>
        <span class="task-name">{{ title }}</span>
        <button
          class="task-close"
          v-tip="$t('common.close')"
          :aria-label="$t('common.close')"
          @click.stop="emit('close')"
        >
          <RiCloseLine size="13" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- 中：每日一言（点击换一条） -->
    <button
      v-if="ready && saying"
      class="task-saying"
      :class="{ refreshing: loading }"
      v-tip="loading ? $t('saying.refreshing') : $t('saying.tapHint')"
      @click="onRefresh"
    >
      <span class="saying-text">{{ $t('saying.format', { s: saying }) }}</span>
      <span class="saying-actions" @click.stop>
        <span
          class="saying-icon-btn"
          role="button"
          v-tip="copied ? $t('saying.copiedTitle') : $t('saying.copy')"
          @click="onCopy"
        >
          <RiFileCopyLine v-if="!copied" size="12" aria-hidden="true" />
          <RiCheckLine v-else size="12" aria-hidden="true" />
        </span>
        <span
          class="saying-icon-btn"
          role="button"
          v-tip="$t('saying.another')"
          @click="onRefresh"
        >
          <RiRefreshLine size="12" aria-hidden="true" />
        </span>
      </span>
    </button>
    <div v-else class="task-saying task-saying-empty"></div>
  </div>
</template>

<style scoped lang="less">
.taskbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-radius: 0;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(17, 22, 32, 0.62);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  color: #fff;
  animation: taskbar-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes taskbar-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .taskbar { animation: none; }
}

/* 左：窗口区 */
.task-apps {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 32vw;
  overflow: hidden;
}

.task-app {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 190px;
  padding: 6px 8px 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
  transition: background 0.15s ease;
  outline: none;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* 运行中指示条（Windows 风格下划线） */
  &.is-active::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 2px;
    height: 2px;
    border-radius: 1px;
    background: @accent;
  }
}

.task-emoji {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}

.task-name {
  font-size: 12px;
  font-weight: 500;
  .ellipsis();
}

.task-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

/* 右：一言（单行省略，靠右对齐，点击换一条） */
.task-saying {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  font: inherit;
  padding: 4px 8px;

  &.task-saying-empty {
    cursor: default;
  }

  &.refreshing .saying-text {
    animation: saying-pulse 1.2s ease-in-out infinite;
  }

  &:hover .saying-actions {
    opacity: 1;
  }
}

.saying-text {
  font-size: 12.5px;
  line-height: 1.5;
  .ellipsis();
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

@keyframes saying-pulse {
  0%, 100% { opacity: 0.95; }
  50% { opacity: 0.55; }
}

.saying-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.saying-icon-btn {
  width: 22px;
  height: 22px;
  border-radius: @radius-circle;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.08);
  }
}

@media (max-width: 640px) {
  .task-apps { max-width: 40vw; }
}
</style>

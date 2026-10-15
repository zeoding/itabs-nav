<script setup>
/**
 * 全局确认弹窗宿主（放置在 App.vue 顶层）
 * - 使用 useConfirm() 控制显隐
 * - ESC 键关闭（等同于取消）
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { RiErrorWarningLine, RiQuestionLine } from '@remixicon/vue'

const { visible, options, ok, cancel } = useConfirm()

function onKeydown(e) {
  if (e.key === 'Escape' && visible.value) {
    e.preventDefault()
    cancel()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

/** 打开时锁定body 滚动 + 关闭时恢复 */
watch(visible, (v) => {
  if (v) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="visible" class="confirm-mask" @click.self="cancel">
        <div class="confirm-dialog glass">
          <div v-if="options.danger" class="confirm-icon danger">
            <RiErrorWarningLine size="28" aria-hidden="true" />
          </div>
          <div v-else class="confirm-icon">
            <RiQuestionLine size="28" aria-hidden="true" />
          </div>
          <h3 class="confirm-title">{{ options.title }}</h3>
          <p class="confirm-message">{{ options.message }}</p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="cancel">{{ options.cancelText }}</button>
            <button
              :class="['btn-ok', { danger: options.danger }]"
              @click="ok"
            >{{ options.okText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.confirm-mask {
  position: fixed;
  inset: 0;
  background: @mask-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11000;
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  width: min(380px, 92vw);
  padding: 28px 28px 22px;
  border-radius: 18px;
  text-align: center;
  color: @text;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.confirm-icon {
  width: 48px;
  height: 48px;
  border-radius: @radius-circle;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;

  &.danger {
    background: linear-gradient(135deg, #ef4444, #f59e0b);
  }
}

.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.confirm-message {
  margin: 0;
  font-size: 13px;
  color: @text-soft;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
}

.btn-cancel,
.btn-ok {
  flex: 1;
  height: 38px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.btn-cancel {
  background: @icon-bg;
  color: @text-soft;

  &:hover {
    background: @icon-bg-hover;
    color: @text;
  }
}

.btn-ok {
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));

  &:hover {
    transform: translateY(-1px);
  }

  &.danger {
    background: linear-gradient(135deg, #ef4444, #f97316);

    &:hover {
      box-shadow: 0 6px 18px rgba(239, 68, 68, 0.35);
    }
  }
}

/* 进入/离开动画 */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;

  .confirm-dialog {
    transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;

  .confirm-dialog {
    opacity: 0;
    transform: scale(0.92) translateY(8px);
  }
}
</style>

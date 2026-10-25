<script setup>
/**
 * 全局消息容器
 * - 由 App.vue 挂载一次
 * - 从 useMessage() 读取队列
 * - 队列每项渲染为一条小 toast
 * - 点击消息立即消失
 */
import { useMessage } from '@/composables/useMessage'
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiAlertLine,
} from '@remixicon/vue'

const ICON_COMPONENTS = {
  success: RiCheckboxCircleLine,
  error: RiErrorWarningLine,
  info: RiInformationLine,
  warning: RiAlertLine,
}

const ICON_SIZES = {
  success: '18',
  error: '18',
  info: '18',
  warning: '18',
}

const { queue, dismiss } = useMessage()

function onClick(id) {
  dismiss(id)
}
</script>

<template>
  <Teleport to="body">
    <div class="message-host" aria-live="polite" aria-atomic="false">
      <transition-group name="message-fade" tag="div" class="message-stack">
        <div
          v-for="m in queue"
          :key="m.id"
          :class="['message-item', `message-${m.type}`, { leaving: m.leaving }]"
          role="status"
          @click="onClick(m.id)"
        >
          <component
            :is="ICON_COMPONENTS[m.type] || ICON_COMPONENTS.info"
            :size="ICON_SIZES[m.type] || '18'"
            class="message-icon"
            aria-hidden="true"
          />
          <span class="message-text">{{ m.content }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped lang="less">
.message-host {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20000;
  pointer-events: none;     /* 让穿透到下方元素 */
}

.message-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.message-item {
  pointer-events: auto;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: @radius-pill;
  background: rgba(31, 41, 55, 0.88);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  .glass-blur(14px, 180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  max-width: min(80vw, 480px);
  user-select: none;
  .ellipsis();
  transition: transform 0.18s ease, opacity 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
  }

  &.leaving {
    opacity: 0;
    transform: translateY(-8px);
    pointer-events: none;
  }
}

/* 类型色（左侧小色块 + 图标颜色） */
.message-success {
  border-color: rgba(34, 197, 94, 0.45);

  .message-icon { color: #22c55e; }
}

.message-error {
  border-color: fade(@danger, 45%);

  .message-icon { color: @danger; }
}

.message-warning {
  border-color: rgba(245, 158, 11, 0.45);

  .message-icon { color: #f59e0b; }
}

.message-info .message-icon { color: rgba(255, 255, 255, 0.85); }

.message-icon {
  flex-shrink: 0;
  display: inline-flex;
}

/* 进入 / 离开动画 */
.message-fade-enter-active,
.message-fade-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.message-fade-enter-from,
.message-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
<script setup>
/**
 * 版本更新提示条（配合 useUpdateChecker，App.vue 挂载一次）
 * - Teleport 到 body，fixed 顶部居中，玻璃拟态
 * - 发现新版本时从上滑入：仅一句提示 + 三个动作（立即刷新 / 稍后提醒 / 忽略此版本）
 */
import { useUpdateChecker } from '@/composables/useUpdateChecker'
import { $t } from '@/composables/useI18n'
import { RiDownloadCloud2Line, RiRefreshLine, RiCloseLine } from '@remixicon/vue'

import { ref } from 'vue'
import { usePwa } from '@/composables/usePwa'

const { updateState, dismiss, ignoreVersion, reload } = useUpdateChecker()
const { pwaState } = usePwa()
const pwaDismissed = ref(false)
function later() {
  pwaDismissed.value = true
  dismiss()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="update-slide">
      <div v-if="updateState.available || (pwaState.updateReady && !pwaDismissed)" class="update-notice" role="alert">
        <div class="update-icon">
          <RiDownloadCloud2Line size="20" aria-hidden="true" />
        </div>
        <div class="update-body">
          <div class="update-title">{{ $t('update.found') }}</div>
        </div>
        <div class="update-actions">
          <button class="btn-primary" type="button" :disabled="pwaState.updating" @click="reload">
            <RiRefreshLine size="14" aria-hidden="true" />
            {{ $t('update.refresh') }}
          </button>
          <button class="btn-ghost" type="button" @click="later">{{ $t('update.later') }}</button>
          <button
            v-if="updateState.available && !pwaState.updateReady"
            class="update-ignore"
            type="button"
            v-tip="$t('update.ignore')"
            @click="ignoreVersion(updateState.available.version)"
          >
            <RiCloseLine size="14" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.update-notice {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15000;
  display: flex;
  align-items: center; /* 图标/标题/按钮高度不一，统一走垂直居中 */
  gap: 12px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 12px 14px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.92);
  .glass-blur(20px, 180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 10px 34px rgba(31, 41, 55, 0.16);
  color: @text;
}

.update-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: @radius-pill;
  color: #fff;
  background: @accent-gradient;
}

.update-body {
  flex: 1;
  min-width: 0;
}

.update-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.update-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: #fff;
  background: @accent-gradient;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 40%, transparent);
  }

  &:active {
    transform: scale(0.95);
  }
}

.btn-ghost {
  padding: 7px 12px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: rgba(127, 127, 127, 0.1);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    color: @text;
    background: rgba(127, 127, 127, 0.18);
  }
}

.update-ignore {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: @radius-circle;
  color: @text-soft;
  background: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    color: @text;
    background: rgba(127, 127, 127, 0.12);
  }
}

/* 顶部滑入/滑出 */
.update-slide-enter-active,
.update-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.update-slide-enter-from,
.update-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px);
}
</style>

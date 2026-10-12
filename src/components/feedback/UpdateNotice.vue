<script setup>
/**
 * 版本更新提示条（配合 useUpdateChecker，App.vue 挂载一次）
 * - Teleport 到 body，fixed 顶部居中，玻璃拟态
 * - 发现新版本时从上滑入：版本号 + 更新说明（可折叠）+ 三个动作
 *   （立即刷新 / 稍后提醒 / 忽略此版本）
 */
import { ref, computed } from 'vue'
import { useUpdateChecker } from '@/composables/useUpdateChecker'
import { $t } from '@/composables/useI18n'
import { RiDownloadCloud2Line, RiRefreshLine, RiCloseLine } from '@remixicon/vue'

const { updateState, dismiss, ignoreVersion, reload } = useUpdateChecker()
/** 更新说明展开/收起（默认收起只显示一行提示，避免遮挡页面） */
const notesOpen = ref(false)

const hasNotes = computed(() => Boolean(updateState.available?.notes))
</script>

<template>
  <Teleport to="body">
    <Transition name="update-slide">
      <div v-if="updateState.available" class="update-notice" role="alert">
        <div class="update-icon">
          <RiDownloadCloud2Line size="20" aria-hidden="true" />
        </div>
        <div class="update-body">
          <div class="update-title">
            {{ $t('update.found') }}
            <span class="update-ver">v{{ updateState.available.version }}</span>
          </div>
          <button
            v-if="hasNotes"
            class="update-notes-toggle"
            type="button"
            @click="notesOpen = !notesOpen"
          >
            {{ $t('update.notes') }}{{ notesOpen ? '▲' : '▼' }}
          </button>
          <pre v-if="hasNotes && notesOpen" class="update-notes">{{ updateState.available.notes }}</pre>
        </div>
        <div class="update-actions">
          <button class="btn-primary" type="button" @click="reload">
            <RiRefreshLine size="14" aria-hidden="true" />
            {{ $t('update.refresh') }}
          </button>
          <button class="btn-ghost" type="button" @click="dismiss">{{ $t('update.later') }}</button>
          <button
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
  align-items: flex-start;
  gap: 12px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 12px 14px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
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
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
}

.update-body {
  flex: 1;
  min-width: 0;
}

.update-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;

  .update-ver {
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: @radius-pill;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: @accent;
    background: @accent-soft;
  }
}

.update-notes-toggle {
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: @text-soft;
  cursor: pointer;

  &:hover {
    color: @accent;
  }
}

.update-notes {
  margin: 6px 0 0;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-line;
  word-break: break-word;
  font-family: inherit;
  color: @text-soft;
  background: rgba(127, 127, 127, 0.08);
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
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
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

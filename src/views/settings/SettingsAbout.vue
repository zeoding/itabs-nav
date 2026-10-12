<script setup>
/**
 * 设置 - 关于 Tab
 * - 应用信息 + 构建日期（version / 构建日期均为 vite define 注入的编译期常量）
 * - 手动检查更新：latest → toast 提示；available → 顶部提示条弹出；error → 失败提示
 */
import { ref } from 'vue'
import { $t } from '@/composables/useI18n'
import { useUpdateChecker } from '@/composables/useUpdateChecker'
import { useMessage } from '@/composables/useMessage'
import { RiCompassDiscoverLine, RiRefreshLine } from '@remixicon/vue'

/** 构建日期（vite.config define 注入，格式 YYYY-MM-DD HH:mm） */
const buildDate = __BUILD_DATE__
/** 应用版本（vite.config define 注入，取自 package.json version） */
const appVersion = __APP_VERSION__

const { check } = useUpdateChecker()
const message = useMessage()
const checking = ref(false)

async function onCheckUpdate() {
  if (checking.value) return
  checking.value = true
  const result = await check({ manual: true })
  checking.value = false
  if (result === 'available') return // 顶部提示条已弹出，无需额外提示
  if (result === 'latest') {
    message.success($t('update.latest', { version: appVersion }))
  } else {
    message.error($t('update.failed'))
  }
}
</script>

<template>
  <div class="about">
    <div class="about-logo">
      <RiCompassDiscoverLine size="48" aria-hidden="true" />
    </div>
    <div class="about-name">{{ $t('settings.about.name') }}</div>
    <div class="about-ver">{{ $t('settings.about.version', { version: appVersion }) }}</div>
    <div class="about-build">{{ $t('settings.about.buildDate') }}：{{ buildDate }}</div>
    <button class="about-check" type="button" :disabled="checking" @click="onCheckUpdate">
      <RiRefreshLine size="14" :class="{ spinning: checking }" aria-hidden="true" />
      {{ checking ? $t('update.checking') : $t('update.checkNow') }}
    </button>
    <p class="about-desc">{{ $t('settings.about.desc') }}</p>
  </div>
</template>

<style scoped lang="less">
.about {
  text-align: center;
  padding: 12px 6px;
}

.about-logo {
  width: 56px;
  height: 56px;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));

  :deep(svg) {
    color: #fff;
  }
}

.about-name {
  font-size: 18px;
  font-weight: 600;
}

.about-ver {
  font-size: 12px;
  color: @text-soft;
  margin: 4px 0 2px;
}

.about-build {
  font-size: 12px;
  color: @text-soft;
  margin: 0 0 12px;
  font-variant-numeric: tabular-nums;
}

.about-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @accent;
  background: @accent-soft;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, @accent-soft 70%, @accent 15%);
  }

  &:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .spinning {
    animation: about-spin 0.9s linear infinite;
  }
}

@keyframes about-spin {
  to {
    transform: rotate(360deg);
  }
}

.about-desc {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.8;
  color: @text-soft;
  text-align: left;
}
</style>

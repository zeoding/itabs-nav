<script setup>
/**
 * 设置 - 关于 Tab
 * - 纯展示：应用信息 + 构建日期
 */
import { $t } from '@/composables/useI18n'
import { RiCompassDiscoverLine } from '@remixicon/vue'

/** 构建日期（vite.config define 注入，格式 YYYY-MM-DD HH:mm） */
const buildDate = __BUILD_DATE__
</script>

<template>
  <div class="about">
    <div class="about-logo">
      <RiCompassDiscoverLine size="48" aria-hidden="true" />
    </div>
    <div class="about-name">{{ $t('settings.about.name') }}</div>
    <div class="about-ver">{{ $t('settings.about.version') }}</div>
    <div class="about-build">{{ $t('settings.about.buildDate') }}：{{ buildDate }}</div>
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

.about-desc {
  font-size: 13px;
  line-height: 1.8;
  color: @text-soft;
  text-align: left;
}
</style>

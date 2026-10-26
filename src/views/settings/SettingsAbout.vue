<script setup>
/**
 * 设置 - 关于 Tab
 * - 应用信息 + 构建日期（version / 构建日期均为 vite define 注入的编译期常量）
 * - 手动检查更新：available → 顶部提示条弹出；latest / ignored → toast；
 *   dismissed 不额外提示（提示条已重新弹出）；error → 失败提示
 */
import { ref } from 'vue'
import { $t } from '@/composables/useI18n'
import { useUpdateChecker } from '@/composables/useUpdateChecker'
import { useMessage } from '@/composables/useMessage'
import { usePwa } from '@/composables/usePwa'
import { openExternal } from '@/utils/openExternal'
import { RiCompassDiscoverLine, RiRefreshLine, RiGithubLine } from '@remixicon/vue'

/** 构建日期（vite.config define 注入，格式 YYYY-MM-DD HH:mm） */
const buildDate = __BUILD_DATE__
/** 应用版本（vite.config define 注入，取自 package.json version） */
const appVersion = __APP_VERSION__
/** GitHub 仓库地址（与 git remote 同源） */
const REPO_URL = 'https://github.com/zeoding/itabs-nav'

const { check } = useUpdateChecker()
const { pwaState, install } = usePwa()
const message = useMessage()
const checking = ref(false)

async function onCheckUpdate() {
  if (checking.value) return
  checking.value = true
  const result = await check({ manual: true })
  checking.value = false
  if (result === 'available' || result === 'dismissed') return // 顶部提示条已弹出
  if (result === 'ignored') {
    // 新版本确实存在，只是此前被用户「忽略此版本」：不能说「已是最新」
    message.info($t('update.ignoredHint'))
    return
  }
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
    <div class="about-actions">
      <button v-if="pwaState.canInstall" class="about-check" type="button" @click="install">
        {{ $t('pwa.install') }}
      </button>
      <button class="about-check" type="button" :disabled="checking" @click="onCheckUpdate">
        <RiRefreshLine size="14" :class="{ spinning: checking }" aria-hidden="true" />
        {{ checking ? $t('update.checking') : $t('update.checkNow') }}
      </button>
      <button
        class="about-github"
        type="button"
        v-tip="$t('settings.about.github')"
        :aria-label="$t('settings.about.github')"
        @click="openExternal(REPO_URL)"
      >
        <RiGithubLine size="14" aria-hidden="true" />
        GitHub
      </button>
    </div>
    <p v-if="pwaState.supported" class="about-pwa" role="status">
      {{ pwaState.installed ? $t('pwa.installed') : $t('pwa.installHint') }}
      <br />
      {{ pwaState.offlineReady ? $t('pwa.offlineReady') : $t('pwa.preparing') }}
    </p>
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
  background: @accent-gradient;

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

/* 检查更新 + GitHub 仓库：一排两个胶囊按钮 */
.about-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
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
    animation: spin360 0.9s linear infinite;
  }
}

/* GitHub 仓库跳转：中性色调，与主操作区分 */
.about-github {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text;
  background: rgba(31, 41, 55, 0.06);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(31, 41, 55, 0.12);
  }
}


.about-pwa {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: @text-soft;
}

.about-desc {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.8;
  color: @text-soft;
  text-align: left;
}
</style>

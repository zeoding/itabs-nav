<script setup>
/**
 * 设置 - 外观 Tab
 * - 壁纸模式 / 每行格子数 / 主题色 / 语言
 * - 受控组件：展示用 local 镜像，变更经 update 事件回写父级（App → useSettings）
 */
import { ref, watch } from 'vue'
import {
  THEME_PRESETS,
  WALLPAPER_REFRESH_OPTIONS,
} from '@/stores/settings'
import { $t, setLanguage } from '@/composables/useI18n'

const props = defineProps({
  settings: { type: Object, required: true },
})
const emit = defineEmits(['update'])

const local = ref({ ...props.settings })
watch(
  () => props.settings,
  (val) => {
    local.value = { ...val }
  },
  { deep: true }
)

/** 随机壁纸刷新间隔选项（小时） */
const refreshOptions = WALLPAPER_REFRESH_OPTIONS

function change(key, value) {
  local.value = { ...local.value, [key]: value }
  emit('update', key, value)
}

/** 语言切换：写回 store + 立即应用 */
function changeLanguage(lang) {
  change('language', lang)
  setLanguage(lang)
}

/** 自定义颜色实时应用（拖动 color picker 时持续更新） */
function onCustomColor(e) {
  const c = e.target.value
  local.value.themeColor = c
  emit('update', 'themeColor', c)
}
</script>

<template>
  <div class="group">
    <div class="group-title">{{ $t('settings.wallpaper.title') }}</div>
    <div class="seg">
      <button
        v-for="mode in [
          { key: 'gradient', name: $t('settings.wallpaper.gradient') },
          { key: 'image', name: $t('settings.wallpaper.image') },
          { key: 'random', name: $t('settings.wallpaper.random') },
        ]"
        :key="mode.key"
        :class="['seg-btn', { active: local.wallpaperMode === mode.key }]"
        @click="change('wallpaperMode', mode.key)"
      >
        {{ mode.name }}
      </button>
    </div>
    <input
      v-if="local.wallpaperMode === 'image'"
      v-model="local.wallpaper"
      class="text-input"
      type="text"
      :placeholder="$t('settings.wallpaper.urlPlaceholder')"
      @change="change('wallpaper', $event.target.value)"
    />
    <template v-if="local.wallpaperMode === 'random'">
      <div class="sub-title">{{ $t('settings.wallpaper.refresh') }}</div>
      <div class="seg">
        <button
          v-for="h in refreshOptions"
          :key="h"
          :class="['seg-btn', { active: Number(local.wallpaperRefreshHours) === h }]"
          @click="change('wallpaperRefreshHours', h)"
        >
          {{ $t('settings.wallpaper.hours', { n: h }) }}
        </button>
      </div>
    </template>
  </div>

  <div class="group">
    <div class="group-title">{{ $t('settings.grid.title') }}</div>
    <div class="seg">
      <button
        v-for="n in ['auto', 4, 5, 6]"
        :key="n"
        :class="['seg-btn', { active: String(local.gridColumns) === String(n) }]"
        @click="change('gridColumns', n)"
      >
        {{ n === 'auto' ? $t('settings.grid.auto') : n }}
      </button>
    </div>
  </div>

  <div class="group">
    <div class="group-title">{{ $t('settings.themeColor.title') }}</div>
    <p class="hint">{{ $t('settings.themeColor.hint') }}</p>
    <div class="theme-row">
      <button
        v-for="tp in THEME_PRESETS"
        :key="tp.key"
        class="theme-swatch"
        :class="{ active: local.themeColor?.toLowerCase() === tp.value.toLowerCase() }"
        v-tip="$t(`settings.presetNames.${tp.key}`)"
        :aria-label="`${$t('settings.themeColor.title')}：${$t(`settings.presetNames.${tp.key}`)}`"
        :style="{ background: tp.value }"
        @click="change('themeColor', tp.value)"
      />
      <label class="theme-picker" v-tip="$t('settings.themeColor.custom')">
        <input
          type="color"
          :value="local.themeColor || '#6366f1'"
          :aria-label="$t('settings.themeColor.custom')"
          @input="onCustomColor"
        />
        <span class="picker-label">{{ $t('settings.themeColor.custom') }}</span>
      </label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">{{ $t('settings.language.title') }}</div>
    <p class="hint">{{ $t('settings.language.hint') }}</p>
    <div class="seg">
      <button
        v-for="lang in [
          { key: 'zh-CN', name: $t('settings.language.zhCN') },
          { key: 'en', name: $t('settings.language.en') },
        ]"
        :key="lang.key"
        :class="['seg-btn', { active: (local.language || 'zh-CN') === lang.key }]"
        @click="changeLanguage(lang.key)"
      >
        {{ lang.name }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.group {
  margin-bottom: 20px;
}

.group-title {
  font-size: 12px;
  color: @text-soft;
  margin-bottom: 8px;
}

.sub-title {
  font-size: 12px;
  color: @text-soft;
  margin: 10px 0 6px;
}

.hint {
  font-size: 12px;
  color: @text-soft;
  margin-bottom: 10px;
  line-height: 1.6;
}

.seg {
  display: flex;
  gap: 8px;
}

.seg-btn {
  flex: 1;
  border-radius: @radius-pill;
  padding: 8px 0;
  font-size: 13px;
  color: @text-soft;
  background: rgba(31, 41, 55, 0.04);
  transition: all @tr;
  border: none;
  cursor: pointer;

  &:hover {
    background: @accent-soft;
    color: @accent;
  }

  &.active {
    background: @accent-gradient;
    color: #fff;
    box-shadow: 0 2px 8px @accent-soft;
  }
}

.text-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 10px 14px;
  font-size: 14px;

  &:focus {
    border-color: @accent;
    outline: none;
  }
}

/* 主题色：预设色值 + 自定义 */
.theme-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.theme-swatch {
  width: 32px;
  height: 32px;
  border-radius: @radius-circle;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 2px 6px rgba(31, 41, 55, 0.12);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  position: relative;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(31, 41, 55, 0.18);
  }

  &.active {
    border-color: @accent;
    box-shadow: 0 0 0 3px @accent-soft;
  }
}

.theme-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: @radius-pill;
  background: rgba(31, 41, 55, 0.05);
  font-size: 12px;
  color: @text-soft;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(31, 41, 55, 0.1);
    color: @text;
  }

  input[type="color"] {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: none;
      border-radius: @radius-circle;
    }
  }
}

.picker-label {
  user-select: none;
}
</style>

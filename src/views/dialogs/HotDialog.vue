<script setup>
/**
 * 热榜弹窗（iTab 风格? * - 3个tab：百度/ 微博 / 知乎
 * - 展示15条热榜，可点击跳转 * - 显示热度数字
 * - 支持全屏放大
 * - 数据源：vvhan API（带兜底）
 */
import { ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useHotStore, formatHot } from '@/stores/hot'
import BaseDialog from '@/components/BaseDialog.vue'
import {
  RiAlertLine,
  RiSignalWifiErrorLine,
} from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  defaultSource: { type: String, default: 'weibo' },
})
const emit = defineEmits(['update:open'])

const hotStore = useHotStore()
const { data, loading, error, currentSource, lastUpdated, fromCache, usedFallback } = storeToRefs(hotStore)
const { load, sourceList } = hotStore

function close() {
  emit('update:open', false)
}

function switchSource(key) {
  if (key === currentSource.value) return
  // 切换源读缓存优先，命中当天缓存零请求
  load(key, false)
}

function forceRefresh() {
  load(currentSource.value, true)
}

function openUrl(url) {
  if (!url || url === '#') return
  window.open(url, '_blank', 'noopener')
}

function formatTime(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const h = String(dt.getHours()).padStart(2, '0')
  const m = String(dt.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function rankStyle(i) {
  if (i === 0) return { background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff' }
  if (i === 1) return { background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#fff' }
  if (i === 2) return { background: 'linear-gradient(135deg, #84cc16, #16a34a)', color: '#fff' }
  return null
}

watch(
  () => props.open,
  (val) => {
    // 打开时缺数据才读（缓存优先），避免每次打开都打一次网络；
    // 手动刷新走右上角刷新按钮（force=true）
    if (val && !data.value) {
      load(props.defaultSource, false)
    }
  }
)
onMounted(() => {
  if (props.open && !data.value) {
    load(props.defaultSource, false)
  }
})
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('hot.title')"
    height="500px"
    max-height="90vh"
    padding="22px 24px 22px"
    fs-padding="24px 32px"
    @close="close"
  >
    <template #default="{ fullscreen }">
      <div class="hot-root" :class="{ 'is-fullscreen': fullscreen }">
        <!-- 顶部 tab + 刷新时间 -->
        <div class="tab-bar">
          <button
            v-for="s in sourceList"
            :key="s.key"
            :class="['tab-btn', { active: currentSource === s.key }]"
            :style="currentSource === s.key ? { background: s.color, color: '#fff' } : null"
            @click="switchSource(s.key)"
          >
            {{ s.name }}
          </button>
          <div class="updated">
            <span v-if="lastUpdated">{{ $t('hot.updatedAt', { t: formatTime(lastUpdated) }) }}</span>
            <span v-if="fromCache" class="cache-hint">{{ $t('hot.cachedHint') }}</span>
            <span v-if="usedFallback" class="fallback-hint" v-tip="$t('hot.apiDown')">
              <RiAlertLine size="14" aria-hidden="true" /> {{ $t('hot.offline') }}
            </span>
          </div>
          <button class="refresh-btn" :disabled="loading" @click="forceRefresh" v-tip="$t('hot.refreshTitle')">
            {{ loading ? $t('hot.loading') : $t('hot.refresh') }}
          </button>
        </div>

        <!-- 列表 -->
        <div v-if="loading && !data" class="loading">{{ $t('hot.loading') }}</div>
        <div v-else-if="data && data.length > 0" class="hot-list">
          <div
            v-for="(item, i) in data"
            :key="i"
            class="hot-item"
            @click="openUrl(item.url)"
          >
            <span
              class="rank"
              :style="rankStyle(i) || undefined"
            >{{ i + 1 }}</span>
            <span class="title" v-tip="item.title">{{ item.title }}</span>
            <span class="hot">{{ formatHot(item.hot) }}</span>
          </div>
        </div>
        <div v-else class="placeholder">
          <div class="placeholder-icon">
            <RiSignalWifiErrorLine size="56" aria-hidden="true" />
          </div>
          <div class="placeholder-text">{{ usedFallback ? $t('hot.apiDown') : $t('hot.noData') }}</div>
          <div v-if="error" class="placeholder-hint">{{ error }}</div>
          <button class="retry-btn" @click="forceRefresh">{{ $t('hot.retry') }}</button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped lang="less">
/* 内容根：承接原 .dialog 的纵向 flex（全屏类改挂此处，容器已收归 BaseDialog） */
.hot-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  /* 全屏：双列 */
  &.is-fullscreen .hot-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0 16px;
  }
}

/* tab bar */
.tab-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.tab-btn {
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  background: rgba(31, 41, 55, 0.06);
  color: @text-soft;
  border: none;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover:not(.active) {
    background: rgba(31, 41, 55, 0.1);
    color: @text;
  }
}

.updated {
  flex: 1;
  font-size: 11px;
  color: @text-soft;
  margin-left: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.fallback-hint {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
  font-weight: 500;
}

.cache-hint {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
  font-weight: 500;
}

.refresh-btn {
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 12px;
  color: @text;
  background: color-mix(in srgb, @accent 0.08%, transparent);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, @accent 0.18%, transparent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 列表 */
.hot-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: color-mix(in srgb, @accent 0.3%, transparent) transparent;
  padding-right: 4px;
  .thin-scrollbar(color-mix(in srgb, @accent 0.3%, transparent), 5px);

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.hot-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 2px;

  &:hover {
    background: color-mix(in srgb, @accent 0.06%, transparent);
  }

  &:active {
    background: color-mix(in srgb, @accent 0.12%, transparent);
  }
}

.rank {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: rgba(31, 41, 55, 0.08);
  color: @text-soft;
  flex-shrink: 0;
}

.title {
  flex: 1;
  font-size: 13px;
  color: @text;
  min-width: 0;
  .ellipsis();
}

.hot {
  font-size: 11px;
  color: @text-soft;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.loading,
.placeholder {
  text-align: center;
  padding: 40px 20px;
  color: @text-soft;
  font-size: 13px;
}

.placeholder-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.6;
}

.placeholder-text {
  font-size: 14px;
  color: @text;
  font-weight: 500;
  margin-bottom: 4px;
}

.placeholder-hint {
  font-size: 11px;
  color: @text-soft;
  margin-bottom: 12px;
  word-break: break-all;
}

.retry-btn {
  padding: 6px 18px;
  border-radius: 10px;
  font-size: 13px;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, @accent 0.3%, transparent);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>

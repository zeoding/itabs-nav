<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore, tempLinePoints, tempRange } from '@/stores/weather'
import BaseDialog from '@/components/BaseDialog.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import { PROVINCES, HOT_CITIES, DEFAULT_PROVINCE, DEFAULT_CITY } from '@/data/regions'
import { $t } from '@/composables/useI18n'
import {
  RiMapPinLine,
  RiLoopLeftLine,
} from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const weatherStore = useWeatherStore()
const { data, loading, error, locating, city, lastUpdated, fromCache } = storeToRefs(weatherStore)
const { load, locate } = weatherStore
// 省市两级选择（替代原来的手动输入框）
const selectedProvince = ref(DEFAULT_PROVINCE)
const selectedCity = ref(DEFAULT_CITY)
const currentCities = computed(
  () => PROVINCES.find((p) => p.name === selectedProvince.value)?.cities || []
)
const provinceNames = computed(() => PROVINCES.map((p) => p.name))
const cityNames = computed(() => currentCities.value)

/** 省份切换：重置城市到该省第一个 + 读缓存优先 */
function onProvincePicked() {
  onProvinceChange()
  loadCached()
}
/** 城市切换：读缓存优先（命中当天缓存零请求）；手动点查询/刷新才强制走网络 */
function onCityPicked() {
  loadCached()
}

/** 去行政区划后缀后比对（深圳市→深圳，兴安盟→兴安） */
function normName(s) {
  return String(s || '').replace(/[市省区县盟旗州]$/, '')
}

/** 把城市名回填到两级选择（定位 / IP / 历史城市进来时用） */
function syncSelects(name) {
  const n = normName(name)
  if (!n) return
  for (const p of PROVINCES) {
    if (normName(p.name) === n) {
      selectedProvince.value = p.name
      selectedCity.value = p.cities[0]
      return
    }
    const hit = p.cities.find((c) => normName(c) === n || c === name)
    if (hit) {
      selectedProvince.value = p.name
      selectedCity.value = hit
      return
    }
  }
}

function onProvinceChange() {
  const list = PROVINCES.find((p) => p.name === selectedProvince.value)?.cities || []
  selectedCity.value = list[0] || ''
}

/** 切换城市读缓存优先（命中当天缓存零请求）；手动点查询/刷新才强制走网络 */
async function loadCached() {
  if (selectedCity.value) await load(selectedCity.value, false)
}

async function forceRefresh() {
  if (selectedCity.value) await load(selectedCity.value, true)
}

/** 缓存时间格式化（lastUpdated 可能是时间戳数字） */
function formatCacheTime(t) {
  if (!t) return ''
  const d = t instanceof Date ? t : new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

async function autoLocate() {
  const result = await locate()
  if (result) syncSelects(result)
}

async function resetToShenzhen() {
  selectedProvince.value = DEFAULT_PROVINCE
  selectedCity.value = DEFAULT_CITY
  await load(DEFAULT_CITY)
}

async function pickHot(name) {
  syncSelects(name)
  await loadCached()
}

function close() {
  emit('update:open', false)
}

/** 月相文字 图标 */
function moonIcon(phase) {
  if (!phase) return '🌑'
  const map = {
    'New Moon': '🌑',
    'Waxing Crescent': '🌒',
    'First Quarter': '🌓',
    'Waxing Gibbous': '🌔',
    'Full Moon': '🌕',
    'Waning Gibbous': '🌖',
    'Last Quarter': '🌗',
    'Waning Crescent': '🌘',
  }
  return map[phase] || '🌑'
}

/** 格式化日期 */
function formatDate(s, i) {
  if (!s) return ''
  if (i === 0) return $t('weather.today')
  if (i === 1) return $t('weather.tomorrow')
  const [, m, d] = s.split('-')
  const dt = new Date(Number(s.slice(0, 4)), Number(m) - 1, Number(d))
  const w = $t('weather.weekdays')[dt.getDay()]
  return `${parseInt(m, 10)}/${parseInt(d, 10)} ${w}`
}

/** 小时格式化 */
function formatHour(t) {
  const s = String(t).padStart(4, '0')
  return `${s.slice(0, 2)}:${s.slice(2)}`
}

/** 24h 温度曲线 SVG path */
const linePath = computed(() => {
  if (!data.value?.todayHourly) return ''
  return tempLinePoints(data.value.todayHourly, 320, 50)
})
/** 温度范围 */
const tempRangeVal = computed(() => {
  if (!data.value?.todayHourly) return { min: 0, max: 0 }
  return tempRange(data.value.todayHourly)
})
/** 生活指数（接口直接返回 18 项，带 level/advice） */
const lifeItems = computed(() => data.value?.life || [])

watch(
  () => props.open,
  (val) => {
    if (val) {
      syncSelects(city.value)
      if (!data.value) loadCached()
    }
  }
)
onMounted(() => {
  if (props.open) {
    syncSelects(city.value)
    if (!data.value) loadCached()
  }
})
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('weather.title')"
    height="min(780px, 92vh)"
    max-height="92vh"
    padding="22px 24px 22px"
    fs-padding="28px 40px"
    @close="close"
  >
    <template #default="{ fullscreen }">
      <div class="w-root" :class="{ 'is-fullscreen': fullscreen }">
        <div class="city-row">
          <BaseSelect
            v-model="selectedProvince"
            :options="provinceNames"
            variant="box"
            layout="list"
            filterable
            :filter-placeholder="$t('weather.searchRegion')"
            :aria-label="$t('weather.province')"
            @select="onProvincePicked"
          >
            <template #empty>{{ $t('weather.noResult') }}</template>
          </BaseSelect>
          <BaseSelect
            v-model="selectedCity"
            :options="cityNames"
            variant="box"
            layout="list"
            filterable
            :filter-placeholder="$t('weather.searchRegion')"
            :aria-label="$t('weather.cityLabel')"
            @select="onCityPicked"
          >
            <template #empty>{{ $t('weather.noResult') }}</template>
          </BaseSelect>
          <button class="locate-btn" @click="autoLocate" :disabled="locating || loading" v-tip="$t('weather.locateTitle')" :aria-label="$t('weather.locateTitle')">
            <RiMapPinLine v-if="!locating" size="16" aria-hidden="true" />
            <span v-else></span>
          </button>
          <button class="reset-btn" @click="resetToShenzhen" :disabled="loading" v-tip="$t('weather.resetTitle')" :aria-label="$t('weather.resetTitle')">
            <RiLoopLeftLine size="16" aria-hidden="true" />
          </button>
          <button class="refresh-btn" @click="forceRefresh" :disabled="loading" v-tip="$t('weather.refreshTitle')">
            {{ loading ? $t('weather.loading') : $t('weather.searchBtn') }}
          </button>
        </div>
        <div v-if="fromCache && lastUpdated" class="cache-hint">{{ $t('weather.cachedHint', { t: formatCacheTime(lastUpdated) }) }}</div>
        <div class="hot-row">
          <span class="hot-row-label">{{ $t('weather.hotCities') }}</span>
          <button
            v-for="c in HOT_CITIES"
            :key="c"
            class="hot-chip"
            :class="{ active: c === selectedCity }"
            :disabled="loading"
            @click="pickHot(c)"
          >{{ c }}</button>
        </div>

        <div v-if="data && data.alerts && data.alerts.length" class="alerts">
          <div class="alerts-title">{{ $t('weather.alerts') }}</div>
          <div v-for="(a, i) in data.alerts" :key="i" class="alert-item">
            <span v-if="a.level" class="alert-level">{{ a.level }}</span>
            <div class="alert-body">
              <div v-if="a.title" class="alert-item-title">{{ a.title }}</div>
              <div v-if="a.text" class="alert-item-text">{{ a.text }}</div>
            </div>
          </div>
        </div>

        <div v-if="loading" class="loading">{{ $t('weather.loading') }}</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <template v-else-if="data">
          <!-- 左右分栏 -->
          <div class="weather-body">
            <div class="left-pane">
              <section class="now">
                <div class="now-left">
                  <div class="now-icon">{{ data.icon }}</div>
                  <div class="now-info">
                    <div class="now-temp">{{ data.temp }}°</div>
                    <div class="now-desc">{{ data.desc }}</div>
                    <div class="now-feel">{{ $t('weather.feelsLike', { v: data.feels }) }}</div>
                  </div>
                </div>
                <div class="now-right">
                  <div class="now-hilo">
                    <span class="hi">{{ data.forecast?.[0]?.max }}°</span>
                    <span class="lo">{{ data.forecast?.[0]?.min }}°</span>
                  </div>
                  <div class="now-loc">
                    📍 {{ data.city }}
                    <span v-if="data.region">· {{ data.region }}</span>
                  </div>
                  <div class="now-time" v-if="data.localObsTime">{{ $t('weather.observed', { t: data.localObsTime }) }}</div>
                </div>
              </section>

              <!-- 今日天文（左栏） -->
              <section class="astro">
                <div class="astro-item">
                  <span class="astro-icon">🌅</span>
                  <div>
                    <div class="astro-label">{{ $t('weather.sunrise') }}</div>
                    <div class="astro-value">{{ data.sunrise }}</div>
                  </div>
                </div>
                <div class="astro-item">
                  <span class="astro-icon">🌇</span>
                  <div>
                    <div class="astro-label">{{ $t('weather.sunset') }}</div>
                    <div class="astro-value">{{ data.sunset }}</div>
                  </div>
                </div>
                <div v-if="data.moonrise || data.moonset" class="astro-item">
                  <span class="astro-icon">🌙</span>
                  <div>
                    <div class="astro-label">{{ $t('weather.moonrise') }}</div>
                    <div class="astro-value">{{ data.moonrise }} / {{ data.moonset }}</div>
                  </div>
                </div>
                <div v-if="data.moonPhase" class="astro-item">
                  <span class="astro-icon">{{ moonIcon(data.moonPhase) }}</span>
                  <div>
                    <div class="astro-label">{{ $t('weather.phase') }}</div>
                    <div class="astro-value">{{ data.moonPhase }} <span class="moon-pct">{{ data.moonIllumination }}%</span></div>
                  </div>
                </div>
              </section>

              <!-- 24h 温度趋势 -->
              <section class="hourly" v-if="data.todayHourly?.length">
                <div class="hourly-head">
                  <span class="head-title">{{ $t('weather.trend24') }}</span>
                  <span class="head-range">
                    <span class="lo">{{ tempRangeVal.min }}°</span>
                    <span class="hi">{{ tempRangeVal.max }}°</span>
                  </span>
                </div>
                <svg class="temp-line" viewBox="0 0 320 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#f97316" stop-opacity="0.4" />
                      <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path :d="`${linePath} L 320 50 L 0 50 Z`" fill="url(#lineGrad)" />
                  <path :d="linePath" stroke="#f97316" stroke-width="1.5" fill="none" />
                </svg>
                <div class="hourly-list">
                  <div v-for="(h, i) in data.todayHourly" :key="i" class="hl-item">
                    <div class="hl-time">{{ formatHour(h.time) }}</div>
                    <div class="hl-icon">{{ h.icon }}</div>
                    <div class="hl-temp">{{ h.temp }}°</div>
                    <div v-if="Number(h.chanceOfRain) > 0" class="hl-rain">💧{{ h.chanceOfRain }}%</div>
                    <div v-else class="hl-rain placeholder">·</div>
                  </div>
                </div>
              </section>

              <!-- 详细指标网格 -->
              <section class="detail-grid">
                <div class="dg-item">
                  <div class="dg-icon">💧</div>
                  <div class="dg-label">{{ $t('weather.humidity') }}</div>
                  <div class="dg-value">{{ data.humidity }}<span class="unit">%</span></div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">💨</div>
                  <div class="dg-label">{{ $t('weather.wind') }}</div>
                  <div class="dg-value small">{{ data.windText }}</div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">🧭</div>
                  <div class="dg-label">{{ $t('weather.direction') }}</div>
                  <div class="dg-value small">{{ data.windDir }}</div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">🌡</div>
                  <div class="dg-label">{{ $t('weather.pressure') }}</div>
                  <div class="dg-value">{{ data.pressure }}<span class="unit">hPa</span></div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">👁</div>
                  <div class="dg-label">{{ $t('weather.visibility') }}</div>
                  <div class="dg-value">{{ data.visibility }}<span class="unit">km</span></div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">☀️</div>
                  <div class="dg-label">{{ $t('weather.uvIndex') }}</div>
                  <div class="dg-value">{{ data.uvIndex }}</div>
                </div>
                <div v-if="data.dewPoint != null" class="dg-item">
                  <div class="dg-icon">💦</div>
                  <div class="dg-label">{{ $t('weather.dewPoint') }}</div>
                  <div class="dg-value">{{ data.dewPoint }}<span class="unit">°</span></div>
                </div>
                <div class="dg-item">
                  <div class="dg-icon">☁️</div>
                  <div class="dg-label">{{ $t('weather.cloudCover') }}</div>
                  <div class="dg-value">{{ data.cloudCover }}<span class="unit">%</span></div>
                </div>
                <div v-if="data.aqi != null" class="dg-item">
                  <div class="dg-icon">🍃</div>
                  <div class="dg-label">{{ $t('weather.aqi') }}</div>
                  <div class="dg-value">{{ data.aqi }}<span class="unit">{{ data.aqiCategory }}</span></div>
                </div>
              </section>
            </div>

            <!-- 右栏：生活指数 -->
            <div class="right-pane">
              <!-- 未来 7天-->
              <section class="forecast">
                <div class="forecast-title">{{ $t('weather.forecast') }}</div>
                <div class="forecast-list">
                  <div v-for="(d, i) in data.forecast" :key="i" class="forecast-day">
                    <div class="fd-label">{{ formatDate(d.date, i) }}</div>
                    <div class="fd-icon">{{ d.icon }}</div>
                    <div class="fd-temp">
                      <span class="hi">{{ d.max }}°</span>
                      <span class="bar"></span>
                      <span class="lo">{{ d.min }}°</span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- 生活指数 -->
              <section class="life" v-if="lifeItems.length">
                <div class="life-title">{{ $t('weather.lifeIndices') }}</div>
                <div class="life-grid">
                  <div v-for="(item, i) in lifeItems" :key="i" class="lg-item" v-tip="item.advice">
                    <span class="lg-icon">{{ item.icon }}</span>
                    <span class="lg-label">{{ item.label }}</span>
                    <span class="lg-value">{{ item.value }}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div class="city-name" v-if="data.country && data.country !== 'Hong Kong'">
            {{ data.country }}
          </div>
        </template>
        <div v-else class="placeholder">{{ $t('weather.empty') }}</div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped lang="less">
/* 内容根：承接原 .dialog 的纵向 flex（全屏类改挂此处，容器已收归 BaseDialog） */
.w-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 左右分栏 */
.weather-body {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 18px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.left-pane,
.right-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  .thin-scrollbar(color-mix(in srgb, @accent 0.3%, transparent));
}
.city-row {
  display: flex;
  gap: 8px;
  padding: 8px 6px 8px 6px;  /* 两段内边距*/
  margin-bottom: 14px;
  flex-shrink: 0;
}
/* 省市下拉组件本体样式在 BaseSelect.vue（box/list 变体） */
/* 热门城市行 */
.hot-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.hot-row-label {
  font-size: 12px;
  color: @text-soft;
  margin-right: 2px;
}

.hot-chip {
  padding: 4px 12px;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: rgba(31, 41, 55, 0.06);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, @accent 0.15%, transparent);
    color: @accent;
  }

  &.active {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 每日缓存提示 */
.cache-hint {
  font-size: 11px;
  color: @text-soft;
  padding: 0 8px;
  margin: -8px 0 10px;
  opacity: 0.85;
}

/* 气象预警 */
.alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
  border-radius: @radius-card;
  background: rgba(239, 68, 68, 0.07);
  border: 1px solid rgba(239, 68, 68, 0.18);
  flex-shrink: 0;
}

.alerts-title {
  font-size: 12px;
  font-weight: 600;
  color: #ef4444;
}

.alert-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.alert-level {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ef4444, #f97316);
  border-radius: 6px;
  padding: 2px 8px;
}
.alert-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alert-item-title {
  font-size: 12px;
  font-weight: 600;
  color: @text;
}

.alert-item-text {
  font-size: 11px;
  line-height: 1.5;
  color: @text-soft;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.refresh-btn {
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  border: none;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.locate-btn,
.reset-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.locate-btn {
  background: color-mix(in srgb, @accent 0.08%, transparent);
  color: @accent;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, @accent 0.18%, transparent);
  }
}

.reset-btn {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;

  &:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.2);
  }
}

.loading,
.error,
.placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  color: @text-soft;
  font-size: 13px;
}

.error {
  color: #ef4444;
}

/* 当前天气 */
.now {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, @accent 0.12%, transparent), rgba(139, 92, 246, 0.08));
  flex-shrink: 0;
}

.now-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.now-icon {
  font-size: 56px;
  line-height: 1;
}

.now-temp {
  font-size: 44px;
  font-weight: 700;
  color: @text;
  line-height: 1;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}

.now-desc {
  font-size: 14px;
  color: @text;
  margin-top: 2px;
}

.now-feel {
  font-size: 11px;
  color: @text-soft;
  margin-top: 2px;
}

.now-right {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.now-hilo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;

  .hi {
    color: #f97316;
  }

  .lo {
    color: #6366f1;
  }
}

.now-loc {
  font-size: 11px;
  color: @text-soft;
}

.now-time {
  font-size: 10px;
  color: @text-soft;
  opacity: 0.7;
}

/* 24h 趋势 */
.hourly {
  padding: 10px 12px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.hourly-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.head-title {
  font-size: 12px;
  font-weight: 600;
  color: @text;
}

.head-range {
  font-size: 11px;
  display: flex;
  gap: 8px;

  .hi {
    color: #f97316;
    font-weight: 600;
  }

  .lo {
    color: #6366f1;
    font-weight: 600;
  }
}

.temp-line {
  width: 100%;
  height: 50px;
  display: block;
  margin-bottom: 6px;
}

.hourly-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.hl-item {
  flex-shrink: 0;
  min-width: 36px;
  text-align: center;
  padding: 4px 0;
  border-radius: 6px;
  font-size: 10px;
}

.hl-time {
  color: @text-soft;
  font-size: 9px;
}

.hl-icon {
  font-size: 14px;
  line-height: 1.2;
  margin: 2px 0;
}

.hl-temp {
  font-size: 11px;
  font-weight: 600;
  color: @text;
  line-height: 1;
}

.hl-rain {
  font-size: 9px;
  color: #38bdf8;
  margin-top: 1px;

  &.placeholder {
    color: transparent;
  }
}

/* 详细指标 */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.dg-item {
  padding: 8px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.4);
  text-align: center;
}

.dg-icon {
  font-size: 16px;
  line-height: 1;
  margin-bottom: 2px;
}

.dg-label {
  font-size: 10px;
  color: @text-soft;
  margin-bottom: 2px;
}

.dg-value {
  font-size: 14px;
  color: @text;
  font-weight: 600;
  line-height: 1.2;

  &.small {
    font-size: 12px;
    font-weight: 500;
  }
}

.unit {
  font-size: 10px;
  color: @text-soft;
  font-weight: 400;
  margin-left: 1px;
}

/* 今日天文 */
.astro {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.06);
  font-size: 12px;
  flex-shrink: 0;
}

.astro-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.astro-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.astro-label {
  color: @text-soft;
  font-size: 10px;
}

.astro-value {
  color: @text;
  font-weight: 500;
  font-size: 12px;
}

.moon-pct {
  font-size: 10px;
  color: @text-soft;
  font-weight: 400;
}

/* 未来预报 */
.forecast {
  flex-shrink: 0;
}

.forecast-title,
.life-title {
  font-size: 12px;
  font-weight: 600;
  color: @text;
  margin-bottom: 6px;
}

.forecast-list {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.forecast-day {
  text-align: center;
  padding: 10px 4px;
  border-radius: 10px;
  background: color-mix(in srgb, @accent 0.06%, transparent);
  min-width: 0;
}

.fd-label {
  font-size: 10px;
  color: @text-soft;
  margin-bottom: 4px;
  .ellipsis();
}

.fd-icon {
  font-size: 22px;
  margin-bottom: 2px;
}

.fd-temp {
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  .hi {
    color: #f97316;
  }

  .lo {
    color: #6366f1;
  }

  .bar {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, #f97316, #6366f1);
    border-radius: 1px;
    min-width: 4px;
    max-width: 12px;
  }
}

/* 生活指数 */
.life {
  flex-shrink: 0;
}

.life-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.lg-item {
  padding: 8px 8px;
  border-radius: 10px;
  background: rgba(34, 197, 94, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}

.lg-icon {
  font-size: 18px;
  line-height: 1;
}

.lg-label {
  font-size: 10px;
  color: @text-soft;
}

.lg-value {
  font-size: 11px;
  color: @text;
  font-weight: 600;
}

.city-name {
  text-align: center;
  font-size: 11px;
  color: @text-soft;
  margin-top: 4px;
  opacity: 0.7;
}

/* 全屏模式：更宽的网格 */
.w-root.is-fullscreen {
  .weather-body {
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }

  .detail-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .life-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .forecast-list {
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }

  .forecast-day {
    padding: 12px 6px;
  }
}
</style>

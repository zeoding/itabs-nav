<script setup>
/**
 * 世界时间弹窗（点击时钟卡片打开）
 * - 本地时间 + 全球主要城市实时时间（IANA 时区，Intl 格式化，无额外依赖）
 * - 打开期间每秒刷新；展示与本地时差、昼夜状态、相对日期（昨天/明天）
 */
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { useI18n, $t } from '@/composables/useI18n'
import { pad2 } from '@/utils/datetime'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const { lang } = useI18n()

/* ---------------- 城市数据（IANA 时区，按区域分组） ---------------- */
const GROUPS = [
  {
    key: 'apac',
    cities: [
      { tz: 'Asia/Shanghai', nameKey: 'worldTime.cities.beijing' },
      { tz: 'Asia/Tokyo', nameKey: 'worldTime.cities.tokyo' },
      { tz: 'Asia/Seoul', nameKey: 'worldTime.cities.seoul' },
      { tz: 'Asia/Singapore', nameKey: 'worldTime.cities.singapore' },
      { tz: 'Asia/Kolkata', nameKey: 'worldTime.cities.mumbai' },
      { tz: 'Asia/Dubai', nameKey: 'worldTime.cities.dubai' },
      { tz: 'Australia/Sydney', nameKey: 'worldTime.cities.sydney' },
    ],
  },
  {
    key: 'europe',
    cities: [
      { tz: 'Europe/Moscow', nameKey: 'worldTime.cities.moscow' },
      { tz: 'Europe/London', nameKey: 'worldTime.cities.london' },
      { tz: 'Europe/Paris', nameKey: 'worldTime.cities.paris' },
      { tz: 'Europe/Berlin', nameKey: 'worldTime.cities.berlin' },
    ],
  },
  {
    key: 'africa',
    cities: [
      { tz: 'Africa/Cairo', nameKey: 'worldTime.cities.cairo' },
      { tz: 'Africa/Lagos', nameKey: 'worldTime.cities.lagos' },
      { tz: 'Africa/Johannesburg', nameKey: 'worldTime.cities.johannesburg' },
    ],
  },
  {
    key: 'america',
    cities: [
      { tz: 'America/New_York', nameKey: 'worldTime.cities.newyork' },
      { tz: 'America/Chicago', nameKey: 'worldTime.cities.chicago' },
      { tz: 'America/Mexico_City', nameKey: 'worldTime.cities.mexicocity' },
      { tz: 'America/Los_Angeles', nameKey: 'worldTime.cities.losangeles' },
      { tz: 'America/Sao_Paulo', nameKey: 'worldTime.cities.saopaulo' },
    ],
  },
]

/* ---------------- 每秒走针（仅打开期间） ---------------- */
const now = ref(new Date())
let timer = null
function startTicking() {
  if (timer) return
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
}
function stopTicking() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
// 开/关时钟计时；immediate 兼容「首次打开才挂载」门控下挂载即打开的场景
watch(
  () => props.open,
  (val) => {
    val ? startTicking() : stopTicking()
  },
  { immediate: true }
)
onBeforeUnmount(stopTicking)

/* ---------------- 时区计算 ---------------- */
const partFmtCache = new Map()
/** 取指定时区的年月日时分秒（h23 制，避免 12 小时制歧义） */
function zoneParts(tz, date) {
  let fmt = partFmtCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partFmtCache.set(tz, fmt)
  }
  const map = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return map
}

/** 时区相对 UTC 的偏移（分钟，东为正） */
function zoneOffset(tz, date) {
  const m = zoneParts(tz, date)
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second)
  return Math.round((asUTC - date.getTime()) / 60000)
}

/** 星期格式（随语言切换） */
const weekdayFmt = computed(
  () => new Intl.DateTimeFormat(lang.value === 'en' ? 'en-US' : 'zh-CN', { weekday: 'short' })
)

/** 时差标签：+2h / -5h / +5h30m / 本地 */
function formatDiff(diff) {
  if (diff === 0) return $t('worldTime.sameAsLocal')
  const sign = diff > 0 ? '+' : '-'
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m ? `${sign}${h}h${m}m` : `${sign}${h}h`
}

/** 单个城市的时间信息（每秒重算） */
function cityInfo(tz) {
  const m = zoneParts(tz, now.value)
  const hour = +m.hour
  const local = now.value
  const localUTC = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day)
  const dayDiff = Math.round((asUTC - localUTC) / 86400000)
  const weekday = weekdayFmt.value.format(new Date(asUTC))
  const dateStr = lang.value === 'en'
    ? `${+m.month}/${+m.day}`
    : `${+m.month}月${+m.day}日`
  const diff = zoneOffset(tz, now.value) - -local.getTimezoneOffset()
  return {
    time: `${m.hour}:${m.minute}:${m.second}`,
    date: `${dateStr} ${weekday}`,
    diff: formatDiff(diff),
    sameDiff: diff === 0,
    isDay: hour >= 6 && hour < 18,
    dayLabel: dayDiff === 1 ? $t('worldTime.tomorrow') : dayDiff === -1 ? $t('worldTime.yesterday') : '',
  }
}

/** 分组后的城市数据（名称走 i18n，时间信息每秒重算） */
const cityGroups = computed(() =>
  GROUPS.map((g) => ({
    key: g.key,
    cities: g.cities.map((c) => ({ ...c, name: $t(c.nameKey), ...cityInfo(c.tz) })),
  }))
)

/** 本地时间信息 */
const localInfo = computed(() => {
  const d = now.value
  const weekday = weekdayFmt.value.format(d)
  const dateStr = lang.value === 'en'
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getMonth() + 1}月${d.getDate()}日`
  return {
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
    date: `${dateStr} ${weekday}`,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  }
})

function close() {
  emit('update:open', false)
}
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('worldTime.title')"
    width="min(880px, 96vw)"
    height="min(720px, 86vh)"
    max-height="86vh"
    padding="22px 24px 22px"
    fs-padding="28px 40px"
    @close="close"
  >
    <template #default="{ fullscreen }">
      <div class="wt-root" :class="{ 'is-fullscreen': fullscreen }">
        <!-- 本地时间 -->
        <section class="wt-local">
          <span class="wt-local-label">{{ $t('worldTime.local') }}</span>
          <span class="wt-local-time">{{ localInfo.time }}</span>
          <span class="wt-local-meta">
            <span>{{ localInfo.date }}</span>
            <span v-if="localInfo.zone" class="wt-local-zone">{{ localInfo.zone }}</span>
          </span>
        </section>

        <!-- 分组城市时间卡片 -->
        <section v-for="g in cityGroups" :key="g.key" class="wt-group">
          <div class="wt-group-title">{{ $t(`worldTime.regions.${g.key}`) }}</div>
          <div class="wt-grid">
            <div v-for="c in g.cities" :key="c.tz" class="wt-city" :class="{ night: !c.isDay }">
              <div class="wt-city-head">
                <span class="wt-city-name">{{ c.name }}</span>
                <span class="wt-city-icon">{{ c.isDay ? '☀️' : '🌙' }}</span>
              </div>
              <div class="wt-city-time">{{ c.time }}</div>
              <div class="wt-city-meta">
                <span class="wt-city-date">{{ c.date }}</span>
                <span class="wt-city-diff" :class="{ same: c.sameDiff }">{{ c.diff }}</span>
              </div>
              <div v-if="c.dayLabel" class="wt-city-day">{{ c.dayLabel }}</div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped lang="less">
.wt-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  .thin-scrollbar();
}

/* 本地时间横幅 */
.wt-local {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-radius: @radius-card;
  background: linear-gradient(135deg,
    color-mix(in srgb, @accent 12%, transparent),
    color-mix(in srgb, @accent 4%, transparent));
  border: 1px solid color-mix(in srgb, @accent 18%, transparent);
  flex-shrink: 0;
}

.wt-local-label {
  font-size: 12px;
  font-weight: 600;
  color: @accent;
}

.wt-local-time {
  font-size: 24px;
  font-weight: 700;
  color: @text;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.wt-local-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: @text-soft;
}

.wt-local-zone {
  padding: 1px 8px;
  border-radius: @radius-pill;
  background: @icon-bg;
  font-size: 11px;
}

/* 分组 */
.wt-group {
  flex-shrink: 0;
}

.wt-group-title {
  font-size: 12px;
  font-weight: 600;
  color: @text-soft;
  margin-bottom: 6px;
}

/* 城市卡片网格 */
.wt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 8px;
}

.wt-city {
  padding: 8px 12px;
  border-radius: @radius-card;
  background: @icon-bg;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  transition: background 0.15s ease;

  &:hover {
    background: @icon-bg-hover;
  }

  /* 夜间城市：压暗一点，配合月亮图标 */
  &.night {
    background: color-mix(in srgb, #6366f1 8%, transparent);

    &:hover {
      background: color-mix(in srgb, #6366f1 14%, transparent);
    }
  }
}

.wt-city-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.wt-city-name {
  font-size: 12px;
  font-weight: 600;
  color: @text;
  .ellipsis();
}

.wt-city-icon {
  font-size: 11px;
  flex-shrink: 0;
}

.wt-city-time {
  font-size: 20px;
  font-weight: 700;
  color: @text;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.wt-city-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: @text-soft;
}

.wt-city-date {
  .ellipsis();
}

.wt-city-diff {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: @radius-pill;
  background: color-mix(in srgb, @accent 12%, transparent);
  color: @accent;
  font-weight: 600;

  &.same {
    background: @icon-bg;
    color: @text-soft;
    font-weight: 400;
  }
}

.wt-city-day {
  font-size: 10px;
  color: @text-soft;
  opacity: 0.8;
}

/* 全屏：卡片网格更宽 */
.wt-root.is-fullscreen .wt-grid {
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
}
</style>

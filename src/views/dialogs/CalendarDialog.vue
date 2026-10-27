<script setup>
/**
 * 日历弹窗（iTab 风格）左右布局，支持全屏放大
 *  左侧：年月下拉 + 6×7 月历网格（节日/节气/休班角标/事件点标）
 *  右侧：选中日期详情（公历、农历、节日、星座、宜忌、黄历）
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEventsStore } from '@/stores/events'
import BaseDialog from '@/components/BaseDialog.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import { useI18n, $t } from '@/composables/useI18n'
import { formatYMD as formatDate } from '@/utils/datetime'
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowLeftDoubleLine,
  RiArrowRightDoubleLine,
} from '@remixicon/vue'
import {
  getFestivals,
  getLunarLabel,
  getZodiac,
  getLunarInfo,
  getDayAlmanac,
  getCellLabel,
  isWeekend,
  getHoliday,
} from '@/utils/lunar'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const eventsStore = useEventsStore()
const { events } = storeToRefs(eventsStore)
const { load } = eventsStore
const cursor = ref(new Date())
const selectedDate = ref(formatDate(new Date()))

const { lang } = useI18n()
const WEEKDAYS_CN = ['一', '二', '三', '四', '五', '六', '日']
let WEEKDAYS = [...WEEKDAYS_CN]
watch(lang, (l) => {
  // 中英文星期表头均为周一起，与网格首列（周一）对齐
  WEEKDAYS = l === 'en' ? [...$t('calendar.weekdays')] : [...WEEKDAYS_CN]
}, { immediate: true })

const year = computed(() => cursor.value.getFullYear())
const month = computed(() => cursor.value.getMonth() + 1)

/** 年份下拉选项（默认 12 年窗口，箭头 ±10 年翻页） */
const yearOptions = computed(() => {
  const list = []
  const cur = new Date().getFullYear()
  const offset = yearBaseOffset.value
  for (let y = cur - 5 + offset; y <= cur + 6 + offset; y++) list.push(y)
  return list
})
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

/** 月份下拉选项：{ value, label }，label 走 i18n 月份名 */
const monthOptions = computed(() =>
  $t('calendar.months').map((name, i) => ({ value: i + 1, label: name }))
)

/** 年份下拉翻页偏移（面板打开时归零，箭头 ±10 年翻页） */
const yearBaseOffset = ref(0)
function pickYear(y) {
  cursor.value = new Date(y, month.value - 1, 1)
}
function pickMonth(m) {
  cursor.value = new Date(year.value, m - 1, 1)
}
function jumpYears(delta) {
  yearBaseOffset.value += delta
}

/** 生成 6×7 网格 */
const grid = computed(() => {
  const first = new Date(year.value, month.value - 1, 1)
  const firstWeekday = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - firstWeekday)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push(d)
  }
  return cells
})

function prevMonth() {
  cursor.value = new Date(year.value, month.value - 2, 1)
}
function nextMonth() {
  cursor.value = new Date(year.value, month.value, 1)
}
function goToday() {
  const t = new Date()
  cursor.value = t
  selectedDate.value = formatDate(t)
}

function pickDate(cell) {
  selectedDate.value = cell.key
}

const isCurrentMonth = (d) => d.getMonth() === month.value - 1

/** 弹窗生命周期内的「今天」标记（跨天场景极少，不值当为它加重算逻辑） */
const todayKey = formatDate(new Date())

/**
 * 42 格视图模型：每格的标签/节日/假日/事件点在此一次性算好。
 * 此前模板对每格重复调用 getCellLabel ×3、getFestivals ×2、hasFestival，
 * 单次渲染约 200+ 次 lunar-javascript 重算，点选/翻月都会全格重算。
 * 注意：选中态依赖 selectedDate，必须留在模板（cell.key === selectedDate），
 * 不能进本 computed，否则点一下日期就触发 42 格 lunar 全量重算。
 */
const cells = computed(() => {
  const eventDates = new Set(events.value.map((e) => e.date))
  return grid.value.map((d) => {
    const key = formatDate(d)
    const fests = getFestivals(d)
    const h = getHoliday(d)
    return {
      date: d,
      key,
      day: d.getDate(),
      otherMonth: !isCurrentMonth(d),
      today: key === todayKey,
      weekend: isWeekend(d),
      festival: fests.length > 0,
      label: getCellLabel(d, fests),
      festivalsText: fests.map((f) => f.name).join(' / '),
      holiday: h ? (h.work ? '班' : '休') : '',
      hasEvent: eventDates.has(key),
    }
  })
})

function close() {
  emit('update:open', false)
}

/* ----- 右侧"今日"详情：默认显示今天，点选左侧后联动到选中日期 ----- */
const selectedDayInfo = computed(() => {
  // 默认今天；如果用户选了别的日期，联动到选中日期
  const isSelecting = selectedDate.value !== formatDate(new Date())
  const t = isSelecting
    ? (() => {
        const [y, m, d] = selectedDate.value.split('-').map(Number)
        return new Date(y, m - 1, d)
      })()
    : new Date()
  return {
    date: t,
    dateStr: formatDate(t),
    weekDay: ['日', '一', '二', '三', '四', '五', '六'][t.getDay()],
    festivals: getFestivals(t),
    lunarLabel: getLunarLabel(t),
    zodiac: getZodiac(t),
    lunar: getLunarInfo(t),
    almanac: getDayAlmanac(t),
    holiday: getHoliday(t),
  }
})
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('calendar.title')"
    height="min(680px, 88vh)"
    max-height="90vh"
    padding="22px 24px 18px"
    overflow="auto"
    fs-padding="24px 40px"
    fs-overflow="hidden"
    @open="load"
    @close="close"
  >
    <template #default="{ fullscreen }">
      <div class="cal-root" :class="{ 'is-fullscreen': fullscreen }">
        <div class="dialog-body">
          <!-- 左侧：月份+ 事件 -->
          <section class="left-pane">
            <div class="cal-toolbar">
              <button class="nav-btn" v-tip="$t('calendar.prevMonth')" :aria-label="$t('calendar.prevMonth')" @click="prevMonth">
                <RiArrowLeftSLine size="18" aria-hidden="true" />
              </button>
              <div class="month-label">
                <!-- 年份下拉：触发器显示「YYYY年」，面板头部 ±10 年跳页（BaseSelect 自管开关/点击外部关闭） -->
                <BaseSelect
                  :model-value="year"
                  :options="yearOptions"
                  :current="currentYear"
                  :aria-label="$t('calendar.selectYear')"
                  @update:model-value="pickYear"
                  @open="yearBaseOffset = 0"
                >
                  <template #display="{ value }">{{ $t('calendar.yearFormat', { y: value }) }}</template>
                  <template #header>
                    <div class="sel-panel-header">
                      <button class="panel-jump" @click="jumpYears(-10)" :aria-label="$t('calendar.prevDecade')">
                        <RiArrowLeftDoubleLine size="14" aria-hidden="true" />
                      </button>
                      <span>{{ $t('calendar.selectYear') }}</span>
                      <button class="panel-jump" @click="jumpYears(10)" :aria-label="$t('calendar.nextDecade')">
                        <RiArrowRightDoubleLine size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </template>
                </BaseSelect>
                <!-- 月份下拉 -->
                <BaseSelect
                  :model-value="month"
                  :options="monthOptions"
                  :current="currentMonth"
                  :aria-label="$t('calendar.months')"
                  @update:model-value="pickMonth"
                />
              </div>
              <button class="nav-btn" v-tip="$t('calendar.nextMonth')" :aria-label="$t('calendar.nextMonth')" @click="nextMonth">
                <RiArrowRightSLine size="18" aria-hidden="true" />
              </button>
              <button class="today-btn" @click="goToday">{{ $t('calendar.today') }}</button>
            </div>

            <div class="weekdays">
              <div v-for="w in WEEKDAYS" :key="w" class="wd">{{ w }}</div>
            </div>

            <div class="days">
              <!-- 当前月份水印：纯装饰，不响应指针 -->
              <div class="month-watermark" aria-hidden="true">{{ String(month).padStart(2, '0') }}</div>
              <button
                v-for="cell in cells"
                :key="cell.key"
                :class="[
                  'day',
                  {
                    'other-month': cell.otherMonth,
                    today: cell.today,
                    selected: cell.key === selectedDate,
                    weekend: cell.weekend,
                    festival: cell.festival,
                    xiu: cell.holiday === '休',
                    ban: cell.holiday === '班',
                  },
                ]"
                :data-cell-kind="cell.label.kind"
                @click="pickDate(cell)"
              >
                <span class="day-num">{{ cell.day }}</span>
                <span
                  class="cell-label"
                  :class="`kind-${cell.label.kind}`"
                  v-tip="cell.festivalsText"
                >
                  {{ cell.label.text }}
                </span>
                <span
                  v-if="cell.holiday"
                  class="day-tag"
                  :class="cell.holiday === '休' ? 'tag-xiu' : 'tag-ban'"
                >{{ cell.holiday }}</span>
                <span
                  v-if="cell.hasEvent"
                  class="dot"
                ></span>
              </button>
            </div>
          </section>

          <!-- 右侧：今日详细信息 -->
          <aside class="right-pane">
            <div class="info-card glass">
              <div class="info-date">
                <div class="big-date">
                  {{ selectedDayInfo.date.getDate() }}
                </div>
                <div class="sub-date">
                  <span
                    v-if="selectedDayInfo.holiday"
                    class="date-tag"
                    :class="selectedDayInfo.holiday.work ? 'tag-ban' : 'tag-xiu'"
                  >{{ $t(selectedDayInfo.holiday.work ? 'calendar.workday' : 'calendar.dayoff') }}</span>
                  {{ $t('calendar.detailDate', { m: selectedDayInfo.date.getMonth() + 1, w: selectedDayInfo.weekDay, month: $t('calendar.months')[selectedDayInfo.date.getMonth()], year: selectedDayInfo.date.getFullYear(), week: $t('calendar.weekdays')[selectedDayInfo.date.getDay() === 0 ? 6 : selectedDayInfo.date.getDay() - 1] }) }}
                </div>
              </div>
              <!-- 全部节日/节气：按类型着色 chips -->
              <div v-if="selectedDayInfo.festivals.length" class="info-festivals">
                <span
                  v-for="(f, i) in selectedDayInfo.festivals"
                  :key="i"
                  class="fest-chip"
                  :class="`kind-${f.type}`"
                >{{ f.name }}</span>
              </div>
              <!-- 历法速览：农历 / 干支 / 生肖 / 星座 -->
              <div class="lunar-grid">
                <div class="lg-item">
                  <span class="lg-label">{{ $t('calendar.lunarDate') }}</span>
                  <span class="lg-value">{{ selectedDayInfo.lunar.monthInChinese }}月{{ selectedDayInfo.lunar.dayInChinese }}</span>
                </div>
                <div class="lg-item">
                  <span class="lg-label">{{ $t('calendar.ganZhi') }}</span>
                  <span class="lg-value">{{ selectedDayInfo.lunar.yearInGanZhi }}年</span>
                </div>
                <div class="lg-item">
                  <span class="lg-label">{{ $t('calendar.zodiacLabel') }}</span>
                  <span class="lg-value">{{ $t('calendar.animals.' + selectedDayInfo.lunar.shengXiao) }}</span>
                </div>
                <div class="lg-item">
                  <span class="lg-label">{{ $t('calendar.sign') }}</span>
                  <span class="lg-value">{{ selectedDayInfo.zodiac ? $t('calendar.zodiac.' + selectedDayInfo.zodiac) : '—' }}</span>
                </div>
              </div>
            </div>

            <div class="yiji glass">
              <div class="yj-block yi">
                <div class="yj-label">
                  <span class="yi-dot"></span>{{ $t('calendar.auspicious') }}</div>
                <ul class="yj-list">
                  <li v-for="(item, i) in selectedDayInfo.almanac.yi" :key="i">{{ item }}</li>
                </ul>
              </div>
              <div class="yj-block ji">
                <div class="yj-label">
                  <span class="ji-dot"></span>{{ $t('calendar.inauspicious') }}</div>
                <ul class="yj-list">
                  <li v-for="(item, i) in selectedDayInfo.almanac.ji" :key="i">{{ item }}</li>
                </ul>
              </div>
            </div>

            <!-- 黄历附加：胎神 / 太岁 / 星宿 / 彭祖百忌 -->
            <div class="almanac glass">
              <div class="almanac-row">
                <div class="ar-item">
                  <span class="ar-label">{{ $t('calendar.fetalGod') }}</span>
                  <span class="ar-value">{{ selectedDayInfo.almanac.positionTai }}</span>
                </div>
                <div class="ar-item">
                  <span class="ar-label">{{ $t('calendar.taiSui') }}</span>
                  <span class="ar-value">
                    {{ selectedDayInfo.almanac.taiSui }}
                  </span>
                </div>
                <div class="ar-item">
                  <span class="ar-label">{{ $t('calendar.xiuLabel') }}</span>
                  <span class="ar-value">{{ selectedDayInfo.almanac.xiu }}</span>
                </div>
              </div>
              <div v-if="selectedDayInfo.almanac.xiuSong" class="xiu-song">
                {{ selectedDayInfo.almanac.xiuSong }}
              </div>
              <div v-if="selectedDayInfo.almanac.pengZuGan || selectedDayInfo.almanac.pengZuZhi" class="pengzu">
                <div v-if="selectedDayInfo.almanac.pengZuGan">
                  {{ $t('calendar.pengZuGan', { v: selectedDayInfo.almanac.pengZuGan }) }}
                </div>
                <div v-if="selectedDayInfo.almanac.pengZuZhi">
                  {{ $t('calendar.pengZuZhi', { v: selectedDayInfo.almanac.pengZuZhi }) }}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped lang="less">
/* 内容根：全屏类改挂此处（容器已收归 BaseDialog） */
.cal-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.dialog-body {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 32px;
  min-height: 0;
  flex: 1;
  overflow: visible;
}

/* 左侧 */
.left-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.nav-btn,
.today-btn {
  border-radius: 8px;
  background: color-mix(in srgb, @accent 0.08%, transparent);
  color: @accent;
  transition: background 0.15s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.18%, transparent);
  }
}

.nav-btn {
  font-size: 18px;
  line-height: 1;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.today-btn {
  font-size: 12px;
  padding: 6px 12px;
  margin-left: auto;
}

.month-label {
  flex: 1;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* 下拉组件本体样式在 BaseSelect.vue；此处仅保留面板头插槽内容样式 */
.sel-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 6px;
  border-bottom: 1px solid color-mix(in srgb, @accent 0.1%, transparent);
  font-size: 12px;
  color: @text-soft;
}

.panel-jump {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: @accent;
  background: color-mix(in srgb, @accent 0.08%, transparent);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.18%, transparent);
  }
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
}

.wd {
  text-align: center;
  font-size: 11px;
  color: @text-soft;
  padding: 4px 0;
}

.days {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(70px, 1fr);  /* 固定最小高度70px，且行平均分配 */
  gap: 4px;
  margin-bottom: 16px;
  /* 拉伸吃满左栏剩余高度（全屏同样生效），行高 1fr 自动分配 */
  flex: 1;
  min-height: 0;
  /* 防止切换月份时高度跳动 */
  contain: layout;
}

/* 当前月份大字水印：压在格子底层，pointer-events 穿透 */
.month-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(80px, 11vw, 150px);
  font-weight: 800;
  letter-spacing: 6px;
  color: color-mix(in srgb, @accent 6%, transparent);
  pointer-events: none;
  user-select: none;
}

.day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 12px;
  color: @text;
  background: transparent;
  transition: background 0.15s ease;
  padding: 2px 0;
  gap: 2px;
  min-height: 0;
  /* 移除 aspect-ratio，改变grid 行高（行高= 列宽 * 7/7 接近正方形） */
  overflow: hidden;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
  }

  &.other-month {
    opacity: 0.4;
  }

  /* 法定节假日（休）：淡红背景；调休补班日（班）：浅灰背景 */
  &.xiu {
    background: fade(@danger, 8%);
  }

  &.ban {
    background: rgba(100, 116, 139, 0.12);
  }

  &.xiu:hover {
    background: fade(@danger, 14%);
  }

  &.ban:hover {
    background: rgba(100, 116, 139, 0.2);
  }

  &.selected {
    background: color-mix(in srgb, @accent 0.18%, transparent);
    /*?box-shadow 内嵌到元素内部画边框，绕开相邻 grid 单元?overflow:hidden 的裁?*/
    box-shadow: inset 0 0 0 1.5px @accent;
    border-radius: 8px;
  }

  &.today.selected {
    /* 今天 + 选中：圆? 内嵌边框（day-num 是圆形背景） */
    box-shadow: inset 0 0 0 1.5px @accent;
  }

  /* 休息日：周六、周日字体红色*/
  &.weekend .day-num {
    color: @danger;
  }

  /* 调休补班的周末照常上班：不显示红色 */
  &.ban .day-num {
    color: @text;
  }

  /* 法定节假日：日期+ 标签都加粗*/
  &.festival {
    .day-num,
    .cell-label {
      font-weight: 700;
    }
  }
}

.day-num {
  .day.today & {
    color: #fff;
    background: @accent-gradient;
    width: 22px;
    height: 22px;
    border-radius: @radius-circle;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
}

/* 今天 day-num 默认白色（放在 weekend/festival 之后，确保今天落在周末时仍为白色）*/
.day.today .day-num {
  color: #fff;
}

/* 日期格下方小标签 */
.cell-label {
  font-size: 9px;
  line-height: 1.1;
  max-width: 100%;
  padding: 0 2px;
  color: @text-soft;
  .ellipsis();

  &.kind-term {
    color: #10b981;
    font-weight: 600;
  }

  &.kind-lunar {
    color: #f59e0b;
    font-weight: 600;
  }

  &.kind-solar {
    color: @danger;
    font-weight: 600;
  }

  &.kind-lunar-day {
    color: @text-soft;
    font-weight: 400;
  }
}

.dot {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: @radius-circle;
  background: @accent;
}

/* 右上角休/班角标 */
.day-tag {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  font-size: 9px;
  line-height: 15px;
  text-align: center;
  color: #fff;
  pointer-events: none;

  &.tag-xiu {
    background: @danger;
  }

  &.tag-ban {
    background: #94a3b8;
  }
}

.muted {
  color: @text-soft;
  font-weight: 400;
}

/* 右侧 */
.right-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  /* 滚动条视觉隐藏（滚轮/触摸滚动不受影响） */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.info-card {
  padding: 16px;
  border-radius: @radius-card;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-date {
  display: flex;
  align-items: center;
  gap: 14px;
}

.big-date {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 68px;
  padding: 0 12px;
  border-radius: 16px;
  color: #ffffff;
  background:
    @accent-gradient padding-box,
    @accent-gradient border-box;
  border: 2px solid transparent;
  position: relative;
  flex-shrink: 0;
}

.sub-date {
  font-size: 13px;
  color: @text-soft;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 休/班角标：与左侧日期格 tag-xiu/tag-ban 同色系 */
.date-tag {
  font-size: 11px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;

  &.tag-xiu {
    background: @danger;
  }

  &.tag-ban {
    background: #94a3b8;
  }
}

/* 节日/节气 chips：类型着色，与左侧 cell-label 同色系 */
.info-festivals {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fest-chip {
  font-size: 11px;
  line-height: 1;
  padding: 4px 9px;
  border-radius: 999px;
  font-weight: 500;

  &.kind-term {
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  &.kind-lunar {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
  }

  &.kind-solar {
    color: @danger;
    background: fade(@danger, 10%);
  }
}

/* 历法速览：农历 / 干支 / 生肖 / 星座 */
.lunar-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in srgb, @accent 0.15%, transparent);
}

.lg-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lg-label {
  font-size: 11px;
  color: @text-soft;
}

.lg-value {
  font-size: 13px;
  color: @text;
  font-weight: 500;
  .ellipsis();
}

.yiji {
  padding: 14px 16px;
  border-radius: @radius-card;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.yj-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.yj-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.yi-dot,
.ji-dot {
  width: 8px;
  height: 8px;
  border-radius: @radius-circle;
}

.yi-dot {
  background: #10b981;
}

.ji-dot {
  background: @danger;
}

.yi .yj-label {
  color: #10b981;
}

.ji .yj-label {
  color: @danger;
}

.yj-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;

  li {
    font-size: 11px;
    color: @text;
    padding: 3px 9px;
    border-radius: 999px;
  }
}

/* 宜/忌词条底色：极浅类型色 */
.yi .yj-list li {
  background: rgba(16, 185, 129, 0.08);
}

.ji .yj-list li {
  background: fade(@danger, 7%);
}

/* 黄历（胎神/太岁/星宿/彭祖）*/
.almanac {
  padding: 12px 16px;
  border-radius: @radius-card;
}

.almanac-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}

.ar-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ar-label {
  font-size: 11px;
  color: @text-soft;
}

.ar-value {
  font-size: 13px;
  color: @text;
  font-weight: 500;
}

.xiu-song {
  font-size: 11px;
  color: @text-soft;
  line-height: 1.5;
  padding-top: 6px;
  border-top: 1px dashed color-mix(in srgb, @accent 0.15%, transparent);
}

.pengzu {
  font-size: 11px;
  color: @text-soft;
  line-height: 1.5;
  margin-top: 4px;

  div {
    padding: 1px 0;
  }
}

.cal-root.is-fullscreen .dialog-body {
  grid-template-columns: 1fr 380px;
  gap: 48px;
}
</style>

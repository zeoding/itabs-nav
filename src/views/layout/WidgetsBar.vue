<script setup>
/**
 * 顶部小组件条
 *   1. 时钟（实时）
 *   2. 天气（点击打开天气弹窗  
 *   3. 待办（点击打开待办弹窗，显示未完成数量）
 *   4. 日历（点击打开日历弹窗，显示今天日期/ 农历 / 星期几）
 *   5. 热榜（点击打开热榜弹窗 */
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useTodosStore } from '@/stores/todos'
import { useWeatherStore } from '@/stores/weather'
import { useHotStore } from '@/stores/hot'
import { useI18n, $t } from '@/composables/useI18n'
import { RiRefreshLine } from '@remixicon/vue'
import ClockCard from '@/views/layout/ClockCard.vue'

const emit = defineEmits(['open-weather', 'open-todo', 'open-calendar', 'open-hot', 'open-worldtime'])
const { lang } = useI18n()

/* 待办统计 */
const todosStore = useTodosStore()
const { remaining } = storeToRefs(todosStore)
const { load: loadTodos } = todosStore
onMounted(() => {
  loadTodos()
})

/* 今日信息：公历部分同步计算；农历部分等 lunar-javascript 异步加载后填充。
   该库 ~300KB，静态引入会把整库拖进首屏 chunk，故仅在首帧后动态加载 */
function todayBase() {
  const d = new Date()
  return {
    day: d.getDate(),
    weekDay: $t('clock.weekDays')[d.getDay()],
    weekDayCN: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
  }
}
const todayInfo = ref({ ...todayBase(), lunarMonth: '', lunarDay: '' })

async function loadLunar() {
  try {
    const { Solar } = await import('lunar-javascript')
    const lunar = Solar.fromDate(new Date()).getLunar()
    todayInfo.value.lunarMonth = lunar.getMonthInChinese()
    todayInfo.value.lunarDay = lunar.getDayInChinese()
  } catch {
    /* 农历库加载失败只隐藏农历文案，不影响卡片其余信息 */
  }
}
loadLunar()

/** 农历星期显示：英文用 weekDay，中文用 weekDayCN（字典 lunarFormat 只差这一个参数） */
const lunarWeek = computed(() => (lang.value === 'en' ? todayInfo.value.weekDay : todayInfo.value.weekDayCN))

/** 日历卡副标题：农历未加载完成时先只显示星期 */
const todaySub = computed(() =>
  todayInfo.value.lunarDay
    ? $t('clock.lunarFormat', { month: todayInfo.value.lunarMonth, day: todayInfo.value.lunarDay, week: lunarWeek.value })
    : lunarWeek.value
)

/** 语言切换后重算星期；农历字段与语言无关，保持不变 */
watch(lang, () => {
  todayInfo.value = {
    ...todayBase(),
    lunarMonth: todayInfo.value.lunarMonth,
    lunarDay: todayInfo.value.lunarDay,
  }
})

/* 天气（每日缓存：当天内读缓存，手动刷新才强制请求） */
const weatherStore = useWeatherStore()
const { data: weatherData, loading: weatherLoading } = storeToRefs(weatherStore)
const { load: loadWeather } = weatherStore
onMounted(() => {
  // 无参数：有历史城市用历史的，新用户走 IP 定位，失败回退默认城市；
  // 命中当天缓存则零请求直接展示
  loadWeather()
})
/** 卡片手动刷新：强制走网络并回写当天缓存 */
function refreshWeather(e) {
  e?.stopPropagation?.()
  loadWeather(undefined, true)
}

/* 热榜：默认微博（每日缓存 + 卡片/弹窗共享 store） */
const hotStore = useHotStore()
const { data: hotData, loading: hotLoading, currentSource: hotSource } = storeToRefs(hotStore)
const { load: loadHot, sourceList } = hotStore
function switchHotSource(key) {
  if (key === hotSource.value) return
  loadHot(key)
}
/** 卡片手动刷新当前源 */
function refreshHot(e) {
  e?.stopPropagation?.()
  loadHot(hotSource.value, true)
}
onMounted(() => {
  loadHot('weibo')
})
</script>

<template>
  <div class="widgets-bar">
    <!-- 时钟卡片：独立子组件，秒级重渲染不波及其余卡片；点击打开世界时间弹窗 -->
    <ClockCard @open-worldtime="emit('open-worldtime')" />

    <!-- 天气卡片：当前城市 + 今天天气 + 温度（右上刷新按钮强制更新） -->
    <div
      class="widget widget-tile widget-weather"
      role="button"
      tabindex="0"
      @click="emit('open-weather')"
      @keydown.enter="emit('open-weather')"
    >
      <button
        class="refresh-mini"
        v-tip="$t('weather.refresh')"
        :aria-label="$t('weather.refresh')"
        :disabled="weatherLoading"
        @click="refreshWeather"
      >
        <RiRefreshLine size="13" :class="{ spinning: weatherLoading }" aria-hidden="true" />
      </button>
      <div class="w-title">
        <span v-if="weatherData">{{ weatherData.city }}</span>
        <span v-else>{{ $t('widgets.weather') }}</span>
      </div>
      <div class="w-big weather-row">
        <span v-if="weatherData" class="w-icon">{{ weatherData.icon }}</span>
        <span v-else class="w-icon">🌤</span>
        <span v-if="weatherData" class="w-temp">{{ weatherData.temp }}°</span>
        <span v-else class="w-temp">--°</span>
      </div>
      <div class="w-sub">
        <span v-if="weatherData">{{ weatherData.desc }} · {{ $t('clock.weatherToday') }}</span>
        <span v-else>{{ $t('clock.weatherClickHint') }}</span>
      </div>
    </div>

    <!-- 待办卡片 -->
    <button class="widget widget-tile widget-todo" @click="emit('open-todo')">
      <div class="w-title">{{ $t('widgets.todo') }}</div>
      <div class="w-big">{{ remaining }}</div>
      <div class="w-sub">{{ $t('clock.todoUnit') }}</div>
    </button>

    <!-- 日历卡片：今天多少日 + 农历 + 星期-->
    <button class="widget widget-tile widget-cal" @click="emit('open-calendar')">
      <div class="w-title">{{ $t('widgets.calendar') }}</div>
      <div class="w-big">{{ todayInfo.day }}</div>
      <div class="w-sub">{{ todaySub }}</div>
    </button>

    <!-- 热榜卡片 tab 切换 + 主体点击打开弹窗（右上刷新按钮强制更新当前源） -->
    <div class="widget widget-hot">
      <div class="w-title">
        <span class="hot-label">{{ $t('widgets.hot') }}</span>
        <div class="hot-tabs">
          <button
            v-for="s in sourceList"
            :key="s.key"
            class="hot-tab"
            :class="{ active: hotSource === s.key }"
            v-tip="s.name"
            @click.stop="switchHotSource(s.key)"
          >{{ s.name[0] }}</button>
          <button
            class="hot-tab hot-refresh"
            v-tip="$t('hot.refresh')"
            :aria-label="$t('hot.refresh')"
            :disabled="hotLoading"
            @click.stop="refreshHot"
          >
            <RiRefreshLine size="10" :class="{ spinning: hotLoading }" aria-hidden="true" />
          </button>
        </div>
      </div>
      <button class="w-main" @click="emit('open-hot')">
        <div class="w-big hot-title">
          <span v-if="hotData && hotData[0]">{{ hotData[0].title }}</span>
          <span v-else>--</span>
        </div>
        <div class="w-sub">
          <span v-if="hotData && hotData[1]">{{ hotData[1].title }}</span>
          <span v-else>{{ $t('clock.weatherClickHint') }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.widgets-bar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  width: 100%;
  max-width: 1080px;
  margin-top: 24px;
}

/* 卡片基础样式 */
.widget {
  padding: 14px 18px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 96px;
  text-align: left;
  cursor: default;
  color: #fff;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 4px 16px rgba(31, 41, 55, 0.18);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;

  /* 光泽效果（顶部） */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%);
  }

  /* 扫过光泽：悬浮时一道斜光从左划到右 */
  &::after {
    content: '';
    position: absolute;
    top: -20%;
    bottom: -20%;
    left: -60%;
    width: 45%;
    background: linear-gradient(105deg,
      transparent 0%,
      rgba(255, 255, 255, 0.22) 50%,
      transparent 100%);
    transform: skewX(-20deg);
    transition: left 0.65s ease;
    pointer-events: none;
  }
}

/* 时钟卡片：暖橙渐变（等宽网格下问候语纵向排列在时间下方，避免英文裁切）*/
/* 天气卡片：天蓝渐变*/
.widget-weather {
  background: linear-gradient(135deg, #38bdf8 0%, @accent 100%);
}

/* 待办卡片：翠绿渐变*/
.widget-todo {
  background: linear-gradient(135deg, #84cc16 0%, #16a34a 100%);
}

/* 日历卡片：紫粉渐变*/
.widget-cal {
  background: linear-gradient(135deg, #e879f9 0%, #a855f7 100%);
}

/* 热榜卡片：橙红渐变*/
.widget-hot {
  background: linear-gradient(135deg, #f43f5e 0%, #b91c1c 100%);
  text-align: left;
  padding: 0 !important;
  overflow: hidden !important;

  .w-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 10px 14px 4px;       /* 内边距 */
    margin-bottom: 0 !important;
    font-size: 12px;
  }
}

.hot-label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.hot-tabs {
  display: flex;
  gap: 2px;
  pointer-events: auto;
}

.hot-tab {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  padding: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.35);
    color: #fff;
  }

  &.active {
    background: #fff;
    color: #b91c1c;
    transform: scale(1.05);
  }

  &.hot-refresh {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.9);

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.32);
      color: #fff;
    }

    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }
  }
}

/* 天气卡片右上手动刷新 */
.refresh-mini {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
  z-index: 2;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.36);
    color: #fff;
  }

  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }
}

.spinning {
  animation: spin360 0.9s linear infinite;
}


@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}

.w-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  padding: 4px 14px 12px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  border-radius: 0;
  transition: opacity 0.15s ease;
  font: inherit;

  &:hover {
    opacity: 0.85;
  }

  &:active {
    opacity: 0.7;
  }
}

.hot-title {
  font-size: 14px !important;
  font-weight: 600 !important;
  .ellipsis();
  max-width: 100%;
  color: #fff !important;
  line-height: 1.3;
}

/* 可点击卡片 + 时钟/热榜容器：统一 hover（上浮 + 阴影 + 提亮） */
.widget-tile {
  cursor: pointer;

  &:active {
    transform: translateY(-1px);
  }
}

.widget-tile:hover,
.widget-clock:hover,
.widget-hot:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(31, 41, 55, 0.25);
  filter: brightness(1.06);
}

/* 光泽效果（顶部） */
.widget::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%);
}
/* 扫过光泽：悬浮时一道斜光从左划到右 */
.widget::after {
  content: '';
  position: absolute;
  top: -20%;
  bottom: -20%;
  left: -60%;
  width: 45%;
  background: linear-gradient(105deg,
    transparent 0%,
    rgba(255, 255, 255, 0.22) 50%,
    transparent 100%);
  transform: skewX(-20deg);
  transition: left 0.65s ease;
  pointer-events: none;
}
.widget-tile:hover::after,
.widget-clock:hover::after,
.widget-hot:hover::after {
  left: 135%;
}

.w-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
  font-weight: 500;
}

.w-big {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.w-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 4px;
}

.weather-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
}

.w-icon {
  font-size: 20px;
}

.w-temp {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
</style>

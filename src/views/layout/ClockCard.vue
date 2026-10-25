<script setup>
/**
 * 时钟卡片（从 WidgetsBar 抽出）
 * - 每秒更新 now：独立成子组件后，秒级重渲染只作用于本卡片，
 *   不再带着天气/待办/日历/热榜四张卡整条 patch
 * - 点击打开世界时间弹窗
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { $t } from '@/composables/useI18n'
import { pad2 } from '@/utils/datetime'

const emit = defineEmits(['open-worldtime'])

const now = ref(new Date())
let timer = null

function tick() {
  now.value = new Date()
}

const hhStr = computed(() => pad2(now.value.getHours()))
const mmStr = computed(() => pad2(now.value.getMinutes()))
const ssStr = computed(() => pad2(now.value.getSeconds()))

const greeting = computed(() => {
  const h = now.value.getHours()
  if (h < 6) return $t('clock.greeting.night')
  if (h < 11) return $t('clock.greeting.morning')
  if (h < 14) return $t('clock.greeting.noon')
  if (h < 18) return $t('clock.greeting.afternoon')
  if (h < 22) return $t('clock.greeting.evening')
  return $t('clock.greeting.night')
})

onMounted(() => {
  timer = setInterval(tick, 1000)
})
onUnmounted(() => {
  clearInterval(timer)
})
</script>

<template>
  <div
    class="widget widget-clock"
    role="button"
    tabindex="0"
    v-tip="$t('clock.viewWorldTime')"
    :aria-label="$t('worldTime.title')"
    @click="emit('open-worldtime')"
    @keydown.enter="emit('open-worldtime')"
  >
    <div class="clock-time">
      <span
        v-for="(ch, i) in hhStr"
        :key="'h' + i"
        class="digit"
      ><span :key="ch" class="digit-inner">{{ ch }}</span></span>
      <span class="colon">:</span>
      <span
        v-for="(ch, i) in mmStr"
        :key="'m' + i"
        class="digit"
      ><span :key="ch" class="digit-inner">{{ ch }}</span></span>
      <span class="seconds">
        <span class="colon colon-sec">:</span><span
          v-for="(ch, i) in ssStr"
          :key="'s' + i"
          class="digit digit-sec"
        ><span :key="ch" class="digit-inner">{{ ch }}</span></span>
      </span>
    </div>
    <div class="clock-meta">
      <span class="greeting">{{ greeting }}</span>
    </div>
  </div>
</template>

<style scoped lang="less">
/* 时钟卡片：暖橙渐变（等宽网格下问候语纵向排列在时间下方，避免英文裁切）*/
.widget-clock {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
}

.clock-time {
  display: flex;
  align-items: baseline;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  letter-spacing: 1px;
  line-height: 1;

  .colon {
    margin: 0 1px;
    animation: blink 1s steps(1) infinite;
  }

  .seconds {
    display: inline-flex;
    align-items: baseline;
    font-size: 18px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  /* 数字滚动：外层裁剪 + 内层进场动画，key 变化时自动触发 */
  .digit {
    display: inline-block;
    overflow: hidden;
    height: 1em;
    line-height: 1;
  }

  .digit-inner {
    display: inline-block;
    line-height: 1;
    will-change: transform, opacity;
    animation: digit-roll 0.45s cubic-bezier(0.2, 0.7, 0.25, 1.15);
  }

  .digit-sec {
    height: 1em;
  }
}

@keyframes digit-roll {
  0% {
    transform: translateY(55%);
    opacity: 0;
    filter: blur(3px);
  }
  60% {
    transform: translateY(-6%);
    opacity: 1;
    filter: blur(0);
  }
  100% {
    transform: translateY(0);
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes blink {
  50% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .clock-time {
    .digit-inner,
    .colon {
      animation: none;
    }
  }
}

.clock-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.greeting {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
}
</style>

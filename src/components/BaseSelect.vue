<script setup>
/**
 * 自定义下拉选择（原生 select 样式不可控，此组件收口全项目自绘下拉）
 * - 合并自 CalendarDialog（年/月，ghost 变体）与 WeatherDialog（省市，box 变体）
 * - 打开状态组件内部自管：点击触发器开合、点击外部自动关闭（useClickOutside）
 * - options 支持 string/number 或 { value, label }（月份等需要本地化标签的场景）
 * - filterable 时内置过滤输入框（按 label includes 匹配），开合时自动清空
 * - 插槽：header（面板顶部扩展行，如年份 ±10 年跳页）、empty（无结果文案）
 *
 * @property {Array<string|number|{value,label}>} options
 * @property {'ghost'|'box'} variant  ghost=无边框文字触发器+居中浮层；box=描边输入框式+左对齐浮层
 * @property {'grid'|'list'} layout   grid=多列网格（年/月）；list=纵向列表（省市）
 * @property current 与选中态区分的「当前真实值」标记（如今年）
 */
import { ref, computed } from 'vue'
import { RiArrowDownSLine } from '@remixicon/vue'
import { useClickOutside } from '@/composables/useClickOutside'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  variant: { type: String, default: 'ghost' },
  layout: { type: String, default: 'grid' },
  filterable: { type: Boolean, default: false },
  filterPlaceholder: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  current: { type: [String, Number], default: undefined },
})
const emit = defineEmits(['update:modelValue', 'select', 'open'])

const open = ref(false)
const query = ref('')
const rootRef = ref(null)

function toggle() {
  open.value = !open.value
  query.value = ''
  if (open.value) emit('open')
}

function valueOf(opt) {
  return opt && typeof opt === 'object' ? opt.value : opt
}
function labelOf(opt) {
  return opt && typeof opt === 'object' ? String(opt.label) : String(opt)
}

const filtered = computed(() => {
  if (!props.filterable) return props.options
  const q = query.value.trim()
  if (!q) return props.options
  return props.options.filter((o) => labelOf(o).includes(q))
})

function pick(opt) {
  emit('update:modelValue', valueOf(opt))
  emit('select', valueOf(opt))
  open.value = false
}

useClickOutside(
  () => (open.value ? [rootRef.value] : []),
  () => {
    open.value = false
  }
)
</script>

<template>
  <div ref="rootRef" class="bs" :class="[`bs-${variant}`, { open }]">
    <button class="bs-btn" type="button" :aria-label="ariaLabel" @click="toggle">
      <span class="bs-text">
        <slot name="display" :value="modelValue">{{ labelOf(options.find((o) => valueOf(o) === modelValue) ?? modelValue) }}</slot>
      </span>
      <RiArrowDownSLine size="14" class="bs-arrow" aria-hidden="true" />
    </button>
    <div v-if="open" class="bs-panel" :class="{ glass: variant === 'box' }" @click.stop>
      <slot name="header" />
      <input
        v-if="filterable"
        v-model="query"
        class="bs-filter"
        :placeholder="filterPlaceholder"
      />
      <div class="bs-body" :class="`bs-${layout}`">
        <button
          v-for="o in filtered"
          :key="String(valueOf(o))"
          type="button"
          :class="['bs-opt', { active: valueOf(o) === modelValue, current: valueOf(o) === current }]"
          @click="pick(o)"
        >{{ labelOf(o) }}</button>
        <div v-if="!filtered.length" class="bs-empty"><slot name="empty" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.bs {
  position: relative;
  display: inline-block;

  &.open {
    .bs-btn {
      color: @accent;
      background: color-mix(in srgb, @accent 0.15%, transparent);
    }

    .bs-arrow {
      transform: rotate(180deg);
      color: @accent;
    }
  }

  &.bs-box {
    flex: 1;
    min-width: 0;
    display: flex;

    &.open .bs-btn {
      border-color: @accent;
      background: color-mix(in srgb, @accent 0.1%, transparent);
    }
  }
}

.bs-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: @text;
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
  }

  /* box 变体：描边输入框式触发器 */
  .bs-box & {
    flex: 1;
    min-width: 0;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);

    &:hover {
      background: color-mix(in srgb, @accent 0.06%, transparent);
    }
  }
}

.bs-text {
  .ellipsis();
}

.bs-arrow {
  display: inline-flex;
  flex-shrink: 0;
  color: @text-soft;
  transition: transform 0.2s ease;
}

.bs-panel {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 100;
  min-width: 220px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  .glass-blur(20px, 180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 8px 32px rgba(31, 41, 55, 0.18);
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: bs-fade 0.16s ease;

  /* ghost 变体：居中浮层 + 指向触发按钮的小箭头 */
  .bs-ghost & {
    left: 50%;
    transform: translateX(-50%);

    &::after {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top: 0;
      border-bottom-color: rgba(255, 255, 255, 0.96);
    }
  }

  /* box 变体：左对齐、随触发器宽度 */
  .bs-box & {
    left: 0;
    min-width: 100%;
    width: max-content;
    max-width: 230px;
    border: none;
  }
}

@keyframes bs-fade {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* box 变体不做居中位移，单独声明动画避免 translateX 叠加 */
.bs-box .bs-panel {
  animation: bs-fade-box 0.16s ease;
}

@keyframes bs-fade-box {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.bs-filter {
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: @text;
  padding: 7px 10px;
  font-size: 12px;
  outline: none;
  width: 100%;

  &:focus {
    border-color: @accent;
  }
}

.bs-body {
  &.bs-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    /* 年份 12 项 4 列 3 行，紧凑无滚动 */
    max-height: 210px;
    overflow-y: auto;
    padding-right: 2px;
    .thin-scrollbar();
  }

  &.bs-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 208px;
    overflow-y: auto;
    .thin-scrollbar();
  }
}

.bs-opt {
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: @text;
  background: transparent;
  transition: background 0.15s ease, color 0.15s ease;
  cursor: pointer;
  white-space: nowrap;

  .bs-grid & {
    padding: 7px 4px;
    text-align: center;
    white-space: normal;
  }

  &:hover {
    background: color-mix(in srgb, @accent 0.1%, transparent);
    color: @accent;
  }

  &.active {
    background: @accent-gradient;
    color: #fff;
    font-weight: 600;
  }

  &.current:not(.active) {
    border: 1px solid color-mix(in srgb, @accent 0.4%, transparent);
  }
}

.bs-empty {
  text-align: center;
  font-size: 12px;
  color: @text-soft;
  padding: 12px 8px;
}
</style>

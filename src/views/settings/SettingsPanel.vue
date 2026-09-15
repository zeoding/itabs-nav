<script setup>
/**
 * 设置面板（右侧悬浮抽屉）- Tab 壳
 * - 只负责：抽屉容器 / 左侧 Tab 导航（含滑动指示条）/ 右侧动态内容区
 * - 各 Tab 内容为独立组件（settings/ 目录），新增 Tab 只需：
 *   1. 在 settings/ 下新建组件
 *   2. 在 TABS 数组追加一条 { key, component }
 *   3. 在 i18n settings.tabs 下加文案
 * - 对外接口不变：props(open, settings) / emits(close, update, reset, restored)
 */
import { ref, watch, computed, nextTick } from 'vue'
import { useEscapeClose } from '@/composables/useEscapeClose'
import { $t, useI18n } from '@/composables/useI18n'
import { RiCloseLine } from '@remixicon/vue'
import SettingsGeneral from '@/views/settings/SettingsGeneral.vue'
import SettingsData from '@/views/settings/SettingsData.vue'
import SettingsAbout from '@/views/settings/SettingsAbout.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  settings: { type: Object, required: true },
})
const emit = defineEmits(['close', 'update', 'reset', 'restored'])

useEscapeClose(computed(() => props.open), () => emit('close'))

/** Tab 注册表：新增功能 Tab 只需在此追加 */
const TABS = [
  { key: 'general', component: SettingsGeneral },
  { key: 'data', component: SettingsData },
  { key: 'about', component: SettingsAbout },
]
const TAB_KEYS = TABS.map((t) => t.key)

const tab = ref('general')
const activeComponent = computed(
  () => TABS.find((t) => t.key === tab.value)?.component ?? SettingsGeneral
)

function tabName(key) {
  return $t(`settings.tabs.${key}`)
}

watch(
  () => props.open,
  (val) => {
    if (val) tab.value = 'general'
  }
)

/* 纵向滑动指示条：选中背景跟着滑到当前 tab */
const { lang } = useI18n()
const tabsRef = ref(null)
const pillStyle = ref({ top: '0px', height: '0px', opacity: 0 })
function movePill() {
  const root = tabsRef.value
  if (!root || !props.open) return
  const btn = root.querySelectorAll('.tab-btn')[TAB_KEYS.indexOf(tab.value)]
  if (!btn || !btn.offsetHeight) return
  pillStyle.value = { top: `${btn.offsetTop}px`, height: `${btn.offsetHeight}px`, opacity: 1 }
}
watch([() => props.open, tab, lang], async () => {
  await nextTick()
  movePill()
})

/* 子组件事件透传（保持对外接口不变） */
function forwardUpdate(key, value) {
  emit('update', key, value)
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-mask" @click.self="emit('close')">
      <aside class="drawer glass" @click.stop>
        <!-- 左侧侧边栏：标题 + Tab 列表 -->
        <div class="sidebar">
          <header class="sidebar-header">
            <h3>{{ $t('settings.title') }}</h3>
            <button class="close-btn" v-tip="$t('common.close')" :aria-label="$t('common.close')" @click="emit('close')">
              <RiCloseLine size="18" aria-hidden="true" />
            </button>
          </header>

          <nav class="tabs" ref="tabsRef">
            <span class="tab-pill" :style="pillStyle" aria-hidden="true"></span>
            <button
              v-for="tabItem in TABS"
              :key="tabItem.key"
              :class="['tab-btn', { active: tab === tabItem.key }]"
              @click="tab = tabItem.key"
            >
              {{ tabName(tabItem.key) }}
            </button>
          </nav>
        </div>

        <!-- 右侧内容区：动态 Tab 组件 -->
        <div class="drawer-body">
          <component
            :is="activeComponent"
            :key="tab"
            :settings="settings"
            @update="forwardUpdate"
            @reset="emit('reset')"
            @restored="emit('restored')"
          />
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped lang="less">
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(31, 41, 55, 0.35);
  z-index: 100;
  backdrop-filter: blur(4px);
}

.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(560px, 94vw);
  display: flex;
  flex-direction: row;
  border-radius: 0;
  color: @text;
  overflow: hidden;
}

.close-btn {
  .circle-btn(30px);
  font-size: 18px;
  line-height: 1;

  &:hover {
    background: rgba(31, 41, 55, 0.12);
    color: @text;
  }
}

/* 左侧侧边栏 */
.sidebar {
  width: 140px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  background: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, @accent 0.08%, transparent);

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
}

.tabs {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px;
  flex: 1;
}

/* 纵向滑动指示条 */
.tab-pill {
  position: absolute;
  left: 8px;
  right: 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  transition: top 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
              height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.2s ease;
  pointer-events: none;
}

.tab-btn {
  text-align: left;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: @text-soft;
  background: transparent;
  transition: all @tr;
  position: relative;
  z-index: 1;
  border: none;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
    color: @text;
  }

  &.active {
    background: transparent;
    color: #fff;
    font-weight: 500;
  }
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
  min-width: 0;
}

/* 右侧滑入/滑出动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;

  .drawer {
    transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;

  .drawer {
    transform: translateX(100%);
  }
}
</style>

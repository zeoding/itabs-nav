<script setup>
/**
 * App 根组件
 *   ┌─ sidebar ──
 *   │          │      ┌── main ──
 *   │          │      │  search  │  引擎下拉已合入搜索框
 *   │          │      │ widgets  │
 *   │          │      │ grid    │
 *   └──────────┘      └──────────┘ */
import { ref, computed, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import SearchBar from '@/views/search/SearchBar.vue'
import WidgetsBar from '@/views/layout/WidgetsBar.vue'
import SiteGrid from '@/views/sites/SiteGrid.vue'
import Sidebar from '@/views/layout/Sidebar.vue'
import AsyncLoading from '@/components/feedback/AsyncLoading.vue'
import { RiEyeLine, RiEyeOffLine, RiRefreshLine, RiSnowflakeLine, RiMoonLine, RiSunLine } from '@remixicon/vue'
// 弹窗 / 编辑器：按需懒加载，点击时才下载对应 chunk
// - delay: 200（毫秒）后才显示 loading，避免快速 chunk 闪现 loader
// - loadingComponent: 占位组件（旋转圆 + 提示）
const SettingsPanel = defineAsyncComponent({
  loader: () => import('@/views/settings/SettingsPanel.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const WeatherDialog = defineAsyncComponent({
  loader: () => import('@/views/dialogs/WeatherDialog.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const TodoDialog = defineAsyncComponent({
  loader: () => import('@/views/dialogs/TodoDialog.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const CalendarDialog = defineAsyncComponent({
  loader: () => import('@/views/dialogs/CalendarDialog.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const HotDialog = defineAsyncComponent({
  loader: () => import('@/views/dialogs/HotDialog.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const SiteEditor = defineAsyncComponent({
  loader: () => import('@/views/sites/SiteEditor.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
const WidgetPreviewDialog = defineAsyncComponent({
  loader: () => import('@/views/dialogs/WidgetPreviewDialog.vue'),
  delay: 200,
  loadingComponent: AsyncLoading,
})
// 全局 host：随 App 启动即用，同步加载（体积小）
import ConfirmHost from '@/components/feedback/ConfirmHost.vue'
import MessageHost from '@/components/feedback/MessageHost.vue'
import TipHost from '@/components/feedback/TipHost.vue'
import Snowfall from '@/views/layout/Snowfall.vue'
import SayingFooter from '@/views/layout/SayingFooter.vue'
import WidgetTaskbar from '@/views/layout/WidgetTaskbar.vue'
import { useSitesStore } from '@/stores/sites'
import { useSettingsStore } from '@/stores/settings'
import { usePanelsStore } from '@/stores/panels'
import { useUiStore } from '@/stores/ui'
import { setLanguage, $t } from '@/composables/useI18n'
import { storeToRefs } from 'pinia'
import * as db from '@/db'
import { TOOL_KINDS } from '@/db'

const sitesStore = useSitesStore()
const { sites, loading, currentPanel } = storeToRefs(sitesStore)
const { load, add, update, remove, move, setPanel, clearCurrentPanel } = sitesStore
const settingsStore = useSettingsStore()
const { settings, backgroundStyle, isDark } = storeToRefs(settingsStore)
const {
  load: loadSettings,
  set: setSetting,
  applyEngineChanges,
  setCurrentEngine,
  stopWallpaperTimer,
  refreshWallpaper,
} = settingsStore

/** 监听语言变化：写到 IndexedDB 后立即应用到全局 i18n */
watch(
  () => settings.value.language,
  (lang) => {
    if (lang) setLanguage(lang)
  },
  { immediate: true }
)

/** 来自弹窗的批量变更：{ add: [...], remove: [...] } */
async function handleAddEngines(changes) {
  await applyEngineChanges(changes)
}

/** 来自下拉的单个删除 */
async function handleRemoveEngine(key) {
  await applyEngineChanges({ remove: [key] })
}

const editorOpen = ref(false)
const settingsOpen = ref(false)
const weatherOpen = ref(false)
const todoOpen = ref(false)
const calendarOpen = ref(false)
const hotOpen = ref(false)
/** panel-grid 工具卡点击触发的预览弹窗状态 */
const previewWidget = ref(null)
/** 预览弹窗最小化：弹窗隐藏，任务栏承接（widget 保留以便还原） */
const previewMinimized = ref(false)
/** v-model:open 适配：非空 widget 即为打开；关闭时一并退出最小化 */
const previewOpen = computed({
  get: () => previewWidget.value !== null,
  set: (v) => {
    if (!v) {
      previewWidget.value = null
      previewMinimized.value = false
    }
  },
})
/** 任务栏可见：有最小化的预览窗口时 */
const taskbarVisible = computed(
  () => previewWidget.value !== null && previewMinimized.value
)
/** 任务栏窗口标题（与 WidgetPreviewDialog 内文案保持一致；走 i18n，随语言切换更新） */
const TOOL_TITLE_KEYS = {
  'split-text': 'widgets.splitText',
  'free-email': 'widgets.freeEmail',
  'wallpaper': 'widgets.wallpaper',
}
const previewTitle = computed(() => {
  const key = previewWidget.value?.key
  return (key && TOOL_TITLE_KEYS[key]) ? $t(TOOL_TITLE_KEYS[key]) : key || ''
})

/** 精简模式：只保留搜索引擎 */
const minimalist = ref(false)
/** 飘雪开关 + 侧栏收起：统一走 ui store（IndexedDB 持久化） */
const uiStore = useUiStore()
const { snowOn, sidebarCollapsed } = storeToRefs(uiStore)
const { toggleSnow, setSidebarCollapsed } = uiStore
/** 右上 zone hover 状态（用全局 mousemove 监听，避免挡住弹窗） */
const zoneHover = ref(false)
/** 任意弹窗打开时，隐藏精简按钮（最小化到任务栏的不算打开） */
const anyDialogOpen = computed(() =>
  settingsOpen.value ||
  weatherOpen.value ||
  todoOpen.value ||
  calendarOpen.value ||
  hotOpen.value ||
  editorOpen.value ||
  (previewWidget.value !== null && !previewMinimized.value)
)

function onMouseMove(e) {
  // 检测鼠标是否在右上 140×100 区域
  const w = window.innerWidth
  const inZone = e.clientX > w - 140 && e.clientY < 100
  if (inZone !== zoneHover.value) {
    zoneHover.value = inZone
  }
}

function toggleMinimalist() {
  minimalist.value = !minimalist.value
}
const editingSite = ref(null)

/** 侧栏收起后布局回收（状态归 ui store，Sidebar 内切换） */

onMounted(async () => {
  await Promise.all([load(), loadSettings()])
  window.addEventListener('mousemove', onMouseMove)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  stopWallpaperTimer()
})

function openAdd() {
  editingSite.value = null
  editorOpen.value = true
}

/** 左侧 rail-btn 点击 切换面板（所有面板功能一致，但内容独立） */
/** 切换方向forward' (从上往点| 'backward' (从下往点 | 'none' (默认) */
const panelDirection = ref('none')
/** 面板列表：与 Sidebar 同源（panels store 单例），避免新鲜打包环境下只有 ['home'] */
const panelsStore = usePanelsStore()
const { panelOrder } = storeToRefs(panelsStore)
const { setCustomPanels, refreshPanels } = panelsStore

/** Sidebar 增删改后即时同步（同页 storage 事件不触发，靠此事件补齐） */
function onCustomPanelsChanged(list) {
  setCustomPanels(Array.isArray(list) ? [...list] : [])
}

function onRailSelect(key) {
  const cur = currentPanel.value
  if (cur === key) return
  const from = panelOrder.value.indexOf(cur)
  const to = panelOrder.value.indexOf(key)
  // 防御：未知面板（理论上不应发生）默认按 forward 处理，保证仍能切换
  panelDirection.value = from === -1 || to === -1 ? 'forward' : to > from ? 'forward' : 'backward'
  setPanel(key)
}

/** 鼠标滚轮切换面板（绑定到 window，靠累加阈值避免误触） */
let wheelAccum = 0
let wheelTimer = null
const WHEEL_THRESHOLD = 150 // 累加到多少像素才触发一次切换

function onWheelSwitch(e) {
  // 弹窗打开时不切换面板（避免弹窗里滚动切换了背后的页面）
  if (anyDialogOpen.value) return
  // 只在中间主体区域（.content）触发，避免 SearchBar / Sidebar 滚轮也切面板
  const target = e.target
  if (!target || !target.closest || !target.closest('.content')) return
  // 如果当前滚动已经是在一个真正可滚动的子容器（panel-grid 列、popover 等），不拦截
  const scrollable = target.closest('[data-wheel-scrollable]')
  if (scrollable) return

  if (e.deltaY === 0) return

  // 累加 deltaY
  wheelAccum += e.deltaY
  if (Math.abs(wheelAccum) < WHEEL_THRESHOLD) {
    // 没到阈值就刷新重置计时器（避免长时间累积）
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => { wheelAccum = 0 }, 250)
    return
  }

  e.preventDefault()
  const list = panelOrder.value
  // 防御：当前面板不在列表里（如数据迁移中）则回退到 home，保证滚轮仍可用
  let cur = list.indexOf(currentPanel.value)
  if (cur === -1) {
    setPanel('home')
    wheelAccum = 0
    clearTimeout(wheelTimer)
    return
  }
  const dir = wheelAccum > 0 ? 1 : -1
  const next = list[cur + dir]
  // 重置累加器
  wheelAccum = 0
  clearTimeout(wheelTimer)
  if (!next) return
  panelDirection.value = dir > 0 ? 'forward' : 'backward'
  setPanel(next)
}

onMounted(() => {
  // 用 capture 阶段，确保在子元素 wheel 处理前先看到
  window.addEventListener('wheel', onWheelSwitch, { passive: false, capture: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheelSwitch, { capture: true })
  clearTimeout(wheelTimer)
})

/** 删除面板 */
async function onPanelDeleted(key) {
  if (currentPanel.value === key) {
    setPanel('home')
  }
  await clearCurrentPanel()
  // 刷新面板列表（单例已同步，这里只需重读兜底跨 tab 场景）
  refreshPanels()
}

function openEdit(site) {
  editingSite.value = site
  editorOpen.value = true
}

async function handleSave(site) {
  if (site.id) {
    await update(site)
  } else {
    await add(site)
  }
  editorOpen.value = false
}

/** 来自右键菜单：删除 */
async function handleRemoveSite(site) {
  await remove(site.id)
}

/** 来自右键菜单：调整大小 */

async function handleResize({ site, size }) {
  await update({ ...site, size })
}

/**
 * 添加工具卡片：直接在当前面板写入工具站点
 * - kind ∈ TOOL_KINDS  -> SiteCard 点击会走 action 事件 -> 父组件打开弹窗
 * - 默认 size '1x1',与普通站点卡一致
 * - 同面板已有同 kind 卡片则不重复添加(避免重复占位)
 *
 * 新增工具时:
 *  1. 在 db.TOOL_KINDS 追加 kind
 *  2. 在下面 TOOL_PRESETS 加一条 preset(name/url/icon)
 *  3. 在 SiteEditor 的 WIDGETS 加一项 kind === <new>
 */
const TOOL_PRESETS = {
  'split-text': {
    name: '文本分割',
    url: 'action:split-text',
    // 使用与 SiteEditor.WIDGETS 中 split-text 一致的 emoji,
    // 让工具卡片在 panel-grid 中的图标与「添加站点」弹窗里的小组件图标保持一致
    icon: '✂️',
  },
  'free-email': {
    name: '免费邮箱',
    url: 'action:free-email',
    icon: '📫',
  },
  'wallpaper': {
    name: '壁纸库',
    url: 'action:wallpaper',
    icon: '🖼️',
  },
}

async function handleAddTool(tool) {
  if (!TOOL_KINDS.includes(tool)) return
  const exists = sites.value.some((s) => s.kind === tool)
  if (exists) {
    console.info(`[App] 当前面板已存在「${TOOL_PRESETS[tool].name}」卡片,无需重复添加`)
    return
  }
  const preset = TOOL_PRESETS[tool]
  await add({
    name: preset.name,
    url: preset.url,
    icon: preset.icon,
    size: '1x1',
    kind: tool,
  })
}

/**
 * panel-grid 上的工具卡点击：唤起 WidgetPreviewDialog 预览
 * - SiteGrid 已把 site 转成 widget 对象({ key/icon/category/kind })
 * - WidgetPreviewDialog 直接渲染对应的工具组件(目前 split-text → SplitTextPanel)
 */
function handleToolClick(widget) {
  previewWidget.value = widget
  // 新开窗口时确保可见（之前最小化的状态不延续）
  previewMinimized.value = false
}

async function handleReset() {
  await db.clearAll()
  await Promise.all([load(), loadSettings()])
  settingsOpen.value = false
}

/** 备份恢复后：重载站点与设置 */
async function handleRestored() {
  await Promise.all([load(), loadSettings()])
}
</script>

<template>
  <div :class="['app', { minimalist, 'sidebar-collapsed': sidebarCollapsed }]" :style="backgroundStyle">
    <!-- 右上快捷区：深浅切换 + 飘雪 + 壁纸刷新 + 精简切换（图标按钮，任何弹窗打开时自动隐藏） -->
    <div v-show="!anyDialogOpen" class="minimalist-zone">
      <button
        class="zone-btn"
        :class="{ active: isDark, show: zoneHover || minimalist }"
        v-tip="isDark ? $t('settings.themeMode.toLight') : $t('settings.themeMode.toDark')"
        :aria-label="isDark ? $t('settings.themeMode.toLight') : $t('settings.themeMode.toDark')"
        @click="setSetting('themeMode', isDark ? 'light' : 'dark')"
      >
        <RiSunLine v-if="isDark" :size="18" aria-hidden="true" />
        <RiMoonLine v-else size="18" aria-hidden="true" />
      </button>
      <button
        class="zone-btn"
        :class="{ active: snowOn, show: zoneHover || minimalist }"
        v-tip="$t('minimalist.snowTitle')"
        :aria-label="$t('minimalist.snowTitle')"
        @click="toggleSnow"
      >
        <RiSnowflakeLine size="18" aria-hidden="true" />
      </button>
      <button
        v-if="settings.wallpaperMode === 'random'"
        class="zone-btn"
        :class="{ show: zoneHover || minimalist }"
        v-tip="$t('settings.wallpaper.refreshNow')"
        :aria-label="$t('settings.wallpaper.refreshNow')"
        @click="refreshWallpaper"
      >
        <RiRefreshLine size="18" aria-hidden="true" />
      </button>
      <button
        class="zone-btn"
        :class="{ active: minimalist, show: zoneHover || minimalist }"
        v-tip="minimalist ? $t('minimalist.exitTitle') : $t('minimalist.enterTitle')"
        :aria-label="minimalist ? $t('minimalist.exitTitle') : $t('minimalist.enterTitle')"
        @click="toggleMinimalist"
      >
        <RiEyeLine v-if="minimalist" :size="18" aria-hidden="true" />
        <RiEyeOffLine v-else size="18" aria-hidden="true" />
      </button>
    </div>

    <Sidebar
      class="side-area"
      :class="{ hidden: minimalist }"
      :active="currentPanel"
      @open-settings="settingsOpen = true"
      @select="onRailSelect"
      @update:custom="onCustomPanelsChanged"
      @panel-deleted="onPanelDeleted"
      @update:collapsed="setSidebarCollapsed($event)"
    />

    <main class="content">
      <!-- 搜索 + 小组件始终显示 -->
      <div class="searchbar-wrap">
        <SearchBar
          :engines="settings.engines"
          :current-key="settings.currentEngineKey"
          @select="setCurrentEngine"
          @add="handleAddEngines"
          @remove="handleRemoveEngine"
        />
      </div>

      <div
        class="below-search"
        :class="{ hidden: minimalist }"
        :aria-hidden="minimalist"
        :inert="minimalist"
      >
        <WidgetsBar
          @open-weather="weatherOpen = true"
          @open-todo="todoOpen = true"
          @open-calendar="calendarOpen = true"
          @open-hot="hotOpen = true"
        />

        <!-- 中间主体：所有rail-btn（home + 自定义）都显示在SiteGrid（功能一致） -->
        <div class="panel-stage">
          <Transition :name="`panel-${panelDirection}`" mode="out-in">
            <SiteGrid
              :key="currentPanel"
              :sites="sites"
              :loading="loading"
              :grid-columns="settings.gridColumns"
              @move="move"
              @edit="openEdit"
              @add="openAdd"
              @remove="handleRemoveSite"
              @resize="handleResize"
              @tool-click="handleToolClick"
            />
          </Transition>
        </div>
      </div>
    </main>

    <!-- 每日一言页脚（任务栏承接最小化窗口时隐藏，避免重复） -->
    <SayingFooter v-if="!taskbarVisible" />

    <!-- 最小化任务栏：类 Windows 底栏（窗口还原入口 + 一言 + 时钟） -->
    <WidgetTaskbar
      v-if="taskbarVisible"
      :widget="previewWidget"
      :title="previewTitle"
      @restore="previewMinimized = false"
      @close="previewOpen = false"
    />

    <SiteEditor
      :open="editorOpen"
      :editing="editingSite"
      @save="handleSave"
      @close="editorOpen = false"
      @add-tool="handleAddTool"
    />
    <SettingsPanel
      :open="settingsOpen"
      :settings="settings"
      @update="setSetting"
      @reset="handleReset"
      @restored="handleRestored"
      @close="settingsOpen = false"
    />
    <WeatherDialog v-model:open="weatherOpen" />
    <TodoDialog v-model:open="todoOpen" />
    <CalendarDialog v-model:open="calendarOpen" />
    <HotDialog v-model:open="hotOpen" />
    <WidgetPreviewDialog
      v-model:open="previewOpen"
      v-model:minimized="previewMinimized"
      :widget="previewWidget"
    />
    <ConfirmHost />
    <MessageHost />
    <TipHost />
    <Transition name="snow-fade">
      <Snowfall v-if="snowOn" />
    </Transition>
  </div>
</template>

<style scoped lang="less">
.app {
  min-height: 100vh;
  display: flex;
  transition: background 0.4s ease;
  position: relative;
  overflow: hidden;

  /* 侧边栏收起后：回收左侧预留空间 */
  &.sidebar-collapsed .content {
    padding-left: 32px;
  }

  /* 精简模式：不改动 content padding（避免 padding 动画与位移动画打架导致先下跳再上漂）；
     只用 transform 做纯粹的从上往下过渡 */
  &.minimalist {
    /* 搜索框：精简模式时向下平移 18vh（有过渡，平滑下移；退出时平滑上移） */
    .searchbar-wrap {
      transform: translateY(18vh);
    }

    /* below-search：隐藏时快速下沉淡出（与搜索框同向），visibility 延迟隐藏保证淡出播完 */
    .below-search {
      opacity: 0;
      transform: translateY(24px) scale(0.98);
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.22s ease,
        transform 0.25s ease,
        visibility 0s linear 0.25s;
    }
  }
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 150px 32px 60px 110px;
  width: 100%;
  min-width: 0;
  position: relative;
  min-height: 100vh;
  contain: layout;
  transition: padding-left 0.28s ease;
}

.searchbar-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  flex: 0 0 auto;
  position: relative;
  z-index: 2;
  /* 精简切换时的从上往下 / 从下往上平滑过渡 */
  transform: translateY(0);
  transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
}

/* 搜索框下方的"非必要区域"：回显时等搜索框先归位（0.12s 错峰），再上浮淡入 + 微放大，
   与搜索框同向（一起上浮），避免反向发散；隐藏时则走 .minimalist 下的快速淡出 */
.below-search {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
  transform-origin: top center;
  will-change: opacity, transform;
  transition: opacity 0.38s ease 0.12s,
              transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.12s,
              visibility 0s linear 0.12s;

  &.hidden {
    opacity: 0;
    transform: translateY(24px) scale(0.98);
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.22s ease,
      transform 0.25s ease,
      visibility 0s linear 0.25s;
  }
}

.side-area {
  transition: opacity 0.3s ease, visibility 0s;
  &.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
}

/* 右上快捷区：图标按钮组（精简切换 + 壁纸刷新） */
.minimalist-zone {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 200;
  display: flex;
  gap: 8px;
  padding: 14px;
  /* 本体必须可命中，CSS :hover 显示路径才有效；
     盒子只包住按钮组（padding 收小），不遮挡页面其他区域 */
  pointer-events: auto;

  &:hover .zone-btn {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;

    &:active {
      transform: scale(0.92);
    }
  }
}

.zone-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: @radius-circle;
  color: @text;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 18px rgba(31, 41, 55, 0.1);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.18s ease, color 0.18s ease;
  /* 隐藏时不拦截事件，可见时才接收 */
  pointer-events: none;

  /* 显示状态 */
  &.show {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;

    &:active {
      transform: scale(0.92);
    }
  }

  &:hover {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
    border-color: transparent;
  }

  &.active {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
    border-color: transparent;
  }

  &:active {
    transform: scale(0.92);
  }
}

/* 面板切换舞台：固定高度 + 相对定位 */
.panel-stage {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

/* 面板切换动画：方向感 */
/* forward：点击下方按钮 / 鼠标向下滑时，新元素从下往上进 */
.panel-forward-enter-active,
.panel-forward-leave-active {
  transition: opacity 0.32s cubic-bezier(0.2, 0.8, 0.2, 1),
              transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.panel-forward-enter-from {
  opacity: 0;
  transform: translateY(40px);
}

.panel-forward-leave-to {
  opacity: 0;
  transform: translateY(-40px);
}

.panel-forward-enter-to,
.panel-forward-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* backward：点击上方按钮 / 鼠标向上滑动时，新元素从上往下进入 */
.panel-backward-enter-active,
.panel-backward-leave-active {
  transition: opacity 0.32s cubic-bezier(0.2, 0.8, 0.2, 1),
              transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.panel-backward-enter-from {
  opacity: 0;
  transform: translateY(-40px);
}

.panel-backward-leave-to {
  opacity: 0;
  transform: translateY(40px);
}

.panel-backward-enter-to,
.panel-backward-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* 默认（首次渲染等）*/
.panel-none-enter-active,
.panel-none-leave-active {
  transition: none;
}

.panel-none-enter-from,
.panel-none-leave-to {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 900px) {
  .content {
    padding: 24px 20px;
  }
}
</style>

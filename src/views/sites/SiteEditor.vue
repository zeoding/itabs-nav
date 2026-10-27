<script setup>
/**
 * 添加 / 编辑站点 / 添加小组件 弹窗
 * - 左侧 tab：自定义站点 / 小组件
 * - 右侧内容：根据当前 tab 切换
 *   - "自定义站点" tab：保留原添加/编辑表单
 *   - "小组件" tab：以卡片列表呈现 widget,目前仅含内置工具 split-text
 *     - 内置工具类走真实写入路径：
 *         emit('add-tool', 'split-text') → 父组件写入当前面板站点(1x1)
 * - 支持全屏放大
 */
import { ref, watch, computed, nextTick, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'
import BaseDialog from '@/components/BaseDialog.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import { $t } from '@/composables/useI18n'
import { useMessage } from '@/composables/useMessage'
import { useEscapeClose } from '@/composables/useEscapeClose'
import { useClickOutside } from '@/composables/useClickOutside'
import { useSitesStore } from '@/stores/sites'
import { usePanelsStore } from '@/stores/panels'
import { TOOL_KINDS, TOOLS, TOOLS_BY_KIND } from '@/config/tools'
import { FAVICON_API } from '@/config/api'
import { loadEngineSvg, loadEngineSvgCached, THESVG_PREFIX, SITE_ICON_PRESETS } from '@/utils/thesvg'
import { openExternal } from '@/utils/openExternal'
import { DIRECTORY_CATS, DIRECTORY_SITES } from '@/data/directory'
/**
 * 小组件预览弹窗：懒加载
 * - 该弹窗内部静态引入了全部 widget 预览组件（SplitText/Email/Wallpaper/...），
 *   若此处静态 import，会把整棵预览组件树并进 SiteEditor 的 chunk，
 *   导致「添加站点」时连带下载所有 widget（实测 dialogs chunk 膨胀到 ~290KB）。
 * - 改为 defineAsyncComponent 后，只有用户真正点击 widget 卡片时才下载该 chunk。
 */
const WidgetPreviewDialog = defineAsyncComponent(() =>
  import('@/views/dialogs/WidgetPreviewDialog.vue')
)
import {
  RiGlobalLine,
  RiDashboardLine,
  RiCompass3Line,
  RiExternalLinkLine,
  RiAddLine,
  RiSearchLine,
} from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  editing: { type: Object, default: null },
  /** 当前面板 key：「网址导航」的「添加到」默认值 */
  panel: { type: String, default: 'home' },
})
const emit = defineEmits(['save', 'close', 'add-tool', 'add-directory'])

const form = ref({ name: '', url: '', icon: '' })
const errorMsg = ref('')
const activeTab = ref('site') // 'site' | 'directory' | 'widgets'
const message = useMessage()

/** 右键编辑既有站点时隐藏"小组件/网址导航"tab（仅新建经添加卡片进入才需要） */
const isEditing = computed(() => !!props.editing)
const visibleTabs = computed(() => {
  const tabs = [{ key: 'site', icon: RiGlobalLine, label: $t('siteEditor.tabs.site') }]
  if (!isEditing.value) {
    tabs.push({ key: 'directory', icon: RiCompass3Line, label: $t('siteDirectory.tab') })
    tabs.push({ key: 'widgets', icon: RiDashboardLine, label: $t('siteEditor.tabs.widgets') })
  }
  return tabs
})

/* ---------------- widgets ---------------- */
/**
 * 卡片结构（由 @/config/tools 的 TOOLS 派生）：
 *  - key:  唯一键（= kind）
 *  - icon: emoji 图标
 *  - kind: 内置工具类 widget，点击「添加」走真实写入（kind ∈ TOOL_KINDS）
 */
const WIDGETS = TOOLS.map((t) => ({
  key: t.kind,
  icon: t.icon,
  category: t.category,
  kind: t.kind,
}))

/** widget 展示文案：统一取自 @/config/tools */
function wTitle(w) {
  return TOOLS_BY_KIND[w.key]?.name || ''
}
function wDesc(w) {
  return TOOLS_BY_KIND[w.key]?.desc || ''
}

/* 当前 WIDGETS 仅含内置工具类,直接透传,无需搜索/分类过滤 */
const filteredWidgets = computed(() => WIDGETS)

/* ---------------- 网址导航 ---------------- */
const sitesStore = useSitesStore()
const { allSites } = storeToRefs(sitesStore)
const panelsStore = usePanelsStore()

const dirQuery = ref('')
const dirCat = ref('hot') // 'hot' 为跨分类聚合，其余取值见 DIRECTORY_CATS
const dirPanel = ref('home')

/** 「添加到」面板下拉：主页 + 自定义面板 */
const dirPanelOptions = computed(() => [
  { value: 'home', label: $t('sidebar.home') },
  ...panelsStore.customPanels.map((p) => ({ value: p.id, label: p.title })),
])

/** 目标面板已有的站点 URL 集合：命中即「已添加」，防重复添加 */
const dirAddedUrls = computed(() => {
  const set = new Set()
  for (const s of allSites.value) {
    if ((s.panel || 'home') === dirPanel.value) set.add(s.url)
  }
  return set
})

function isDirAdded(item) {
  return dirAddedUrls.value.has(item.url)
}

/** 搜索（名称/描述/网址）+ 分类过滤；「热门」为跨分类聚合 */
const dirFiltered = computed(() => {
  const q = dirQuery.value.trim().toLowerCase()
  return DIRECTORY_SITES.filter((s) => {
    if (dirCat.value === 'hot' ? !s.hot : s.cat !== dirCat.value) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q)
    )
  })
})

/** 添加到目标面板：emit 给父组件写入（编辑器保持打开，支持连续添加） */
function addDirectorySite(item) {
  if (isDirAdded(item)) return
  emit('add-directory', { name: item.name, url: item.url, icon: item.icon, panel: dirPanel.value })
  const panelLabel = dirPanelOptions.value.find((o) => o.value === dirPanel.value)?.label || ''
  message.success($t('siteDirectory.addSuccess', { name: item.name, panel: panelLabel }))
}

/** 导航卡片里的 thesvg 矢量图标（进入 tab 时批量加载，走全局 single-flight 缓存） */
const dirSvgs = ref({})
let dirSvgsLoaded = false
async function loadDirSvgs() {
  if (dirSvgsLoaded) return
  dirSvgsLoaded = true
  const slugs = [
    ...new Set(
      DIRECTORY_SITES
        .filter((s) => s.icon.startsWith(THESVG_PREFIX))
        .map((s) => s.icon.slice(THESVG_PREFIX.length))
    ),
  ]
  const entries = await Promise.all(slugs.map(async (slug) => [slug, await loadEngineSvgCached(slug)]))
  dirSvgs.value = Object.fromEntries(entries)
}

/** favicon 图标加载失败的站点（回退首字母，同 SiteCard 行为） */
const dirImgFailed = ref({})
function onDirImgError(item) {
  dirImgFailed.value = { ...dirImgFailed.value, [item.slug]: true }
}

watch(activeTab, (t) => {
  if (t === 'directory') loadDirSvgs()
})

/* ---------------- 小组件预览弹窗 ---------------- */
/** 当前预览中的 widget（null = 关闭）*/
const previewWidget = ref(null)
/** v-model:open 适配：非空 widget 即为打开 */
const previewOpen = computed({
  get: () => previewWidget.value !== null,
  set: (v) => { if (!v) previewWidget.value = null },
})
/** 点击 widget 卡片（非「添加」按钮区域）→ 打开预览 */
function openWidgetPreview(widget) {
  previewWidget.value = widget
}

function reset() {
  errorMsg.value = ''
  form.value = props.editing
    ? { ...props.editing }
    : { name: '', url: '', icon: '' }
  activeTab.value = 'site'
  // 关闭时同时收起预览弹窗，避免叠加
  previewWidget.value = null
  // 网址导航：重置筛选与目标面板（默认当前面板）
  dirQuery.value = ''
  dirCat.value = 'hot'
  dirPanel.value = props.panel || 'home'
}

/* ---------------- thesvg 图标库悬浮选择 ---------------- */
/** 预设 SVG 缓存（悬浮层首次打开时懒加载，避免首屏下载） */
const presetSvgs = ref({})
let presetsLoaded = false
async function loadPresets() {
  if (presetsLoaded) return
  presetsLoaded = true
  const entries = await Promise.all(
    SITE_ICON_PRESETS.map(async ({ slug }) => [slug, (await loadEngineSvg(slug)) || ''])
  )
  presetSvgs.value = Object.fromEntries(entries)
}

const presetOpen = ref(false)
const presetQuery = ref('')
const presetPos = ref({ left: 0, top: 0 })
const triggerRef = ref(null)
const popRef = ref(null)
const POP_GAP = 8
const POP_MARGIN = 8
const POP_WIDTH = 336

/** 搜索：名称/拼音 slug 双通道，大小写不敏感 */
const filteredPresets = computed(() => {
  const q = presetQuery.value.trim().toLowerCase()
  if (!q) return SITE_ICON_PRESETS
  return SITE_ICON_PRESETS.filter(
    (p) => p.name.toLowerCase().includes(q) || p.slug.includes(q)
  )
})

/** 悬浮层定位（触发器 = 图标库按钮） */
async function openPresets() {
  presetOpen.value = true
  loadPresets()
  await nextTick()
  computePopPosition()
}
function closePresets() {
  presetOpen.value = false
  presetQuery.value = ''
}
function togglePresets() {
  if (presetOpen.value) closePresets()
  else openPresets()
}

function computePopPosition() {
  const el = triggerRef.value
  const pop = popRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const mh = pop ? pop.getBoundingClientRect().height || 320 : 320
  let left = r.left
  if (left + POP_WIDTH > vw - POP_MARGIN) left = r.right - POP_WIDTH
  if (left + POP_WIDTH > vw - POP_MARGIN) left = vw - POP_WIDTH - POP_MARGIN
  if (left < POP_MARGIN) left = POP_MARGIN
  let top = r.bottom + POP_GAP
  if (top + mh > vh - POP_MARGIN) top = r.top - mh - POP_GAP
  if (top < POP_MARGIN) top = POP_MARGIN
  presetPos.value = { left, top }
}

/** 悬浮层内勾选：写入即关闭 */
function pickPreset(slug) {
  form.value.icon = `${THESVG_PREFIX}${slug}`
  closePresets()
}
function isPresetSelected(slug) {
  return form.value.icon === `${THESVG_PREFIX}${slug}`
}

// 图标预设下拉：点击外部 / ESC 关闭
useClickOutside(
  () => (presetOpen.value ? [popRef.value, triggerRef.value] : []),
  closePresets
)
useEscapeClose(presetOpen, closePresets)
watch(
  () => props.open,
  (v) => {
    if (!v) closePresets()
  }
)

watch(
  () => props.open,
  (val) => {
    if (val) reset()
  }
)

/**
 * 自动配图：失焦时仅图标为空才补（不覆盖库勾选/手动输入）；
 * 点"自动"按钮强制重抓
 */
function autoIcon(force = false) {
  if (!force && form.value.icon.trim()) return
  let domain = form.value.url.trim()
  if (!domain) return
  if (!/^https?:\/\//i.test(domain)) domain = 'https://' + domain
  try {
    form.value.icon = FAVICON_API.pageIcon(domain)
  } catch {
    errorMsg.value = $t('siteEditor.invalidUrl')
  }
}

function validateUrl(value) {
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value
  try {
    new URL(value)
    return value
  } catch {
    return null
  }
}

function submitSite() {
  const url = validateUrl(form.value.url.trim())
  if (!url) {
    errorMsg.value = $t('siteEditor.invalidUrlExample')
    return
  }
  const name = form.value.name.trim() || url
  emit('save', {
    id: props.editing?.id,
    name,
    url,
    icon: form.value.icon.trim() || '',
  })
}

function addWidget(widget) {
  // 内置工具类 widget：emit 给父组件写入站点(kind ∈ TOOL_KINDS)
  if (widget.kind && TOOL_KINDS.includes(widget.kind)) {
    emit('add-tool', widget.kind)
    emit('close')
    return
  }
  // 兜底提示（当前 WIDGETS 仅含内置工具,此分支不会触发,保留以备扩展）
  message.success($t('siteEditor.widgetAdded', { name: wTitle(widget) }))
}
</script>

<template>
  <!-- 就地渲染（teleport=false，还原迁移前行为）；内嵌的预览弹窗自身 Teleport 到 body -->
  <BaseDialog
    :open="open"
    :title="editing && activeTab === 'site' ? $t('siteEditor.editTitle') : $t('siteEditor.addTitle')"
    height="600px"
    max-height="90vh"
    padding="22px 24px"
    :z-index="100"
    :teleport="false"
    @close="emit('close')"
  >
      <div class="modal-body">
        <!-- 左侧 tab（编辑模式仅隐藏"小组件"一项） -->
        <nav class="tabs">
          <button
            v-for="tab in visibleTabs"
            :key="tab.key"
            :class="['tab', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" size="16" aria-hidden="true" class="tab-ico" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <!-- 右侧内容 -->
        <div class="content">
          <!-- tab: 自定义站点（保留原表单） -->
          <div v-if="activeTab === 'site'" class="panel">
            <label class="field">
              <span>{{ $t('siteEditor.name') }}</span>
              <input v-model="form.name" type="text" :placeholder="$t('siteEditor.namePlaceholder')" />
            </label>

            <label class="field">
              <span>{{ $t('siteEditor.url') }}</span>
              <input
                v-model="form.url"
                type="text"
                :placeholder="$t('siteEditor.urlPlaceholder')"
                @blur="() => autoIcon(false)"
              />
            </label>

            <label class="field">
              <span>{{ $t('siteEditor.iconUrl') }}</span>
              <div class="icon-row">
                <input
                  v-model="form.icon"
                  type="text"
                  :placeholder="$t('siteEditor.iconAutoPlaceholder')"
                />
                <button type="button" class="auto-btn" @click="autoIcon(true)">{{ $t('siteEditor.auto') }}</button>
                <button
                  ref="triggerRef"
                  type="button"
                  class="auto-btn lib-btn"
                  :class="{ open: presetOpen }"
                  v-tip="$t('siteEditor.iconPreset')"
                  :aria-label="$t('siteEditor.iconPreset')"
                  aria-haspopup="true"
                  :aria-expanded="presetOpen"
                  @click="togglePresets"
                >{{ $t('siteEditor.iconPreset') }}</button>
              </div>
            </label>

            <Teleport to="body">
              <Transition name="menu-pop">
                <div
                  v-if="presetOpen"
                  ref="popRef"
                  class="icon-pop glass"
                  :style="{ left: presetPos.left + 'px', top: presetPos.top + 'px' }"
                  @click.stop
                >
                  <div class="pop-search">
                    <RiSearchLine size="15" class="pop-search-ico" aria-hidden="true" />
                    <input
                      v-model="presetQuery"
                      class="pop-search-input"
                      :placeholder="$t('siteEditor.iconSearch')"
                    />
                  </div>
                  <div v-if="filteredPresets.length" class="pop-grid">
                    <button
                      v-for="p in filteredPresets"
                      :key="p.slug"
                      type="button"
                      :class="['preset-opt', { active: isPresetSelected(p.slug) }]"
                      :title="p.name"
                      :aria-label="p.name"
                      @click="pickPreset(p.slug)"
                    >
                      <span
                        v-if="presetSvgs[p.slug]"
                        class="preset-svg"
                        v-html="presetSvgs[p.slug]"
                      />
                      <span v-else class="preset-fallback">{{ p.name.slice(0, 1) }}</span>
                    </button>
                  </div>
                  <div v-else class="pop-empty">{{ $t('siteEditor.iconEmpty') }}</div>
                </div>
              </Transition>
            </Teleport>

            <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

            <div class="actions">
              <button type="button" class="btn ghost" @click="emit('close')">{{ $t('siteEditor.cancel') }}</button>
              <button type="button" class="btn primary" @click="submitSite">
                {{ editing ? $t('siteEditor.save') : $t('common.add') }}
              </button>
            </div>
          </div>

          <!-- tab: 网址导航（搜索 + 分类过滤 + 点击添加到面板） -->
          <div v-else-if="activeTab === 'directory'" class="panel">
            <!-- 工具行：搜索 + 添加到面板 -->
            <div class="dir-toolbar">
              <div class="dir-search">
                <RiSearchLine size="15" class="dir-search-ico" aria-hidden="true" />
                <input
                  v-model="dirQuery"
                  type="text"
                  :placeholder="$t('siteDirectory.searchPlaceholder')"
                  :aria-label="$t('siteDirectory.searchPlaceholder')"
                />
              </div>
              <div class="dir-panel-pick">
                <span class="dir-panel-label">{{ $t('siteDirectory.addTo') }}</span>
                <BaseSelect
                  v-model="dirPanel"
                  :options="dirPanelOptions"
                  variant="box"
                  layout="list"
                  class="dir-panel-select"
                  :aria-label="$t('siteDirectory.addTo')"
                />
              </div>
            </div>

            <!-- 分类过滤（热门为跨分类聚合） -->
            <div class="dir-cats" role="tablist">
              <button
                type="button"
                :class="['dir-cat', { active: dirCat === 'hot' }]"
                @click="dirCat = 'hot'"
              >{{ $t('siteDirectory.cats.hot') }}</button>
              <button
                v-for="c in DIRECTORY_CATS"
                :key="c"
                type="button"
                :class="['dir-cat', { active: dirCat === c }]"
                @click="dirCat = c"
              >{{ $t(`siteDirectory.cats.${c}`) }}</button>
            </div>

            <!-- 卡片网格：图标 + 标题 + 描述，点击卡片/添加按钮写入面板 -->
            <ul v-if="dirFiltered.length" class="dir-grid">
              <li v-for="item in dirFiltered" :key="item.slug" class="dir-card">
                <!-- 右上角外链：新窗口打开网站（不触发添加） -->
                <button
                  type="button"
                  class="dir-open"
                  v-tip="$t('siteDirectory.visit')"
                  :aria-label="`${$t('siteDirectory.visit')}：${item.name}`"
                  @click.stop="openExternal(item.url)"
                >
                  <RiExternalLinkLine size="13" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="dir-body"
                  :title="item.url"
                  @click="addDirectorySite(item)"
                >
                  <span class="dir-icon" aria-hidden="true">
                    <span
                      v-if="item.icon.startsWith(THESVG_PREFIX) && dirSvgs[item.icon.slice(THESVG_PREFIX.length)]"
                      class="dir-svg"
                      v-html="dirSvgs[item.icon.slice(THESVG_PREFIX.length)]"
                    />
                    <img
                      v-else-if="item.icon.startsWith('http') && !dirImgFailed[item.slug]"
                      :src="item.icon"
                      alt=""
                      loading="lazy"
                      @error="onDirImgError(item)"
                    />
                    <span v-else class="dir-letter">{{ item.name.slice(0, 1) }}</span>
                  </span>
                  <span class="dir-info">
                    <span class="dir-title">{{ item.name }}</span>
                    <span class="dir-desc">{{ item.desc }}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="dir-add"
                  :class="{ added: isDirAdded(item) }"
                  :disabled="isDirAdded(item)"
                  @click="addDirectorySite(item)"
                >
                  {{ isDirAdded(item) ? $t('siteDirectory.added') : $t('common.add') }}
                </button>
              </li>
            </ul>
            <div v-else class="dir-empty">{{ $t('siteDirectory.empty') }}</div>
          </div>

          <!-- tab: 小组件 -->
          <div v-else-if="activeTab === 'widgets'" class="panel">
            <!-- 卡片网格 -->
            <ul v-if="filteredWidgets.length" class="widget-grid">
              <li v-for="w in filteredWidgets" :key="w.key" class="widget-card">
                <!-- 卡片主体（emoji / 标题 / 描述）→ 点击唤起预览弹窗 -->
                <button class="widget-body" type="button" @click="openWidgetPreview(w)">
                  <div class="widget-head">
                    <div class="widget-icon" aria-hidden="true">
                      <span class="widget-emoji">{{ w.icon }}</span>
                    </div>
                    <div class="widget-info">
                      <div class="widget-title">{{ wTitle(w) }}</div>
                      <div class="widget-desc">{{ wDesc(w) }}</div>
                    </div>
                  </div>
                </button>
                <button class="widget-add" @click="addWidget(w)">
                  <RiAddLine size="14" aria-hidden="true" />
                  <span>{{ $t('common.add') }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
  </BaseDialog>

  <!-- 小组件预览弹窗（公共）：点击 widget 卡片（除「添加」按钮）唤起 -->
  <WidgetPreviewDialog
    v-model:open="previewOpen"
    :widget="previewWidget"
  />
</template>

<style scoped lang="less">
/* 左右结构 */
.modal-body {
  display: flex;
  gap: 18px;
  flex: 1;
  min-height: 0;
}

/* 左侧 tabs */
.tabs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 132px;
  flex-shrink: 0;
  padding: 6px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid color-mix(in srgb, @accent 0.1%, transparent);
  align-self: flex-start;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: @text-soft;
  background: transparent;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
    color: @text;
  }

  &.active {
    background: @accent-soft;
    color: @accent;
    font-weight: 600;
  }
}

.tab-ico {
  flex-shrink: 0;
}

/* 右侧内容 */
.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  /* 重置全局 .content padding（避免被 App.vue 主内容区的
     mobile padding-top: 80px 误命中造成顶部留白过大） */
  padding: 0 !important;
  padding-right: 4px !important;
}

.panel {
  display: flex;
  flex-direction: column;
}

.panel-hint {
  font-size: 12px;
  color: @text-soft;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, @accent 0.06%, transparent);
}

/* 字段 */
.field {
  display: block;
  margin-bottom: 14px;

  span {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: @text-soft;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.6);
    color: @text;
    padding: 10px 14px;
    font-size: 14px;
    transition: border @tr, box-shadow @tr;

    &:focus {
      border-color: @accent;
      box-shadow: 0 0 0 3px color-mix(in srgb, @accent 0.15%, transparent);
    }
  }
}

.icon-row {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
  }
}

.auto-btn {
  border-radius: 12px;
  padding: 0 16px;
  font-size: 13px;
  color: @accent;
  background: @accent-soft;
  transition: background @tr;

  &:hover {
    background: color-mix(in srgb, @accent 0.22%, transparent);
  }
}

/* 图标行：输入 + 自动 + 图标库 */
.lib-btn {
  flex-shrink: 0;

  &.open {
    background: @accent-gradient;
    color: #fff;
  }
}

/* 悬浮面板：一排 8 个 */
.icon-pop {
  position: fixed;
  width: 336px;
  max-height: 330px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  z-index: 10001;
}

.pop-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(31, 41, 55, 0.05);
  flex-shrink: 0;
}

.pop-search-ico {
  color: @text-soft;
  flex-shrink: 0;
}

.pop-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: @text;
  font-size: 13px;
}

.pop-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  overflow-y: auto;
  padding: 2px;
  .thin-scrollbar();
}

.pop-empty {
  text-align: center;
  font-size: 12px;
  color: @text-soft;
  padding: 18px 8px;
}

.preset-opt {
  aspect-ratio: 1;
  border-radius: 10px;
  background: rgba(31, 41, 55, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1.5px solid transparent;
  padding: 6px;
  transition: background @tr, border-color @tr, transform @tr;

  &:hover {
    background: color-mix(in srgb, @accent 0.1%, transparent);
    transform: scale(1.06);
  }

  &.active {
    border-color: @accent;
    background: color-mix(in srgb, @accent 0.12%, transparent);
    box-shadow: 0 0 0 1px @accent;
  }
}

.preset-svg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.preset-fallback {
  font-size: 13px;
  font-weight: 600;
  color: @text-soft;
}

.error {
  color: @danger;
  font-size: 13px;
  margin: 8px 0 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  border-radius: @radius-pill;
  padding: 9px 22px;
  font-size: 14px;
  transition: transform @tr, box-shadow @tr;

  &.ghost {
    background: rgba(31, 41, 55, 0.06);
    color: @text-soft;

    &:hover {
      background: rgba(31, 41, 55, 0.12);
    }
  }

  &.primary {
    color: #fff;
    background: @accent-gradient;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 22px color-mix(in srgb, @accent 0.4%, transparent);
    }
  }
}

/* 卡片网格：自适应（窄了2列，3列，4列……） */
.widget-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.widget-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 12px 14px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: color-mix(in srgb, @accent 0.5%, transparent);
    background: rgba(255, 255, 255, 0.65);
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 0.12%, transparent);
  }
}

/* 卡片主体（可点击唤起预览）:button 重置 + 继承卡片点击区域 */
.widget-body {
  display: block;
  width: 100%;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;

  &:focus-visible {
    outline: 2px solid @accent;
    outline-offset: 4px;
    border-radius: 8px;
  }
}

.widget-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.widget-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: @accent-gradient;
}

.widget-emoji {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.08));
}

.widget-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.widget-title {
  font-size: 14px;
  font-weight: 600;
  color: @text;
  .ellipsis();
}

.widget-desc {
  font-size: 12px;
  color: @text-soft;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.widget-add {
  align-self: flex-end;          /* 右对齐 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: @radius-pill;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: @accent-gradient;
  transition: transform @tr, box-shadow @tr;
  flex-shrink: 0;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, @accent 0.35%, transparent);
  }
}

/* ---------------- 网址导航 ---------------- */
.dir-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.dir-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: @radius-pill;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  transition: border-color @tr, box-shadow @tr;

  &:focus-within {
    border-color: @accent;
    box-shadow: 0 0 0 3px color-mix(in srgb, @accent 0.15%, transparent);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: @text;
    font-size: 13px;
    padding: 9px 0;
  }
}

.dir-search-ico {
  color: @text-soft;
  flex-shrink: 0;
}

.dir-panel-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dir-panel-label {
  font-size: 12px;
  color: @text-soft;
  white-space: nowrap;
}

.dir-panel-select {
  width: 150px;
}

/* 分类胶囊行：单行横向滚动 */
.dir-cats {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
  .thin-scrollbar(transparent, 0px);

  &::-webkit-scrollbar-thumb {
    background: transparent;
  }
}

.dir-cat {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: rgba(31, 41, 55, 0.05);
  transition: background @tr, color @tr;

  &:hover {
    background: color-mix(in srgb, @accent 0.1%, transparent);
    color: @text;
  }

  &.active {
    color: #fff;
    background: @accent-gradient;
    font-weight: 600;
  }
}

.dir-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}

.dir-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: color-mix(in srgb, @accent 0.5%, transparent);
    background: rgba(255, 255, 255, 0.65);
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 0.12%, transparent);
  }
}

/* 右上角外链小按钮 */
.dir-open {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: @text-soft;
  background: transparent;
  opacity: 0.55;
  transition: background @tr, color @tr, opacity @tr;

  &:hover {
    background: color-mix(in srgb, @accent 0.12%, transparent);
    color: @accent;
    opacity: 1;
  }
}

/* 卡片主体：点击即添加 */
.dir-body {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;

  &:focus-visible {
    outline: 2px solid @accent;
    outline-offset: 4px;
    border-radius: 8px;
  }
}

.dir-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid rgba(31, 41, 55, 0.06);
  overflow: hidden;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
}

.dir-svg {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.dir-letter {
  font-size: 16px;
  font-weight: 600;
  color: @text-soft;
}

.dir-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dir-title {
  font-size: 14px;
  font-weight: 600;
  color: @text;
  .ellipsis();
}

.dir-desc {
  font-size: 12px;
  color: @text-soft;
  line-height: 1.4;
  .ellipsis();
}

.dir-add {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 14px;
  border-radius: @radius-pill;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: @accent-gradient;
  transition: transform @tr, box-shadow @tr, background @tr;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, @accent 0.35%, transparent);
  }

  &.added {
    background: rgba(31, 41, 55, 0.08);
    color: @text-soft;
    cursor: default;
  }
}

.dir-empty {
  text-align: center;
  font-size: 13px;
  color: @text-soft;
  padding: 40px 8px;
}
</style>
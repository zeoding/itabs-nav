<script setup>
/**
 * 快捷方式网格
 * - 拖拽排序
 * - 自适应多尺寸（grid-column/row span） * - 右键唤出菜单（编辑/ 调整大小 / 删除） * - 添加按钮固定 1x1
 * - 「编辑主页」模式：右键 add-card 进入，所以site-card 显示删除按钮 + 图标持续抖动（纯 CSS）
 * - 工具卡点击：通过 emit('tool-click', widget) 通知父组件打开 WidgetPreviewDialog
 *   (site.kind ∈ TOOL_KINDS 时,SiteCard 会触发 action 事件;这里把 site 转为 widget 对象转发)
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import SiteCard from '@/views/sites/SiteCard.vue'
import SiteContextMenu from '@/views/sites/SiteContextMenu.vue'
import AddCardMenu from '@/views/sites/AddCardMenu.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { $t } from '@/composables/useI18n'
import { RiAddLine, RiCheckLine, RiFolderLine, RiAddLargeLine } from '@remixicon/vue'

const props = defineProps({
  sites: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  gridColumns: { type: [String, Number], default: 'auto' },
})
const emit = defineEmits(['move', 'edit', 'add', 'remove', 'resize', 'tool-click'])

// 站点很多时分批渲染：初始 120 张，滚动近底部每批追加 60 张
// （索引与源列表一致，拖拽重排不受影响，见 useProgressiveList 注释）
const { visible: visibleSites, sentinelRef: gridSentinel, exhausted: sitesExhausted } =
  useProgressiveList(() => props.sites, { initial: 120, step: 60 })

const dragIndex = ref(null)
const dropIndex = ref(null)

const ctxOpen = ref(false)
const ctxRect = ref(null)
const ctxSite = ref(null)

/** 编辑主页模式（控制删除按钮 + CSS 图标抖动）*/
const editMode = ref(false)
/** add-card 右键菜单 */
const addMenuOpen = ref(false)
const addMenuRect = ref(null)

function onDragStart(index) {
  dragIndex.value = index
}
function onDragOver(index) {
  if (dropIndex.value !== index) dropIndex.value = index
}
function onDrop(index) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    emit('move', dragIndex.value, index)
  }
  dragIndex.value = null
  dropIndex.value = null
}
function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

function onContextMenu({ rect, site }) {
  // 编辑主页模式下，原右键菜单关闭（避免干扰删除按钮)
  if (editMode.value) return
  ctxRect.value = rect
  ctxSite.value = site
  ctxOpen.value = true
}
function closeContext() {
  ctxOpen.value = false
}

/**
 * 工具卡点击：把 site 转成 widget 对象,emit 给父组件打开预览弹窗
 * - 当前唯一支持的工具 kind:'split-text'(SiteCard 已通过 isToolKind 判定后才会触发)
 * - widget 对象结构:{ key, icon, category, kind } 与 SiteEditor.WIDGETS 列表保持一致
 */
function onToolClick(site) {
  const widget = {
    key: site.kind,           // 'split-text'
    icon: site.icon || '✂️',  // 工具卡在 grid 上的 emoji(TOOL_PRESETS 已设置)
    category: 'tool',
    kind: site.kind,
  }
  emit('tool-click', widget)
}

function onCtxEdit(site) {
  emit('edit', site)
}
const { confirm } = useConfirm()

async function onCtxRemove(site) {
  const ok = await confirm({
    title: $t('siteContextMenu.confirmDeleteTitle'),
    message: $t('siteContextMenu.confirmDeleteMessage', { name: site.name }),
    okText: $t('common.delete'),
    cancelText: $t('common.cancel'),
    danger: true,
  })
  if (ok) emit('remove', site)
}
function onCtxResize({ site, size }) {
  emit('resize', { site, size })
}

const gridStyle = () => {
  const base = {}
  if (props.gridColumns !== 'auto') {
    base.gridTemplateColumns = `repeat(${props.gridColumns}, 1fr)`
  }
  // 行高 = 列宽：每个单元格为正方形，6 种尺寸才能显示真实比例
  // （首帧未测量时保持 auto，由内容撑高，RO 挂载后立即校正）
  if (autoRows.value) base.gridAutoRows = `${autoRows.value}px`
  return base
}

/**
 * 方形网格：测量实际列宽写入 grid-auto-rows
 * - 列宽是流式的（auto-fill + minmax(80px,1fr)，或设置里的固定列数），
 *   只有行高跟随列宽，卡片 span 出来的尺寸才与「1x1/2x2」等标注一致
 */
const gridRef = ref(null)
const autoRows = ref(null)
let rowResizeObserver = null

function measureRows() {
  const el = gridRef.value
  if (!el) return
  const cols = getComputedStyle(el)
    .gridTemplateColumns.split(' ')
    .filter(Boolean)
  const w = parseFloat(cols[0])
  if (Number.isFinite(w) && w > 0) autoRows.value = Math.round(w)
}

watch(gridRef, (el, old) => {
  if (old && rowResizeObserver) rowResizeObserver.unobserve(old)
  if (el && rowResizeObserver) {
    rowResizeObserver.observe(el)
    measureRows()
  }
})
// 列数设置变化（auto/4/5/6）会改变列宽，但 grid 元素尺寸不变，RO 不触发，需手动重测
watch(
  () => props.gridColumns,
  () => nextTick(measureRows)
)

/** 根据 size 字符串返回 grid-column / row span */
function spanOf(size) {
  const m = /^(\d+)x(\d+)$/.exec(size || '1x1')
  if (!m) return { col: 1, row: 1 }
  return { row: Number(m[1]), col: Number(m[2]) }
}

/** add-card 右键 */
function onAddContextMenu(e) {
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  addMenuRect.value = rect
  addMenuOpen.value = true
}
/**
 * add-card 左键点击
 * - 编辑模式下：触发退出编辑（不弹添加弹窗）
 * - 普通模式：emit('add') 通知父组件打开添加弹窗
 */
function onAddClick() {
  if (editMode.value) {
    exitEditMode()
    return
  }
  emit('add')
}
function closeAddMenu() {
  addMenuOpen.value = false
}

/** 进入 / 退出编辑主页模式（图标抖动 CSS 持续生效，无需 JS）*/
function toggleEditMode() {
  editMode.value = !editMode.value
}

/**
 * 全局 click：编辑模式下点击空白区域 退出编辑模式
 * - 不在 .site-card 内的空白（add-card 已单独处理）
 * - 触发时机：mousedown 后再 click，所以右键菜单的点击/确认按钮不会被算作「空白点击」 */
function onDocClick(e) {
  if (!editMode.value) return
  const target = e.target
  // 跳过右键菜单 / 确认弹窗里的点击（菜单点击不能退出编辑模式）
  if (target.closest('.ctx-menu, .add-menu, .confirm-mask, .confirm-dialog')) return
  // 跳过 add-card 自身点击（避免与打开菜单等行为冲突）
  if (target.closest('.add-card')) return
  if (target.closest('.site-card')) return
  // 其余情况：空白区域退出编辑模式
  editMode.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  rowResizeObserver = new ResizeObserver(measureRows)
  if (gridRef.value) {
    rowResizeObserver.observe(gridRef.value)
    measureRows()
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
  rowResizeObserver?.disconnect()
})

/** 退出编辑主页模式（点击卡片非删除按钮区域触发） */
function exitEditMode() {
  editMode.value = false
}

/** 单个卡片的删除按钮点击事件 */
/**
 * 卡片右上?× 删除按钮
 * - 「编辑主页」模式：直接删除，无需二次确认（用户已主动进入批量编辑态）
 * - 普通模式（理论上不会调用到这里，但兜底）：走二次确认 */
function onCardRemove(site) {
  if (editMode.value) {
    emit('remove', site)
    return
  }
  // 兜底分支：将来如果非编辑模式也接入此入口，仍然有确认
  confirm({
    title: $t('siteContextMenu.confirmDeleteTitle'),
    message: $t('siteContextMenu.confirmDeleteMessage', { name: site.name }),
    okText: $t('common.delete'),
    cancelText: $t('common.cancel'),
    danger: true,
  }).then((ok) => {
    if (ok) emit('remove', site)
  })
}
</script>

<template>
  <div class="panel-grid-wrap">
    <template v-if="loading">
      <div ref="gridRef" class="panel-grid" :style="gridStyle()">
        <div v-for="n in 8" :key="n" class="skeleton glass"></div>
      </div>
    </template>

    <template v-else-if="sites.length">
      <div ref="gridRef" class="panel-grid" :style="gridStyle()">
        <SiteCard
          v-for="(site, index) in visibleSites"
          :key="site.id"
          :site="site"
          :style="{
            gridColumn: `span ${spanOf(site.size).col}`,
            gridRow: `span ${spanOf(site.size).row}`,
          }"
          :dragging="dragIndex === index"
          :dropping="dropIndex === index"
          :edit-mode="editMode"
          @dragstart="onDragStart(index)"
          @dragover="onDragOver(index)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
          @edit="emit('edit', $event)"
          @remove="onCardRemove"
          @contextmenu="onContextMenu"
          @exit-edit="exitEditMode"
          @action="onToolClick($event)"
        />
        <button
          class="add-card"
          :class="{ 'edit-mode': editMode }"
          v-tip="editMode ? $t('siteGrid.exitEdit') : $t('siteEditor.addTitle')"
          @click="onAddClick"
          @contextmenu="onAddContextMenu"
        >
          <RiCheckLine v-if="editMode" size="28" class="add-icon" aria-hidden="true" />
          <RiAddLine v-else size="28" class="add-icon" aria-hidden="true" />
          <span class="add-label">{{ editMode ? $t('editMode.done') : $t('common.add') }}</span>
        </button>
      </div>
      <!-- 渐进渲染触底哨兵（useProgressiveList，见该文件注释） -->
      <div v-if="!sitesExhausted" ref="gridSentinel" class="grid-sentinel" aria-hidden="true"></div>
    </template>

    <div v-else class="empty glass">
      <div class="empty-icon-wrap">
        <RiFolderLine size="30" aria-hidden="true" />
      </div>
      <h3 class="empty-title">{{ $t('siteGrid.empty') }}</h3>
      <p class="empty-desc">{{ $t('siteGrid.emptyDesc') }}</p>
      <button class="primary-btn" @click="emit('add')">
        <RiAddLargeLine size="16" aria-hidden="true" />
        {{ $t('siteGrid.emptyHint') }}
      </button>
    </div>

    <SiteContextMenu
      :open="ctxOpen"
      :anchor-rect="ctxRect"
      :site="ctxSite"
      @close="closeContext"
      @edit="onCtxEdit"
      @remove="onCtxRemove"
      @resize="onCtxResize"
    />

    <AddCardMenu
      :open="addMenuOpen"
      :anchor-rect="addMenuRect"
      :edit-mode="editMode"
      @close="closeAddMenu"
      @toggle-edit="toggleEditMode"
    />
  </div>
</template>

<style scoped lang="less">
.panel-grid-wrap {
  width: 100%;
  max-width: 1080px;
  margin-top: 28px;
}

/* 渐进渲染触底哨兵：仅占位 1px，供 IntersectionObserver 探测 */
.grid-sentinel {
  height: 1px;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  grid-auto-flow: dense;
  gap: 12px;
  align-items: stretch;
}

.add-card {
  width: 100%;
  aspect-ratio: 1;
  padding: 10px 6px 8px;
  border-radius: 12px;
  background: transparent;
  border: 1px dashed color-mix(in srgb, @accent 0.35%, transparent);
  color: @accent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.18s ease, opacity 0.18s ease;
  user-select: none;

  &:hover {
    border-color: color-mix(in srgb, @accent 0.6%, transparent);
    opacity: 1;

    .add-icon {
      border-color: color-mix(in srgb, @accent 85%, transparent);
    }
  }

  /* 编辑主页模式：add-card 微微发光，提示「当前正处于编辑模式」*/
  &.edit-mode {
    border-color: transparent;

    .add-icon {
      border-color: transparent;
      background: #fff;
      box-shadow: 0 0 0 4px color-mix(in srgb, @accent 0.18%, transparent);
    }

    .add-label {
      color: #fff;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    }
  }

  .add-icon {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    border: 1px dashed color-mix(in srgb, @accent 50%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    line-height: 1;
    font-weight: 200;
    color: @accent;
    background: #fff;
    transition: border-color 0.18s ease;
  }

  .add-label {
    font-size: 11px;
    font-weight: 500;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    line-height: 1.2;
    text-align: center;
  }
}

/* 移动端样式见 src/styles/mobile.less */
.skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.45);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.empty {
  padding: 48px 32px 44px;
  text-align: center;
  border-radius: var(--radius-large);
  color: @text-soft;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-style: dashed;
}

.empty-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: @accent-gradient;
  box-shadow: 0 8px 24px color-mix(in srgb, @accent 0.35%, transparent);
  margin-bottom: 16px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 650;
  color: @text;
  letter-spacing: 0.2px;
}

.empty-desc {
  margin: 0 0 22px;
  font-size: 13px;
  line-height: 1.6;
  color: @text-soft;
  max-width: 420px;
}

.primary-btn {
  border-radius: @radius-pill;
  padding: 10px 24px;
  font-size: 14px;
  color: #fff;
  background: @accent-gradient;
  transition: transform @tr, box-shadow @tr;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 22px color-mix(in srgb, @accent 0.4%, transparent);
  }
}
</style>

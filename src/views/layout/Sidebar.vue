<script setup>
/**
 * 左侧图标栏
 * - 固定按钮：主页/ 设置
 * - 自定义按钮：用户通过"添加"按钮添加（功能等同主页）
 * - 自定义按钮持久化到 IndexedDB（panels store）
 * - 当前激活的 rail 按钮高亮
 * - 右键自定义按钮可弹出编辑/移除菜单
 */
import { ref, onMounted, onBeforeUnmount, computed, markRaw } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { $t } from '@/composables/useI18n'
import BaseDialog from '@/components/BaseDialog.vue'
import {
  RiHomeLine,
  RiStarLine,
  RiBookLine,
  RiBriefcaseLine,
  RiPaletteLine,
  RiMusic2Line,
  RiGamepadLine,
  RiLightbulbLine,
  RiShoppingCartLine,
  RiPlaneLine,
  RiRestaurantLine,
  RiFootballLine,
  RiFolderLine,
  RiAddLine,
  RiSettingsLine,
  RiEditLine,
  RiDeleteBinLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
} from '@remixicon/vue'

/** 图标??RemixIcon 组件的查找表（markRaw 避免被响应式包装?*/
const ICONS = markRaw({
  RiHomeLine,
  RiStarLine,
  RiBookLine,
  RiBriefcaseLine,
  RiPaletteLine,
  RiMusic2Line,
  RiGamepadLine,
  RiLightbulbLine,
  RiShoppingCartLine,
  RiPlaneLine,
  RiRestaurantLine,
  RiFootballLine,
  RiFolderLine,
  RiAddLine,
  RiSettingsLine,
  RiEditLine,
  RiDeleteBinLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
})

/** 安全获取组件：未识别数据（emoji 字符串）一律回退?RiFolderLine */
function resolveIcon(name) {
  return ICONS[name] || RiFolderLine
}

import { usePanelsStore } from '@/stores/panels'
import { useUiStore } from '@/stores/ui'
import { storeToRefs } from 'pinia'

defineProps({
  active: { type: String, default: 'home' },
})
const emit = defineEmits(['open-settings', 'select', 'update:custom', 'panel-deleted', 'update:collapsed'])
const { confirm } = useConfirm()

/** 收起状态：走 ui store（IndexedDB 持久化，默认展开） */
const uiStore = useUiStore()
const { sidebarCollapsed: collapsed } = storeToRefs(uiStore)
const { toggleSidebarCollapsed } = uiStore
function toggleCollapsed() {
  toggleSidebarCollapsed()
  emit('update:collapsed', collapsed.value)
}

/** 自定义面板：走统一 store，与 App.vue 的 panelOrder 同源 */
const panelsStore = usePanelsStore()
const { customPanels: customItems } = storeToRefs(panelsStore)
const { setCustomPanels } = panelsStore

const addOpen = ref(false)
const editOpen = ref(false)
const editingItem = ref(null) // {id, icon, title}
const newIcon = ref('RiFolderLine')
const newTitle = ref('')
const ctxMenu = ref(null) // { x, y, item }

function saveCustom() {
  setCustomPanels([...customItems.value])
  emit('update:custom', customItems.value)
}

onMounted(() => {
  emit('update:custom', customItems.value)
  emit('update:collapsed', collapsed.value)
})

// 固定项+ 自定义项
const allItems = computed(() => [
  { key: 'home', icon: 'RiHomeLine', title: $t('sidebar.home'), fixed: true },
  ...customItems.value.map((c) => ({
    key: c.id,
    icon: c.icon,
    title: c.title,
    removable: true,
  })),
])

function onClick(item) {
  if (item.key === 'settings') {
    emit('open-settings')
  } else {
    emit('select', item.key)
  }
}

function openAdd() {
  addOpen.value = true
  newIcon.value = 'RiFolderLine'
  newTitle.value = ''
}
function commitAdd() {
  const title = newTitle.value.trim()
  if (!title) return
  const id = 'c' + Date.now()
  customItems.value.push({
    id,
    icon: newIcon.value || 'RiFolderLine',
    title,
  })
  saveCustom()
  addOpen.value = false
}
function cancelAdd() {
  addOpen.value = false
}
function cancelEdit() {
  editOpen.value = false
}

/* ESC关闭由 BaseDialog 内部 useEscapeClose 统一处理 */

function onContextMenu(item, e) {
  if (!item.removable) return
  e.preventDefault()
  ctxMenu.value = {
    x: e.clientX,
    y: e.clientY,
    item: { ...item },
  }
}
function closeCtx() {
  ctxMenu.value = null
}
function editFromCtx() {
  if (!ctxMenu.value) return
  const it = ctxMenu.value.item
  editingItem.value = { id: it.key, icon: it.icon, title: it.title }
  editOpen.value = true
  closeCtx()
}
function commitEdit() {
  if (!editingItem.value) return
  const { id, icon, title } = editingItem.value
  const t = title.trim()
  if (!t) return
  const idx = customItems.value.findIndex((c) => c.id === id)
  if (idx >= 0) {
    customItems.value[idx] = { id, icon: icon || 'RiFolderLine', title: t }
    saveCustom()
  }
  editOpen.value = false
  editingItem.value = null
}
async function removeFromCtx() {
  if (!ctxMenu.value) return
  const item = ctxMenu.value.item
  const ok = await confirm({
    title: $t('sidebar.removeTitle'),
    message: $t('sidebar.removeMessage', { title: item.title }),
    okText: $t('sidebar.removeOk'),
    danger: true,
  })
  if (!ok) return
  const removedKey = item.key
  customItems.value = customItems.value.filter((c) => c.id !== removedKey)
  saveCustom()
  emit('panel-deleted', removedKey)
  closeCtx()
}

/** 点击其它地方关闭右键菜单 */
function onDocClick(e) {
  if (!ctxMenu.value) return
  const menu = document.querySelector('.ctx-menu')
  if (menu && !menu.contains(e.target)) closeCtx()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
})

const iconPresets = [
  'RiFolderLine',
  'RiStarLine',
  'RiBookLine',
  'RiBriefcaseLine',
  'RiPaletteLine',
  'RiMusic2Line',
  'RiGamepadLine',
  'RiLightbulbLine',
  'RiShoppingCartLine',
  'RiPlaneLine',
  'RiRestaurantLine',
  'RiFootballLine',
]
</script>

<template>
  <div class="sidebar-wrap">
  <aside class="sidebar nav" :class="{ 'is-collapsed': collapsed }" @contextmenu.prevent>
    <button
      v-for="item in allItems"
      :key="item.key"
      :class="['rail-btn', { active: item.key !== 'settings' && active === item.key }]"
      v-tip="item.title"
      @click="onClick(item)"
      @contextmenu="onContextMenu(item, $event)"
    >
      <component :is="resolveIcon(item.icon)" size="22" class="rail-icon" aria-hidden="true" />
    </button>
    <button
      class="rail-btn rail-add"
      v-tip="$t('sidebar.addPanelTitle')"
      :aria-label="$t('sidebar.addPanelTitle')"
      @click="openAdd"
    >
      <RiAddLine size="22" class="rail-icon" aria-hidden="true" />
    </button>
    <button
      class="rail-btn"
      v-tip="$t('sidebar.settings')"
      :aria-label="$t('sidebar.settings')"
      @click="emit('open-settings')"
    >
      <RiSettingsLine size="22" class="rail-icon" aria-hidden="true" />
    </button>
    <button
      class="rail-btn collapse-btn"
      v-tip="$t('sidebar.collapse')"
      :aria-label="$t('sidebar.collapse')"
      @click="toggleCollapsed"
    >
      <RiSidebarFoldLine size="22" class="rail-icon" aria-hidden="true" />
    </button>

    <!-- 添加对话框 -->
    <BaseDialog
      :open="addOpen"
      :title="$t('sidebar.addPanelTitle')"
      width="min(360px, 92vw)"
      padding="24px 26px"
      :fullscreenable="false"
      @close="cancelAdd"
    >
      <div class="add-dialog-body">
        <p class="add-hint">{{ $t('sidebar.addPanelHint') }}</p>
        <div class="field">
          <label>{{ $t('sidebar.fieldIcon') }}</label>
          <div class="icon-picker">
            <button
              v-for="ic in iconPresets"
              :key="ic"
              :class="['icon-opt', { active: newIcon === ic }]"
              v-tip="ic"
              @click="newIcon = ic"
            >
              <component :is="resolveIcon(ic)" size="20" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="field">
          <label>{{ $t('sidebar.fieldName') }}</label>
          <input
            v-model="newTitle"
            class="text-input"
            :placeholder="$t('sidebar.namePlaceholderAdd')"
            maxlength="12"
            @keyup.enter="commitAdd"
          />
        </div>
        <div class="add-actions">
          <button class="btn-cancel" @click="cancelAdd">{{ $t('common.cancel') }}</button>
          <button class="btn-ok" @click="commitAdd">{{ $t('common.add') }}</button>
        </div>
      </div>
    </BaseDialog>

    <!-- 编辑对话框 -->
    <BaseDialog
      :open="editOpen && !!editingItem"
      :title="$t('sidebar.editPanelTitle')"
      width="min(360px, 92vw)"
      padding="24px 26px"
      :fullscreenable="false"
      @close="cancelEdit"
    >
      <div class="add-dialog-body">
        <p class="add-hint">{{ $t('sidebar.editPanelHint') }}</p>
        <div class="field">
          <label>{{ $t('sidebar.fieldIcon') }}</label>
          <div class="icon-picker">
            <button
              v-for="ic in iconPresets"
              :key="ic"
              :class="['icon-opt', { active: editingItem.icon === ic }]"
              v-tip="ic"
              @click="editingItem.icon = ic"
            >
              <component :is="resolveIcon(ic)" size="20" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="field">
          <label>{{ $t('sidebar.fieldName') }}</label>
          <input
            v-model="editingItem.title"
            class="text-input"
            :placeholder="$t('sidebar.namePlaceholderEdit')"
            maxlength="12"
            @keyup.enter="commitEdit"
          />
        </div>
        <div class="add-actions">
          <button class="btn-cancel" @click="cancelEdit">{{ $t('common.cancel') }}</button>
          <button class="btn-ok" @click="commitEdit">{{ $t('common.save') }}</button>
        </div>
      </div>
    </BaseDialog>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div
          v-if="ctxMenu"
          class="ctx-menu glass"
          :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
          @click.stop
        >
          <button class="ctx-item" @click="editFromCtx">
            <RiEditLine size="16" class="ctx-icon" aria-hidden="true" /> {{ $t('contextMenu.edit') }}
          </button>
          <button class="ctx-item danger" @click="removeFromCtx">
            <RiDeleteBinLine size="16" class="ctx-icon" aria-hidden="true" /> {{ $t('contextMenu.remove') }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </aside>
  <button
    v-if="collapsed"
    class="sidebar-expand"
    v-tip="$t('sidebar.expand')"
    :aria-label="$t('sidebar.expand')"
    @click="toggleCollapsed"
  >
    <RiSidebarUnfoldLine size="20" aria-hidden="true" />
  </button>
  </div>
</template>

<style scoped lang="less">
.sidebar {
  position: fixed;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 32px rgba(31, 41, 55, 0.08);
  max-height: 80vh;
  overflow-y: auto;
  /* 对齐 search-bar：默认更淡，悬浮/聚焦加深 */
  transition: transform 0.28s ease, opacity 0.28s ease, background 0.25s ease;

  &:hover,
  &:focus-within {
    background: rgba(255, 255, 255, 0.92);
  }

  /* 收起：整体左滑淡出 */
  &.is-collapsed {
    transform: translateX(-140%) translateY(-50%);
    opacity: 0;
    pointer-events: none;
  }
}

/* 展开悬浮钮：贴左边缘的竖向小 tab */
.sidebar-expand {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 26px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 12px 12px 0;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-left: none;
  box-shadow: 4px 4px 16px rgba(31, 41, 55, 0.1);
  color: @text-soft;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, width 0.18s ease;
  animation: expand-in 0.28s ease;

  &:hover {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
    width: 32px;
  }
}

@keyframes expand-in {
  from {
    transform: translateX(-100%) translateY(-50%);
    opacity: 0;
  }
  to {
    transform: translateX(0) translateY(-50%);
    opacity: 1;
  }
}

.rail-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 18px;
  color: @text-soft;
  position: relative;
  transition: background @tr, color @tr, transform @tr, box-shadow 0.28s ease;
  flex-shrink: 0;

  /* 选中背景独立成层：靠 opacity + scale 做淡入展开过渡 */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    opacity: 0;
    transform: scale(0.5);
    transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1.2);
    pointer-events: none;
  }

  /* 图标浮在背景层之上 */
  > * {
    position: relative;
    z-index: 1;
  }

  &.rail-add {
    /* 与普通 rail-btn 一致：默认无背景、灰色图标；
       与 :hover 同特异度但定义在前，hover 反馈仍由下方 :hover 接管 */
    background: transparent;
    color: @text-soft;
    font-size: 20px;
    font-weight: 300;
  }

  &:hover {
    background: @accent-soft;
    color: @accent;
    transform: scale(1.05);
  }

  &.active {
    color: #fff;
    transform: scale(1.05);
    box-shadow: 0 4px 16px color-mix(in srgb, @accent 45%, transparent);

    &::after {
      opacity: 1;
      transform: scale(1);
    }
  }
}

/* 添加/编辑对话框（基于 BaseDialog，容器由 BaseDialog 提供）
   此处只定义内容层（.add-dialog-body）及其内部子元素的样式 */
.add-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.add-hint {
  margin: 0;
  font-size: 12px;
  color: @text-soft;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 12px;
    color: @text-soft;
  }
}

.icon-picker {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.icon-opt {
  height: 36px;
  border-radius: 8px;
  font-size: 18px;
  background: rgba(31, 41, 55, 0.04);
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
  }

  &.active {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
  }
}

.text-input {
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 9px 12px;
  font-size: 13px;

  &:focus {
    border-color: @accent;
    outline: none;
  }
}

.add-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-cancel,
.btn-ok {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  font-size: 13px;
  transition: opacity 0.15s ease;
}

.btn-cancel {
  background: rgba(31, 41, 55, 0.06);
  color: @text-soft;

  &:hover {
    background: rgba(31, 41, 55, 0.12);
  }
}

.btn-ok {
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
}

/* 右键菜单 */
.ctx-menu {
  position: fixed;
  z-index: 10001;
  min-width: 140px;
  padding: 4px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 8px 32px rgba(31, 41, 55, 0.18);
  font-size: 13px;
  color: @text;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  text-align: left;
  background: transparent;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.1%, transparent);
    color: @accent;
  }

  &.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.ctx-icon {
  flex-shrink: 0;
  display: inline-flex;
}
</style>

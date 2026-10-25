<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useTodosStore } from '@/stores/todos'
import BaseDialog from '@/components/BaseDialog.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useI18n, $t } from '@/composables/useI18n'
import {
  RiCloseLine,
  RiCheckLine,
  RiLoopLeftLine,
  RiDeleteBinLine,
  RiAddLine,
  RiDragMoveLine,
} from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const { confirm } = useConfirm()
const { lang } = useI18n()

const todosStore = useTodosStore()
const { todos, deleted, remaining, doneCount, deletedCount } = storeToRefs(todosStore)
const {
  load,
  add,
  toggle,
  update,
  remove,
  restore,
  purge,
  removeMany,
  restoreMany,
  purgeMany,
  reorder,
  toggleMany,
} = todosStore

const tab = ref('undone') // 'undone' | 'done' | 'recycle'
const input = ref('')
const editingId = ref(null)
const editingText = ref('')

const selectedIds = ref(new Set())   

const currentList = computed(() => {
  if (tab.value === 'recycle') return deleted.value
  if (tab.value === 'done') return todos.value.filter((t) => t.done)
  return todos.value.filter((t) => !t.done)
})

// 待办可能长期积累（含回收站）：分批渲染，初始 100 条、触底每批 60 条
// （切片保序，idx 与源列表一致，拖拽重排不受影响，见 useProgressiveList 注释）
const { visible: visibleTodos, sentinelRef: todoSentinel, exhausted: todosExhausted } =
  useProgressiveList(() => currentList.value, { initial: 100, step: 60 })

/** 切换某项选择 */
function toggleSelect(id) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

/** 当前列表是否全选*/
const isAllSelected = computed(() => {
  if (currentList.value.length === 0) return false
  return currentList.value.every((t) => selectedIds.value.has(t.id))
})

/** 当前选中的数量（基于当前 tab页*/
const currentSelectedCount = computed(() => {
  return currentList.value.filter((t) => selectedIds.value.has(t.id)).length
})

/** 全选/取消全选 */
function toggleSelectAll() {
  if (currentList.value.length === 0) return
  if (isAllSelected.value) {
    // 取消当前 tab 全部
    currentList.value.forEach((t) => selectedIds.value.delete(t.id))
  } else {
    // 选中当前 tab 全部
    currentList.value.forEach((t) => selectedIds.value.add(t.id))
  }
}

/** 反选：当前 tab 中选中的变未选、未选的变选中 */
function invertSelection() {
  currentList.value.forEach((t) => {
    if (selectedIds.value.has(t.id)) {
      selectedIds.value.delete(t.id)
    } else {
      selectedIds.value.add(t.id)
    }
  })
  selectedIds.value = new Set(selectedIds.value)
}

/** 切换 tab 时清空选择 */
function switchTab(t) {
  if (tab.value === t) return
  tab.value = t
  selectedIds.value = new Set()
  draggingId.value = null
}

/* 滑动指示条：选中背景跟着滑到当前 tab（量按钮位置驱动） */
const tabsRef = ref(null)
const pillStyle = ref({ left: '0px', width: '0px', opacity: 0 })
const TAB_KEYS = ['undone', 'done', 'recycle']
function movePill() {
  const root = tabsRef.value
  if (!root || !props.open) return
  const btn = root.querySelectorAll('.tab')[TAB_KEYS.indexOf(tab.value)]
  if (!btn || !btn.offsetWidth) return
  pillStyle.value = { left: `${btn.offsetLeft}px`, width: `${btn.offsetWidth}px`, opacity: 1 }
}
watch(
  [() => props.open, tab, lang, remaining, doneCount, deletedCount],
  async () => {
    await nextTick()
    movePill()
  },
  // immediate：配合「首次打开才挂载」门控，挂载时即为 open=true 也要量算一次，
  // 否则首次打开指示条停留在初始透明态（选中 tab 无背景）
  { immediate: true }
)
function onWinResize() {
  movePill()
}
onMounted(() => {
  window.addEventListener('resize', onWinResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWinResize)
})

const draggingId = ref(null)        // 当前正在被拖动的项 id
const dragOverId = ref(null)        // 当前 dragover 的目标项 id
let dragStartIndex = -1

function onDragStart(e, t) {
  // 编辑中、回收站、已完成 tab 不允许拖动?  
  if (
    editingId.value === t.id ||
    tab.value === 'recycle' ||
    tab.value === 'done'
  ) {
    e.preventDefault()
    return
  }
  draggingId.value = t.id
  dragStartIndex = currentList.value.findIndex((x) => x.id === t.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(e, t) {
  if (tab.value !== 'undone') return
  if (!draggingId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverId.value = t.id
}

function onDragLeave(t) {
  // 仅当真正离开该行时清除（防止子节点切换导致闪烁）
  if (dragOverId.value === t.id) dragOverId.value = null
}

async function onDrop(e, t) {
  if (tab.value !== 'undone') return
  e.preventDefault()
  const sourceId = draggingId.value
  dragOverId.value = null
  draggingId.value = null
  if (!sourceId || sourceId === t.id) return

  // 只对未完成子序列做重排；保持已完成子序列的相对顺序不动
  const undoneList = [...currentList.value]
  const fromIdx = undoneList.findIndex((x) => x.id === sourceId)
  const toIdx = undoneList.findIndex((x) => x.id === t.id)
  if (fromIdx < 0 || toIdx < 0) return
  const [moved] = undoneList.splice(fromIdx, 1)
  undoneList.splice(toIdx, 0, moved)

  const doneList = todos.value.filter((x) => x.done)
  const merged = [...undoneList, ...doneList]  // 未完成在前，已完成在后
  // 立即更新本地视图，避免等待持久化导致的视觉延迟
  todos.value = merged
  try {
    await reorder(merged)
  } catch (err) {
    console.error('[TodoDialog] reorder failed', err)
    await load()
  }
}

function onDragEnd() {
  draggingId.value = null
  dragOverId.value = null
  dragStartIndex = -1
}

/* ============================================================
   批量操作（按当前 tab 自动分发）   ============================================================ */

/** 当前选中项的 id 数组（按当前列表顺序）*/
const selectedIdList = computed(() =>
  currentList.value
    .filter((t) => selectedIds.value.has(t.id))
    .map((t) => t.id)
)

/** 待办 tab：标记选中项为已完成 */
async function batchMarkDone() {
  if (currentSelectedCount.value === 0) return
  await toggleMany(selectedIdList.value, true)
  exitSelection()
}

/** 待办 tab：标记选中项为未完成 */
async function batchMarkUndone() {
  if (currentSelectedCount.value === 0) return
  await toggleMany(selectedIdList.value, false)
  exitSelection()
}

/** 待办 tab：批量移到回收站 */
async function batchRemove() {
  if (currentSelectedCount.value === 0) return
  await removeMany(selectedIdList.value)
  exitSelection()
}

/** 回收站tab：批量恢复*/
async function batchRestore() {
  if (currentSelectedCount.value === 0) return
  await restoreMany(selectedIdList.value)
  exitSelection()
}

/** 回收站tab：批量彻底删除*/
async function batchPurge() {
  if (currentSelectedCount.value === 0) return
  const ok = await confirm({
    title: $t('common.purge'),
    message: $t('todo.purgeMessage', { n: currentSelectedCount.value }),
    okText: $t('common.purge'),
    cancelText: $t('common.cancel'),
    danger: true,
  })
  if (!ok) return
  await purgeMany(selectedIdList.value)
  exitSelection()
}

/** 退出选中：清空选中集合 */
function exitSelection() {
  selectedIds.value = new Set()
}

async function doAdd() {
  const text = input.value.trim()
  if (!text) return
  await add(text)
  input.value = ''
}

function startEdit(t) {
  editingId.value = t.id
  editingText.value = t.text
}
async function commitEdit() {
  if (editingId.value == null) return
  const text = editingText.value.trim()
  if (!text) {
    await remove(editingId.value)
  } else {
    await update(editingId.value, { text })
  }
  editingId.value = null
  editingText.value = ''
}

function close() {
  emit('update:open', false)
}

// 弹窗打开时刷新；immediate 兼容「首次打开才挂载」门控下挂载即打开的场景
// （启动期的列表数据由 WidgetsBar 的 loadTodos 负责，这里无需再兜底）
watch(
  () => props.open,
  (v) => {
    if (v) load()
  },
  { immediate: true }
)

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return $t('todo.time.justNow')
  if (min < 60) return $t('todo.time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return $t('todo.time.hoursAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 30) return $t('todo.time.daysAgo', { n: day })
  return new Date(ts).toLocaleDateString(lang.value === 'en' ? 'en-US' : 'zh-CN')
}
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('todo.title')"
    max-height="86vh"
    padding="24px 26px"
    @close="close"
  >
    <template #default="{ fullscreen }">
      <div class="todo-root" :class="{ 'is-fullscreen': fullscreen }">
        <!-- Tabs：未完成 / 已完成/ 回收成-->
        <div class="tabs" ref="tabsRef">
          <span class="tab-pill" :style="pillStyle" aria-hidden="true"></span>
          <button
            :class="['tab', { active: tab === 'undone' }]"
            @click="switchTab('undone')"
          >
            {{ $t('todo.tabs.undone') }}
            <span v-if="remaining" class="tab-badge">{{ remaining }}</span>
          </button>
          <button
            :class="['tab', { active: tab === 'done' }]"
            @click="switchTab('done')"
          >
            {{ $t('todo.tabs.done') }}
            <span v-if="doneCount" class="tab-badge muted">{{ doneCount }}</span>
          </button>
          <button
            :class="['tab', { active: tab === 'recycle' }]"
            @click="switchTab('recycle')"
          >
            {{ $t('todo.tabs.trash') }}
            <span v-if="deletedCount" class="tab-badge muted">{{ deletedCount }}</span>
          </button>
        </div>

        <!-- 全选/ 反选/ 批量操作工具-->
        <div v-if="currentList.length > 0" class="batch-toolbar">
          <div class="batch-check" @click="toggleSelectAll">
            <input
              type="checkbox"
              :checked="isAllSelected"
              :indeterminate.prop="!isAllSelected && currentSelectedCount > 0"
              @click.stop="toggleSelectAll"
            />
            <span class="box"></span>
            <span>{{ $t('todo.batchSelectAll') }}</span>
          </div>
          <button class="batch-link" @click="invertSelection">
            {{ $t('todo.batchInvert') }}
          </button>
          <span class="batch-hint">
            <template v-if="isAllSelected">{{ $t('todo.allSelected') }}</template>
            <template v-else-if="currentSelectedCount > 0">
              {{ $t('todo.selectedCount', { n: currentSelectedCount }) }}
            </template>
            <template v-else>{{ $t('todo.noneSelected') }}</template>
          </span>

          <!-- 右侧批量操作按钮 -->
          <div class="batch-actions">
            <template v-if="tab === 'undone'">
              <button
                class="batch-btn"
                :disabled="currentSelectedCount === 0"
                v-tip="$t('todo.batchComplete')"
                @click="batchMarkDone"
              >
                <RiCheckLine size="14" aria-hidden="true" /> {{ $t('todo.batchComplete') }}
              </button>
              <button
                class="batch-btn danger"
                :disabled="currentSelectedCount === 0"
                @click="batchRemove"
                v-tip="$t('todo.moveToTrash')"
              >
                <RiDeleteBinLine size="14" aria-hidden="true" /> {{ $t('common.delete') }}
              </button>
            </template>
            <template v-else-if="tab === 'done'">
              <button
                class="batch-btn subtle"
                :disabled="currentSelectedCount === 0"
                @click="batchMarkUndone"
                v-tip="$t('todo.batchUncomplete')"
              >
                <RiLoopLeftLine size="14" aria-hidden="true" /> {{ $t('todo.batchUncomplete') }}
              </button>
              <button
                class="batch-btn danger"
                :disabled="currentSelectedCount === 0"
                @click="batchRemove"
                v-tip="$t('todo.moveToTrash')"
              >
                <RiDeleteBinLine size="14" aria-hidden="true" /> {{ $t('common.delete') }}
              </button>
            </template>
            <template v-else>
              <button
                class="batch-btn"
                :disabled="currentSelectedCount === 0"
                @click="batchRestore"
                v-tip="$t('common.restore')"
              >
                <RiLoopLeftLine size="14" aria-hidden="true" /> {{ $t('todo.batchRestore') }}
              </button>
              <button
                class="batch-btn danger"
                :disabled="currentSelectedCount === 0"
                @click="batchPurge"
                v-tip="$t('common.purge')"
              >
                <RiDeleteBinLine size="14" aria-hidden="true" /> {{ $t('todo.batchPurge') }}
              </button>
            </template>
          </div>
        </div>

        <!-- 待办视图（未完成 / 已完成/ 回收站） -->
        <template v-if="tab === 'undone' || tab === 'done'">
          <form v-if="tab === 'undone'" class="add-row" @submit.prevent="doAdd">
            <input
              v-model="input"
              class="todo-input"
              :placeholder="$t('todo.placeholder')"
              maxlength="100"
            />
            <button type="submit" class="add-btn" :aria-label="$t('common.add')">
            <RiAddLine size="16" aria-hidden="true" />
          </button>
          </form>

          <div v-if="todos.length === 0" class="empty">{{ $t('todo.empty') }}</div>
          <div v-else-if="currentList.length === 0" class="empty">
            {{ tab === 'done' ? $t('todo.emptyDone') : $t('todo.emptyUndone') }}
          </div>
          <ul v-else class="todo-list">
            <li
              v-for="(todo, idx) in visibleTodos"
              :key="todo.id"
              :class="[
                'todo-item',
                {
                  done: todo.done,
                  selected: selectedIds.has(todo.id),
                  dragging: draggingId === todo.id,
                  'drop-before': dragOverId === todo.id && draggingId && draggingId !== todo.id && idx < dragStartIndex,
                  'drop-after': dragOverId === todo.id && draggingId && draggingId !== todo.id && idx > dragStartIndex,
                },
              ]"
              :draggable="editingId !== todo.id"
              @click="toggleSelect(todo.id)"
              @dragstart="onDragStart($event, todo)"
              @dragover="onDragOver($event, todo)"
              @dragleave="onDragLeave(todo)"
              @drop="onDrop($event, todo)"
              @dragend="onDragEnd"
            >
              <!-- 完成按钮（自定义，无需 input-->
              <button
                class="check-btn"
                :class="{ checked: todo.done }"
                @click.stop="toggle(todo.id)"
                v-tip="todo.done ? $t('todo.batchUncomplete') : $t('todo.batchComplete')"
              >
                <RiCheckLine v-if="todo.done" size="12" class="check-mark" aria-hidden="true" />
              </button>
              <input
                v-if="editingId === todo.id"
                v-model="editingText"
                class="edit-input"
                @keyup.enter="commitEdit"
                @blur="commitEdit"
                v-focus
              />
              <span
                v-else
                class="text"
                @dblclick.stop="startEdit(todo)"
                v-tip="$t('todo.dblClickEdit')"
              >{{ todo.text }}</span>
              <span
                v-if="editingId !== todo.id && tab === 'undone'"
                class="drag-handle"
                v-tip="$t('todo.dragToReorder')"
                aria-hidden="true"
              >
                <RiDragMoveLine size="16" />
              </span>
              <button
                class="del-btn"
                @click.stop="remove(todo.id)"
                v-tip="$t('todo.moveToTrash')"
                :aria-label="$t('todo.moveToTrash')"
              >
                <RiCloseLine size="14" aria-hidden="true" />
              </button>
            </li>
            <!-- 渐进渲染触底哨兵（useProgressiveList，见该文件注释） -->
            <li v-if="!todosExhausted" ref="todoSentinel" class="todo-more" aria-hidden="true"></li>
          </ul>

          <footer class="dialog-footer">
            <span>
              <template v-if="tab === 'undone'">{{ $t('todo.pendingCount', { n: remaining }) }}</template>
              <template v-else>{{ $t('todo.doneCount', { n: doneCount }) }}</template>
            </span>
          </footer>
        </template>

        <!-- 回收站视图-->
        <template v-else>
          <div v-if="deleted.length === 0" class="empty">{{ $t('todo.emptyTrash') }}</div>
          <ul v-else class="todo-list">
            <li
              v-for="todo in deleted"
              :key="todo.id"
              :class="['todo-item deleted', { selected: selectedIds.has(todo.id) }]"
              @click="toggleSelect(todo.id)"
            >
              <span class="trash-icon">
                <RiDeleteBinLine size="16" aria-hidden="true" />
              </span>
              <span class="text deleted-text" v-tip="todo.text">{{ todo.text }}</span>
              <span class="deleted-time">{{ relativeTime(todo.deletedAt) }}</span>
              <div class="recycle-actions">
                <button class="restore-btn" @click.stop="restore(todo.id)" v-tip="$t('common.restore')" :aria-label="$t('common.restore')">
                  <RiLoopLeftLine size="14" aria-hidden="true" />
                </button>
                <button class="del-btn" @click.stop="purge(todo.id)" v-tip="$t('common.purge')" :aria-label="$t('common.purge')">
                  <RiDeleteBinLine size="14" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>

          <footer class="dialog-footer">
            <span>{{ $t('todo.trashCount', { n: deletedCount }) }}</span>
          </footer>
        </template>
      </div>
    </template>
  </BaseDialog>
</template>

<script>
export default {
  directives: {
    focus: {
      mounted(el) {
        el.focus()
        el.select?.()
      },
    },
  },
}
</script>

<style scoped lang="less">
/* 内容根：承接原 .dialog 的纵向 flex（全屏类改挂此处，容器已收归 BaseDialog） */
.todo-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Tabs */
.tabs {
  position: relative;
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, @accent 0.1%, transparent);
}

/* 滑动指示条：绝对定位跟随选中 tab，left/width 过渡 */
.tab-pill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 8px 8px 0 0;
  background: @accent-soft;
  transition: left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
              width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.2s ease;
  pointer-events: none;
}

.tab {
  padding: 8px 14px;
  font-size: 13px;
  color: @text-soft;
  background: transparent;
  border-radius: 8px 8px 0 0;
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s ease, background 0.15s ease;

  &:hover {
    color: @text;
  }

  &.active {
    color: @accent;
    background: transparent;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: @accent;
      border-radius: 2px;
    }
  }
}

.tab-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: @radius-pill;
  background: @accent;
  color: #fff;
  font-weight: 600;
  min-width: 18px;
  text-align: center;

  &.muted {
    background: color-mix(in srgb, @accent 0.15%, transparent);
    color: @accent;
  }
}

/* 全选/ 反选/ 批量操作工具 */
.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  margin-bottom: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.batch-check {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: @text;
  font-weight: 500;
  cursor: pointer;
  user-select: none;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  .box {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1.5px solid @text-soft;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    background: transparent;
  }

  input:checked + .box {
    background: @accent;
    border-color: @accent;

    &::after {
      content: '';
      width: 4px;
      height: 8px;
      border-right: 2px solid #fff;
      border-bottom: 2px solid #fff;
      transform: rotate(45deg) translate(-1px, -1px);
    }
  }
}

.batch-hint {
  font-size: 11px;
  color: @text-soft;
  font-weight: 500;
  margin-left: 4px;
}

.batch-link {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  background: transparent;
  color: @text-soft;
  border: 1px solid rgba(31, 41, 55, 0.1);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(31, 41, 55, 0.06);
    color: @text;
    border-color: rgba(31, 41, 55, 0.18);
  }
}

/* 右侧批量操作按钮*/
.batch-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;        /* 把批量按钮推到工具栏最右端 */
  padding-left: 8px;
  border-left: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
}

.batch-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, @accent 18%, transparent);
  color: @accent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, @accent 32%, transparent);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px color-mix(in srgb, @accent 18%, transparent);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: color-mix(in srgb, @accent 6%, transparent);
    color: @text-soft;
  }

  /* 副样式：标记未完成用更轻的样式与"标记完成"区分（仍跟随主题色，但浓度更低） */
  &.subtle {
    background: color-mix(in srgb, @accent 6%, transparent);
    color: color-mix(in srgb, @accent 70%, @text-soft);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, @accent 14%, transparent);
      color: @accent;
      box-shadow: 0 2px 6px color-mix(in srgb, @accent 10%, transparent);
    }
  }

  &.danger {
    background: fade(@danger, 12%);
    color: @danger;

    &:hover:not(:disabled) {
      background: fade(@danger, 22%);
      box-shadow: 0 2px 8px fade(@danger, 20%);
    }
  }
}

.batch-hint-sub {
  color: @text-soft;
  font-weight: 400;
  margin-left: 2px;
  font-size: 10px;
}

/* 选中态的 todo-item */
.todo-item.selected {
  background: color-mix(in srgb, @accent 0.12%, transparent);
  border-color: transparent;
  box-shadow: 0 0 0 1.5px @accent;
}

.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.todo-input {
  flex: 1;
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 10px 14px;
  font-size: 13px;

  &:focus {
    border-color: @accent;
    outline: none;
  }
}

.add-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  font-size: 18px;
  color: #fff;
  background: @accent-gradient;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty {
  text-align: center;
  padding: 36px 12px;
  color: @text-soft;
  font-size: 13px;
}

.todo-list {
  list-style: none;
  padding: 4px 6px 4px 4px;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 200px;
  max-height: 60vh;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 10px;
  align-content: start;
  /* 渐进渲染触底哨兵：跨双列占 1px，供 IntersectionObserver 探测 */
  .todo-more {
    grid-column: 1 / -1;
    height: 1px;
  }
  /* 自定义滚动条：细而优化 */
  scrollbar-color: color-mix(in srgb, @accent 0.4%, transparent) transparent;
  .thin-scrollbar(linear-gradient(180deg, color-mix(in srgb, @accent 0.35%, transparent), rgba(139, 92, 246, 0.35)), 6px);

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, color-mix(in srgb, @accent 0.6%, transparent), rgba(139, 92, 246, 0.6));
  }
}

.todo-root.is-fullscreen .todo-list {
  grid-template-columns: repeat(3, 1fr);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, @accent 35%, transparent);
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.05%, transparent);
    border-color: color-mix(in srgb, @accent 70%, transparent);
  }

  &.done {
    border-color: color-mix(in srgb, @accent 18%, transparent);

    .text {
      text-decoration: line-through;
      color: @text-soft;
    }
  }

  &.deleted {
    opacity: 0.75;

    &:hover {
      opacity: 1;
    }
  }

  &.dragging {
    opacity: 0.45;
    transform: scale(0.98);
    cursor: grabbing;
  }

  &.drop-before {
    box-shadow: 0 -2px 0 0 @accent;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
  }

  &.drop-after {
    box-shadow: 0 2px 0 0 @accent;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
  }

  &[draggable="true"] {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
}

.check-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px dashed color-mix(in srgb, @accent 0.5%, transparent);
  border-radius: @radius-circle;
  background: rgba(255, 255, 255, 0.35);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.18s ease;
  position: relative;

  &::after {
    content: '';
    width: 4px;
    height: 4px;
    border-radius: @radius-circle;
    background: color-mix(in srgb, @accent 0.55%, transparent);
    opacity: 1;
    transition: all 0.18s ease;
  }

  &:hover {
    border-color: color-mix(in srgb, @accent 0.85%, transparent);
    background: color-mix(in srgb, @accent 0.1%, transparent);
    transform: scale(1.06);

    &::after {
      background: @accent;
      transform: scale(1.2);
    }
  }

  &:active {
    transform: scale(0.94);
  }

  &.checked {
    background: @accent-gradient;
    border: 1.5px solid transparent;
    border-style: solid;
    box-shadow: 0 2px 6px color-mix(in srgb, @accent 0.35%, transparent);
    transform: scale(1);

    &::after {
      width: 0;
      height: 0;
      opacity: 0;
    }

    &:hover {
      transform: scale(1.06);
    }
  }
}

.check-mark {
  color: #fff;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.text {
  flex: 1;
  font-size: 13px;
  color: @text;
  cursor: text;
  user-select: text;
  word-break: break-all;
  min-width: 0;
}

.deleted-text {
  text-decoration: line-through;
  color: @text-soft;
  cursor: default;
}

.deleted-time {
  font-size: 11px;
  color: @text-soft;
  flex-shrink: 0;
  white-space: nowrap;
}

.trash-icon {
  flex-shrink: 0;
  opacity: 0.6;
  color: @text-soft;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.edit-input {
  flex: 1;
  border: 1px solid color-mix(in srgb, @accent 0.4%, transparent);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
}

/* 拖动手柄 */
.drag-handle {
  flex-shrink: 0;
  cursor: grab;
  line-height: 1;
  color: @text-soft;
  opacity: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -3px;
  user-select: none;
  padding: 2px 4px;
  border-radius: 4px;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;

  .todo-item:hover & {
    opacity: 0.55;
  }

  &:hover {
    opacity: 1 !important;
    color: @accent;
    background: color-mix(in srgb, @accent 0.1%, transparent);
  }

  &:active {
    cursor: grabbing;
  }
}

.del-btn,
.restore-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: @text-soft;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  opacity: 0;

  .todo-item:hover & {
    opacity: 1;
  }
}

.del-btn:hover {
  background: fade(@danger, 12%);
  color: @danger;
}

.restore-btn {
  font-size: 16px;
  color: @accent;

  &:hover {
    background: color-mix(in srgb, @accent 0.12%, transparent);
  }
}

.recycle-actions {
  display: flex;
  gap: 2px;
  align-items: center;
}

/* 回收站项：操作按钮始终可见（透明度不隐藏）*/
.todo-item.deleted {
  .del-btn,
  .restore-btn {
    opacity: 0.7;
  }

  &:hover {
    .del-btn,
    .restore-btn {
      opacity: 1;
    }
  }
}

.dialog-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, @accent 0.1%, transparent);
  font-size: 12px;
  color: @text-soft;
  text-align: right;
  flex-shrink: 0;
}
</style>

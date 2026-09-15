<script setup>

import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { SITE_SIZES, isToolKind } from '@/db'
import { RiEditLine, RiDeleteBinLine } from '@remixicon/vue'
import { useConfirm } from '@/composables/useConfirm'

const props = defineProps({
  open: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null }, // DOMRectLike
  site: { type: Object, default: null },
})
const emit = defineEmits(['close', 'edit', 'remove', 'resize'])

/**
 * 是否为内置工具卡（如文本分割）
 *  - 工具卡暂不开放「编辑 / 调整大小」菜单项(避免误改 url/kind),
 *    只保留「删除」作为出口
 *  - 判定走 db.isToolKind:kind 在 TOOL_KINDS 列表里的都视为工具卡
 */
const isTool = computed(() => isToolKind(props.site?.kind))

const SIZE_LABELS = {
  '1x1': '1 × 1',
  '1x2': '1 × 2',
  '2x1': '2 × 1',
  '2x2': '2 × 2',
  '2x4': '2 × 4',
  '4x2': '4 × 2',
}

const pos = ref({ left: 0, top: 0 })
const menuRef = ref(null)
const { confirm } = useConfirm()

const GAP = 8 // 菜单与触发卡片之间的间距
const MARGIN = 8 // 视口边距

async function computePosition() {
  await nextTick()
  if (!menuRef.value) return
  const menuRect = menuRef.value.getBoundingClientRect()
  const mw = menuRect.width || 220
  const mh = menuRect.height || (isTool.value ? 64 : 240)
  const r = props.anchorRect
  if (!r) {
    pos.value = { left: MARGIN, top: MARGIN }
    return
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 横向：默认左对齐卡片左缘；左侧放不下则右对齐卡片右缘
  let left = r.left
  if (left + mw > vw - MARGIN) {
    left = r.right - mw
  }
  if (left < MARGIN) left = MARGIN

  // 纵向：默认在卡片下方；下方空间不足则改到卡片上方
  let top = r.bottom + GAP
  if (top + mh > vh - MARGIN) {
    top = r.top - mh - GAP
  }
  if (top < MARGIN) top = MARGIN

  pos.value = { left, top }
}

const currentSize = computed(() => props.site?.size || '1x1')

function onDocMousedown(e) {
  if (!menuRef.value) return
  if (!menuRef.value.contains(e.target)) emit('close')
}

function onEsc(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMousedown)
  document.addEventListener('keydown', onEsc)
})

// 每次打开时重新计算位置（基于最新的 anchorRect）

watch(
  () => props.open,
  (val) => {
    if (val) computePosition()
  }
)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  document.removeEventListener('keydown', onEsc)
})

function doEdit() {
  if (isTool.value) return
  emit('edit', props.site)
  emit('close')
}
function doRemove() {
  emit('remove', props.site)
  emit('close')
}
function doResize(size) {
  if (isTool.value) return
  emit('resize', { site: props.site, size })
  emit('close')
}

function sizeShape(s) {
  const [r, c] = s.split('x').map(Number)
  const unit = 6
  return { w: c * unit + 'px', h: r * unit + 'px' }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="menu-pop">
      <div
        v-if="open"
        ref="menuRef"
        class="ctx-menu glass"
        :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
        @contextmenu.prevent
      >
        <!-- 普通网站站点 —— 编辑 / 删除 / 调整大小 -->
        <template v-if="!isTool">
          <button class="ctx-item" @click="doEdit">
            <RiEditLine size="16" class="ctx-ico" aria-hidden="true" />
            <span>{{ $t('siteContextMenu.edit') }}</span>
          </button>
          <button class="ctx-item danger" @click="doRemove">
            <RiDeleteBinLine size="16" class="ctx-ico" aria-hidden="true" />
            <span>{{ $t('siteContextMenu.delete') }}</span>
          </button>

          <div class="ctx-divider"></div>
          <div class="ctx-label">{{ $t('siteContextMenu.resize') }}</div>
          <div class="ctx-sizes">
            <button
              v-for="s in SITE_SIZES"
              :key="s"
              :class="['ctx-size', { active: s === currentSize }]"
              v-tip="SIZE_LABELS[s]"
              @click="doResize(s)"
            >
              <span
                class="size-icon"
                :class="`shape-${s}`"
                :style="{ '--w': sizeShape(s).w, '--h': sizeShape(s).h }"
              ></span>
              <span class="size-text">{{ SIZE_LABELS[s] }}</span>
            </button>
          </div>
        </template>

        <!-- 工具卡（split-text 等） —— 只保留删除 -->
        <template v-else>
          <button class="ctx-item danger" @click="doRemove">
            <RiDeleteBinLine size="16" class="ctx-ico" aria-hidden="true" />
            <span>{{ $t('siteContextMenu.delete') }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.ctx-menu {
  position: fixed;
  min-width: 200px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid color-mix(in srgb, @accent 0.15%, transparent);
  box-shadow: 0 16px 40px rgba(31, 41, 55, 0.22);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: @text;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  color: @text;
  transition: background 0.15s ease, color 0.15s ease;
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: @accent-soft;
    color: @accent;
  }

  &.danger {
    color: #ef4444;

    &:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    }
  }
}

.ctx-ico {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ctx-divider {
  height: 1px;
  background: color-mix(in srgb, @accent 0.1%, transparent);
  margin: 4px 6px;
}

.ctx-label {
  padding: 6px 10px 4px;
  font-size: 11px;
  color: @text-soft;
  letter-spacing: 0.4px;
}

.ctx-sizes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 0 4px 4px;
}

.ctx-size {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  background: transparent;
  color: @text-soft;
  transition: background 0.15s ease, color 0.15s ease;
  cursor: pointer;
  font-size: 11px;

  &:hover {
    background: @accent-soft;
    color: @accent;

    .size-icon {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  &.active {
    background: @accent;
    color: #fff;

    .size-icon {
      background: #fff;
      opacity: 1;
    }
  }
}

.size-icon {
  display: block;
  width: var(--w);
  height: var(--h);
  border-radius: 3px;
  background: currentColor;
  opacity: 0.6;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.size-text {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
</style>

<script setup>
/**
 *  「添加」卡片的右键菜单
 * - 位置基于 add-card bounding rect
 * - 单一项：根据当前 editMode 切换文案（编辑主页/ 完成编辑）
 */
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { RiCheckLine, RiEditLine } from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'toggle-edit'])

const pos = ref({ left: 0, top: 0 })
const menuRef = ref(null)

const GAP = 8
const MARGIN = 8

async function computePosition() {
  await nextTick()
  if (!menuRef.value) return
  const menuRect = menuRef.value.getBoundingClientRect()
  const mw = menuRect.width || 180
  const mh = menuRect.height || 44
  const r = props.anchorRect
  if (!r) {
    pos.value = { left: MARGIN, top: MARGIN }
    return
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 横向：默认左对齐卡片左缘；左侧放不下则右对齐卡片右缘
  let left = r.left
  if (left + mw > vw - MARGIN) left = r.right - mw
  if (left + mw > vw - MARGIN) left = vw - mw - MARGIN
  if (left < MARGIN) left = MARGIN

  // 纵向：优先放卡片下方；下方空间不足则改到卡片上方
  let top = r.bottom + GAP
  if (top + mh > vh - MARGIN) top = r.top - mh - GAP
  if (top < MARGIN) top = MARGIN

  pos.value = { left, top }
}

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
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  document.removeEventListener('keydown', onEsc)
})

watch(() => props.open, (val) => {
  if (val) computePosition()
})

function doToggle() {
  emit('toggle-edit')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="menu-pop">
      <div
        v-if="open"
        ref="menuRef"
        class="add-menu glass"
        :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
        @contextmenu.prevent
      >
        <button class="add-menu-item" @click="doToggle">
          <RiCheckLine v-if="editMode" size="16" class="add-menu-ico" aria-hidden="true" />
          <RiEditLine v-else size="16" class="add-menu-ico" aria-hidden="true" />
          <span>{{ editMode ? $t('editMode.done') : $t('editMode.enter') }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.add-menu {
  position: fixed;
  min-width: 160px;
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

.add-menu-item {
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
}

.add-menu-ico {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
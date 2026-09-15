<script setup>
/**
 * 搜索栏（iTab 风格? * - 左侧触发器：当前引擎 logo + 名称 + 下拉箭头
 * - 悬停/点击展开引擎列表（横向胶囊式浮层，避免被遮挡? *   - 每个引擎：图+ 名称，悬停右侧出× 删除
 *   - 末尾：＋ 添加搜索引擎
 * - 中间输入+ 右侧搜索按钮
 * - 点击外部自动关闭下拉
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue'
import EngineEditor from '@/views/search/EngineEditor.vue'
import { useConfirm } from '@/composables/useConfirm'
import { $t } from '@/composables/useI18n'
import { loadEngineSvg } from '@/utils/thesvg'
import { RiCloseLine } from '@remixicon/vue'

const props = defineProps({
  engines: { type: Array, required: true },
  currentKey: { type: String, default: 'baidu' },
})
const emit = defineEmits(['select', 'add', 'remove'])

const keyword = ref('')
const dropdownOpen = ref(false)
const editorOpen = ref(false)
const rootRef = ref(null)

const currentEngine = computed(
  () => props.engines.find((e) => e.key === props.currentKey) || props.engines[0]
)

/** 引擎 SVG 字符串缓存 */
const svgCache = ref({})
function loadIcon(slug) {
  if (!slug) return
  if (svgCache.value[slug]) return
  svgCache.value[slug] = ''
  loadEngineSvg(slug).then((svg) => {
    svgCache.value = { ...svgCache.value, [slug]: svg || '' }
  })
}
/** 初始 + engines 变化时加载所有图标 */
function loadAllIcons() {
  props.engines.forEach((e) => loadIcon(e.icon))
}
onMounted(loadAllIcons)
watch(() => props.engines, loadAllIcons, { deep: true })

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function selectEngine(key) {
  emit('select', key)
  dropdownOpen.value = false
}

const { confirm } = useConfirm()

async function removeEngine(engine, event) {
  event.stopPropagation()
  const ok = await confirm({
    title: $t('searchBar.removeTitle'),
    message: $t('searchBar.removeMessage', { name: engine.name }),
    okText: $t('common.delete'),
    danger: true,
  })
  if (ok) emit('remove', engine.key)
}

function onDocClick(e) {
  if (!rootRef.value) return
  if (!rootRef.value.contains(e.target)) {
    dropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
})

function search() {
  const kw = keyword.value.trim()
  if (!kw) return
  const base = currentEngine.value?.url
  if (!base) return
  window.open(base + encodeURIComponent(kw), '_blank', 'noopener')
}
</script>

<template>
  <div class="search-bar glass" ref="rootRef">
    <div
      class="engine-trigger"
      :class="{ open: dropdownOpen }"
      @click="toggleDropdown"
    >
      <span
        v-if="currentEngine"
        class="engine-svg"
        :class="{ loaded: svgCache[currentEngine.icon] }"
        v-html="svgCache[currentEngine.icon] || currentEngine.name.charAt(0)"
      />
      <span class="trigger-name">{{ currentEngine?.name || $t('searchBar.triggerPlaceholder') }}</span>
      <span class="arrow"></span>
    </div>

    <input
      v-model="keyword"
      class="search-input"
      type="text"
      :placeholder="$t('app.searchPlaceholder')"
      @keyup.enter="search"
      @focus="dropdownOpen = false"
    />
    <button class="search-btn" @click="search">{{ $t('searchBar.search') }}</button>

    <!-- 浮层：上下模式（图标+名称），与搜索框等宽 -->
    <Transition name="dropdown">
      <div v-if="dropdownOpen" class="engine-dropdown" @click.stop>
        <div
          v-for="e in engines"
          :key="e.key"
          :class="['dd-item', { active: e.key === currentKey }]"
          v-tip="e.name"
          role="button"
          tabindex="0"
          @click="selectEngine(e.key)"
          @keyup.enter="selectEngine(e.key)"
          @keyup.space.prevent="selectEngine(e.key)"
        >
          <span class="dd-icon">
            <span
              class="engine-svg"
              :class="{ loaded: svgCache[e.icon] }"
              v-html="svgCache[e.icon] || e.name.charAt(0)"
            />
          </span>
          <span class="dd-name">{{ e.name }}</span>
          <button
            class="dd-remove"
            type="button"
            v-tip="$t('searchBar.removeIconTitle')"
            :aria-label="$t('searchBar.removeIconTitle')"
            @click.stop="removeEngine(e, $event)"
          >
            <RiCloseLine size="12" aria-hidden="true" />
          </button>
        </div>
        <button class="dd-add" @click="editorOpen = true; dropdownOpen = false">
          <span class="dd-icon dd-icon-add">
            <span class="plus">+</span>
          </span>
          <span class="dd-name">{{ $t('searchBar.addEngine') }}</span>
        </button>
      </div>
    </Transition>

    <EngineEditor
      v-model:open="editorOpen"
      :existing-engines="engines"
      @save="emit('add', $event)"
    />
  </div>
</template>

<style scoped lang="less">
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 620px;
  max-width: 92vw;
  padding: 6px 8px 6px 6px;
  border-radius: @radius-pill;
  z-index: 50;
  /* 关键：固定宽度，layout 不会因容器变化而抖动 */
  flex-shrink: 0;
  /* 默认更淡，悬浮加深 */
  background: rgba(255, 255, 255, 0.55);
  /* 平滑过渡位置/尺寸 */
  transition: margin 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              background 0.25s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.92);
  }

  [data-theme='dark'] & {
    background: rgba(17, 24, 39, 0.55);

    &:hover {
      background: rgba(17, 24, 39, 0.9);
    }
  }
}

.engine-trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: @radius-pill;
  cursor: pointer;
  transition: background @tr;
  user-select: none;
  flex-shrink: 0;

  &:hover,
  &.open {
    background: color-mix(in srgb, @accent 0.08%, transparent);
  }

  img {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    object-fit: contain;
    background: color-mix(in srgb, @accent 0.08%, transparent);
  }

  .engine-svg :deep(svg) {
    width: 20px;
    height: 20px;
  }
}

.trigger-name {
  font-size: 14px;
  font-weight: 500;
  color: @text;
  max-width: 80px;
  .ellipsis();
}

.arrow {
  font-size: 12px;
  color: @text-soft;
  transition: transform @tr;
  width: 8px;
  height: 8px;
  border-right: 2px solid @text-soft;
  border-bottom: 2px solid @text-soft;
  transform: rotate(45deg);
  display: inline-block;

  .engine-trigger.open & {
    transform: rotate(45deg);
  }
}

.search-input {
  flex: 1;
  font-size: 15px;
  color: @text;
  padding: 10px 8px;
  background: transparent;
  min-width: 0;

  &::placeholder {
    color: @text-soft;
  }
}

.search-btn {
  border-radius: @radius-pill;
  padding: 9px 22px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  transition: transform @tr, box-shadow @tr;
  flex-shrink: 0;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px color-mix(in srgb, @accent 0.35%, transparent);
  }
}

/* 浮层：与搜索框等宽，10px 圆角，背景与搜索框一致 */
.engine-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
  padding: 12px 14px;
  width: min(620px, 92vw);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid color-mix(in srgb, @accent 0.15%, transparent);
  box-shadow: 0 12px 32px rgba(31, 41, 55, 0.18);
  z-index: 9999;
  transform-origin: top center;
}

.dd-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px 4px;
  border-radius: 8px;
  font-size: 11px;
  color: @text-soft;
  background: transparent;
  transition: background 0.18s ease, color 0.18s ease;
  cursor: pointer;
  width: 64px;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);
    color: @accent;

    .dd-icon {
      transform: translateY(-1px);
    }

    .dd-remove {
      opacity: 1;
    }
  }

  &.active {
    background: @accent-soft;
    color: @accent;
    font-weight: 500;

    .dd-icon {
      background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));

      img,
      .engine-svg :deep(svg) {
        filter: brightness(0) invert(1);
      }
    }
  }
}

.dd-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: background 0.18s ease, transform 0.18s ease;

  img,
  .engine-svg :deep(svg) {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
}

/* 引擎 SVG：缩放到合适大小 */
.engine-svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-size: 14px;
  color: @text-soft;
  font-weight: 600;

  :deep(svg) {
    width: 22px;
    height: 22px;
    display: block;
  }

  /* 加载完时淡入 */
  &:not(.loaded) {
    opacity: 0.4;
  }

  &.loaded {
    opacity: 1;
    transition: opacity 0.2s ease;
  }
}

.dd-name {
  font-size: 11px;
  max-width: 100%;
  .ellipsis();
}

.dd-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  border-radius: @radius-circle;
  background: #ef4444;
  color: #fff;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
  cursor: pointer;

  &:hover {
    transform: scale(1.15);
  }
}

.dd-icon-add {
  background: #fff;
  color: @accent;
  border: 1px dashed color-mix(in srgb, @accent 50%, transparent);

  .plus {
    font-size: 18px;
    line-height: 1;
    font-weight: 300;
  }
}

/* 添加按钮：与 .dd-item 同尺寸对齐 */
.dd-add {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px 4px;
  border-radius: 8px;
  font-size: 11px;
  color: @accent;
  background: transparent;
  transition: background 0.18s ease;
  cursor: pointer;
  width: 64px;
  flex-shrink: 0;

  &:hover {
    background: color-mix(in srgb, @accent 0.08%, transparent);

    .dd-icon-add {
      background: color-mix(in srgb, @accent 0.18%, transparent);
    }
  }
}

/* 进入/离开动画：从搜索框下方向下展开 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scaleY(0.85);
}

.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0) scaleY(1);
}
</style>

<script setup>
/**
 * 引擎管理弹窗（iTab 风格）
 * - 顶部"常用引擎"区：完整显示所有常用引擎
 *   - 已装的自动勾选
 *   - 取消勾选 = 标记要删除
 *   - 勾选未装的 = 标记要添加
 * - 底部"自定义"区：填写一项 = 标记要添加
 * - 提交时一次应用
 *   { add: [...], remove: [...] }
 * - 至少一项变化才能提交（添加/删除其一）
 * - 与搜索框下拉完全联动
 *   - 下拉里删除后重新打开弹窗，对应项自动取消勾选
 *   - 弹窗里勾选取消勾选，保存后下拉同步 */
import { ref, computed, watch, reactive, onMounted } from 'vue'
import { $t } from '@/composables/useI18n'
import { COMMON_ENGINES } from '@/stores/settings'
import { FAVICON_API } from '@/config/api'
import BaseDialog from '@/components/BaseDialog.vue'
import { loadEngineSvg } from '@/utils/thesvg'
import { RiCheckLine } from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  existingEngines: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:open', 'save'])

const selectedKeys = ref(new Set())
const custom = ref({ name: '', url: '', icon: '' })
const errorMsg = ref('')

/** 引擎图标 SVG 缓存 */
const svgCache = reactive({})
function loadIcon(slug) {
  if (!slug || svgCache[slug] !== undefined) return
  svgCache[slug] = ''
  loadEngineSvg(slug).then((svg) => {
    svgCache[slug] = svg || ''
  })
}
onMounted(() => {
  COMMON_ENGINES.forEach((e) => loadIcon(e.icon))
  props.existingEngines?.forEach?.((e) => loadIcon(e.icon))
})

/* ---------------- 状态初始化（联动核心） ---------------- */

function initFromExisting() {
  // 用现有引擎的 key 集合作为初始勾选
  selectedKeys.value = new Set(props.existingEngines.map((e) => e.key))
  custom.value = { name: '', url: '', icon: '' }
  errorMsg.value = ''
}

watch(
  () => props.open,
  (val) => {
    if (val) initFromExisting()
  }
)

// 即便 open 没变（外部不通过 open 重新触发），existingEngines 引用变化时也要同步
watch(
  () => props.existingEngines,
  () => {
    if (props.open) initFromExisting()
  },
  { deep: true }
)

/* ---------------- 勾选/ 取消 ---------------- */

function togglePick(key) {
  if (selectedKeys.value.has(key)) selectedKeys.value.delete(key)
  else selectedKeys.value.add(key)
  selectedKeys.value = new Set(selectedKeys.value)
}

/* ---------------- 自定义 ---------------- */

const customValid = computed(() => {
  const u = custom.value.url.trim()
  if (!u) return false
  if (!/(\?|%s|%w)/.test(u) && !/[?&](wd|q|query|search|keyword)=?/.test(u)) return false
  return true
})

/**
 * 自动配图：失焦时仅图标为空才补（不覆盖手动输入）；
 * 点"自动"按钮强制重抓
 */
function autoIcon(force = false) {
  if (!force && custom.value.icon.trim()) return
  let u = custom.value.url.trim()
  if (!u) return
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try {
    custom.value.icon = FAVICON_API.pageIcon(u)
  } catch {
    errorMsg.value = $t('engineEditor.invalidUrl')
  }
}

/* ---------------- 变化量计算 ---------------- */

const existingKeys = computed(() => new Set(props.existingEngines.map((e) => e.key)))

const toAddCommon = computed(() => {
  // 勾选未装（且属于 COMMON_ENGINES）的引擎
  const result = []
  for (const key of selectedKeys.value) {
    if (!existingKeys.value.has(key)) {
      const e = COMMON_ENGINES.find((c) => c.key === key)
      if (e) result.push({ ...e })
    }
  }
  return result
})

const toRemove = computed(() => {
  // 已装但未勾选的引擎
  const result = []
  for (const e of props.existingEngines) {
    if (!selectedKeys.value.has(e.key)) result.push(e.key)
  }
  return result
})

const toAdd = computed(() => {
  const list = [...toAddCommon.value]
  if (customValid.value) {
    let u = custom.value.url.trim()
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    let host = ''
    try {
      host = new URL(u).hostname
    } catch {
      /* ignore */
    }
    const name = custom.value.name.trim() || host
    list.push({
      key: `custom-${Date.now()}`,
      name,
      url: u,
      icon:
        custom.value.icon.trim() ||
        FAVICON_API.pageIcon(u),
    })
  }
  return list
})

const addCount = computed(() => toAdd.value.length)
const removeCount = computed(() => toRemove.value.length)
const hasChange = computed(() => addCount.value > 0 || removeCount.value > 0)

/* ---------------- 提交 ---------------- */

function submit() {
  errorMsg.value = ''
  if (!hasChange.value) return
  emit('save', { add: toAdd.value, remove: toRemove.value })
  emit('update:open', false)
}
</script>

<template>
  <BaseDialog
    :open="open"
    :title="$t('engineEditor.title')"
    width="min(540px, 94vw)"
    max-height="86vh"
    padding="24px 26px"
    :fullscreenable="false"
    @close="emit('update:open', false)"
  >
        <p class="tip">
          {{ $t('engineEditor.hint') }}
        </p>

        <!-- 常用引擎多选-->
        <section class="section">
          <div class="section-title">
            <span>{{ $t('engineEditor.installed') }}</span>
            <span class="hint">{{ $t('engineEditor.keepHint') }}</span>
          </div>
          <div class="grid">
            <label
              v-for="e in COMMON_ENGINES"
              :key="e.key"
              :class="['pill', { checked: selectedKeys.has(e.key) }, { installed: existingKeys.has(e.key) }]"
            >
              <input
                type="checkbox"
                :checked="selectedKeys.has(e.key)"
                @change="togglePick(e.key)"
              />
              <span
                class="engine-svg"
                :class="{ loaded: svgCache[e.icon] }"
                v-html="svgCache[e.icon] || e.name.charAt(0)"
              />
              <span class="pill-name">{{ e.name }}</span>
              <span class="check-mark">
                <RiCheckLine size="12" aria-hidden="true" />
              </span>
            </label>
          </div>
        </section>

        <div class="divider"><span>{{ $t('engineEditor.addCustom') }}</span></div>

        <!-- 自定义引擎 -->
        <section class="section">
          <label class="field">
            <span>{{ $t('engineEditor.customName') }}</span>
            <input v-model="custom.name" type="text" :placeholder="$t('engineEditor.customName')" />
          </label>

          <label class="field">
            <span>{{ $t('engineEditor.customUrl') }}</span>
            <input
              v-model="custom.url"
              type="text"
              :placeholder="$t('engineEditor.customUrlPlaceholder')"
              @blur="() => autoIcon(false)"
            />
          </label>

          <label class="field">
            <span>{{ $t('engineEditor.iconUrl') }}</span>
            <div class="icon-row">
              <input
                v-model="custom.icon"
                type="text"
                :placeholder="$t('engineEditor.iconAutoPlaceholder')"
              />
              <button type="button" class="auto-btn" @click="autoIcon(true)">{{ $t('engineEditor.auto') }}</button>
            </div>
          </label>
        </section>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <footer class="actions">
          <span class="counter">
            <span v-if="addCount" class="add">+ {{ addCount }}</span>
            <span v-if="removeCount" class="remove">- {{ removeCount }}</span>
            <span v-if="!hasChange" class="no-change">{{ $t('engineEditor.noChange') }}</span>
          </span>
          <div class="action-btns">
            <button class="btn ghost" @click="emit('update:open', false)">{{ $t('engineEditor.cancel') }}</button>
            <button
              class="btn primary"
              :disabled="!hasChange"
              @click="submit"
            >
              {{ $t('engineEditor.saveChanges') }}
            </button>
          </div>
        </footer>
  </BaseDialog>
</template>

<style scoped lang="less">
.tip {
  margin: 4px 0 14px;
  font-size: 12px;
  color: @text-soft;
}

.section {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;

  > span:first-child {
    font-size: 13px;
    font-weight: 500;
    color: @text;
  }

  .hint {
    font-size: 11px;
    color: @text-soft;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 8px;
}

.pill {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;

  &:hover {
    background: color-mix(in srgb, @accent 0.06%, transparent);
    border-color: color-mix(in srgb, @accent 0.3%, transparent);
  }

  input[type='checkbox'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  img,
  .engine-svg :deep(svg) {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    object-fit: contain;
    flex-shrink: 0;
  }

  &.checked {
    background: @accent-soft;
    border-color: @accent;

    .pill-name {
      color: @accent;
      font-weight: 500;
    }

    .check-mark {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* 已装的引擎：略微高亮提示 */
  &.installed:not(.checked) {
    border-style: dashed;
    background: color-mix(in srgb, @accent 0.04%, transparent);

    .pill-name {
      color: @text-soft;
    }
  }
}

/* 引擎 SVG 通用样式 */
.engine-svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-size: 12px;
  font-weight: 600;
  color: @text-soft;

  :deep(svg) {
    width: 20px;
    height: 20px;
    display: block;
    flex-shrink: 0;
  }

  &:not(.loaded) {
    opacity: 0.4;
  }

  &.loaded {
    transition: opacity 0.2s ease;
  }
}

.pill-name {
  font-size: 13px;
  color: @text;
  flex: 1;
  .ellipsis();
}

.check-mark {
  width: 18px;
  height: 18px;
  border-radius: @radius-circle;
  background: @accent;
  color: #fff;
  line-height: 18px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 0.18s ease, transform 0.18s ease;
  flex-shrink: 0;
}

.divider {
  display: flex;
  align-items: center;
  margin: 14px 0 10px;
  color: @text-soft;
  font-size: 12px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, @accent 0.12%, transparent);
  }

  span {
    padding: 0 10px;
  }
}

.field {
  display: block;
  margin-bottom: 12px;

  span {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: @text-soft;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.6);
    color: @text;
    padding: 9px 12px;
    font-size: 13px;
    transition: border 0.18s ease, box-shadow 0.18s ease;

    &:focus {
      border-color: @accent;
      box-shadow: 0 0 0 3px color-mix(in srgb, @accent 0.15%, transparent);
      outline: none;
    }
  }
}

.icon-row {
  display: flex;
  gap: 6px;

  input {
    flex: 1;
  }
}

.auto-btn {
  border-radius: 10px;
  padding: 0 14px;
  font-size: 12px;
  color: @accent;
  background: color-mix(in srgb, @accent 0.12%, transparent);
  transition: background 0.18s ease;

  &:hover {
    background: color-mix(in srgb, @accent 0.22%, transparent);
  }
}

.error {
  color: @danger;
  font-size: 13px;
  margin: 8px 0 0;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, @accent 0.1%, transparent);
}

.counter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;

  .add {
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    padding: 3px 9px;
    border-radius: @radius-pill;
  }

  .remove {
    color: @danger;
    background: fade(@danger, 10%);
    padding: 3px 9px;
    border-radius: @radius-pill;
  }

  .no-change {
    color: @text-soft;
    font-weight: 400;
  }
}

.action-btns {
  display: flex;
  gap: 8px;
}

.btn {
  border-radius: @radius-pill;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;

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

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 22px color-mix(in srgb, @accent 0.4%, transparent);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}
</style>

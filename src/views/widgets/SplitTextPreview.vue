<script setup>
/**
 * 文本分割 widget 预览(单文件融合版)
 * - 由原 src/views/split/ 下 5 个组件融合而来:
 *   SplitTextPanel(状态/逻辑) + SplitInputPanel + SplitOptionsPanel
 *   + SplitActions + SplitOutputPanel
 * - 功能保持不变:拆分 / 去重 / 分组 / 重复统计 / 复制 / 清空 / 导出(xlsx 优先,CSV 兜底)
 * - 不再依赖 element-plus / xlsx / lodash / @vueuse
 */
import { ref, computed, onMounted, watch } from 'vue'
import { setSetting, migrateSetting } from '@/db'
import { copyText } from '@/utils/clipboard'

const STORAGE_KEY = 'splitText.inputValue'
const DRAFT_KEY = 'splitDraft'

const SPLIT_OPTIONS = [
  { label: '逗号', value: '1', map: ',' },
  { label: '分号', value: '2', map: ';' },
  { label: '斜杠', value: '3', map: '/' },
  { label: '换行', value: '4', map: '\n' },
]

// === 状态 ===
const inputValue = ref('')
const splitType = ref('1')
const customSplit = ref('')
const groupCount = ref('200')
const removeDuplicate = ref(false)
const showRepeatCount = ref(false)

// === 派生 ===
const formatValue = computed(() => {
  return inputValue.value
    .replace(/\n/g, ',')
    .replace(/\//g, ',')
    .replace(/;/g, ',')
    .replace(/,/g, ',')
    .split(',')
    .filter(Boolean)
})

function resolveSeparator() {
  if (customSplit.value) return customSplit.value
  return SPLIT_OPTIONS.find((s) => s.value === splitType.value)?.map ?? ','
}

function joinGroup(arr) {
  return arr.join(resolveSeparator())
}

function chunkArray(arr, size) {
  if (!size || size < 1) return [arr]
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

const outValue = computed(() => {
  const arr = removeDuplicate.value
    ? Array.from(new Set(formatValue.value))
    : formatValue.value
  const size = Number(groupCount.value)
  if (size > 0) {
    const chunks = chunkArray(arr, size)
    return chunks.map((c) => joinGroup(c)).join('\n===================================================\n')
  }
  return joinGroup(arr)
})

const repeatValue = computed(() => {
  const counts = {}
  for (const item of formatValue.value) {
    counts[item] = (counts[item] || 0) + 1
  }
  return Object.entries(counts)
    .map(([k, v]) => `${k} : ${v}`)
    .join('\n')
})

const outputCount = computed(() => {
  if (!removeDuplicate.value) return formatValue.value.length
  return Array.from(new Set(formatValue.value)).length
})

// === 操作 ===
async function handleCopy() {
  const ok = await copyText(outValue.value)
  notify(ok ? 'success' : 'error', ok ? '复制成功' : '复制失败,请手动复制')
}

function handleClear() {
  inputValue.value = ''
  setSetting(DRAFT_KEY, '').catch(() => {})
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function handleExport() {
  const sep = resolveSeparator()
  const size = Number(groupCount.value)
  const groups = size > 0 ? chunkArray(formatValue.value, size) : [formatValue.value]
  const rows = groups.map((g, i) => ({
    序号: i + 1,
    编号: g.join(sep),
  }))

  // 优先用全局 XLSX(若已通过 <script> 引入);否则降级为 CSV 下载
  const XLSX = typeof window !== 'undefined' ? window.XLSX : null
  if (XLSX?.utils) {
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wpx: 100 }, { wpx: 1000 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `split-${Date.now()}.xlsx`)
    return
  }

  // CSV 兜底
  const csv = ['序号,编号']
    .concat(rows.map((r) => `${r.序号},"${String(r.编号).replace(/"/g, '""')}"`))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `split-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 轻量通知:派发 CustomEvent,由 MessageHost(若已挂载)统一消费;
 * 未挂载时降级为 console
 */
function notify(type, message) {
  window.dispatchEvent(new CustomEvent('app:message', { detail: { type, text: message } }))
  if (type === 'error') console.warn('[SplitTextPreview]', message)
}

// === 持久化（IndexedDB `settings` 表，含 localStorage 遗留迁移；写防抖 300ms） ===
let draftTimer = null
onMounted(async () => {
  try {
    const saved = await migrateSetting(DRAFT_KEY, STORAGE_KEY, '')
    if (saved) inputValue.value = saved
  } catch {
    /* ignore */
  }
})

watch(inputValue, (v) => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    setSetting(DRAFT_KEY, v).catch(() => {})
  }, 300)
})
</script>

<template>
  <div class="split-preview">
    <div class="split-panel">
      <!-- 输入 -->
      <section class="panel-section">
        <h4 class="section-title">输入值</h4>
        <div class="split-input">
          <textarea
            v-model="inputValue"
            class="split-textarea"
            :rows="6"
            placeholder=""
          />
        </div>
      </section>

      <!-- 选项 -->
      <section class="panel-section">
        <div class="split-options">
          <!-- 分隔方式 -->
          <div class="opt-row">
            <label class="opt-label">输出分割方式</label>
            <div class="radio-group">
              <label
                v-for="item in SPLIT_OPTIONS"
                :key="item.value"
                :class="['radio-opt', { active: splitType === item.value }]"
              >
                <input
                  type="radio"
                  :value="item.value"
                  :checked="splitType === item.value"
                  @change="splitType = item.value"
                />
                <span>{{ item.label }}</span>
              </label>
            </div>
          </div>

          <!-- 各项配置 -->
          <div class="opt-grid">
            <div class="opt-cell">
              <label class="opt-label">自定义分割</label>
              <input
                v-model="customSplit"
                class="text-input"
                placeholder="留空则采用上方分割方式"
              />
              <p class="opt-hint">如果有内容,优先采用自定义分隔符</p>
            </div>

            <div class="opt-cell">
              <label class="opt-label">分组数量</label>
              <input
                v-model="groupCount"
                class="text-input"
                placeholder="不分组"
              />
              <p class="opt-hint">每多少项用分隔线断开(导出时同时分组)</p>
            </div>

            <div class="opt-cell opt-cell-check">
              <label class="checkbox-opt">
                <input v-model="removeDuplicate" type="checkbox" />
                <span>去重</span>
              </label>
            </div>

            <div class="opt-cell opt-cell-check">
              <label class="checkbox-opt">
                <input v-model="showRepeatCount" type="checkbox" />
                <span>显示重复项</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- 操作 -->
      <section class="panel-section">
        <h4 class="section-title">操作</h4>
        <div class="split-actions">
          <button
            type="button"
            class="act-btn primary"
            :disabled="!formatValue.length"
            @click="handleExport"
          >
            生成文件
          </button>
          <button
            type="button"
            class="act-btn warning"
            :disabled="!inputValue"
            @click="handleClear"
          >
            清空输入值
          </button>
          <button
            type="button"
            class="act-btn danger"
            :disabled="!outValue"
            @click="handleCopy"
          >
            复制
          </button>
        </div>
      </section>

      <!-- 输出 -->
      <section class="panel-section">
        <h4 class="section-title">输出值</h4>
        <div class="split-output">
          <!-- 顶部统计 -->
          <div class="stats">
            <span>输入条数: {{ formatValue.length }}</span>
            <span>输出条数: {{ outputCount }}</span>
          </div>

          <!-- 输出区 -->
          <div class="out-grid" :class="{ 'two-col': showRepeatCount }">
            <textarea
              class="out-textarea"
              :rows="14"
              :value="outValue"
              readonly
            />
            <template v-if="showRepeatCount">
              <div class="repeat-label">值 / 出现次数</div>
              <textarea
                class="out-textarea"
                :rows="14"
                :value="repeatValue"
                readonly
              />
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="less">
.split-preview {
  width: 100%;
}

.split-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: @text;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: @text-soft;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

/* ---- 输入 ---- */
.split-input {
  width: 100%;
}

.split-textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: @accent;
  }

  [data-theme='dark'] & {
    background: rgba(255, 255, 255, 0.07);
  }
}

/* ---- 选项 ---- */
.split-options {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.opt-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: @text-soft;
  margin-bottom: 6px;
}

.opt-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: @text-soft;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.radio-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: @radius-pill;
  background: rgba(31, 41, 55, 0.06);
  color: @text;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  user-select: none;

  input {
    display: none;
  }

  &:hover {
    background: color-mix(in srgb, @accent 0.1%, transparent);
  }

  &.active {
    background: @accent-gradient;
    color: #fff;
  }
}

.opt-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.opt-cell-check {
  display: flex;
  align-items: center;
  padding-top: 18px;
}

.text-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 9px 12px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: @accent;
  }

  [data-theme='dark'] & {
    background: rgba(255, 255, 255, 0.07);
  }
}

.checkbox-opt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: @text;
  cursor: pointer;
  user-select: none;

  input {
    width: 16px;
    height: 16px;
    accent-color: @accent;
  }
}

/* ---- 操作栏 ---- */
.act-variant(@bg, @shadow) {
  background: @bg;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px @shadow;
  }
}

.split-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.act-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.primary {
    .act-variant(
      @accent-gradient,
      color-mix(in srgb, @accent 0.35%, transparent)
    );
  }

  &.warning {
    .act-variant(#f59e0b, rgba(245, 158, 11, 0.35));
  }

  &.danger {
    .act-variant(@danger, fade(@danger, 35%));
  }
}

/* ---- 输出 ---- */
.split-output {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stats {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: @text-soft;
}

.out-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;

  &.two-col {
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
  }
}

.repeat-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 12px;
  color: @text-soft;
  padding-right: 8px;
}

.out-textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  color: @text;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
  outline: none;

  [data-theme='dark'] & {
    background: rgba(255, 255, 255, 0.07);
  }
}
</style>

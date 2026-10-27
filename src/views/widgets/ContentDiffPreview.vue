<script setup>
/**
 * 内容对比小组件（两段文本 / 代码逐行 diff）
 *
 * 功能：
 *  - 左右两个输入区，粘贴或上传两段文本，实时计算差异
 *  - 三种视图：并排（左右对照）、统一（Git 风格 +/- 行）、仅差异（只看变更行）
 *  - 逐行标记：新增 / 删除 / 修改；「修改」行再做强词级高亮
 *  - 选项：忽略大小写、忽略空白、自动换行
 *  - 概览：新增 / 删除 / 修改 / 相同 计数 + 折叠未变更区块
 *  - 导出 diff 为 .txt，一键交换两侧，复制差异摘要
 *
 * 实现说明：
 *  - 算法在 ./diffUtils.js（纯函数、Myers 贪心、带公共前后缀裁剪）
 *  - 本组件不引入任何新依赖，随 WidgetPreviewDialog 懒加载，不进首屏包
 *  - 大文本（> MAX_LINES 行）直接降级为提示，不做 O(ND) 搜索，避免卡死主线程
 *  - 滚动同步：并排视图下左右两侧按强制比例联动（用锁定标记避免回环）
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { copyText } from '@/utils/clipboard'
import { downloadBlob } from '@/utils/download'
import { setSetting, getSetting } from '@/db'
import {
  diffLines,
  diffWords,
  buildDiffStats,
  MAX_LINES,
} from './diffUtils'
import {
  RiFileCopyLine,
  RiArrowLeftRightLine,
  RiDownloadLine,
  RiDeleteBin6Line,
  RiUpload2Line,
} from '@remixicon/vue'

const message = useMessage()

/* ---------------- 状态 ---------------- */
const leftText = ref('')
const rightText = ref('')
const viewMode = ref('split') // 'split' | 'unified' | 'changes'
const ignoreCase = ref(false)
const ignoreWhitespace = ref(false)
const wrapLines = ref(false)
const collapsed = ref(false) // 折叠未变更区块
const truncated = ref(false)

/** 草稿持久化 key（沿用工具草稿约定，写入 IndexedDB settings 表） */
const DRAFT_KEY = 'contentDiff.draft'

/* ---------------- 差异计算 ---------------- */
const options = computed(() => ({
  ignoreCase: ignoreCase.value,
  ignoreWhitespace: ignoreWhitespace.value,
}))

/** 行级 diff 结果 */
const diffResult = computed(() => {
  const hasAny = leftText.value !== '' || rightText.value !== ''
  if (!hasAny) return { rows: [], truncated: false }
  return diffLines(leftText.value, rightText.value, options.value)
})

const rows = computed(() => diffResult.value.rows)
const stats = computed(() => buildDiffStats(rows.value))

watch(
  () => diffResult.value.truncated,
  (v) => {
    truncated.value = v
  },
  { immediate: true }
)

/** 是否两边都为空（空状态提示） */
const isEmpty = computed(() => leftText.value === '' && rightText.value === '')
/** 是否完全一致 */
const isIdentical = computed(() => !isEmpty.value && stats.value.changed === 0)

/**
 * 「修改」行的词级高亮：按 aLine/bLine 组合做缓存，避免每帧重算。
 * Map 上限 2000 条，超出整体清空（简单可靠的 LRU 近似）。
 */
const wordCache = new Map()
function wordsFor(row) {
  const cacheKey = `${row.aLine}\u0000${row.bLine}\u0000${ignoreCase.value}\u0000${ignoreWhitespace.value}`
  let hit = wordCache.get(cacheKey)
  if (!hit) {
    hit = diffWords(row.aLine ?? '', row.bLine ?? '', options.value)
    if (wordCache.size > 2000) wordCache.clear()
    wordCache.set(cacheKey, hit)
  }
  return hit
}

/**
 * 展示用行序列：把连续的 equal 行折叠成「展开/收起」占位行。
 * 仅在 collapsed 开启且变更行数不太少时启用，避免把短文本也折叠成一行。
 */
const visibleRows = computed(() => {
  const all = rows.value
  if (!collapsed.value) return all.map((r, i) => ({ ...r, key: i }))

  const out = []
  let i = 0
  while (i < all.length) {
    if (all[i].type !== 'equal') {
      out.push({ ...all[i], key: i })
      i++
      continue
    }
    let j = i
    while (j < all.length && all[j].type === 'equal') j++
    const count = j - i
    // 连续相同行 <= 4 时不值得折叠
    if (count <= 4) {
      for (let k = i; k < j; k++) out.push({ ...all[k], key: k })
    } else {
      out.push({ type: 'hidden', count, key: `h${i}` })
    }
    i = j
  }
  return out
})

/** 仅差异视图：过滤掉 equal 与 hidden */
const changesRows = computed(() => rows.value.filter((r) => r.type !== 'equal'))

/** 统一视图：把 del/modify 的左侧与 add/modify 的右侧摊平成 Git 风格行 */
const unifiedRows = computed(() => {
  const out = []
  rows.value.forEach((r, i) => {
    if (r.type === 'equal') {
      out.push({ type: 'equal', text: r.aLine, aNo: r.aNo, bNo: r.bNo, key: `e${i}` })
    } else if (r.type === 'del') {
      out.push({ type: 'del', text: r.aLine, aNo: r.aNo, bNo: null, key: `d${i}` })
    } else if (r.type === 'add') {
      out.push({ type: 'add', text: r.bLine, aNo: null, bNo: r.bNo, key: `a${i}` })
    } else {
      out.push({ type: 'del', text: r.aLine, aNo: r.aNo, bNo: null, key: `md${i}` })
      out.push({ type: 'add', text: r.bLine, aNo: null, bNo: r.bNo, key: `ma${i}` })
    }
  })
  return out
})

/* ---------------- 统计文案 ---------------- */
const summaryText = computed(() => {
  const s = stats.value
  return $t('contentDiff.summary', {
    add: s.added,
    del: s.removed,
    mod: s.modified,
    same: s.same,
  })
})

/* ---------------- 操作 ---------------- */
function swapSides() {
  const tmp = leftText.value
  leftText.value = rightText.value
  rightText.value = tmp
  wordCache.clear()
}

function clearAll() {
  leftText.value = ''
  rightText.value = ''
  wordCache.clear()
}

/** 上传文本文件到指定侧 */
function pickFile(side) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt,.md,.json,.js,.ts,.css,.html,.xml,.yml,.yaml,.csv,.log,text/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      if (side === 'left') leftText.value = text
      else rightText.value = text
      wordCache.clear()
      message.success($t('contentDiff.imported', { name: file.name }))
    } catch {
      message.error($t('contentDiff.importFail'))
    }
  }
  input.click()
}

async function copyDiff() {
  const lines = []
  const stamp = `--- ${$t('contentDiff.leftLabel')}\n+++ ${$t('contentDiff.rightLabel')}`
  lines.push(stamp)
  for (const r of changesRows.value) {
    if (r.type === 'del') lines.push(`- ${r.aLine}`)
    else if (r.type === 'add') lines.push(`+ ${r.bLine}`)
    else if (r.type === 'modify') {
      lines.push(`- ${r.aLine}`)
      lines.push(`+ ${r.bLine}`)
    }
  }
  if (lines.length === 1) {
    message.info($t('contentDiff.noDiffToCopy'))
    return
  }
  const ok = await copyText(lines.join('\n'))
  message[ok ? 'success' : 'error']($t(ok ? 'contentDiff.copied' : 'contentDiff.copyFail'))
}

function exportDiff() {
  if (isEmpty.value) {
    message.info($t('contentDiff.noDiffToCopy'))
    return
  }
  // 统一 diff 文本：首行标注两侧来源，随后为 -/+ 变更行
  const lines = [`--- ${$t('contentDiff.leftLabel')}`, `+++ ${$t('contentDiff.rightLabel')}`]
  for (const r of changesRows.value) {
    if (r.type === 'del') lines.push(`- ${r.aLine}`)
    else if (r.type === 'add') lines.push(`+ ${r.bLine}`)
    else if (r.type === 'modify') {
      lines.push(`- ${r.aLine}`)
      lines.push(`+ ${r.bLine}`)
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  // 文件名带时间戳，避免多次导出互相覆盖
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  downloadBlob(blob, `diff-${stamp}.txt`)
  message.success($t('contentDiff.exported'))
}

/* ---------------- 左右滚动同步（并排视图） ---------------- */
const leftScrollEl = ref(null)
const rightScrollEl = ref(null)
/** 防止 scroll 事件互相触发的回环锁 */
let syncing = false

function onScroll(source) {
  if (viewMode.value !== 'split' || syncing) return
  const a = leftScrollEl.value
  const b = rightScrollEl.value
  if (!a || !b) return
  syncing = true
  const from = source === 'left' ? a : b
  const to = source === 'left' ? b : a
  // 两侧行数可能不同，按可滚动比例映射，近似对齐
  const fromMax = from.scrollHeight - from.clientHeight
  const toMax = to.scrollHeight - to.clientHeight
  to.scrollTop = fromMax > 0 ? (from.scrollTop / fromMax) * toMax : 0
  requestAnimationFrame(() => {
    syncing = false
  })
}

/* ---------------- 草稿持久化（防抖 400ms） ---------------- */
let draftTimer = null
onBeforeUnmount(() => clearTimeout(draftTimer))

watch([leftText, rightText, viewMode, ignoreCase, ignoreWhitespace, wrapLines, collapsed], () => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    setSetting(DRAFT_KEY, {
      leftText: leftText.value,
      rightText: rightText.value,
      viewMode: viewMode.value,
      ignoreCase: ignoreCase.value,
      ignoreWhitespace: ignoreWhitespace.value,
      wrapLines: wrapLines.value,
      collapsed: collapsed.value,
    }).catch(() => {})
  }, 400)
})

/* 恢复草稿 */
;(async () => {
  try {
    const saved = await getSetting(DRAFT_KEY)
    if (!saved || typeof saved !== 'object') return
    if (typeof saved.leftText === 'string') leftText.value = saved.leftText
    if (typeof saved.rightText === 'string') rightText.value = saved.rightText
    if (['split', 'unified', 'changes'].includes(saved.viewMode)) viewMode.value = saved.viewMode
    ignoreCase.value = !!saved.ignoreCase
    ignoreWhitespace.value = !!saved.ignoreWhitespace
    wrapLines.value = !!saved.wrapLines
    collapsed.value = !!saved.collapsed
  } catch {
    /* 草稿读取失败不影响使用 */
  }
})()

const VIEW_MODES = [
  { key: 'split', labelKey: 'contentDiff.viewSplit', icon: '⇄' },
  { key: 'unified', labelKey: 'contentDiff.viewUnified', icon: '≡' },
  { key: 'changes', labelKey: 'contentDiff.viewChanges', icon: '±' },
]
</script>

<template>
  <div class="cd-wrap">
    <!-- 工具栏：视图切换 + 选项 -->
    <div class="cd-toolbar">
      <div class="cd-views">
        <button
          v-for="v in VIEW_MODES"
          :key="v.key"
          class="cd-view-btn"
          :class="{ active: viewMode === v.key }"
          @click="viewMode = v.key"
        >
          <span class="cd-view-icon" aria-hidden="true">{{ v.icon }}</span>
          {{ $t(v.labelKey) }}
        </button>
      </div>

      <div class="cd-opts">
        <label class="cd-check">
          <input type="checkbox" v-model="ignoreCase" />
          <span>{{ $t('contentDiff.ignoreCase') }}</span>
        </label>
        <label class="cd-check">
          <input type="checkbox" v-model="ignoreWhitespace" />
          <span>{{ $t('contentDiff.ignoreWhitespace') }}</span>
        </label>
        <label class="cd-check">
          <input type="checkbox" v-model="wrapLines" />
          <span>{{ $t('contentDiff.wrapLines') }}</span>
        </label>
        <label class="cd-check">
          <input type="checkbox" v-model="collapsed" />
          <span>{{ $t('contentDiff.collapseSame') }}</span>
        </label>
      </div>
    </div>

    <!-- 输入区（两栏） -->
    <div class="cd-inputs">
      <div class="cd-input-col">
        <div class="cd-input-head">
          <span class="cd-input-title">{{ $t('contentDiff.leftLabel') }}</span>
          <div class="cd-input-acts">
            <button class="cd-mini" v-tip="$t('contentDiff.upload')" @click="pickFile('left')">
              <RiUpload2Line size="13" aria-hidden="true" />
            </button>
            <button class="cd-mini" v-tip="$t('contentDiff.clear')" @click="leftText = ''">
              <RiDeleteBin6Line size="13" aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          v-model="leftText"
          class="cd-textarea"
          spellcheck="false"
          :placeholder="$t('contentDiff.leftPlaceholder')"
        ></textarea>
      </div>

      <button class="cd-swap" v-tip="$t('contentDiff.swap')" :aria-label="$t('contentDiff.swap')" @click="swapSides">
        <RiArrowLeftRightLine size="16" aria-hidden="true" />
      </button>

      <div class="cd-input-col">
        <div class="cd-input-head">
          <span class="cd-input-title">{{ $t('contentDiff.rightLabel') }}</span>
          <div class="cd-input-acts">
            <button class="cd-mini" v-tip="$t('contentDiff.upload')" @click="pickFile('right')">
              <RiUpload2Line size="13" aria-hidden="true" />
            </button>
            <button class="cd-mini" v-tip="$t('contentDiff.clear')" @click="rightText = ''">
              <RiDeleteBin6Line size="13" aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          v-model="rightText"
          class="cd-textarea"
          spellcheck="false"
          :placeholder="$t('contentDiff.rightPlaceholder')"
        ></textarea>
      </div>
    </div>

    <!-- 概览条 -->
    <div class="cd-summary">
      <span class="cd-badge cd-badge-add">+{{ stats.added }}</span>
      <span class="cd-badge cd-badge-del">-{{ stats.removed }}</span>
      <span class="cd-badge cd-badge-mod">~{{ stats.modified }}</span>
      <span class="cd-badge cd-badge-same">={{ stats.same }}</span>
      <span class="cd-summary-text">{{ summaryText }}</span>
      <div class="cd-summary-acts">
        <button class="cd-btn" @click="copyDiff">
          <RiFileCopyLine size="13" aria-hidden="true" /> {{ $t('contentDiff.copyDiff') }}
        </button>
        <button class="cd-btn" @click="exportDiff">
          <RiDownloadLine size="13" aria-hidden="true" /> {{ $t('contentDiff.exportDiff') }}
        </button>
        <button class="cd-btn" @click="clearAll">
          <RiDeleteBin6Line size="13" aria-hidden="true" /> {{ $t('contentDiff.clearAll') }}
        </button>
      </div>
    </div>

    <!-- 结果区 -->
    <div class="cd-result">
      <!-- 超限降级 -->
      <div v-if="truncated" class="cd-empty cd-empty-warn">
        {{ $t('contentDiff.tooLarge', { max: MAX_LINES }) }}
      </div>

      <!-- 空状态 -->
      <div v-else-if="isEmpty" class="cd-empty">{{ $t('contentDiff.emptyHint') }}</div>

      <!-- 完全一致 -->
      <div v-else-if="isIdentical" class="cd-empty cd-empty-ok">
        {{ $t('contentDiff.identical') }}
      </div>

      <!-- 并排视图 -->
      <div v-else-if="viewMode === 'split'" class="cd-split">
        <div class="cd-split-head">
          <span class="cd-col-head">{{ $t('contentDiff.leftLabel') }}</span>
          <span class="cd-col-head">{{ $t('contentDiff.rightLabel') }}</span>
        </div>
        <div class="cd-split-body">
          <div ref="leftScrollEl" class="cd-col" @scroll="onScroll('left')">
            <template v-for="row in visibleRows" :key="row.key">
              <div v-if="row.type === 'hidden'" class="cd-row cd-row-hidden">
                <span class="cd-no">⋯</span>
                <span class="cd-line">{{ $t('contentDiff.hiddenLines', { n: row.count }) }}</span>
              </div>
              <div
                v-else
                class="cd-row"
                :class="[`cd-${row.type}`, { 'cd-nowrap': !wrapLines }]"
              >
                <span class="cd-no">{{ row.aNo ?? '' }}</span>
                <span class="cd-line">
                  <template v-if="row.type === 'modify'">
                    <span
                      v-for="(seg, si) in wordsFor(row).left"
                      :key="si"
                      :class="{ 'cd-word': seg.changed }"
                    >{{ seg.text }}</span>
                  </template>
                  <template v-else>{{ row.aLine ?? '' }}</template>
                </span>
              </div>
            </template>
          </div>

          <div ref="rightScrollEl" class="cd-col" @scroll="onScroll('right')">
            <template v-for="row in visibleRows" :key="row.key">
              <div v-if="row.type === 'hidden'" class="cd-row cd-row-hidden">
                <span class="cd-no">⋯</span>
                <span class="cd-line">{{ $t('contentDiff.hiddenLines', { n: row.count }) }}</span>
              </div>
              <div
                v-else
                class="cd-row"
                :class="[`cd-${row.type}`, { 'cd-nowrap': !wrapLines }]"
              >
                <span class="cd-no">{{ row.bNo ?? '' }}</span>
                <span class="cd-line">
                  <template v-if="row.type === 'modify'">
                    <span
                      v-for="(seg, si) in wordsFor(row).right"
                      :key="si"
                      :class="{ 'cd-word': seg.changed }"
                    >{{ seg.text }}</span>
                  </template>
                  <template v-else>{{ row.bLine ?? '' }}</template>
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 统一视图 -->
      <div v-else-if="viewMode === 'unified'" class="cd-unified">
        <div class="cd-col cd-col-full">
          <div
            v-for="row in unifiedRows"
            :key="row.key"
            class="cd-row"
            :class="[`cd-${row.type}`, { 'cd-nowrap': !wrapLines }]"
          >
            <span class="cd-no">{{ row.aNo ?? '' }}</span>
            <span class="cd-no">{{ row.bNo ?? '' }}</span>
            <span class="cd-sign" aria-hidden="true">{{ row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ' }}</span>
            <span class="cd-line">{{ row.text }}</span>
          </div>
        </div>
      </div>

      <!-- 仅差异视图 -->
      <div v-else class="cd-changes">
        <div class="cd-col cd-col-full">
          <div
            v-for="(row, i) in changesRows"
            :key="`c${i}`"
            class="cd-row"
            :class="[`cd-${row.type}`, { 'cd-nowrap': !wrapLines }]"
          >
            <span class="cd-no">{{ row.aNo ?? '' }}</span>
            <span class="cd-no">{{ row.bNo ?? '' }}</span>
            <span class="cd-sign" aria-hidden="true">{{ row.type === 'add' ? '+' : row.type === 'del' ? '-' : '~' }}</span>
            <span class="cd-line">
              <template v-if="row.type === 'modify'">
                <span
                  v-for="(seg, si) in wordsFor(row).left"
                  :key="`l${si}`"
                  :class="{ 'cd-word': seg.changed }"
                >{{ seg.text }}</span>
                <span class="cd-arrow" aria-hidden="true">→</span>
                <span
                  v-for="(seg, si) in wordsFor(row).right"
                  :key="`r${si}`"
                  :class="{ 'cd-word': seg.changed }"
                >{{ seg.text }}</span>
              </template>
              <template v-else>{{ row.type === 'add' ? row.bLine : row.aLine }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.cd-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

/* 工具栏 */
.cd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.cd-views {
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.12);
}

.cd-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  font-size: 12px;
  color: @text-soft;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover { color: @text; }
  &.active { color: #fff; background: @accent; }
}

.cd-view-icon {
  font-size: 12px;
  line-height: 1;
}

.cd-opts {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cd-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: @text-soft;
  cursor: pointer;
  user-select: none;

  input {
    width: 13px;
    height: 13px;
    accent-color: @accent;
    cursor: pointer;
    margin: 0;
  }

  &:hover { color: @text; }
}

/* 输入区 */
.cd-inputs {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.cd-input-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cd-input-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.cd-input-title {
  font-size: 11px;
  font-weight: 600;
  color: @text-soft;
}

.cd-input-acts {
  display: inline-flex;
  gap: 4px;
}

.cd-mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(255, 255, 255, 0.6);
  color: @text-soft;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: @accent;
    border-color: color-mix(in srgb, @accent 45%, transparent);
  }
}

.cd-textarea {
  width: 100%;
  height: 108px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  line-height: 1.55;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: @accent; }
}

.cd-swap {
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.7);
  color: @text-soft;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: @accent;
    border-color: color-mix(in srgb, @accent 45%, transparent);
    transform: rotate(180deg);
  }
}

/* 概览 */
.cd-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: 9px;
  background: rgba(127, 127, 127, 0.06);
}

.cd-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: @radius-pill;
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.cd-badge-add { color: #15803d; background: rgba(34, 197, 94, 0.14); }
.cd-badge-del { color: #b91c1c; background: rgba(239, 68, 68, 0.14); }
.cd-badge-mod { color: #b45309; background: rgba(245, 158, 11, 0.16); }
.cd-badge-same { color: @text-soft; background: rgba(127, 127, 127, 0.12); }

.cd-summary-text {
  font-size: 11px;
  color: @text-soft;
  flex: 1;
  min-width: 0;
}

.cd-summary-acts {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cd-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: @radius-pill;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  color: @text-soft;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: @accent;
    border-color: color-mix(in srgb, @accent 45%, transparent);
  }
}

/* 结果区 */
.cd-result {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  border-radius: @radius-card;
  border: 1px solid rgba(127, 127, 127, 0.18);
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}

.cd-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 32px 16px;
  font-size: 12.5px;
  color: @text-soft;
  text-align: center;

  &.cd-empty-ok { color: #15803d; }
  &.cd-empty-warn { color: #b45309; }
}

/* 并排 */
.cd-split {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.cd-split-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid rgba(127, 127, 127, 0.16);
  background: rgba(127, 127, 127, 0.05);
}

.cd-col-head {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  color: @text-soft;

  & + .cd-col-head { border-left: 1px solid rgba(127, 127, 127, 0.16); }
}

.cd-split-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 0;
}

.cd-col {
  overflow: auto;
  min-width: 0;
  min-height: 0;
  .thin-scrollbar();

  & + .cd-col { border-left: 1px solid rgba(127, 127, 127, 0.16); }
}

.cd-col-full {
  flex: 1;
  overflow: auto;
  .thin-scrollbar();
}

.cd-unified,
.cd-changes {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 行 */
.cd-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-height: 20px;

  &.cd-nowrap .cd-line {
    white-space: pre;
  }
}

.cd-no {
  flex: 0 0 34px;
  text-align: right;
  color: rgba(127, 127, 127, 0.75);
  font-size: 10.5px;
  line-height: 1.75;
  user-select: none;
}

.cd-sign {
  flex: 0 0 10px;
  text-align: center;
  color: rgba(127, 127, 127, 0.8);
  user-select: none;
}

.cd-line {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.cd-equal { background: transparent; }
.cd-del { background: rgba(239, 68, 68, 0.1); }
.cd-add { background: rgba(34, 197, 94, 0.11); }
.cd-modify { background: rgba(245, 158, 11, 0.12); }

/* 词级高亮 */
.cd-word {
  border-radius: 3px;
  padding: 0 1px;
  background: rgba(245, 158, 11, 0.45);
  font-weight: 600;
}

.cd-del .cd-word { background: rgba(239, 68, 68, 0.38); }
.cd-add .cd-word { background: rgba(34, 197, 94, 0.4); }

.cd-arrow {
  color: @text-soft;
  margin: 0 6px;
  user-select: none;
}

.cd-row-hidden {
  background: rgba(127, 127, 127, 0.06);

  .cd-line {
    color: @text-soft;
    font-size: 11px;
    font-style: italic;
  }
}

@media (max-width: 720px) {
  .cd-inputs { flex-direction: column; }
  .cd-swap { align-self: center; }
  .cd-split-body { grid-template-columns: 1fr; }
  .cd-col + .cd-col { border-left: none; border-top: 1px solid rgba(127, 127, 127, 0.16); }
}
</style>

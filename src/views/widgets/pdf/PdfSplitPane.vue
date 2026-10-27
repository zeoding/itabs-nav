<script setup>
/**
 * 拆分面板：单个 PDF 按页码范围切成多个文件。
 * 范围解析/夹取/去重见 utils/pdfTools.parsePageRanges（输入实时解析出 chips，
 * 每个 chip 可单独预览）；「拆分并下载」逐个生成下载。
 */
import { computed, ref, shallowRef } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { downloadBlob } from '@/utils/download'
import { createPdf, formatBytes, loadPdf, parsePageRanges, sanitizePdfName } from '@/utils/pdfTools'
import { RiDownloadLine, RiEyeLine, RiFilePdf2Line, RiFilePdfLine, RiLoader4Line } from '@remixicon/vue'

const emit = defineEmits(['preview'])
const message = useMessage()

const file = shallowRef(null)
const pageCount = ref(0)
const rangesInput = ref('')
const working = ref(false)
const isDragging = ref(false)
const inputRef = ref(null)
let dragDepth = 0

const parsed = computed(() => parsePageRanges(rangesInput.value, pageCount.value))
const canRun = computed(() => !!file.value && parsed.value.ranges.length > 0 && !parsed.value.errors.length)

function isPdf(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
}

async function setFile(f) {
  if (!isPdf(f)) {
    message.warning($t('pdfMerge.invalidType', { name: f.name }))
    return
  }
  try {
    const doc = await loadPdf(f)
    file.value = f
    pageCount.value = doc.getPageCount()
  } catch {
    message.error($t('pdfMerge.fileFailed', { name: f.name }))
  }
}

function pick() {
  inputRef.value?.click()
}

function onPick(event) {
  if (event.target.files[0]) setFile(event.target.files[0])
  event.target.value = ''
}

/* 单文件拖拽：dragenter/leave 因子元素冒泡成对触发，depth 计数抵消 */
function onDragEnter(event) {
  if (!event.dataTransfer?.types?.includes('Files')) return
  dragDepth++
  isDragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) isDragging.value = false
}

function onDrop(event) {
  event.preventDefault()
  dragDepth = 0
  isDragging.value = false
  const list = [...(event.dataTransfer?.files || [])]
  if (list.length) setFile(list[0])
}

function rangeFileName(base, { start, end }) {
  return `${base}-p${start}${end > start ? `-${end}` : ''}.pdf`
}

/** 一个范围 → 一份 PDF（copyPages 支持乱序/重复索引，这里按升序取页） */
async function buildRangeBlob(doc, start, end) {
  const out = await createPdf()
  const indices = []
  for (let p = start; p <= end; p++) indices.push(p - 1)
  ;(await out.copyPages(doc, indices)).forEach((page) => out.addPage(page))
  return new Blob([await out.save()], { type: 'application/pdf' })
}

async function previewRange(range) {
  if (working.value) return
  working.value = true
  try {
    const doc = await loadPdf(file.value)
    const blob = await buildRangeBlob(doc, range.start, range.end)
    emit('preview', { blob, name: rangeFileName(sanitizePdfName(file.value.name), range) })
  } catch {
    message.error($t('pdfMerge.fileFailed', { name: file.value.name }))
  } finally {
    working.value = false
  }
}

async function runSplit() {
  if (!canRun.value || working.value) return
  working.value = true
  try {
    const doc = await loadPdf(file.value)
    const base = sanitizePdfName(file.value.name)
    const ranges = parsed.value.ranges
    for (const range of ranges) {
      downloadBlob(await buildRangeBlob(doc, range.start, range.end), rangeFileName(base, range))
      await new Promise((resolve) => setTimeout(resolve, 200)) // 连续触发下载留间隔，避免被浏览器拦截
    }
    message.success($t('pdfMerge.splitDone', { n: ranges.length }))
  } catch {
    message.error($t('pdfMerge.failed'))
  } finally {
    working.value = false
  }
}

/** 一键填入「每页一个范围」；页数过多时拒绝并提示手动填写 */
function eachPage() {
  if (pageCount.value > 100) {
    message.warning($t('pdfMerge.splitEachPageWarn', { n: 100 }))
    return
  }
  rangesInput.value = Array.from({ length: pageCount.value }, (_, i) => i + 1).join(',')
}
</script>

<template>
  <div class="pane">
    <div
      v-if="!file"
      class="dropzone"
      :class="{ dragging: isDragging }"
      role="button"
      tabindex="0"
      :aria-label="$t('pdfMerge.singleAddHint')"
      @click="pick"
      @keydown.enter.prevent="pick"
      @keydown.space.prevent="pick"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover.prevent
      @drop="onDrop"
    >
      <RiFilePdf2Line size="30" aria-hidden="true" />
      <p class="dz-main">{{ $t('pdfMerge.singleAddHint') }}</p>
      <span class="dz-hint">{{ $t('pdfMerge.pick') }}</span>
      <input
        ref="inputRef"
        type="file"
        class="dz-input"
        accept=".pdf,application/pdf"
        @change="onPick"
      />
    </div>

    <template v-else>
      <div class="file-card">
        <RiFilePdfLine size="15" class="fc-icon" aria-hidden="true" />
        <span class="fc-name" :title="file.name">{{ file.name }}</span>
        <span class="fc-meta">{{ formatBytes(file.size) }} · {{ $t('pdfMerge.pages', { n: pageCount }) }}</span>
        <button type="button" class="fc-btn" :disabled="working" @click="pick">
          {{ $t('pdfMerge.replace') }}
        </button>
        <input
          ref="inputRef"
          type="file"
          class="dz-input"
          accept=".pdf,application/pdf"
          @change="onPick"
        />
      </div>

      <div class="field-row">
        <label class="field-label" for="pdf-split-ranges">{{ $t('pdfMerge.splitRangesLabel') }}</label>
        <input
          id="pdf-split-ranges"
          v-model="rangesInput"
          class="field-input"
          type="text"
          :placeholder="$t('pdfMerge.splitRangesPlaceholder')"
          :disabled="working"
          @keydown.enter="runSplit"
        />
      </div>
      <p class="hint">{{ $t('pdfMerge.splitRangesHint') }}</p>
      <p v-if="parsed.errors.length" class="warn">
        {{ $t('pdfMerge.splitInvalidRange', { tokens: parsed.errors.join('、') }) }}
      </p>

      <!-- 实时解析出的范围 chips：可单独预览 -->
      <div v-if="parsed.ranges.length" class="chips">
        <span v-for="(range, i) in parsed.ranges" :key="i" class="chip">
          <span class="chip-text">
            p{{ range.start }}<template v-if="range.end > range.start">–{{ range.end }}</template>
            （{{ $t('pdfMerge.pages', { n: range.end - range.start + 1 }) }}）
          </span>
          <button
            type="button"
            class="chip-btn"
            :aria-label="$t('pdfMerge.preview')"
            :disabled="working"
            @click="previewRange(range)"
          >
            <RiEyeLine size="12" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div class="action-bar">
        <button type="button" class="ghost-btn" :disabled="working || pageCount < 2" @click="eachPage">
          {{ $t('pdfMerge.splitEachPage') }}
        </button>
        <button type="button" class="primary-btn" :disabled="!canRun || working" @click="runSplit">
          <RiLoader4Line v-if="working" size="14" class="spin" aria-hidden="true" />
          <RiDownloadLine v-else size="14" aria-hidden="true" />
          {{ working ? $t('pdfMerge.merging') : $t('pdfMerge.splitRun') }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * 水印面板：给单个 PDF 的全部页面平铺文字水印。
 * 文字经 canvas 栅格化成 PNG 再 embedPng（见 utils/pdfTools.addWatermark）：
 * pdf-lib 标准字体不支持中文，canvas 走浏览器字体渲染，任意文字都能用。
 * 每次生成都从原文件重载，反复调参不会叠加旧水印。
 */
import { ref, shallowRef } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { downloadBlob } from '@/utils/download'
import { addWatermark, formatBytes, loadPdf, sanitizePdfName } from '@/utils/pdfTools'
import { RiDropLine, RiFilePdf2Line, RiFilePdfLine, RiLoader4Line } from '@remixicon/vue'

const emit = defineEmits(['preview'])
const message = useMessage()

const file = shallowRef(null)
const pageCount = ref(0)
const wmText = ref('')
const fontSize = ref(48)
const opacity = ref(0.15)
const angle = ref(-30)
const working = ref(false)
const isDragging = ref(false)
const inputRef = ref(null)
let dragDepth = 0

const angles = [-45, -30, -15, 0, 15, 30, 45]

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

async function run() {
  if (!file.value || working.value) return
  const text = wmText.value.trim()
  if (!text) {
    message.warning($t('pdfMerge.wmTextRequired'))
    return
  }
  working.value = true
  try {
    const doc = await loadPdf(file.value)
    await addWatermark(doc, { text, fontSize: fontSize.value, opacity: opacity.value, angle: angle.value })
    const name = `${sanitizePdfName(file.value.name)}-watermark.pdf`
    const blob = new Blob([await doc.save()], { type: 'application/pdf' })
    downloadBlob(blob, name)
    emit('preview', { blob, name })
    message.success($t('pdfMerge.done', { name }))
  } catch {
    message.error($t('pdfMerge.failed'))
  } finally {
    working.value = false
  }
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
        <label class="field-label" for="pdf-wm-text">{{ $t('pdfMerge.wmTextLabel') }}</label>
        <input
          id="pdf-wm-text"
          v-model="wmText"
          class="field-input"
          type="text"
          :placeholder="$t('pdfMerge.wmTextPlaceholder')"
          maxlength="60"
          :disabled="working"
          @keydown.enter="run"
        />
      </div>

      <div class="wm-opts">
        <label class="opt">
          <span class="opt-label">{{ $t('pdfMerge.wmFontSize') }}</span>
          <input v-model.number="fontSize" type="number" min="12" max="120" step="2" :disabled="working" />
        </label>
        <label class="opt">
          <span class="opt-label">{{ $t('pdfMerge.wmOpacity') }}</span>
          <input v-model.number="opacity" type="range" min="0.05" max="0.6" step="0.05" :disabled="working" />
          <em class="opt-value">{{ Math.round(opacity * 100) }}%</em>
        </label>
        <label class="opt">
          <span class="opt-label">{{ $t('pdfMerge.wmAngle') }}</span>
          <select v-model.number="angle" :disabled="working">
            <option v-for="a in angles" :key="a" :value="a">{{ a }}°</option>
          </select>
        </label>
      </div>

      <div class="action-bar">
        <button type="button" class="primary-btn" :disabled="!file || working" @click="run">
          <RiLoader4Line v-if="working" size="14" class="spin" aria-hidden="true" />
          <RiDropLine v-else size="14" aria-hidden="true" />
          {{ working ? $t('pdfMerge.merging') : $t('pdfMerge.wmRun') }}
        </button>
      </div>
    </template>
  </div>
</template>

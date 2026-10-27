<script setup>
/**
 * 合并面板：多份 PDF 排序后合并为一个文件。
 * 排序/增删用 shallowRef 整组替换（File/Blob 不做深度响应化，避免 Proxy
 * 包装影响第三方库读取）；合并结果下载并 emit('preview') 交给壳组件预览。
 */
import { computed, ref, shallowRef } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { downloadBlob } from '@/utils/download'
import { createPdf, formatBytes, loadPdf, sanitizePdfName } from '@/utils/pdfTools'
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCloseLine,
  RiDownloadLine,
  RiFilePdf2Line,
  RiFilePdfLine,
  RiLoader4Line,
} from '@remixicon/vue'

const emit = defineEmits(['preview'])
const message = useMessage()

/** 文件列表：{ id, file, name, size } */
const files = shallowRef([])
const inputRef = ref(null)
const merging = ref(false)
const isDragging = ref(false)
let uid = 0
let dragDepth = 0

const canMerge = computed(() => files.value.length >= 2)
const totalSize = computed(() => files.value.reduce((sum, item) => sum + item.size, 0))

function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/** 追加文件：过滤非 PDF、按 名称+大小 去重 */
function addFiles(list) {
  const next = [...files.value]
  const rejected = []
  for (const file of list) {
    if (!isPdf(file)) {
      rejected.push(file.name)
      continue
    }
    if (next.some((item) => item.name === file.name && item.size === file.size)) continue
    next.push({ id: ++uid, file, name: file.name, size: file.size })
  }
  if (rejected.length) {
    message.warning($t('pdfMerge.invalidType', { name: rejected.join('、') }))
  }
  files.value = next
}

function pick() {
  inputRef.value?.click()
}

function onPick(event) {
  addFiles([...event.target.files])
  event.target.value = '' // 允许重复选择同一文件
}

/* 拖拽多文件：dragenter/leave 因子元素冒泡成对触发，depth 计数抵消 */
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
  if (list.length) addFiles(list)
}

/** 相邻交换排序（dir: -1 上移 / 1 下移） */
function move(index, dir) {
  const target = index + dir
  const next = [...files.value]
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  files.value = next
}

function removeAt(index) {
  files.value = files.value.filter((_, i) => i !== index)
}

function clearAll() {
  files.value = []
}

/** 默认输出名（不含扩展名）：pdf-merge-YYYYMMDD-HHmmss */
function defaultBase() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `pdf-merge-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const baseName = ref(defaultBase())

async function merge() {
  if (!canMerge.value || merging.value) return
  const list = [...files.value] // 合并期间的新增/删除不影响本次快照
  merging.value = true
  try {
    const out = await createPdf()
    for (const item of list) {
      try {
        const src = await loadPdf(item.file)
        ;(await out.copyPages(src, src.getPageIndices())).forEach((page) => out.addPage(page))
      } catch {
        throw new Error($t('pdfMerge.fileFailed', { name: item.name }))
      }
    }
    const base = sanitizePdfName(baseName.value, defaultBase())
    baseName.value = base // 清洗结果回填输入框，实际文件名对用户可见
    const name = `${base}.pdf`
    const blob = new Blob([await out.save()], { type: 'application/pdf' })
    downloadBlob(blob, name)
    emit('preview', { blob, name })
    message.success($t('pdfMerge.done', { name }))
  } catch (error) {
    message.error(error?.message || $t('pdfMerge.failed'))
  } finally {
    merging.value = false
  }
}
</script>

<template>
  <div class="pane">
    <!-- 导入区：点击 / 拖拽（多文件），拖入时高亮 -->
    <div
      class="dropzone"
      :class="{ dragging: isDragging }"
      role="button"
      tabindex="0"
      :aria-label="$t('pdfMerge.addHint')"
      @click="pick"
      @keydown.enter.prevent="pick"
      @keydown.space.prevent="pick"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover.prevent
      @drop="onDrop"
    >
      <RiFilePdf2Line size="30" aria-hidden="true" />
      <p class="dz-main">{{ $t('pdfMerge.addHint') }}</p>
      <span class="dz-hint">{{ $t('pdfMerge.pick') }}</span>
      <input
        ref="inputRef"
        type="file"
        class="dz-input"
        accept=".pdf,application/pdf"
        multiple
        @change="onPick"
      />
    </div>

    <!-- 文件列表（合并顺序即列表顺序） -->
    <ul v-if="files.length" class="file-list">
      <li v-for="(item, index) in files" :key="item.id">
        <span class="f-index">{{ index + 1 }}</span>
        <RiFilePdfLine size="15" class="f-icon" aria-hidden="true" />
        <span class="f-name" :title="item.name">{{ item.name }}</span>
        <span class="f-size">{{ formatBytes(item.size) }}</span>
        <div class="f-ops">
          <button
            type="button"
            v-tip="$t('pdfMerge.moveUp')"
            :aria-label="$t('pdfMerge.moveUp')"
            :disabled="index === 0 || merging"
            @click="move(index, -1)"
          >
            <RiArrowUpLine size="14" aria-hidden="true" />
          </button>
          <button
            type="button"
            v-tip="$t('pdfMerge.moveDown')"
            :aria-label="$t('pdfMerge.moveDown')"
            :disabled="index === files.length - 1 || merging"
            @click="move(index, 1)"
          >
            <RiArrowDownLine size="14" aria-hidden="true" />
          </button>
          <button
            type="button"
            v-tip="$t('common.delete')"
            :aria-label="$t('common.delete')"
            :disabled="merging"
            @click="removeAt(index)"
          >
            <RiCloseLine size="14" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <p v-else class="empty-tip">{{ $t('pdfMerge.empty') }}</p>

    <!-- 输出文件名：可编辑，.pdf 后缀固定补上 -->
    <div class="name-row">
      <label class="name-label" for="pdf-merge-name">{{ $t('pdfMerge.outputName') }}</label>
      <div class="name-field">
        <input
          id="pdf-merge-name"
          v-model="baseName"
          class="name-input"
          type="text"
          :placeholder="$t('pdfMerge.namePlaceholder')"
          :disabled="merging"
          maxlength="120"
          @keydown.enter="merge"
        />
        <span class="name-ext">.pdf</span>
      </div>
    </div>

    <!-- 统计 + 合并动作 -->
    <div class="merge-bar">
      <span v-if="files.length" class="bar-meta">
        {{ $t('pdfMerge.count', { n: files.length }) }} · {{ formatBytes(totalSize) }}
        <button class="link-btn" type="button" :disabled="merging" @click="clearAll">
          {{ $t('pdfMerge.clear') }}
        </button>
      </span>
      <button class="primary-btn" type="button" :disabled="!canMerge || merging" @click="merge">
        <RiLoader4Line v-if="merging" size="14" class="spin" aria-hidden="true" />
        <RiDownloadLine v-else size="14" aria-hidden="true" />
        {{ merging ? $t('pdfMerge.merging') : $t('pdfMerge.merge') }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * PDF 合并小组件
 *
 * 功能：
 *  - 点击选择 / 拖拽（可多文件）导入 PDF，列表内上移 / 下移调整合并顺序
 *  - 按列表顺序合并为一个 PDF 并触发下载，全程浏览器本地完成，不上传
 *
 * 实现说明：
 *  - pdf-lib 随 vite pdf-libs 分组独立成块，且在本组件内首次点击「合并」才动态
 *    import：打开面板不下载 ~500KB 依赖，只有真正合并时才拉取（构建进 PWA 预缓存）
 *  - files 用 shallowRef + 整组替换：File/Blob 不被深度响应化代理（Proxy 包装的
 *    File 传给第三方库有兼容风险），排序/增删都生成新数组触发更新
 *  - 拖拽多文件与 useFileDrop 单文件语义不同（那里只取 files[0]），这里按同一
 *    dragDepth 计数思路在组件内实现，接受 dataTransfer 里的全部 PDF
 *  - ignoreEncryption: true 兼容仅设了所有者权限的 PDF；真正损坏的文件会在
 *    load/copyPages 抛错，按文件名提示并中止本次合并
 */
import { computed, ref, shallowRef } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { downloadBlob } from '@/utils/download'
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCloseLine,
  RiDownloadLine,
  RiFilePdf2Line,
  RiFilePdfLine,
  RiLoader4Line,
} from '@remixicon/vue'

const message = useMessage()

/** 文件列表：{ id, file, name, size }；shallowRef 整组替换驱动视图 */
const files = shallowRef([])
const inputRef = ref(null)
const merging = ref(false)
const isDragging = ref(false)
let uid = 0
let dragDepth = 0

const canMerge = computed(() => files.value.length >= 2)
const totalSize = computed(() => files.value.reduce((sum, item) => sum + item.size, 0))

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/** 追加文件：过滤非 PDF、按 名称+大小 去重，追加到列表末尾 */
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

/* ---- 拖拽导入（多文件）：dragenter/leave 因子元素冒泡成对触发，depth 计数抵消 ---- */
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

/** 输出文件名：pdf-merge-YYYYMMDD-HHmmss.pdf */
function outputName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `pdf-merge-${stamp}.pdf`
}

async function merge() {
  if (!canMerge.value || merging.value) return
  const list = [...files.value] // 合并期间的新增/删除不影响本次快照
  merging.value = true
  try {
    const { PDFDocument } = await import('pdf-lib')
    const out = await PDFDocument.create()
    for (const item of list) {
      try {
        const src = await PDFDocument.load(await item.file.arrayBuffer(), { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((page) => out.addPage(page))
      } catch {
        throw new Error($t('pdfMerge.fileFailed', { name: item.name }))
      }
    }
    const bytes = await out.save()
    const name = outputName()
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name)
    message.success($t('pdfMerge.done', { name }))
  } catch (error) {
    message.error(error?.message || $t('pdfMerge.failed'))
  } finally {
    merging.value = false
  }
}
</script>

<template>
  <div class="pdf-merge">
    <!-- 导入区：点击 / 拖拽，拖入时高亮 -->
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
        <span class="f-size">{{ formatSize(item.size) }}</span>
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

    <!-- 统计 + 合并动作 -->
    <div class="merge-bar">
      <span v-if="files.length" class="bar-meta">
        {{ $t('pdfMerge.count', { n: files.length }) }} · {{ formatSize(totalSize) }}
        <button class="link-btn" type="button" :disabled="merging" @click="clearAll">
          {{ $t('pdfMerge.clear') }}
        </button>
      </span>
      <button class="merge-btn" type="button" :disabled="!canMerge || merging" @click="merge">
        <RiLoader4Line v-if="merging" size="14" class="spin" aria-hidden="true" />
        <RiDownloadLine v-else size="14" aria-hidden="true" />
        {{ merging ? $t('pdfMerge.merging') : $t('pdfMerge.merge') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.pdf-merge {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* 导入区 */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 26px 16px;
  border: 1.5px dashed color-mix(in srgb, @accent 40%, transparent);
  border-radius: @radius-card;
  color: @accent;
  background: @accent-soft;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: @accent;
    outline: none;
  }

  &.dragging {
    border-color: @accent;
    background: color-mix(in srgb, @accent-soft 60%, @accent 12%);
    transform: scale(1.01);
  }
}

.dz-main {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: @text;
}

.dz-hint {
  font-size: 12px;
  color: @text-soft;
}

.dz-input {
  display: none;
}

/* 文件列表 */
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  .thin-scrollbar(color-mix(in srgb, @accent 0.3%, transparent));

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: @radius-card;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  }
}

.f-index {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: @radius-circle;
  font-size: 11px;
  font-weight: 600;
  color: @accent;
  background: @accent-soft;
  font-variant-numeric: tabular-nums;
}

.f-icon {
  flex: 0 0 auto;
  color: @text-soft;
}

.f-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: @text;
  .ellipsis();
}

.f-size {
  flex: 0 0 auto;
  font-size: 11px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
}

.f-ops {
  flex: 0 0 auto;
  display: flex;
  gap: 2px;

  button {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: @radius-circle;
    color: @text-soft;
    background: none;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover:not(:disabled) {
      color: @text;
      background: rgba(127, 127, 127, 0.14);
    }

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
  }
}

.empty-tip {
  margin: 0;
  padding: 10px 2px;
  font-size: 12px;
  color: @text-soft;
  text-align: center;
}

/* 统计 + 合并按钮 */
.merge-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.bar-meta {
  font-size: 12px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
}

.link-btn {
  margin-left: 8px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: @accent;
  cursor: pointer;

  &:hover:not(:disabled) {
    text-decoration: underline;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.merge-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: @radius-pill;
  font-size: 13px;
  color: #fff;
  background: @accent-gradient;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 40%, transparent);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .spin {
    animation: spin360 0.9s linear infinite;
  }
}
</style>

<script setup>
/**
 * 二维码 生成 / 解码 小组件
 *
 * 功能：
 *  - 生成：输入文本/链接，实时生成二维码；可选容错级别(L/M/Q/H)、输出尺寸、留白
 *    支持「异形」样式：码点/定位点形状（方/圆角/圆点）、前景/背景色、渐变前景
 *    支持中间放置 Logo（可上传图片、调整大小，自动垫底防止遮码）
 *    下载 PNG、复制内容
 *  - 解码：选择图片 / 拖拽 / 剪贴板粘贴(Ctrl+V) 导入二维码图片，
 *    用 jsQR 识别，展示结果并可复制、跳转链接
 *
 * 实现说明：
 *  - qrcode-generator 生成、jsqr 解码，两者零依赖，随本组件懒加载，不进首屏包
 *  - qrcode-generator 默认 stringToBytes 只取低字节，中文会乱码，这里覆盖为 UTF-8
 *  - 样式渲染基于 isDark() 自行绘制：码点可圆角/圆形、定位点单独绘制（保留 1 模块
 *    环宽），Logo 先垫背景板再绘制，含 Logo 时建议容错级别 H
 *  - 解码在隐藏 canvas 上绘制后取 ImageData；超大图先降采样，兼顾识别率与性能
 */
import { ref, shallowRef, computed, watch, onMounted, nextTick } from 'vue'
import qrcode from 'qrcode-generator'
import jsQR from 'jsqr'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { useFileDrop } from '@/composables/useFileDrop'
import { copyText as copyToClipboard } from '@/utils/clipboard'
import { isSafeHttpUrl, openExternal } from '@/utils/openExternal'
import { RiDownloadLine, RiFileCopyLine, RiImageAddLine, RiImageLine } from '@remixicon/vue'

/* ---------------- qrcode-generator UTF-8 补丁 ---------------- */
/** 按 UTF-8 编码为字节数组（覆盖默认的低字节实现，保证中文/emoji 正确） */
function utf8ToBytes(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)
    if (code > 0xffff) i++ // 代理对占两个 code unit
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return out
}
qrcode.stringToBytes = utf8ToBytes

const message = useMessage()

const mode = ref('gen') // 'gen' | 'dec'

/* ---------------- 生成 ---------------- */

const EC_LEVELS = ['L', 'M', 'Q', 'H']
const SIZE_PRESETS = [320, 512, 768, 1024]
const SHAPES = ['square', 'rounded', 'dot'] // 方 / 圆角 / 圆点
/** 预设配色（前景 / 背景） */
const COLOR_PRESETS = [
  { fg: '#111111', bg: '#ffffff' },
  { fg: '#1d4ed8', bg: '#eff6ff' },
  { fg: '#047857', bg: '#ecfdf5' },
  { fg: '#b91c1c', bg: '#fef2f2' },
  { fg: '#7c3aed', bg: '#f5f3ff' },
  { fg: '#0f172a', bg: '#fef3c7' },
]

const text = ref('')
const ecLevel = ref('M')
const outSize = ref(512)
const margin = ref(1) // 留白（单位：模块数）
const genError = ref('')
const genCanvas = ref(null)

/* 异形样式 */
const fgColor = ref('#111111')
const bgColor = ref('#ffffff')
const gradient = ref(false)
const gradColor = ref('#3b82f6')
const eyeColor = ref('#111111')
const moduleShape = ref('rounded')
const eyeStyle = ref('rounded')

/* Logo */
const logoFileRef = ref(null)
const logoImg = shallowRef(null) // HTMLImageElement（shallowRef 避免被深度响应化）
const logoUrl = ref('')
const logoRatio = ref(0.22) // Logo 边长占二维码边长比例

/* ---------------- 绘制辅助 ---------------- */

/** 圆角矩形路径（不依赖 ctx.roundRect，兼容旧浏览器） */
function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

/** 以当前 fillStyle 绘制一个 size 大小的方块/圆角/圆形 */
function fillShape(ctx, x, y, size, style, rRatio = 0.3) {
  if (style === 'dot') {
    const c = size / 2
    ctx.beginPath()
    ctx.arc(x + c, y + c, c, 0, Math.PI * 2)
    ctx.fill()
  } else if (style === 'rounded') {
    roundRectPath(ctx, x, y, size, size, size * rRatio)
    ctx.fill()
  } else {
    ctx.fillRect(x, y, size, size)
  }
}

/** 定位点（7×7 回字）单独绘制：外框 fg → 内圈 bg → 中心 fg，保证 1 模块环宽 */
function drawEye(ctx, x, y, cell, style, fg, bg) {
  const s7 = cell * 7
  const s5 = cell * 5
  const s3 = cell * 3
  if (style === 'dot') {
    const cx = x + s7 / 2
    const cy = y + s7 / 2
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.arc(cx, cy, s7 / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(cx, cy, s5 / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.arc(cx, cy, s3 / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = fg
    fillShape(ctx, x, y, s7, style, 0.24)
    ctx.fillStyle = bg
    fillShape(ctx, x + cell, y + cell, s5, style, 0.2)
    ctx.fillStyle = fg
    fillShape(ctx, x + cell * 2, y + cell * 2, s3, style, 0.28)
  }
}

/** 定位点判定：三个角的 7×7 区域 */
function isFinder(row, col, count) {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= count - 7) ||
    (row >= count - 7 && col < 7)
  )
}

function renderQr() {
  const canvas = genCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  if (!text.value) {
    genError.value = ''
    canvas.width = outSize.value
    canvas.height = outSize.value
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }

  let qr
  try {
    qr = qrcode(0, ecLevel.value) // typeNumber 0 = 自动
    qr.addData(text.value)
    qr.make()
  } catch {
    genError.value = $t('qrCode.tooLong')
    return
  }
  genError.value = ''

  const count = qr.getModuleCount()
  const m = margin.value
  const total = count + m * 2
  const cell = Math.max(1, Math.floor(outSize.value / total))
  const size = cell * total
  canvas.width = size
  canvas.height = size

  // 背景（含留白区）
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, size, size)

  // 前景：纯色或对角渐变
  let fg = fgColor.value
  if (gradient.value) {
    const g = ctx.createLinearGradient(0, 0, size, size)
    g.addColorStop(0, fgColor.value)
    g.addColorStop(1, gradColor.value)
    fg = g
  }

  // 码点（跳过定位点区域）
  const shape = moduleShape.value
  const gap = shape === 'square' ? 0 : cell * 0.06
  const inner = cell - gap * 2
  ctx.fillStyle = fg
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (isFinder(r, c, count) || !qr.isDark(r, c)) continue
      const x = (c + m) * cell
      const y = (r + m) * cell
      fillShape(ctx, x + gap, y + gap, inner, shape)
    }
  }

  // 定位点（颜色可独立于前景色）
  const eye = eyeColor.value
  drawEye(ctx, m * cell, m * cell, cell, eyeStyle.value, eye, bgColor.value)
  drawEye(ctx, (m + count - 7) * cell, m * cell, cell, eyeStyle.value, eye, bgColor.value)
  drawEye(ctx, m * cell, (m + count - 7) * cell, cell, eyeStyle.value, eye, bgColor.value)

  // Logo（垫背景板 → 等比居中绘制）
  const img = logoImg.value
  if (img && img.width) {
    const box = size * logoRatio.value
    const x = (size - box) / 2
    const y = (size - box) / 2
    const pad = box * 0.12
    ctx.fillStyle = bgColor.value
    roundRectPath(ctx, x - pad, y - pad, box + pad * 2, box + pad * 2, (box + pad * 2) * 0.2)
    ctx.fill()
    const ratio = Math.min(box / img.width, box / img.height)
    const w = img.width * ratio
    const h = img.height * ratio
    ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h)
  }
}

function download() {
  const canvas = genCanvas.value
  if (!canvas || !text.value || genError.value) return
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = 'qrcode.png'
  a.click()
}

async function copyText(val) {
  if (!val) return
  const ok = await copyToClipboard(val)
  if (ok) message.success($t('qrCode.copied'))
  else message.error($t('qrCode.copyFail'))
}

/* ---------------- Logo 上传 ---------------- */

function pickLogo(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    message.error($t('qrCode.invalidImage'))
    return
  }
  const reader = new FileReader()
  reader.onerror = () => message.error($t('qrCode.decodeError'))
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      logoImg.value = img
      logoUrl.value = ev.target.result
      // 含 Logo 会遮挡数据，容错级别偏低时自动提到 H
      if (ecLevel.value !== 'H') ecLevel.value = 'H'
    }
    img.onerror = () => message.error($t('qrCode.decodeError'))
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

function clearLogo() {
  logoImg.value = null
  logoUrl.value = ''
}

/** 应用预设配色（前景 / 背景，定位点跟随前景） */
function applyPreset(preset) {
  fgColor.value = preset.fg
  bgColor.value = preset.bg
  eyeColor.value = preset.fg
}

/* ---------------- 解码 ---------------- */

const fileRef = ref(null)
const decodeCanvas = ref(null)
const decodeImgUrl = ref('')
const decoded = ref('')
const decodeError = ref('')

const isUrl = computed(() => isSafeHttpUrl(decoded.value))

function pickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选择同一文件
  decodeFile(file)
}

function decodeFile(file) {
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    message.error($t('qrCode.invalidImage'))
    return
  }
  const reader = new FileReader()
  reader.onerror = () => message.error($t('qrCode.decodeError'))
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => runDecode(img)
    img.onerror = () => {
      decodeError.value = $t('qrCode.decodeError')
      decoded.value = ''
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

function runDecode(img) {
  decodeError.value = ''
  decoded.value = ''
  decodeImgUrl.value = img.src

  const canvas = decodeCanvas.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // 超大图降采样（长边 ≤ 1200），避免 getImageData 卡顿
  const MAX = 1200
  let w = img.naturalWidth
  let h = img.naturalHeight
  const scale = Math.min(1, MAX / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))
  canvas.width = w
  canvas.height = h
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h)
  const result = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' })
  if (result?.data) {
    decoded.value = result.data
  } else {
    decodeError.value = $t('qrCode.notFound')
  }
}

function resetDecode() {
  decoded.value = ''
  decodeError.value = ''
  decodeImgUrl.value = ''
}

function openLink() {
  openExternal(decoded.value)
}

/* 拖拽 / 粘贴导入图片：机制收口在 useFileDrop（详见该文件注释）
   - pasteWhen 限定只在解码页响应粘贴
   - 拖拽与粘贴共用同一个 decodeFile 回调 */
const { isDragging, onDragEnter, onDragLeave, onDrop } = useFileDrop(decodeFile, {
  pasteWhen: () => mode.value === 'dec',
})

/* ---------------- 生命周期 ---------------- */

/* 输入防抖 200ms（与 EncodeDecodePreview/SplitTextPreview 一致）：
   每敲一个字符就全量重编二维码 + 重绘 canvas，长文本时会持续阻塞主线程；
   色彩/尺寸等非文本参数变化通常单次触发，防抖带来的延迟无感知 */
let renderTimer = null
watch(
  [
    text, ecLevel, outSize, margin,
    fgColor, bgColor, gradient, gradColor, eyeColor, moduleShape, eyeStyle,
    logoImg, logoRatio,
  ],
  () => {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => nextTick(renderQr), 200)
  }
)

onMounted(() => {
  renderQr()
})
</script>

<template>
  <div class="qr">
    <!-- 模式切换 -->
    <div class="qr-tabs">
      <button
        class="qr-tab"
        :class="{ active: mode === 'gen' }"
        type="button"
        @click="mode = 'gen'"
      >{{ $t('qrCode.genTab') }}</button>
      <button
        class="qr-tab"
        :class="{ active: mode === 'dec' }"
        type="button"
        @click="mode = 'dec'"
      >{{ $t('qrCode.decodeTab') }}</button>
    </div>

    <!-- 生成 -->
    <div v-show="mode === 'gen'" class="qr-pane">
      <div class="qr-gen">
        <div class="qr-form">
          <div class="qr-label">
            {{ $t('qrCode.content') }}
            <span class="qr-count">{{ text.length }}</span>
          </div>
          <textarea
            v-model="text"
            class="qr-textarea"
            :placeholder="$t('qrCode.contentPlaceholder')"
            spellcheck="false"
          />

          <div class="qr-opts">
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.ecLevel') }}</span>
              <div class="qr-seg">
                <button
                  v-for="l in EC_LEVELS"
                  :key="l"
                  class="qr-seg-btn"
                  :class="{ active: ecLevel === l }"
                  type="button"
                  @click="ecLevel = l"
                >{{ l }}</button>
              </div>
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.size') }}</span>
              <select v-model.number="outSize" class="qr-input qr-input-sm">
                <option v-for="s in SIZE_PRESETS" :key="s" :value="s">{{ s }}px</option>
              </select>
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.margin') }}</span>
              <input v-model.number="margin" class="qr-input qr-input-sm" type="number" min="0" max="10" />
            </div>
          </div>

          <!-- 预设配色 -->
          <div class="qr-opts">
            <span class="qr-opt-label">{{ $t('qrCode.presets') }}</span>
            <button
              v-for="(p, i) in COLOR_PRESETS"
              :key="i"
              class="qr-swatch"
              type="button"
              :style="{ background: `linear-gradient(135deg, ${p.fg} 50%, ${p.bg} 50%)` }"
              :aria-label="$t('qrCode.presets')"
              @click="applyPreset(p)"
            ></button>
          </div>

          <!-- 异形样式 -->
          <div class="qr-opts">
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.fgColor') }}</span>
              <input v-model="fgColor" class="qr-color" type="color" />
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.bgColor') }}</span>
              <input v-model="bgColor" class="qr-color" type="color" />
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.eyeColor') }}</span>
              <input v-model="eyeColor" class="qr-color" type="color" />
            </div>
            <div class="qr-opt">
              <label class="qr-check">
                <input v-model="gradient" type="checkbox" />
                {{ $t('qrCode.gradient') }}
              </label>
            </div>
            <div v-if="gradient" class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.gradColor') }}</span>
              <input v-model="gradColor" class="qr-color" type="color" />
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.moduleShape') }}</span>
              <select v-model="moduleShape" class="qr-input qr-input-sm">
                <option v-for="s in SHAPES" :key="s" :value="s">{{ $t('qrCode.shape.' + s) }}</option>
              </select>
            </div>
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.eyeShape') }}</span>
              <select v-model="eyeStyle" class="qr-input qr-input-sm">
                <option v-for="s in SHAPES" :key="s" :value="s">{{ $t('qrCode.shape.' + s) }}</option>
              </select>
            </div>
          </div>

          <!-- Logo -->
          <div class="qr-opts">
            <div class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.logo') }}</span>
              <input ref="logoFileRef" type="file" accept="image/*" class="qr-file" @change="pickLogo" />
              <button class="qr-mini" type="button" @click="logoFileRef?.click()">
                <RiImageLine size="14" aria-hidden="true" />
                {{ logoUrl ? $t('qrCode.replaceLogo') : $t('qrCode.uploadLogo') }}
              </button>
              <button v-if="logoUrl" class="qr-mini ghost" type="button" @click="clearLogo">
                {{ $t('qrCode.removeLogo') }}
              </button>
            </div>
            <div v-if="logoUrl" class="qr-opt">
              <span class="qr-opt-label">{{ $t('qrCode.logoSize') }}</span>
              <input v-model.number="logoRatio" class="qr-range" type="range" min="0.12" max="0.3" step="0.01" />
            </div>
            <span v-if="logoUrl && ecLevel !== 'H'" class="qr-tip">{{ $t('qrCode.logoHint') }}</span>
          </div>

          <div class="qr-actions">
            <button
              class="qr-btn"
              type="button"
              :disabled="!text || !!genError"
              @click="download"
            >
              <RiDownloadLine size="15" aria-hidden="true" />
              {{ $t('qrCode.download') }}
            </button>
            <button class="qr-btn ghost" type="button" :disabled="!text" @click="copyText(text)">
              <RiFileCopyLine size="15" aria-hidden="true" />
              {{ $t('qrCode.copy') }}
            </button>
            <button class="qr-btn ghost" type="button" :disabled="!text" @click="text = ''">
              {{ $t('qrCode.clear') }}
            </button>
          </div>
        </div>

        <div class="qr-preview">
          <canvas v-show="text && !genError" ref="genCanvas" class="qr-canvas"></canvas>
          <div v-if="!text" class="qr-ph">{{ $t('qrCode.empty') }}</div>
          <div v-else-if="genError" class="qr-err">{{ genError }}</div>
        </div>
      </div>
    </div>

    <!-- 解码 -->
    <div v-show="mode === 'dec'" class="qr-pane">
      <input ref="fileRef" type="file" accept="image/*" class="qr-file" @change="pickFile" />
      <div class="qr-decode">
        <div
          class="qr-dropzone"
          :class="{ dragging: isDragging }"
          @click="fileRef?.click()"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
        >
          <img v-if="decodeImgUrl" :src="decodeImgUrl" class="qr-upload-img" alt="" />
          <template v-else>
            <RiImageAddLine size="34" aria-hidden="true" />
            <p>{{ $t('qrCode.dropHint') }}</p>
          </template>
        </div>

        <div class="qr-result">
          <div class="qr-label">{{ $t('qrCode.result') }}</div>
          <textarea
            :value="decoded"
            class="qr-textarea"
            readonly
            spellcheck="false"
            :placeholder="decodeError || $t('qrCode.resultPlaceholder')"
            :class="{ 'has-error': !!decodeError }"
          />
          <div class="qr-actions">
            <button class="qr-btn" type="button" :disabled="!decoded" @click="copyText(decoded)">
              <RiFileCopyLine size="15" aria-hidden="true" />
              {{ $t('qrCode.copy') }}
            </button>
            <button v-if="isUrl" class="qr-btn" type="button" @click="openLink">
              {{ $t('qrCode.openLink') }}
            </button>
            <button
              class="qr-btn ghost"
              type="button"
              :disabled="!decoded && !decodeImgUrl"
              @click="resetDecode"
            >{{ $t('qrCode.clear') }}</button>
          </div>
        </div>
      </div>
      <canvas ref="decodeCanvas" class="qr-hidden-canvas"></canvas>
    </div>
  </div>
</template>

<style scoped lang="less">
.qr {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

/* 模式切换 */
.qr-tabs {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.qr-tab {
  padding: 5px 16px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: rgba(127, 127, 127, 0.1);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover { color: @text; background: rgba(127, 127, 127, 0.18); }

  &.active {
    color: #fff;
    background: @accent;
  }
}

.qr-pane {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 生成：左表单 / 右预览 */
.qr-gen,
.qr-decode {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.qr-form,
.qr-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.qr-form {
  overflow-y: auto;
  padding-right: 4px;
}

.qr-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: @text-soft;
}

.qr-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.qr-textarea {
  min-height: 88px;
  flex: 1;
  resize: none;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;
  word-break: break-all;
  transition: border-color 0.15s ease;

  &:focus { border-color: @accent; }
  &:read-only { background: rgba(127, 127, 127, 0.05); }
  &.has-error { border-color: #ef4444; }
}

/* 参数 */
.qr-opts {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.06);
}

.qr-opt {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qr-opt-label {
  font-size: 11px;
  color: @text-soft;
  white-space: nowrap;
}

.qr-input {
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;

  &:focus { border-color: @accent; }

  &.qr-input-sm { width: 82px; }
}

.qr-color {
  width: 30px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(127, 127, 127, 0.22);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.qr-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease;

  &:hover { transform: scale(1.15); }
}

.qr-range {
  width: 110px;
  accent-color: @accent;
}

.qr-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: @text-soft;
  cursor: pointer;
  user-select: none;

  input { accent-color: @accent; }
}

.qr-tip {
  font-size: 11px;
  color: #d97706;
}

.qr-seg {
  display: flex;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.12);
}

.qr-seg-btn {
  padding: 5px 11px;
  border: none;
  font-size: 12px;
  color: @text-soft;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &.active { color: #fff; background: @accent; }
}

/* 动作条 */
.qr-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.qr-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: #fff;
  background: @accent;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;

  &:hover:not(:disabled) { opacity: 0.88; }
  &:active:not(:disabled) { transform: scale(0.97); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &.ghost {
    color: @text-soft;
    background: rgba(127, 127, 127, 0.12);

    &:hover:not(:disabled) { color: @text; background: rgba(127, 127, 127, 0.2); }
  }
}

.qr-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, @accent 45%, transparent);
  border-radius: @radius-pill;
  font-size: 11px;
  color: @accent;
  background: @accent-soft;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover { opacity: 0.85; }

  &.ghost {
    color: @text-soft;
    background: rgba(127, 127, 127, 0.12);
    border-color: transparent;
  }
}

/* 预览 */
.qr-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  padding: 12px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.06);
}

.qr-canvas {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}

.qr-ph,
.qr-err {
  font-size: 12px;
  color: @text-soft;
  text-align: center;
  line-height: 1.6;
}

.qr-err { color: #ef4444; }

/* 解码 */
.qr-file { display: none; }

.qr-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  border: 2px dashed rgba(127, 127, 127, 0.32);
  border-radius: 10px;
  color: @text-soft;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;

  &:hover { border-color: @accent; color: @accent; }

  &.dragging {
    border-color: @accent;
    color: @accent;
    background: color-mix(in srgb, @accent 10%, transparent);
  }

  p { margin: 0; line-height: 1.6; }
}

.qr-upload-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.qr-hidden-canvas { display: none; }

/* 窄屏：左右改上下堆叠 */
@media (max-width: 640px) {
  .qr-gen,
  .qr-decode {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(0, 1fr);
  }

  .qr-pane { overflow-y: auto; }
}
</style>

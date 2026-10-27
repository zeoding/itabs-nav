/**
 * PDF 工具共享逻辑（合并 / 拆分 / 水印三个面板共用）。
 *
 * pdf-lib 必须保持动态 import：本模块不静态引入它，保证 pdf-libs 分包
 * 只在真正处理 PDF 时才加载（PWA 预缓存仍会离线缓存该块）。
 * buildWatermarkPng 只在浏览器事件回调里触碰 document，node 单测可安全 import 本模块。
 */

let pdfLibPromise = null

/** 按需加载 pdf-lib（进程内缓存，避免重复动态 import 开销） */
export function getPdfLib() {
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib')
  return pdfLibPromise
}

/** 读取 File 为 PDFDocument；ignoreEncryption 兼容仅设所有者密码的文件 */
export async function loadPdf(file) {
  const { PDFDocument } = await getPdfLib()
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
}

/** 新建空 PDF 文档 */
export async function createPdf() {
  const { PDFDocument } = await getPdfLib()
  return PDFDocument.create()
}

/**
 * 清洗用户输入的文件名（不含扩展名）：去掉 Windows 非法字符、手滑多打的 .pdf
 * 后缀和结尾空白/点，空则回退 fallback。
 * 顺序敏感：先摘 .pdf（连同其后尾巴），再扫结尾空白/点——反序会把「file.pdf.」洗成「file.pdf.pdf」
 */
export function sanitizePdfName(raw, fallback = 'pdf-merge') {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.pdf[\s.]*$/i, '')
    .replace(/[\s.]+$/g, '')
    .trim()
  return cleaned || fallback
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * 解析页码范围表达式，1-based：'1-3,5,8-' → [{start:1,end:3},{start:5,end:5},{start:8,end:pageCount}]。
 * 支持中英文逗号/分号/空白分隔；'a-' 开区间到末页；逆序范围自动交换；
 * 越界自动夹取到 [1, pageCount]，整段越界丢弃；重复范围去重；结果按起始页排序。
 * @returns {{ ranges: Array<{start:number,end:number}>, errors: string[] }} errors 为无法识别的 token 原文
 */
export function parsePageRanges(input, pageCount) {
  const errors = []
  const ranges = []
  const seen = new Set()
  for (const rawToken of String(input || '').split(/[,，;；\s]+/)) {
    const token = rawToken.trim()
    if (!token) continue
    const m = token.match(/^(\d+)(?:\s*([-–~])\s*(\d+)?)?$/)
    if (!m) {
      errors.push(token)
      continue
    }
    let start = Number(m[1])
    let end = m[2] ? (m[3] ? Number(m[3]) : pageCount) : start
    if (end < start) [start, end] = [end, start]
    start = Math.max(1, start)
    end = Math.min(pageCount, end)
    if (start > pageCount || end < start) continue
    const key = `${start}-${end}`
    if (seen.has(key)) continue
    seen.add(key)
    ranges.push({ start, end })
  }
  ranges.sort((a, b) => a.start - b.start)
  return { ranges, errors }
}

/**
 * 生成一整页平铺水印的 PNG dataURL。
 * 走 canvas 而非 pdf-lib drawText：标准 14 字体只支持 WinAnsi 编码，中文水印会直接
 * 抛错；canvas 用浏览器字体栅格化，任何语言/emoji 都能渲染，且无需打包字体文件。
 */
export function buildWatermarkPng({ text, fontSize = 48, opacity = 0.15, angle = -30, width, height, rgb = '142,142,142' }) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  ctx.globalAlpha = opacity
  ctx.fillStyle = `rgb(${rgb})`
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const stepX = Math.max(ctx.measureText(text).width + fontSize, 120)
  const stepY = Math.max(fontSize * 3, 110)
  // 在旋转坐标系里铺满整页：覆盖半径取对角线一半 + 一个步长，防止边缘漏印
  const half = Math.ceil(Math.hypot(canvas.width, canvas.height) / 2) + Math.max(stepX, stepY)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((angle * Math.PI) / 180)
  for (let y = -half; y <= half; y += stepY) {
    for (let x = -half; x <= half; x += stepX) {
      ctx.fillText(text, x, y)
    }
  }
  return canvas.toDataURL('image/png')
}

/** 给文档全部页面平铺水印；相同尺寸的页面复用同一张 PNG，避免重复栅格化 */
export async function addWatermark(doc, options) {
  const cache = new Map()
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const key = `${Math.round(width)}x${Math.round(height)}`
    if (!cache.has(key)) {
      cache.set(key, await doc.embedPng(buildWatermarkPng({ ...options, width, height })))
    }
    page.drawImage(cache.get(key), { x: 0, y: 0, width, height })
  }
}

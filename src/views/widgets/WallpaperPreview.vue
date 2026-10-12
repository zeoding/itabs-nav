<script setup>
/**
 * 壁纸库小组件（Wallhaven API）
 *
 * 功能：
 *  - Wallhaven 搜索：关键词 + 分类（通用/动漫/人物）+ 排序（精选/最新/最热/最爱/随机）
 *  - 缩略图网格 + 翻页 / 换一批
 *  - 点击放大预览（灯箱），可一键设为桌面壁纸 / 下载原图 / 跳转 Wallhaven 详情页
 *
 * 数据与缓存：
 *  - 搜索结果走每日缓存（utils/dailyCache，key 含全部查询参数），当天内不再请求网络
 *  - 网络失败时回退展示过期缓存；手动刷新强制走网络
 *  - 搜索偏好（关键词/分类/排序）持久化到 settings 表 key: 'wallpaper-gallery-prefs'
 *
 * 设计取舍：
 *  - 无需 API Key（默认仅返回 sfw，purity=100 显式约束）
 *  - 网格用 thumbs.small（轻），灯箱用 thumbs.large，设为壁纸才用 path 原图
 *  - 灯箱复用公共 BaseDialog（标题/遮罩/ESC/全屏/关闭统一接管）
 *  - 设壁纸 = settings.wallpaperMode='image' + settings.wallpaper=原图地址（复用现有桌面背景链路）
 */
import { ref, computed, onMounted } from 'vue'
import { getSetting, setSetting } from '@/db'
import http from '@/utils/http'
import BaseDialog from '@/components/BaseDialog.vue'
import { WALLHAVEN_API } from '@/config/api'
import { getDaily, getAny, setDaily } from '@/utils/dailyCache'
import { openExternal } from '@/utils/openExternal'
import { $t } from '@/composables/useI18n'
import { useMessage } from '@/composables/useMessage'
import { useSettingsStore } from '@/stores/settings'
import {
  RiSearchLine,
  RiRefreshLine,
  RiCheckLine,
  RiShuffleLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiGlobalLine,
  RiImageLine,
  RiDownloadLine,
  RiZoomInLine,
  RiZoomOutLine,
  RiLoader4Line,
} from '@remixicon/vue'

const PREFS_KEY = 'wallpaper-gallery-prefs'

const CATEGORIES = [
  { key: 'all', value: '111' },
  { key: 'general', value: '100' },
  { key: 'anime', value: '010' },
  { key: 'people', value: '001' },
]
const SORTINGS = ['toplist', 'date_added', 'views', 'favorites', 'random']

/* ---------- 状态 ---------- */
const q = ref('')
const categories = ref('111')
const sorting = ref('toplist')
const page = ref(1)
const lastPage = ref(1)
const items = ref([]) // [{ id, thumb, large, full, resolution, category, views, favorites, pageUrl }]
const loading = ref(false)
const error = ref('')
const lightbox = ref(null) // 当前放大的壁纸对象
const setDone = ref(false) // 「已设为壁纸」临时反馈
const downloading = ref(false) // 下载中状态（防重复点击）
const imgLoading = ref(false) // 预览大图加载态（切换图片时置 true，load/error 后置 false）
/* 灯箱图片缩放（自持：zoom + 平移 + 拖拽） */
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const dragging = ref(false)
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }
let setDoneTimer = 0

const message = useMessage()
const settingsStore = useSettingsStore()

/** 灯箱显隐（BaseDialog 的 open 只认布尔） */
const lightboxOpen = computed(() => !!lightbox.value)
/** 缩放百分比（工具条展示） */
const zoomPct = computed(() => `${Math.round(zoom.value * 100)}%`)

function cacheKey() {
  return `wallpaper:${sorting.value}:${categories.value}:${q.value.trim()}:${page.value}`
}

function normalize(list) {
  return (Array.isArray(list) ? list : []).map((w) => ({
    id: w.id,
    // 兼容两种形状：Wallhaven 原始（thumbs/path/url）+ 已缓存的归一化（thumb/large/full/pageUrl）
    thumb: w.thumbs?.small || w.thumb || '',
    large: w.path || w.large || w.thumbs?.small || w.thumb || '',
    full: w.full || w.path || '',
    resolution: w.resolution || '',
    category: w.category || '',
    views: w.views ?? 0,
    favorites: w.favorites ?? 0,
    pageUrl: w.url || w.pageUrl || '',
  }))
}

async function savePrefs() {
  try {
    await setSetting(PREFS_KEY, { q: q.value, categories: categories.value, sorting: sorting.value })
  } catch { /* 偏好持久化失败不阻塞主流程 */ }
}

async function loadPrefs() {
  try {
    const prefs = await getSetting(PREFS_KEY, null)
    if (prefs && typeof prefs === 'object') {
      if (typeof prefs.q === 'string') q.value = prefs.q
      if (typeof prefs.categories === 'string') categories.value = prefs.categories
      if (typeof prefs.sorting === 'string' && SORTINGS.includes(prefs.sorting)) sorting.value = prefs.sorting
    }
  } catch { /* 无偏好则用默认 */ }
}

/**
 * 搜索请求：Netlify 代理为主源（部分网络环境直连 wallhaven.cc 不通），
 * 失败时降级官方直连兜底；两者都失败才抛给上层走「回退过期缓存」逻辑
 */
async function searchWallhaven(params) {
  try {
    return await http.get(WALLHAVEN_API.search(), { params })
  } catch (e) {
    console.warn('[wallpaper] 代理源失败，降级官方直连:', e?.message)
    return http.get(WALLHAVEN_API.officialSearch(), { params })
  }
}

/** 拉取壁纸列表（force=true 跳过当天缓存） */
async function load(force = false) {
  loading.value = true
  error.value = ''
  const key = cacheKey()
  try {
    if (!force) {
      const hit = await getDaily(key)
      if (hit) {
        items.value = normalize(hit.payload?.items)
        lastPage.value = hit.payload?.lastPage || 1
        return
      }
    }
    const params = {
      ...WALLHAVEN_API.defaultParams,
      sorting: sorting.value,
      page: page.value,
    }
    const keyword = q.value.trim()
    if (keyword) params.q = keyword
    params.categories = categories.value
    const json = await searchWallhaven(params)
    items.value = normalize(json?.data)
    lastPage.value = json?.meta?.last_page || 1
    if (page.value > lastPage.value) page.value = lastPage.value
    await setDaily(key, { items: items.value, lastPage: lastPage.value })
    await savePrefs()
  } catch (e) {
    // 网络失败：回退过期缓存（有图总比白屏好）
    try {
      const stale = await getAny(key)
      if (stale?.payload?.items?.length) {
        items.value = normalize(stale.payload.items)
        lastPage.value = stale.payload.lastPage || 1
        return
      }
    } catch { /* ignore */ }
    error.value = e?.message || $t('wallpaper.error')
    items.value = []
  } finally {
    loading.value = false
  }
}

/** 新搜索（换关键词/分类/排序）：清空旧结果，让 loading 态可见，避免网格突然整体替换 */
function newSearch() {
  page.value = 1
  items.value = []
  load(true)
}

function onSearch() {
  newSearch()
}

function onCategory(value) {
  if (categories.value === value) return
  categories.value = value
  newSearch()
}

function onSorting(value) {
  if (sorting.value === value) return
  sorting.value = value
  newSearch()
}

function prevPage() {
  if (page.value <= 1 || loading.value) return
  page.value -= 1
  load(false)
}

function nextPage() {
  if (page.value >= lastPage.value || loading.value) return
  page.value += 1
  load(false)
}

/** 换一批：random 排序直接重载第 1 页（服务端重洗牌）；否则跳随机页 */
function shuffle() {
  if (loading.value) return
  if (sorting.value === 'random') {
    page.value = 1
  } else {
    const max = Math.max(1, Math.min(lastPage.value, 25))
    page.value = 1 + Math.floor(Math.random() * max)
  }
  load(true)
}

function openLightbox(item) {
  lightbox.value = item
  setDone.value = false
  imgLoading.value = true
  resetZoom()
}

function closeLightbox() {
  lightbox.value = null
  setDone.value = false
  downloading.value = false
  imgLoading.value = false
  resetZoom()
  if (setDoneTimer) {
    clearTimeout(setDoneTimer)
    setDoneTimer = 0
  }
}

/** 预览大图载入完成 / 失败：统一结束 loading（失败时图片破图，原有行为不变） */
function onImgLoad() {
  imgLoading.value = false
}

function onImgError() {
  imgLoading.value = false
}

/** 缩放：钳制到 [MIN, MAX]，回到 1x 时清掉平移 */
function applyZoom(next) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100))
  if (zoom.value <= ZOOM_MIN) pan.value = { x: 0, y: 0 }
}

function zoomIn() {
  applyZoom(zoom.value + 0.5)
}

function zoomOut() {
  applyZoom(zoom.value - 0.5)
}

function resetZoom() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  dragging.value = false
}

function toggleZoom() {
  if (zoom.value > ZOOM_MIN) resetZoom()
  else applyZoom(2)
}

/** 滚轮缩放（模板侧 @wheel.prevent 已阻止页面滚动） */
function onZoomWheel(e) {
  applyZoom(zoom.value + (e.deltaY < 0 ? 0.25 : -0.25))
}

/** 放大后拖拽平移（pointer 事件统一鼠标/触摸） */
function onZoomPointerDown(e) {
  if (zoom.value <= ZOOM_MIN) return
  dragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, panX: pan.value.x, panY: pan.value.y }
  e.currentTarget?.setPointerCapture?.(e.pointerId)
}

function onZoomPointerMove(e) {
  if (!dragging.value) return
  const clamp = (v) => Math.min(800, Math.max(-800, v))
  pan.value = {
    x: clamp(dragStart.panX + (e.clientX - dragStart.x)),
    y: clamp(dragStart.panY + (e.clientY - dragStart.y)),
  }
}

function endZoomDrag() {
  dragging.value = false
}

/** 一键设为桌面壁纸（复用 settings 的 image 模式链路） */
async function setAsWallpaper() {
  if (!lightbox.value?.full) return
  await settingsStore.set('wallpaperMode', 'image')
  await settingsStore.set('wallpaper', lightbox.value.full)
  setDone.value = true
  message.success($t('wallpaper.setDone'))
  if (setDoneTimer) clearTimeout(setDoneTimer)
  setDoneTimer = setTimeout(() => { setDone.value = false }, 2500)
}

function openSource() {
  const url = lightbox.value?.pageUrl
  if (url) openExternal(url)
}

/** 下载原图（fetch blob 直存，失败则新标签页打开兜底） */
async function downloadWallpaper() {
  const url = lightbox.value?.full
  if (!url || downloading.value) return
  downloading.value = true
  try {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const ext = (url.match(/\.(\w+)(?:[?#]|$)/)?.[1] || 'jpg').toLowerCase()
    const name = `wallpaper-${lightbox.value?.id || Date.now()}.${ext}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    message.success($t('wallpaper.downloadDone'))
  } catch (e) {
    // 跨域/CORS 失败时兜底：新标签页打开原图，用户可手动另存
    openExternal(url)
    message.error(e?.message || $t('wallpaper.downloadFail'))
  } finally {
    downloading.value = false
  }
}

onMounted(async () => {
  await loadPrefs()
  await load(false)
})
</script>

<template>
  <div class="wallpaper">
    <!-- 搜索栏 -->
    <div class="toolbar">
      <div class="search-box">
        <RiSearchLine size="15" class="search-ico" aria-hidden="true" />
        <input
          v-model="q"
          class="search-input"
          type="text"
          :placeholder="$t('wallpaper.searchPlaceholder')"
          @keyup.enter="onSearch"
        />
        <button type="button" class="search-btn" @click="onSearch">{{ $t('wallpaper.search') }}</button>
      </div>
      <button type="button" class="icon-btn" :title="$t('wallpaper.refresh')" @click="load(true)">
        <RiRefreshLine size="16" aria-hidden="true" />
      </button>
      <button type="button" class="icon-btn" :title="$t('wallpaper.shuffle')" @click="shuffle">
        <RiShuffleLine size="16" aria-hidden="true" />
      </button>
    </div>

    <!-- 分类 + 排序 -->
    <div class="filters">
      <div class="seg">
        <button
          v-for="c in CATEGORIES"
          :key="c.key"
          type="button"
          :class="['seg-btn', { active: categories === c.value }]"
          @click="onCategory(c.value)"
        >{{ $t(`wallpaper.categories.${c.key}`) }}</button>
      </div>
      <div class="seg">
        <button
          v-for="s in SORTINGS"
          :key="s"
          type="button"
          :class="['seg-btn', { active: sorting === s }]"
          @click="onSorting(s)"
        >{{ $t(`wallpaper.sorting.${s}`) }}</button>
      </div>
    </div>

    <!-- 内容区 -->
    <div v-if="loading && !items.length" class="state">{{ $t('common.loading') }}</div>
    <div v-else-if="error && !items.length" class="state error">
      <p>{{ error }}</p>
      <button type="button" class="btn primary" @click="load(true)">{{ $t('wallpaper.retry') }}</button>
    </div>
    <div v-else-if="!items.length" class="state">{{ $t('wallpaper.empty') }}</div>
    <ul v-else class="grid">
      <li v-for="item in items" :key="item.id" class="cell">
        <button type="button" class="thumb-btn" @click="openLightbox(item)" :title="item.resolution">
          <img class="thumb" :src="item.thumb" :alt="item.id" loading="lazy" />
          <span class="resolution">{{ item.resolution }}</span>
        </button>
      </li>
    </ul>

    <!-- 翻页 -->
    <div v-if="items.length" class="pager">
      <button type="button" class="page-btn" :disabled="page <= 1" @click="prevPage">
        <RiArrowLeftSLine size="15" aria-hidden="true" />
        <span>{{ $t('wallpaper.prevPage') }}</span>
      </button>
      <span class="page-info">{{ $t('wallpaper.pageOf', { n: page, m: lastPage }) }}</span>
      <button type="button" class="page-btn" :disabled="page >= lastPage" @click="nextPage">
        <span>{{ $t('wallpaper.nextPage') }}</span>
        <RiArrowRightSLine size="15" aria-hidden="true" />
      </button>
    </div>

    <!-- 灯箱预览（公共弹窗容器：标题/ESC/全屏/关闭统一由 BaseDialog 接管；固定高度避免大图加载时跳变） -->
    <BaseDialog
      :open="lightboxOpen"
      width="min(1100px, 96vw)"
      height="min(680px, 86vh)"
      max-height="92vh"
      padding="22px 24px 18px"
      :z-index="200"
      @close="closeLightbox"
    >
      <template #title>
        <div v-if="lightbox" class="lightbox-meta">
          <span class="meta-chip">{{ lightbox.resolution }}</span>
          <span class="meta-chip">{{ lightbox.category }}</span>
          <span class="meta-num">👁 {{ lightbox.views }} · ♥ {{ lightbox.favorites }}</span>
        </div>
      </template>
      <div v-if="lightbox" class="lightbox-body" @wheel.prevent="onZoomWheel">
        <img
          :key="lightbox.id"
          class="lightbox-img"
          :class="{ zoomed: zoom > 1, dragging, 'is-loading': imgLoading }"
          :src="lightbox.large"
          :alt="lightbox.id"
          draggable="false"
          :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
          @load="onImgLoad"
          @error="onImgError"
          @dblclick="toggleZoom"
          @pointerdown="onZoomPointerDown"
          @pointermove="onZoomPointerMove"
          @pointerup="endZoomDrag"
          @pointercancel="endZoomDrag"
        />
        <div v-if="imgLoading" class="img-loading">
          <RiLoader4Line size="28" class="spin" aria-hidden="true" />
          <span>{{ $t('common.loading') }}</span>
        </div>
        <div class="zoom-bar" @wheel.stop.prevent="onZoomWheel">
          <button
            type="button"
            class="zoom-btn"
            :title="$t('wallpaper.zoomOut')"
            :aria-label="$t('wallpaper.zoomOut')"
            :disabled="zoom <= ZOOM_MIN"
            @click="zoomOut"
          >
            <RiZoomOutLine size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="zoom-pct"
            :title="$t('wallpaper.resetZoom')"
            @click="resetZoom"
          >{{ zoomPct }}</button>
          <button
            type="button"
            class="zoom-btn"
            :title="$t('wallpaper.zoomIn')"
            :aria-label="$t('wallpaper.zoomIn')"
            :disabled="zoom >= ZOOM_MAX"
            @click="zoomIn"
          >
            <RiZoomInLine size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <template #footer>
        <div v-if="lightbox" class="lightbox-actions">
          <button type="button" class="btn primary" @click="setAsWallpaper">
            <RiImageLine v-if="!setDone" size="15" aria-hidden="true" />
            <RiCheckLine v-else size="15" aria-hidden="true" />
            <span>{{ setDone ? $t('wallpaper.setDone') : $t('wallpaper.setAsWallpaper') }}</span>
          </button>
          <button type="button" class="btn ghost" :disabled="downloading" @click="downloadWallpaper">
            <RiDownloadLine size="15" aria-hidden="true" />
            <span>{{ downloading ? $t('wallpaper.downloading') : $t('wallpaper.download') }}</span>
          </button>
          <button type="button" class="btn ghost" @click="openSource">
            <RiGlobalLine size="15" aria-hidden="true" />
            <span>{{ $t('wallpaper.openSource') }}</span>
          </button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped lang="less">
.wallpaper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* 搜索栏 */
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-box {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid color-mix(in srgb, @accent 0.18%, transparent);

  &:focus-within {
    border-color: @accent;
    box-shadow: 0 0 0 3px color-mix(in srgb, @accent 0.15%, transparent);
  }
}

.search-ico {
  color: @text-soft;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: @text;
  font-size: 13px;
}

.search-btn {
  flex-shrink: 0;
  border-radius: 9px;
  padding: 7px 14px;
  font-size: 13px;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
}

.icon-btn {
  .circle-btn(34px);
  flex-shrink: 0;
}

/* 分类 + 排序 */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  background: rgba(31, 41, 55, 0.05);
}

.seg-btn {
  border-radius: 9px;
  padding: 6px 12px;
  font-size: 12px;
  color: @text-soft;
  transition: background @tr, color @tr;

  &:hover {
    color: @text;
  }

  &.active {
    background: #fff;
    color: @accent;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }
}

/* 状态 */
.state {
  text-align: center;
  font-size: 13px;
  color: @text-soft;
  padding: 40px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  &.error p {
    margin: 0;
    color: #ef4444;
  }
}

/* 缩略图网格 */
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.cell {
  min-width: 0;
}

.thumb-btn {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  cursor: zoom-in;
  background: rgba(31, 41, 55, 0.06);
  aspect-ratio: 16 / 10;
  transition: transform @tr, box-shadow @tr;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px color-mix(in srgb, @accent 0.25%, transparent);

    .resolution {
      opacity: 1;
    }
  }
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.resolution {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 8px;
  border-radius: @radius-pill;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity @tr;
}

/* 翻页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @accent;
  background: @accent-soft;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.page-info {
  font-size: 12px;
  color: @text-soft;
}

/* 灯箱内容（容器/标题栏/遮罩/ESC/全屏统一由 BaseDialog 接管） */
/* 高度由弹窗固定高度撑满：图片加载前后 body 尺寸不变，不会跳变 */
.lightbox-body {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 1 auto;
  min-height: 280px;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  touch-action: none;
}

.lightbox-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.meta-chip {
  padding: 3px 10px;
  border-radius: @radius-pill;
  font-size: 11px;
  color: @accent;
  background: @accent-soft;
}

.meta-num {
  font-size: 12px;
  color: @text-soft;
}

.lightbox-img {
  width: auto;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  user-select: none;
  cursor: zoom-in;
  transform-origin: center center;
  transition: transform 0.15s ease, opacity 0.15s ease;

  &.zoomed {
    cursor: grab;
  }

  &.dragging {
    cursor: grabbing;
    transition: none;
  }

  &.is-loading {
    opacity: 0;
  }
}

/* 大图加载中遮罩 */
.img-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: @text-soft;

  .spin {
    animation: wp-img-spin 1s linear infinite;
    color: @accent;
  }
}

@keyframes wp-img-spin {
  to { transform: rotate(360deg); }
}

/* 缩放工具条（右下角浮层） */
.zoom-bar {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: @radius-pill;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(6px);
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: @radius-circle;
  color: #fff;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.zoom-pct {
  min-width: 52px;
  padding: 4px 8px;
  border-radius: @radius-pill;
  font-size: 12px;
  color: #fff;
  font-variant-numeric: tabular-nums;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }
}

/* 全屏态下图片可用高度更大 */
:deep(.dialog.is-fullscreen) .lightbox-img {
  max-height: calc(100vh - 240px);
}

.lightbox-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: @radius-pill;
  padding: 9px 20px;
  font-size: 13px;
  transition: transform @tr, box-shadow @tr;

  &.ghost {
    background: rgba(31, 41, 55, 0.06);
    color: @text-soft;

    &:hover {
      background: rgba(31, 41, 55, 0.12);
    }
  }

  &.primary {
    color: #fff;
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 22px color-mix(in srgb, @accent 0.4%, transparent);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
</style>

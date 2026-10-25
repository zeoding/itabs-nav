<script setup>
/**
 * 单个快捷方式卡片（iTab 风格）
 * - 玻璃质感、悬浮微上移
 * - 支持尺寸：1x1 / 1x2 / 2x1 / 2x2 / 2x4 / 4x2
 * - 可拖拽、右键唤出菜单、点击编辑按钮/打开链接
 * - 编辑主页模式下：右上角显示 × 删除按钮
 * - 两类站点点击行为:
 *   - 网址类 (kind: 'web'):         跳转 window.open(url)
 *   - 工具卡 (kind ∈ TOOL_KINDS):   emit('action') 由父组件打开弹窗
 */
import { computed, ref, watch, onMounted } from 'vue'
import { isToolKind } from '@/config/tools'
import { loadEngineSvgCached, parseThesvgIcon } from '@/utils/thesvg'
import { openExternal } from '@/utils/openExternal'

const props = defineProps({
  site: { type: Object, required: true },
  dragging: { type: Boolean, default: false },
  dropping: { type: Boolean, default: false },
  /** 是否处于"编辑主页"模式（由 SiteGrid 控制） */
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits([
  'edit',
  'remove',
  'contextmenu',
  'dragstart',
  'dragover',
  'drop',
  'exit-edit',
  'action',
])

const size = computed(() => props.site.size || '1x1')

/**
 * 站点类型
 *  - kind ∈ TOOL_KINDS   → 工具卡,emit('action', site) 由父组件打开对应弹窗
 *  - kind === 'web'(默认) → 普通网址,window.open(url) 跳转
 */
const kind = computed(() => props.site.kind || 'web')
const isTool = computed(() => isToolKind(kind.value))

/**
 * 三类站点图标:
 *  - thesvg 图标 icon:'thesvg:<slug>',按需 import SVG 用 v-html 渲染
 *  - 普通站点 icon:URL(http(s)://... 或 //domain),用 <img> 渲染
 *  - 工具卡 icon:emoji 字符(如 ✂️),用 <span> 渲染,样式 .site-emoji
 * 判定顺序:thesvg 前缀 > URL > emoji(兜底)
 */
const thesvgSlug = computed(() => parseThesvgIcon(props.site.icon))
/** icon 是不是链接：http(s):// 或协议相对 URL //domain */
const iconIsUrl = computed(() => {
  const ic = props.site.icon
  if (!ic || thesvgSlug.value) return false
  return /^(https?:)?\/\//i.test(ic)
})
/** icon 是不是 emoji/纯文本（不是 URL 也不是 thesvg） */
const iconIsEmoji = computed(() => {
  const ic = props.site.icon
  if (!ic || thesvgSlug.value) return false
  return !iconIsUrl.value
})

/**
 * thesvg SVG：走 utils/thesvg 的模块级缓存（多卡片/多组件共享同一份，
 * 同一 slug 只 import 一次且在途请求合并）。异步返回时 icon 可能已变化，
 * 仅当 slug 仍一致才写入。
 */
const svgHtml = ref('')
async function loadSvg() {
  const slug = thesvgSlug.value
  if (!slug) {
    svgHtml.value = ''
    return
  }
  const html = await loadEngineSvgCached(slug)
  if (thesvgSlug.value === slug) svgHtml.value = html
}
onMounted(loadSvg)
watch(thesvgSlug, loadSvg)

/** 站点自有 favicon 经常 404：失败时回退首字母，不留空白块 */
const imgFailed = ref(false)
watch(
  () => props.site.icon,
  () => {
    imgFailed.value = false
  }
)
function onImgError() {
  imgFailed.value = true
}

function onCardClick() {
  if (props.editMode) {
    // 编辑模式下，点击卡片非删除按钮区域 → 退出编辑模式
    emit('exit-edit')
    return
  }
  if (isTool.value) {
    emit('action', props.site)
    return
  }
  // 普通模式：打开链接（走协议白名单，防备份导入注入 javascript: 等伪协议）
  openExternal(props.site.url)
}

function onContextMenu(e) {
  if (props.editMode) {
    // 编辑主页模式下，右键交给外层处理（一般没有菜单），但阻止默认
    e.preventDefault()
    return
  }
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  emit('contextmenu', { rect, site: props.site })
}

function onRemoveClick(e) {
  e.stopPropagation()
  e.preventDefault()
  emit('remove', props.site)
}
</script>

<template>
  <div
    class="site-card"
    :class="[
      `size-${size}`,
      {
        'with-bg': size !== '1x1',
        dragging,
        'drop-target': dropping,
        'edit-mode': editMode,
      },
    ]"
    :draggable="!editMode"
    v-tip="site.name"
    @click="onCardClick"
    @contextmenu="onContextMenu"
    @dragstart="emit('dragstart', $event)"
    @dragover.prevent="emit('dragover', $event)"
    @drop.prevent="emit('drop', $event)"
  >
    <!-- 编辑模式下的删除按钮 -->
    <button
      v-if="editMode"
      class="card-remove-btn"
      v-tip="$t('siteCard.removeTitle')"
      @click="onRemoveClick"
      @mousedown.stop
    >×</button>
    <div class="site-icon">
      <span v-if="svgHtml" class="site-svg" v-html="svgHtml" />
      <img
        v-else-if="site.icon && iconIsUrl && !imgFailed"
        :src="site.icon"
        :alt="site.name"
        loading="lazy"
        @error="onImgError"
      />
      <span v-else-if="iconIsEmoji" class="site-letter site-emoji">{{ site.icon }}</span>
      <span v-else class="site-letter">{{ site.name.slice(0, 1).toUpperCase() }}</span>
    </div>
    <div class="site-name">{{ site.name }}</div>
  </div>
</template>

<style scoped lang="less">
/* 尺寸参数混入：容器撑满网格跨区（宽高不写死），仅调图标档位 + 名称排版 */
.site-size(@icon, @pad, @gap, @fs, @clamp, @ppad: 2px, @lh: 1.2) {
  --icon-size: @icon;
  padding: @pad;
  gap: @gap;

  .site-name {
    font-size: @fs;
    font-weight: 500;
    text-align: center;
    line-height: @lh;
    max-width: 100%;
    padding: 0 @ppad;
    display: -webkit-box;
    -webkit-line-clamp: @clamp;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
  }
}

.site-card {
  position: relative;
  /* 撑满网格跨区：真实宽高由 gridColumn/gridRow span + 方形行高（SiteGrid 测量）决定，
     保证 1x1/2x2 等标注与视觉比例一致 */
  width: 100%;
  height: 100%;
  --icon-size: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 4px;
  border-radius: 12px;
  background: transparent;
  border: none;
  box-shadow: none;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  user-select: none;

  &:hover {
    transform: none;
  }

  /* 非 1x1：主题玻璃底 + 主题文字色（原白色底配白字不可读） */
  &.with-bg {
    background: var(--glass-bg);
    .glass-blur(24px, 180%);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);

    &:hover {
      background: color-mix(in srgb, var(--glass-bg) 90%, var(--glass-border));
      box-shadow: 0 8px 20px rgba(31, 41, 55, 0.16);
    }

    .site-name {
      color: @text;
      text-shadow: none;
    }
  }

  &.dragging {
    opacity: 0.4;
  }

  &.drop-target {
    outline: 2px dashed @accent;
    outline-offset: -3px;
  }

  /* ============================================================
     「编辑主页」模式
     ============================================================ */
  &.edit-mode {
    cursor: default;

    &.with-bg {
      /* 编辑模式下玻璃底更实一点，区别于 hover（主题自适应） */
      background: color-mix(in srgb, var(--glass-bg) 94%, #fff);
      box-shadow: 0 6px 18px rgba(31, 41, 55, 0.18);
    }

    &:hover {
      background: color-mix(in srgb, var(--glass-bg) 88%, #fff);
    }
  }
}

/* ============================================================
   「编辑主页」模式下图标持续抖动
   - 纯 CSS 实现，无需 JS 操作 class
   - 仅作用在图标上，让抖动更聚焦、更轻盈
   - 整个动画 1.2s，无限循环
   ============================================================ */
@keyframes cardIconShake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  10%      { transform: translate(-1.5px, 0) rotate(-3deg); }
  20%      { transform: translate(1.5px, 0)  rotate(3deg); }
  30%      { transform: translate(-1.5px, 0) rotate(-2deg); }
  40%      { transform: translate(1.5px, 0)  rotate(2deg); }
  50%      { transform: translate(-1px, 0)   rotate(-1.5deg); }
  60%      { transform: translate(1px, 0)    rotate(1.5deg); }
  70%      { transform: translate(-0.5px, 0) rotate(-1deg); }
  80%      { transform: translate(0.5px, 0)  rotate(1deg); }
  90%      { transform: translate(0, 0)      rotate(0); }
}

.site-card.edit-mode {
  .site-icon {
    animation: cardIconShake 1.2s ease-in-out infinite;
    /* 让抖动有微小随机感：每张卡片略微错开 */
  }

  &:nth-child(2n) .site-icon {
    animation-delay: -0.3s;
  }

  &:nth-child(3n) .site-icon {
    animation-delay: -0.6s;
  }

  &:nth-child(5n) .site-icon {
    animation-delay: -0.9s;
  }
}

/* 卡片右上角的 × 删除按钮
   - 玻璃质感（半透明白底 + 轻边框 + 柔和阴影）
   - 默认不刺眼，仅 hover 时才泛红
   - 与"编辑主页"模式整体柔和调性一致 */
.card-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: @radius-circle;
  border: 1px solid rgba(31, 41, 55, 0.08);
  background: rgba(255, 255, 255, 0.85);
  .glass-blur(8px);
  color: @text-soft;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(31, 41, 55, 0.12);
  z-index: 3;
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    background: fade(@danger, 95%);
    border-color: fade(@danger, 95%);
    color: #fff;
    box-shadow: 0 4px 10px fade(@danger, 35%);
    transform: scale(1.08);
  }

  &:active {
    transform: scale(0.94);
  }
}

/* ============================================================
   几何一致性原则
   - 卡片宽高 = 网格跨区（行高由 SiteGrid 测量 = 列宽，单元格为正方形）
   - 6 种尺寸只差图标档位 + 名称排版
   - 1x1 即正方形，2x2 是其 2 倍，1x2/2x1/2x4/4x2 比例真实
   ============================================================ */

/* 1x1：1 行 1 列（正方形） */
.size-1x1 {
  .site-size(52px, 5px 4px, 4px, 11px, 1);
}

/* 1x2：1 行 2 列（横） */
.size-1x2 {
  .site-size(56px, 5px 8px, 4px, 12px, 1);
}

/* 2x1：2 行 1 列（竖） */
.size-2x1 {
  .site-size(56px, 8px 4px, 6px, 12px, 2, 2px, 1.3);
}

/* 2x2：2 行 2 列（正方形） */
.size-2x2 {
  .site-size(76px, 14px 10px, 8px, 14px, 2, 4px, 1.3);
}

/* 2x4：2 行 4 列（横长） */
.size-2x4 {
  .site-size(76px, 14px 16px, 10px, 15px, 2, 4px, 1.3);
}

/* 4x2：4 行 2 列（竖长） */
.size-4x2 {
  .site-size(76px, 16px 10px, 10px, 15px, 3, 4px, 1.3);
}

.site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(31, 41, 55, 0.08);
  border: none;
  color: @accent;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* thesvg 矢量图标：撑满图标区，SVG 自适应 */
  .site-svg {
    width: 72%;
    height: 72%;
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(svg) {
      width: 100%;
      height: 100%;
    }
  }
}

.site-letter {
  font-size: calc(var(--icon-size) * 0.55);
  font-weight: 700;

  /* emoji 图标(工具卡:split-text 等)
     - 与添加站点弹窗里的 .widget-emoji 视觉一致:
       大字号 + 居中 + 轻投影
     - 不继承 .site-letter 的 700 字重(emoji 本身已是字形) */
  &.site-emoji {
    font-size: calc(var(--icon-size) * 0.62);
    font-weight: normal;
    line-height: 1;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15));
  }
}

.site-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

/* 移动端样式见 src/styles/mobile.less */
</style>

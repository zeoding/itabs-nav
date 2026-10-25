<script setup>
/**
 * 小组件预览弹窗（公共容器）
 * - 在「添加站点 → 小组件」tab 中，点击小组件卡片唤起本弹窗
 * - 当前唯一支持的 widget：split-text（工具类）
 *   弹窗内容容器直接渲染 SplitTextPreview,提供完整的文本分割体验
 * - SplitTextPreview 异步懒加载,避免弹窗首次打开就下载较重的依赖
 *   (SplitTextPanel / 文件解析 / xlsx 导出等)
 *
 * 设计原则:
 *  - 弹窗本身只负责容器(标题/分类/描述/footer),不耦合具体 widget 实现
 *  - 不修改现有 Weather/Todo/Calendar/Hot/SplitText Dialog
 *  - 后续如需新增预览 widget,在 views/widgets/ 下新建组件并在此引入
 */
import { computed, h } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { $t } from '@/composables/useI18n'
import { lazyDialog } from '@/utils/lazyDialog'
import { TOOLS_BY_KIND } from '@/config/tools'
import {
  RiSubtractLine,
  RiLoader4Line,
} from '@remixicon/vue'

/* Widget 异步懒加载:
 * - 仅当用户真的点击对应 widget 时才按需 import
 * - 内容区占位（居中旋转图标）六处共用一个组件，
 *   经 lazyDialog 工厂统一注入（delay 100ms 内不展示，避免快速切换时闪烁）
 */
const WidgetLoading = {
  render() {
    return h('div', { class: 'cp-loading-with-icon' }, [
      h(RiLoader4Line, { size: 28, class: 'spin', 'aria-hidden': true }),
      h('div', { class: 'cp-loading-text' }, $t('common.loading')),
    ])
  },
}

const SplitTextPreview = lazyDialog(() => import('@/views/widgets/SplitTextPreview.vue'), { delay: 100, loading: WidgetLoading })
const EmailPreview = lazyDialog(() => import('@/views/widgets/EmailPreview.vue'), { delay: 100, loading: WidgetLoading })
const WallpaperPreview = lazyDialog(() => import('@/views/widgets/WallpaperPreview.vue'), { delay: 100, loading: WidgetLoading })
const WeekReportPreview = lazyDialog(() => import('@/views/widgets/WeekReportPreview.vue'), { delay: 100, loading: WidgetLoading })
const EncodeDecodePreview = lazyDialog(() => import('@/views/widgets/EncodeDecodePreview.vue'), { delay: 100, loading: WidgetLoading })
const QrCodePreview = lazyDialog(() => import('@/views/widgets/QrCodePreview.vue'), { delay: 100, loading: WidgetLoading })

const props = defineProps({
  open: { type: Boolean, default: false },
  widget: { type: Object, default: null },
  /** 最小化（v-model:minimized）：弹窗隐藏，任务栏承接 */
  minimized: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'update:minimized'])

/** 实际可见：打开、有 widget 且未最小化（合并后交给 BaseDialog 控制显隐/ESC/全屏） */
const visible = computed(() => props.open && !!props.widget && !props.minimized)

/* 内置工具 widget 元数据统一取自 @/config/tools */
const tool = computed(() => (props.widget ? TOOLS_BY_KIND[props.widget.key] : null))
const widgetTitle = computed(() => tool.value?.name || '')
const widgetDesc = computed(() => tool.value?.desc || '')
const widgetCategory = computed(() => tool.value?.categoryKey || '')
const widgetKey = computed(() => props.widget?.key || '')

function close() {
  emit('update:open', false)
}

/** 最小化：弹窗隐藏，widget 保留，任务栏承接（点击任务栏还原） */
function minimize() {
  emit('update:minimized', true)
}
</script>

<template>
  <BaseDialog
    :open="visible"
    height="min(760px, 92vh)"
    max-height="92vh"
    padding="22px 24px 18px"
    :z-index="100"
    @close="close"
  >
    <template #title>
      <div class="header-title">
        <div class="header-icon" aria-hidden="true">
          <span class="header-emoji">{{ widget.icon }}</span>
        </div>
        <h3>{{ widgetTitle }}</h3>
      </div>
    </template>
    <template #actions>
      <button
        class="action-btn"
        v-tip="$t('dialog.minimize')"
        :aria-label="$t('dialog.minimize')"
        @click="minimize"
      >
        <RiSubtractLine size="18" aria-hidden="true" />
      </button>
    </template>

    <div class="modal-body">
            <!-- 分类 + 字典描述 -->
            <div class="meta-row">
              <span class="cat-tag">{{ $t(widgetCategory) }}</span>
              <span class="desc-inline">{{ widgetDesc }}</span>
            </div>

            <!-- 内容容器：根据 widgetKey 条件渲染对应的工具组件(异步懒加载) -->
            <div class="content-area">
              <SplitTextPreview v-if="widgetKey === 'split-text'" :key="widgetKey" />
              <EmailPreview v-else-if="widgetKey === 'free-email'" :key="widgetKey" />
              <WallpaperPreview v-else-if="widgetKey === 'wallpaper'" :key="widgetKey" />
              <WeekReportPreview v-else-if="widgetKey === 'week-report'" :key="widgetKey" />
              <EncodeDecodePreview v-else-if="widgetKey === 'encode-decode'" :key="widgetKey" />
              <QrCodePreview v-else-if="widgetKey === 'qr-code'" :key="widgetKey" />
            </div>
          </div>
    <template #footer>
      <footer class="modal-footer">
        <button class="btn ghost" @click="close">{{ $t('common.close') }}</button>
      </footer>
    </template>
  </BaseDialog>
</template>

<style scoped lang="less">
/* 异步加载占位(用于 SplitTextPreview 懒加载期间) */
.cp-loading-with-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 50px 12px;

  .spin {
    animation: wp-spin 1s linear infinite;
    color: @accent;
  }
}

.cp-loading-text {
  font-size: 12px;
  color: @text-soft;
}

@keyframes wp-spin {
  to { transform: rotate(360deg); }
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    .ellipsis();
  }
}

.header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  flex-shrink: 0;
}

.header-emoji {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
}

/* 最小化按钮（位于 BaseDialog 头部 #actions 插槽内） */
.action-btn {
  .circle-btn(30px);
  font-size: 18px;
  line-height: 1;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  flex: 1;
}

/* meta 行 */
.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cat-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: @radius-pill;
  font-size: 11px;
  font-weight: 500;
  color: @accent;
  background: @accent-soft;
  flex-shrink: 0;
}

.desc-inline {
  font-size: 12px;
  color: @text-soft;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}

/* 内容容器 */
.content-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  .thin-scrollbar(color-mix(in srgb, @accent 0.3%, transparent));
}

/* 底部按钮 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
}

.btn {
  border-radius: @radius-pill;
  padding: 8px 20px;
  font-size: 14px;
  transition: transform @tr, box-shadow @tr;

  &.ghost {
    background: rgba(31, 41, 55, 0.06);
    color: @text-soft;

    &:hover {
      background: rgba(31, 41, 55, 0.12);
    }
  }
}
</style>

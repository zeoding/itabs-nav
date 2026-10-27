<script setup>
/**
 * PDF 工具（合并 / 拆分 / 水印）壳组件。
 *
 * 结构：模式 Tab + 三个功能面板 + 预览弹窗。
 * 面板生成文件后 emit('preview', { blob, name })，壳用统一弹窗 BaseDialog
 * 展示（Teleport 到 body，不挤卡片内布局），iframe 交给浏览器原生 PDF 查看
 * 器，弹窗底部提供下载按钮；对象 URL 在下次预览/组件卸载时回收。
 * 三个面板只带结构，共享样式全部集中在下方 :deep 区，避免三份拷贝。
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { $t } from '@/composables/useI18n'
import BaseDialog from '@/components/BaseDialog.vue'
import { downloadBlob } from '@/utils/download'
import { RiDownloadLine } from '@remixicon/vue'
import PdfMergePane from './pdf/PdfMergePane.vue'
import PdfSplitPane from './pdf/PdfSplitPane.vue'
import PdfWatermarkPane from './pdf/PdfWatermarkPane.vue'

const modes = [
  { key: 'merge', component: PdfMergePane },
  { key: 'split', component: PdfSplitPane },
  { key: 'watermark', component: PdfWatermarkPane },
]

const mode = ref('merge')
const activeComp = computed(() => modes.find((m) => m.key === mode.value)?.component)

const preview = shallowRef(null) // { url, name, blob }
const previewOpen = ref(false)

function openPreview({ blob, name }) {
  if (preview.value) URL.revokeObjectURL(preview.value.url)
  preview.value = { url: URL.createObjectURL(blob), name, blob }
  previewOpen.value = true
}

/* 关闭只收起弹窗；URL 留到下次 openPreview / 组件卸载时回收，退出动画期间标题不闪空 */
function closePreview() {
  previewOpen.value = false
}

function downloadPreview() {
  if (!preview.value) return
  downloadBlob(preview.value.blob, preview.value.name)
}

onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value.url)
})
</script>

<template>
  <div class="pdf-tools">
    <!-- 模式切换 -->
    <div class="mode-tabs" role="tablist">
      <button
        v-for="m in modes"
        :key="m.key"
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ active: mode === m.key }"
        :aria-selected="mode === m.key"
        @click="mode = m.key"
      >
        {{ $t(`pdfMerge.tab_${m.key}`) }}
      </button>
    </div>

    <component :is="activeComp" @preview="openPreview" />

    <!-- 生成结果预览弹窗：z-index 高于外层 WidgetPreviewDialog(100) -->
    <BaseDialog
      :open="previewOpen"
      :title="preview?.name"
      width="min(960px, 94vw)"
      height="86vh"
      max-height="92vh"
      padding="16px 16px 14px"
      :z-index="200"
      @close="closePreview"
    >
      <div v-if="preview" class="pv-body">
        <iframe class="pv-frame" :src="preview.url" :title="preview.name" />
      </div>
      <template #footer>
        <div v-if="preview" class="pv-footer">
          <button type="button" class="pv-download" @click="downloadPreview">
            <RiDownloadLine size="14" aria-hidden="true" />
            {{ $t('pdfMerge.download') }}
          </button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped lang="less">
.pdf-tools {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* ===== 模式 Tab ===== */
.mode-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: @radius-pill;
  background: color-mix(in srgb, @accent 0.08%, transparent);
  align-self: flex-start;
}

.tab-btn {
  padding: 5px 16px;
  border: none;
  border-radius: @radius-pill;
  background: none;
  font-size: 12.5px;
  color: @text-soft;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(.active) {
    color: @text;
  }

  &.active {
    color: #fff;
    background: @accent-gradient;
    font-weight: 500;
  }
}

/* ===== 预览弹窗 ===== */
.pv-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.pv-frame {
  flex: 1;
  min-height: 0;
  border: none;
  background: #525659; // 与 Chrome 内置 PDF 查看器底色一致
}

.pv-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.pv-download {
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
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 40%, transparent);
  }

  &:active {
    transform: scale(0.96);
  }
}

/* ===== 三个功能面板的共享样式（pane 内无 scoped 样式，全部在此 :deep 提供） ===== */
.pdf-tools :deep(.pane) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* 导入区 */
:deep(.dropzone) {
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

:deep(.dz-main) {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: @text;
}

:deep(.dz-hint) {
  font-size: 12px;
  color: @text-soft;
}

:deep(.dz-input) {
  display: none;
}

/* 已选文件信息卡（拆分/水印） */
:deep(.file-card) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
}

:deep(.fc-icon) {
  flex: 0 0 auto;
  color: @text-soft;
}

:deep(.fc-name) {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: @text;
  .ellipsis();
}

:deep(.fc-meta) {
  flex: 0 0 auto;
  font-size: 11px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
}

:deep(.fc-btn) {
  flex: 0 0 auto;
  padding: 3px 10px;
  border: none;
  border-radius: @radius-pill;
  font-size: 11.5px;
  color: @accent;
  background: @accent-soft;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

/* 表单行 */
:deep(.field-row) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.field-label) {
  flex: 0 0 auto;
  font-size: 12px;
  color: @text-soft;
}

:deep(.field-input) {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.55);
  font-size: 12.5px;
  color: @text;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: @accent;
  }

  &::placeholder {
    color: @text-soft;
    opacity: 0.7;
  }

  &:disabled {
    opacity: 0.5;
  }
}

:deep(.hint) {
  margin: -6px 0 0;
  font-size: 11.5px;
  color: @text-soft;
}

:deep(.warn) {
  margin: -6px 0 0;
  font-size: 11.5px;
  color: #b45309;
}

/* 拆分范围 chips */
:deep(.chips) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

:deep(.chip) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px 3px 10px;
  border-radius: @radius-pill;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
}

:deep(.chip-text) {
  font-size: 11.5px;
  color: @text;
  font-variant-numeric: tabular-nums;
}

:deep(.chip-btn) {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: @radius-circle;
  color: @accent;
  background: none;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: @accent-soft;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

/* 水印参数 */
:deep(.wm-opts) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

:deep(.opt) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: @text-soft;

  input[type='number'] {
    width: 64px;
    padding: 4px 6px;
    border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
    border-radius: @radius-card;
    background: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    color: @text;
    outline: none;

    &:focus {
      border-color: @accent;
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  input[type='range'] {
    accent-color: @accent;
  }

  select {
    padding: 4px 6px;
    border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
    border-radius: @radius-card;
    background: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    color: @text;
    outline: none;

    &:disabled {
      opacity: 0.5;
    }
  }
}

:deep(.opt-value) {
  font-style: normal;
  min-width: 34px;
  color: @text;
  font-variant-numeric: tabular-nums;
}

/* 合并文件列表 */
:deep(.file-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  .thin-scrollbar();

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

:deep(.f-index) {
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

:deep(.f-icon) {
  flex: 0 0 auto;
  color: @text-soft;
}

:deep(.f-name) {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: @text;
  .ellipsis();
}

:deep(.f-size) {
  flex: 0 0 auto;
  font-size: 11px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
}

:deep(.f-ops) {
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

:deep(.empty-tip) {
  margin: 0;
  padding: 10px 2px;
  font-size: 12px;
  color: @text-soft;
  text-align: center;
}

/* 合并输出文件名 */
:deep(.name-row) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.name-label) {
  flex: 0 0 auto;
  font-size: 12px;
  color: @text-soft;
}

:deep(.name-field) {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-radius: @radius-card;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: @accent;
  }
}

:deep(.name-input) {
  flex: 1;
  min-width: 0;
  padding: 7px 0;
  border: none;
  outline: none;
  background: none;
  font-size: 12.5px;
  color: @text;
  font-variant-numeric: tabular-nums;

  &::placeholder {
    color: @text-soft;
    opacity: 0.7;
  }

  &:disabled {
    opacity: 0.5;
  }
}

:deep(.name-ext) {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: @text-soft;
  user-select: none;
}

/* 统计行 + 动作按钮 */
:deep(.merge-bar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

:deep(.bar-meta) {
  font-size: 12px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
}

:deep(.link-btn) {
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

:deep(.action-bar) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

:deep(.primary-btn) {
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
    animation: spin360 0.9s linear infinite; // keyframes 定义在 src/styles/main.less
  }
}

:deep(.ghost-btn) {
  padding: 7px 14px;
  border: 1px solid color-mix(in srgb, @accent 0.25%, transparent);
  border-radius: @radius-pill;
  font-size: 12.5px;
  color: @accent;
  background: none;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    background: @accent-soft;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>

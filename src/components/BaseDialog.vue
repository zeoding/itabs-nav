<script setup>
/**
 * 公共弹窗容器（所有弹窗共用）
 * - 统一：Teleport + modal-pop 过渡 + 遮罩 + 标题栏（标题 / 全屏 / 关闭）+ ESC 关闭
 * - 容器沿用全局 .dialog 类名：modal-pop 进场动画与 mobile.css 响应式规则对所有弹窗生效
 * - 各弹窗的尺寸差异经 CSS 变量传入（width / height / maxHeight / padding / overflow
 *   及全屏态的 fsPadding / fsOverflow），无需重复写遮罩/标题栏样式
 * - 全屏状态内部持有，经默认 slot prop `fullscreen` 透给内容区：
 *     <BaseDialog ...>
 *       <template #default="{ fullscreen }"> ... </template>
 *     </BaseDialog>
 * - 额外头部按钮经 #actions slot 注入；完全自定义标题区经 #title slot 覆盖
 */
import { computed, watch } from 'vue'
import { useDialogFullscreen } from '@/utils/fullscreenMixin'
import { useEscapeClose } from '@/composables/useEscapeClose'
import { $t } from '@/composables/useI18n'
import {
  RiFullscreenLine,
  RiFullscreenExitLine,
  RiCloseLine,
} from '@remixicon/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 纯文本标题；需自定义（含图标等）时改用 #title slot */
  title: { type: String, default: '' },
  width: { type: String, default: 'min(960px, 96vw)' },
  height: { type: String, default: null },
  maxHeight: { type: String, default: '90vh' },
  padding: { type: String, default: '22px 24px' },
  overflow: { type: String, default: 'hidden' },
  /** 全屏态覆盖（缺省沿用普通态） */
  fsPadding: { type: String, default: null },
  fsOverflow: { type: String, default: null },
  zIndex: { type: Number, default: 10000 },
  /** 是否 Teleport 到 body（SiteEditor 等就地渲染的弹窗传 false） */
  teleport: { type: Boolean, default: true },
  fullscreenable: { type: Boolean, default: true },
})
const emit = defineEmits(['close', 'open'])

/** 打开时通知内容区做数据加载（替代各弹窗 watch(open)+onMounted 双份样板）。
 *  immediate：配合「首次打开才挂载」的父级 v-if 门控，挂载时即为 open=true
 *  也要触发一次 */
watch(
  () => props.open,
  (v) => {
    if (v) emit('open')
  },
  { immediate: true }
)

const { isFullscreen, toggleFullscreen } = useDialogFullscreen(
  computed(() => props.open)
)
useEscapeClose(computed(() => props.open), onClose)

function onClose() {
  emit('close')
}

/** 尺寸经 CSS 变量下发；全屏态由下方 .is-fullscreen 规则接管
 *（--dlg-z 设在遮罩上，其余设在容器上：变量只向下继承） */
const maskVars = computed(() => ({ '--dlg-z': props.zIndex }))
const dlgVars = computed(() => ({
  '--dlg-width': props.width,
  ...(props.height ? { '--dlg-height': props.height } : {}),
  ...(props.maxHeight ? { '--dlg-max-height': props.maxHeight } : {}),
  '--dlg-padding': props.padding,
  '--dlg-overflow': props.overflow,
  ...(props.fsPadding ? { '--dlg-fs-padding': props.fsPadding } : {}),
  ...(props.fsOverflow ? { '--dlg-fs-overflow': props.fsOverflow } : {}),
}))
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <Transition name="modal-pop">
      <div v-if="open" class="modal-mask" :style="maskVars" @click.self="onClose">
        <div class="dialog glass" :class="{ 'is-fullscreen': isFullscreen }" :style="dlgVars">
          <header class="dialog-header">
            <slot name="title">
              <h3 v-if="title">{{ title }}</h3>
            </slot>
            <div class="header-actions">
              <slot name="actions" />
              <button
                v-if="fullscreenable"
                class="fullscreen-btn"
                v-tip="isFullscreen ? $t('dialog.collapse') : $t('dialog.expand')"
                :aria-label="$t('dialog.toggle')"
                @click="toggleFullscreen"
              >
                <RiFullscreenExitLine v-if="isFullscreen" size="18" aria-hidden="true" />
                <RiFullscreenLine v-else size="18" aria-hidden="true" />
              </button>
              <button
                class="close-btn"
                v-tip="$t('common.close')"
                :aria-label="$t('common.close')"
                @click="onClose"
              >
                <RiCloseLine size="18" aria-hidden="true" />
              </button>
            </div>
          </header>
          <slot :fullscreen="isFullscreen" />
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.modal-mask {
  position: fixed;
  inset: 0;
  background: @mask-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--dlg-z, 10000);
  .glass-blur(6px);
  padding: 20px;

  &:has(.dialog.is-fullscreen) {
    padding: 0;
  }
}

.dialog {
  width: var(--dlg-width, min(960px, 96vw));
  height: var(--dlg-height, auto);
  max-height: var(--dlg-max-height, 90vh);
  padding: var(--dlg-padding, 22px 24px);
  border-radius: @radius-dialog;
  color: @text;
  overflow: var(--dlg-overflow, hidden);
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease, max-height 0.25s ease;

  &.is-fullscreen {
    width: 100vw;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    padding: var(--dlg-fs-padding, var(--dlg-padding, 22px 24px));
    overflow: var(--dlg-fs-overflow, var(--dlg-overflow, hidden));
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
}

.header-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.fullscreen-btn,
.close-btn {
  .circle-btn(30px);
  font-size: 18px;
  line-height: 1;
}
</style>

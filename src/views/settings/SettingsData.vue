<script setup>
/**
 * 设置 - 数据管理 Tab
 * - 备份导出 / 恢复导入 / 重置外观设置 / 清空全部数据
 * - 自包含：直接调用 db / confirm / message，变更经事件通知父级
 */
import { ref } from 'vue'
import { exportBackup, importBackup } from '@/db'
import { SETTINGS_DEFAULTS } from '@/stores/settings'
import { useConfirm } from '@/composables/useConfirm'
import { useMessage } from '@/composables/useMessage'
import { pad2 } from '@/utils/datetime'
import { $t } from '@/composables/useI18n'
import {
  RiDownloadLine,
  RiUploadLine,
  RiLoopLeftLine,
} from '@remixicon/vue'

const emit = defineEmits(['update', 'reset', 'restored'])

const { confirm } = useConfirm()
const message = useMessage()
const fileInput = ref(null)

// 局部 toast 包装：error 走 message.error，其余走 message.success
function toast(msg, type = 'ok') {
  if (type === 'error') message.error(msg)
  else message.success(msg)
}

/** 备份：导出 IndexedDB 全量 JSON 文件下载 */
async function handleBackup() {
  try {
    const payload = await exportBackup()
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const d = new Date()
    const name = `itabs-nav-backup-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    toast($t('settings.data.backupDone'))
  } catch (e) {
    toast($t('settings.data.backupFail', { msg: e.message }), 'error')
  }
}

/** 恢复：选择备份 JSON 文件并导入 */
function triggerRestore() {
  fileInput.value?.click()
}

async function onFileChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const ok = await confirm({
      title: $t('settings.data.restoreConfirmTitle'),
      message: $t('settings.data.restoreConfirmMsg', { name: file.name }),
      okText: $t('settings.data.restoreOk'),
      danger: true,
    })
    if (!ok) return
    await importBackup(payload)
    emit('restored')
    toast($t('settings.data.restoreDone'))
  } catch (err) {
    toast($t('settings.data.restoreFail', { msg: err.message }), 'error')
  }
}

/** 仅重置外观布局类设置，不动导航数据 */
async function resetSettings() {
  const ok = await confirm({
    title: $t('settings.reset.title'),
    message: $t('settings.reset.message'),
    okText: $t('settings.reset.okText'),
  })
  if (!ok) return
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    // 深拷贝引擎数组，避免引用污染
    const v = Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value
    emit('update', key, v)
  }
  toast($t('settings.reset.done'))
}

async function resetAll() {
  const ok = await confirm({
    title: $t('settings.resetAll.title'),
    message: $t('settings.resetAll.message'),
    okText: $t('settings.resetAll.okText'),
    danger: true,
  })
  if (ok) emit('reset')
}
</script>

<template>
  <div class="group">
    <div class="group-title">{{ $t('settings.data.backupTitle') }}</div>
    <p class="hint">{{ $t('settings.data.backupHint') }}</p>
    <div class="row-btns">
      <button class="action-btn" @click="handleBackup">
        <RiDownloadLine size="16" aria-hidden="true" /> {{ $t('settings.data.backup') }}
      </button>
      <button class="action-btn" @click="triggerRestore">
        <RiUploadLine size="16" aria-hidden="true" /> {{ $t('settings.data.restore') }}
      </button>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onFileChange"
    />
  </div>

  <div class="group">
    <div class="group-title">{{ $t('settings.data.resetTitle') }}</div>
    <div class="row-btns col">
      <button class="action-btn" @click="resetSettings">
        <RiLoopLeftLine size="16" aria-hidden="true" /> {{ $t('settings.data.resetSettings') }}
      </button>
      <button class="danger-btn" @click="resetAll">{{ $t('settings.data.resetAll') }}</button>
    </div>
  </div>
</template>

<style scoped lang="less">
.group {
  margin-bottom: 20px;
}

.group-title {
  font-size: 12px;
  color: @text-soft;
  margin-bottom: 8px;
}

.hint {
  font-size: 12px;
  color: @text-soft;
  margin-bottom: 10px;
  line-height: 1.6;
}

.row-btns {
  display: flex;
  gap: 10px;

  &.col {
    flex-direction: column;
  }
}

.action-btn {
  flex: 1;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
  color: @accent;
  background: @accent-soft;
  transition: background @tr;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, @accent 0.2%, transparent);
  }
}

.danger-btn {
  width: 100%;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
  color: @danger;
  background: fade(@danger, 8%);
  transition: background @tr;
  border: none;
  cursor: pointer;

  &:hover {
    background: fade(@danger, 16%);
  }
}
</style>

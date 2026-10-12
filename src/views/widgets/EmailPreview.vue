<script setup>
/**
 * 免费邮箱小组件（duckmail.sbs API）
 *
 * 功能：
 *  - 自动创建临时邮箱账户（持久化到 IDB settings）
 *  - 收件箱每 15s 自动轮询 + 手动刷新
 *  - 支持查看单封邮件（纯文本 + HTML 两种来源）
 *  - 复制地址到剪贴板
 *
 * 数据持久化：
 *  - 账户信息（id/address/password/token/tokenExpiresAt）存在 settings 表
 *    key: 'free-email-account'
 *  - 关闭弹窗后再打开会复用同一邮箱；如果想换新邮箱，调用 resetAccount()
 *
 * 设计取舍：
 *  - 直接 fetch('https://api.duckmail.sbs/...')，duckmail.sbs 公开 API、CORS-enabled
 *  - 邮件 HTML 通过 iframe srcdoc 渲染，避开 v-html 的限制并保留样式
 *  - iframe 加 sandbox="" 隔离邮件里的脚本
 */
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { getSetting, setSetting } from '@/db'
import {
  RiMailLine,
  RiLoader4Line,
  RiRefreshLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiArrowDownSLine,
} from '@remixicon/vue'

const SETTINGS_KEY = 'free-email-account'
const POLL_INTERVAL_MS = 15000
const MAIL_TM_BASE = 'https://api.duckmail.sbs'

/* ---------- 状态 ---------- */
const account = ref(null)              // { id, address, password, token, tokenExpiresAt }
const messages = ref([])               // 邮件列表（按 createdAt 倒序，DuckMail/duckmail.sbs 都用这个字段）
const loading = ref(false)
const polling = ref(false)
const error = ref('')
const openMessageId = ref(null)       // 当前展开的邮件 id
const openMessage = ref(null)          // 当前展开的邮件详情
const openMessageLoading = ref(false)
const copied = ref(false)              // 复制按钮临时高亮

/* ---------- 工具 ---------- */
function randomPassword() {
  // 16 位随机密码：大小写字母+数字
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

function isTokenValid(acc) {
  if (!acc?.tokenExpiresAt) return false
  // 提前 60s 视为过期，避免边界竞态
  return Date.now() < acc.tokenExpiresAt - 60_000
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (account.value?.token) headers['Authorization'] = `Bearer ${account.value.token}`
  const res = await fetch(`${MAIL_TM_BASE}${path}`, { ...opts, headers })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.['hydra:description'] || '' } catch { /* noop */ }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  // duckmail.sbs 部分端点返回 204 No Content（如 DELETE /accounts/{id}）
  if (res.status === 204) return null
  return res.json()
}

async function createAccount() {
  const address = `itab_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@duckmail.sbs`
  const password = randomPassword()
  // 1. 注册账户
  const acc = await api('/accounts', {
    method: 'POST',
    body: JSON.stringify({ address, password }),
  })
  // 2. 拿 token
  const tok = await api('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password }),
  })
  account.value = {
    id: acc.id,
    address,
    password,
    token: tok.token,
    tokenExpiresAt: Date.now() + (tok.expiresIn || 3600) * 1000,
  }
  await setSetting(SETTINGS_KEY, toPlain(account.value))
}

async function refreshToken() {
  const tok = await api('/token', {
    method: 'POST',
    body: JSON.stringify({ address: account.value.address, password: account.value.password }),
  })
  account.value.token = tok.token
  account.value.tokenExpiresAt = Date.now() + (tok.expiresIn || 3600) * 1000
  await setSetting(SETTINGS_KEY, toPlain(account.value))
}

/* 序列化备份：避免往 IDB 写 Proxy / Function 等 */
function toPlain(obj) {
  return JSON.parse(JSON.stringify(obj))
}

async function loadOrCreateAccount() {
  error.value = ''
  const cached = await getSetting(SETTINGS_KEY, null)
  if (cached && cached.id) {
    account.value = cached
    if (!isTokenValid(cached)) {
      try { await refreshToken() }
      catch (e) { error.value = 'token 刷新失败：' + e.message }
    }
  } else {
    await createAccount()
  }
}

async function fetchMessages() {
  if (!account.value?.token) return
  try {
    polling.value = true
    const data = await api('/messages?page=1')
    // 按 createdAt 倒序（DuckMail 字段；duckmail.sbs 用 receivedAt，兜底兼容）
    const list = (data['hydra:member'] || data.member || []).slice()
    list.sort((a, b) => {
      const tb = new Date(b.createdAt || b.receivedAt || 0).getTime()
      const ta = new Date(a.createdAt || a.receivedAt || 0).getTime()
      return tb - ta
    })
    messages.value = list
    error.value = ''
  } catch (e) {
    if (String(e.message).includes('HTTP 401')) {
      // token 失效，尝试刷新一次
      try { await refreshToken(); return fetchMessages() }
      catch { error.value = '登录已过期，请点击刷新按钮重试' }
    } else {
      error.value = '获取邮件失败：' + e.message
    }
  } finally {
    polling.value = false
  }
}

async function loadOpenMessage(msg) {
  if (openMessageId.value === msg.id) {
    // 再次点击收起
    openMessageId.value = null
    openMessage.value = null
    return
  }
  openMessageId.value = msg.id
  openMessage.value = null
  openMessageLoading.value = true
  try {
    const detail = await api(`/messages/${msg.id}`)
    openMessage.value = detail
  } catch (e) {
    error.value = '读取邮件失败：' + e.message
  } finally {
    openMessageLoading.value = false
  }
}

async function copyAddress() {
  if (!account.value?.address) return
  try {
    await navigator.clipboard.writeText(account.value.address)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    /* 剪贴板权限被拒，忽略 */
  }
}

async function resetAccount() {
  if (!account.value?.id) return
  loading.value = true
  error.value = ''
  try {
    await api(`/accounts/${account.value.id}`, { method: 'DELETE' })
  } catch {
    /* 即便远端删除失败，也走本地重建 */
  }
  account.value = null
  messages.value = []
  openMessageId.value = null
  openMessage.value = null
  await setSetting(SETTINGS_KEY, null)
  await loadOrCreateAccount()
  await fetchMessages()
  loading.value = false
}

/* ---------- 派生 ---------- */
const hasHtml = computed(() => !!openMessage.value?.html && openMessage.value.html.length > 0)
const hasText = computed(() => !!openMessage.value?.text && openMessage.value.text.length > 0)

/** 从 from 复合对象中提取展示用的发件人字符串
 *  - 优先展示 name
 *  - 有 name 但也带 address 时,附加 "<address>" 让用户既能看到昵称也能看到真邮箱
 *  - 没 name 时退到 address
 */
function formatFrom(from) {
  if (!from) return '(未知发件人)'
  if (from.name && from.address && from.name !== from.address) {
    return `${from.name} <${from.address}>`
  }
  return from.name || from.address || '(未知发件人)'
}

/** DuckMail 字段为 createdAt，duckmail.sbs 字段为 receivedAt；兼容两种 */
function formatDate(msg) {
  const iso = msg?.createdAt || msg?.receivedAt || ''
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const hh = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  // 跨年用完整年份，否则用 MM-DD
  const md = d.getFullYear() === now.getFullYear()
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  // 计算"几天前"：以本地零点为分界
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000)

  if (diffDays <= 0) return `今天 ${hh}`
  if (diffDays === 1) return `昨天 ${hh}`
  if (diffDays < 7) return `${diffDays}天前`
  return md
}

/* ---------- 生命周期 ---------- */
let pollTimer = null
function startPolling() {
  stopPolling()
  pollTimer = setInterval(fetchMessages, POLL_INTERVAL_MS)
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await loadOrCreateAccount()
    await fetchMessages()
    startPolling()
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="email-root">
    <!-- 顶部：邮箱地址 + 操作 -->
    <div class="email-header glass">
      <div class="addr-block">
        <div class="addr-label">临时邮箱</div>
        <div v-if="account" class="addr-value" :title="account.address">
          {{ account.address }}
        </div>
        <div v-else class="addr-placeholder">
          <RiLoader4Line size="14" class="spin" aria-hidden="true" />
          {{ loading ? '创建中...' : '加载中...' }}
        </div>
      </div>
      <div class="addr-actions">
        <button
          class="icon-btn"
          :class="{ active: copied }"
          :disabled="!account"
          v-tip="copied ? '已复制' : '复制地址'"
          :aria-label="copied ? '已复制' : '复制地址'"
          @click="copyAddress"
        >
          <RiCheckLine v-if="copied" size="16" aria-hidden="true" />
          <RiMailLine v-else size="16" aria-hidden="true" />
        </button>
        <button
          class="icon-btn"
          :disabled="!account || polling"
          v-tip="'刷新'"
          :aria-label="'刷新'"
          @click="fetchMessages"
        >
          <RiRefreshLine :class="{ spin: polling }" size="16" aria-hidden="true" />
        </button>
        <button
          class="icon-btn danger"
          :disabled="!account"
          v-tip="'换新邮箱'"
          :aria-label="'换新邮箱'"
          @click="resetAccount"
        >
          <RiDeleteBinLine size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- 错误条 -->
    <div v-if="error" class="error-bar">{{ error }}</div>

    <!-- 收件箱 -->
    <div v-if="loading && messages.length === 0" class="status">
      <RiLoader4Line size="28" class="spin" aria-hidden="true" />
      <span>正在初始化邮箱...</span>
    </div>
    <div v-else-if="messages.length === 0" class="status muted">
      暂无邮件，等待接收中...
    </div>
    <div v-else class="msg-list">
      <button
        v-for="msg in messages"
        :key="msg.id"
        :class="['msg-item glass', { open: openMessageId === msg.id, unread: msg.seen === false }]"
        type="button"
        @click="loadOpenMessage(msg)"
      >
        <div class="msg-row1">
          <span v-if="msg.seen === false" class="msg-unread-dot" aria-label="未读" />
          <span class="msg-from" v-tip="msg.from?.address" :title="msg.from?.address">{{ formatFrom(msg.from) }}</span>
          <span class="msg-time">{{ formatDate(msg) }}</span>
          <span class="msg-arrow" aria-hidden="true">
            <RiArrowDownSLine size="14" />
          </span>
        </div>
        <div class="msg-subject">{{ msg.subject || '(无主题)' }}</div>
        <div v-if="openMessageId === msg.id" class="msg-detail" @click.stop>
          <div v-if="openMessageLoading" class="detail-loading">
            <RiLoader4Line size="20" class="spin" aria-hidden="true" />
          </div>
          <template v-else-if="openMessage">
            <div v-if="hasHtml" class="detail-html">
              <iframe
                :srcdoc="openMessage.html"
                sandbox=""
                referrerpolicy="no-referrer"
                title="email-html"
              ></iframe>
            </div>
            <pre v-else-if="hasText" class="detail-text">{{ openMessage.text }}</pre>
            <div v-else class="detail-empty">(邮件无内容)</div>
          </template>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.email-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

/* 顶部邮箱信息条 */
.email-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  flex-shrink: 0;
}

.addr-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.addr-label {
  font-size: 11px;
  color: @text-soft;
}

.addr-value {
  font-size: 14px;
  font-weight: 600;
  color: @accent;
  .ellipsis();
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.addr-placeholder {
  font-size: 13px;
  color: @text-soft;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.addr-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  .circle-btn(30px);
  font-size: 14px;
  color: @text-soft;
  background: rgba(31, 41, 55, 0.06);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(31, 41, 55, 0.12);
    color: @text;
  }

  &.active {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
  }

  &.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.spin {
  animation: em-spin 1s linear infinite;
}

@keyframes em-spin {
  to { transform: rotate(360deg); }
}

/* 错误条 */
.error-bar {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 12px;
  flex-shrink: 0;
}

/* 状态（loading / empty） */
.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 13px;
  color: @text-soft;
  flex: 1;

  &.muted {
    color: @text-soft;
    opacity: 0.7;
  }
}

/* 邮件列表 */
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;  /* 卡片阴影不被滚动条裁剪 */
  .thin-scrollbar(color-mix(in srgb, @accent 0.3%, transparent));
}

.msg-item {
  position: relative;
  width: 100%;
  text-align: left;
  padding: 11px 14px 11px 16px;  /* 左侧多 4px 让位给未读竖条 */
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid color-mix(in srgb, @accent 0.08%, transparent);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  color: @text;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;  /* 让 ::before 竖条不会超出圆角 */

  &:hover {
    background: rgba(255, 255, 255, 0.85);
    border-color: color-mix(in srgb, @accent 0.2%, transparent);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }

  &.open {
    background: rgba(255, 255, 255, 0.95);
    border-color: color-mix(in srgb, @accent 0.25%, transparent);
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.10);

    .msg-arrow {
      color: @accent;
      transform: rotate(180deg);
    }
  }

  /* 未读：左侧 3px accent 竖条 */
  &.unread::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: linear-gradient(180deg, @accent, color-mix(in srgb, @accent 70%, #fff));
  }

  /* 未读：subject 加粗 + 整卡微微抬高 */
  &.unread .msg-subject {
    font-weight: 600;
  }
  &.unread .msg-from {
    font-weight: 600;
  }
}

/* 键盘焦点：保持可访问性 */
.msg-item:focus-visible {
  outline: 2px solid color-mix(in srgb, @accent 50%, transparent);
  outline-offset: 2px;
}

.msg-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: @text-soft;
}

.msg-from {
  .ellipsis();
  font-weight: 500;
  color: @text;
  flex: 1;
  min-width: 0;
}

.msg-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 未读小圆点（紧贴 from 文字左侧） */
.msg-unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: @accent;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, @accent 25%, transparent);
}

/* 展开/折叠箭头：默认朝下，open 时旋转 180° 朝上 */
.msg-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: @text-soft;
  opacity: 0.6;
  transition: transform 0.2s ease, color 0.2s ease, opacity 0.2s ease;
}

.msg-item:hover .msg-arrow {
  opacity: 1;
}

.msg-subject {
  font-size: 13px;
  font-weight: 500;
  color: @text;
  .ellipsis();
}

.msg-detail {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in srgb, @accent 0.18%, transparent);
}

.detail-loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  color: @accent;
}

.detail-html {
  width: 100%;

  iframe {
    width: 100%;
    min-height: 240px;
    max-height: 360px;
    border: 1px solid color-mix(in srgb, @accent 0.12%, transparent);
    border-radius: 8px;
    background: #fff;
  }
}

.detail-text {
  margin: 0;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: @text;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow-y: auto;
}

.detail-empty {
  font-size: 12px;
  color: @text-soft;
  text-align: center;
  padding: 16px 0;
}
</style>
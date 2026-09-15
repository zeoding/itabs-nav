/**
 * 统一 HTTP 请求工具
 * - 基于 axios 封装
 * - 内置请求/响应拦截器
 * - 统一错误处理、超时、headers
 *
 * 使用：
 *   import http from '@/utils/http'
 *   const data = await http.get('/hot', { params: { type: 'baidu' } })
 */
import axios from 'axios'
import { $t } from '@/composables/useI18n'

/** 默认配置 */
const DEFAULT_CONFIG = {
  timeout: 8000,                       // 8s 超时
  headers: {
    'Accept': 'application/json',
  },
}

/** 创建 axios 实例 */
const instance = axios.create(DEFAULT_CONFIG)

/* ============================================================
   请求拦截器
   ============================================================ */
instance.interceptors.request.use(
  (config) => {
    // 请求开始时间（用于计算耗时）
    config.metadata = { startTime: Date.now() }
    return config
  },
  (error) => {
    console.error('[http] 请求拦截器错误:', error)
    return Promise.reject(error)
  }
)

/* ============================================================
   响应拦截器
   ============================================================ */
instance.interceptors.response.use(
  (response) => {
    // 计算耗时
    const duration = Date.now() - (response.config.metadata?.startTime || 0)
    if (duration > 3000) {
      console.warn(`[http] ${response.config.url} 耗时 ${duration}ms`)
    }
    return response
  },
  (error) => {
    return Promise.reject(normalizeError(error))
  }
)

/* ============================================================
   错误标准化（内部用）
   - 转换为统一格式：{ code, message, original }
   ============================================================ */
function normalizeError(error) {
  if (error.response) {
    // HTTP 4xx / 5xx
    return {
      code: error.response.status,
      message: `HTTP ${error.response.status} ${error.response.statusText || ''}`.trim(),
      original: error,
    }
  }
  if (error.code === 'ECONNABORTED') {
    return { code: -1, message: $t('http.timeout'), original: error }
  }
  if (error.request) {
    return { code: -2, message: $t('http.networkError'), original: error }
  }
  return { code: -3, message: error.message || $t('http.unknownError'), original: error }
}

/* ============================================================
   公共方法
   ============================================================ */
export const http = {
  /** GET 请求（全工程仅此一个出口） */
  get(url, config = {}) {
    return instance.get(url, config).then((resp) => resp.data)
  },
}

export default http
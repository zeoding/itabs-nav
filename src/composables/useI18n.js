import { ref, computed } from 'vue'
import zhCN from '@/i18n/zh-CN.js'
import en from '@/i18n/en.js'

/**
 * 轻量 i18n composable
 * - 默认中文
 * - 语言设置由 useSettings 持久化（language: 'zh-CN' | 'en'）
 * - 支持模板插值：$t('settings.data.backupFail', { msg: e.message })
 * - 数组返回：$t('calendar.weekdays')  →  ['日', '一', ...]
 * - 缺省 fallback：zh-CN（保证总是不空）
 */

const DICTS = {
  'zh-CN': zhCN,
  en,
}

const currentLang = ref('zh-CN')

/** 通过点路径读取字典值：'a.b.c' → DICTS[lang].a.b.c */
function lookup(dict, path) {
  return path.split('.').reduce((acc, k) => {
    if (acc == null) return undefined
    // 支持数字键（如 weekdays[0] → 'weekdays.0'）
    return acc[k]
  }, dict)
}

/** 模板插值：将 {key} 占位符替换为 params[key] */
function interpolate(template, params) {
  if (!params || typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key]
    return v == null ? `{${key}}` : String(v)
  })
}

export function setLanguage(lang) {
  if (DICTS[lang]) currentLang.value = lang
}

export function getLanguage() {
  return currentLang.value
}

export function useI18n() {
  const lang = computed(() => currentLang.value)

  return {
    $t,
    lang,
    setLanguage,
    getLanguage,
  }
}

/**
 * 独立翻译函数（与 useI18n 返回的是同一个）
 * - 供 main.js 注册为全局属性（模板内直接 $t('...')，无需逐文件 useI18n）
 * - script 内按需可用具名导入：import { $t } from '@/composables/useI18n'
 * @param {string} key  点路径，如 'common.cancel'
 * @param {object} [params] 插值参数
 * @returns {string|Array|Object}
 */
export function $t(key, params) {
  const cur = DICTS[currentLang.value] || DICTS['zh-CN']
  let value = lookup(cur, key)
  if (value === undefined) {
    // 缺省回落到中文
    value = lookup(DICTS['zh-CN'], key)
  }
  if (value === undefined) return key
  if (typeof value === 'string') return interpolate(value, params)
  return value
}
import dayjs from 'dayjs'

/**
 * 时间格式化工具（基于 dayjs，本地时区）
 *
 * 收口此前散落在 8+ 个文件里的 pad/格式化内联实现：
 * HotDialog formatTime、WeatherDialog formatCacheTime、CalendarDialog
 * formatDate、dailyCache todayStr、WorldTimeDialog/SettingsData/
 * EmailPreview/ClockCard 各自的 pad 内联。
 *
 * - dayjs 入参直接接受 Date / 时间戳 / 日期字符串；无效日期统一返回 ''
 *   （此前仅 formatHHmm 有该守卫，现在三个格式化函数行为一致）
 * - 格式 token 与语言环境无关（HH:mm / YYYY-MM-DD），无需加载 dayjs 语言包
 * - 相对时间（"几天前"，TodoDialog/EmailPreview）依赖 i18n 文案，
 *   各自语义不同，不在此收口
 */

/** 两位补零（1 → '01'）——非日期场景（备份文件名/时钟数字）也用它 */
export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** HH:mm（如 09:07）；无效日期返回 '' */
export function formatHHmm(d = new Date()) {
  const dt = dayjs(d)
  return dt.isValid() ? dt.format('HH:mm') : ''
}

/** yyyy-MM-dd */
export function formatYMD(d = new Date()) {
  const dt = dayjs(d)
  return dt.isValid() ? dt.format('YYYY-MM-DD') : ''
}

/** yyyy-MM-dd HH:mm:ss */
export function formatDateTime(d = new Date()) {
  const dt = dayjs(d)
  return dt.isValid() ? dt.format('YYYY-MM-DD HH:mm:ss') : ''
}

/**
 * 时间格式化工具（本地时区）
 *
 * 收口此前散落在 8+ 个文件里的 pad/格式化内联实现：
 * HotDialog formatTime、WeatherDialog formatCacheTime、CalendarDialog
 * formatDate、dailyCache todayStr、WorldTimeDialog/SettingsData/
 * EmailPreview/WeekReportPreview 各自的 pad 内联。
 *
 * 相对时间（"几天前"，TodoDialog/EmailPreview）依赖 i18n 文案，
 * 各自语义不同，不在此收口。
 */

/** 两位补零（1 → '01'） */
export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** HH:mm（如 09:07）；无效日期返回 '' */
export function formatHHmm(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
}

/** yyyy-MM-dd */
export function formatYMD(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** yyyy-MM-dd HH:mm:ss（原 WeekReportPreview 里 dayjs 的原生等价） */
export function formatDateTime(d = new Date()) {
  return `${formatYMD(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

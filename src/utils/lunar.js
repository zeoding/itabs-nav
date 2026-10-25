/**
 * 农历/节假日/黄历工具（基于 lunar-javascript）
 *
 * 提供：
 *  - getFestivals(date)         阳历 + 24 节气 + 农历节日（按类型分）
 *  - getLunarInfo(date)         完整农历信息（年柱、生肖、农历月日）
 *  - getZodiac(date)            星座
 *  - getDayAlmanac(date)        今日宜/忌/值神/星宿等
 */
import { Solar, HolidayUtil } from 'lunar-javascript'

/** 获取某日期的所有节日，按类型分组 */
export function getFestivals(date) {
  const d = date instanceof Date ? date : new Date(date)
  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  const list = []

  // 阳历节日
  const solFests = solar.getFestivals() || []
  for (const name of solFests) {
    list.push({ type: 'solar', name })
  }

  // 24 节气
  const jieqi = lunar.getJieQi()
  if (jieqi) list.push({ type: 'term', name: jieqi })

  // 农历节日
  const lunFests = lunar.getFestivals() || []
  for (const name of lunFests) {
    list.push({ type: 'lunar', name })
  }

  return list
}

/** 农历简短标签（用于日期格上方的红字） */
export function getLunarLabel(date) {
  const fests = getFestivals(date)
  // 优先返回：节气 > 农历节日 > 阳历节日
  const term = fests.find((f) => f.type === 'term')
  if (term) return term.name
  const lun = fests.find((f) => f.type === 'lunar')
  if (lun) return lun.name
  const sol = fests.find((f) => f.type === 'solar')
  return sol ? sol.name : ''
}

/**
 * 给日期格使用的简短标签
 * - 优先：节气 / 节日
 * - 否则：农历日（如"初一"、"廿三"）
 * @param {Date} date
 * @param {Array} [precomputed] 可选，调用方已算好的 getFestivals(date) 结果，
 *   供批量渲染（日历 42 格）复用，避免同一日期重复做 lunar 转换
 */
export function getCellLabel(date, precomputed) {
  const d = date instanceof Date ? date : new Date(date)
  const fests = precomputed ?? getFestivals(d)
  if (fests.length > 0) {
    // 优先级：节气 > 农历节日 > 阳历节日
    const term = fests.find((f) => f.type === 'term')
    if (term) return { text: term.name, kind: 'term' }
    const lun = fests.find((f) => f.type === 'lunar')
    if (lun) return { text: lun.name, kind: 'lunar' }
    const sol = fests.find((f) => f.type === 'solar')
    if (sol) return { text: sol.name, kind: 'solar' }
  }
  // 农历日
  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  const dayText = lunar.getDayInChinese()
  return { text: dayText, kind: 'lunar-day' }
}

/** 是否休息日（周六、周日） */
export function isWeekend(date) {
  const d = date instanceof Date ? date : new Date(date)
  const w = d.getDay()
  return w === 0 || w === 6
}

/** 是否法定节假日（有节日标记） */
export function hasFestival(date) {
  return getFestivals(date).length > 0
}

/**
 * 法定节假日/补班日（基于 lunar-javascript 内置国务院安排数据）
 * - 放假（含周末连休的法定假）：{ work: false, name: '国庆中秋' }
 * - 调休补班日：{ work: true, name: '国庆中秋' }
 * - 普通日：null
 */
export function getHoliday(date) {
  const d = date instanceof Date ? date : new Date(date)
  const h = HolidayUtil.getHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate())
  if (!h) return null
  return { work: h.isWork(), name: h.getName() }
}

/** 12 星座（按月份范围匹配，name 为字典 key：calendar.zodiac.*） */
const ZODIAC = [
  { key: 'capricorn', from: [12, 22], to: [1, 19] },
  { key: 'aquarius', from: [1, 20], to: [2, 18] },
  { key: 'pisces', from: [2, 19], to: [3, 20] },
  { key: 'aries', from: [3, 21], to: [4, 19] },
  { key: 'taurus', from: [4, 20], to: [5, 20] },
  { key: 'gemini', from: [5, 21], to: [6, 21] },
  { key: 'cancer', from: [6, 22], to: [7, 22] },
  { key: 'leo', from: [7, 23], to: [8, 22] },
  { key: 'virgo', from: [8, 23], to: [9, 22] },
  { key: 'libra', from: [9, 23], to: [10, 23] },
  { key: 'scorpio', from: [10, 24], to: [11, 22] },
  { key: 'sagittarius', from: [11, 23], to: [12, 21] },
]

export function getZodiac(date) {
  const d = date instanceof Date ? date : new Date(date)
  const m = d.getMonth() + 1
  const day = d.getDate()
  for (const z of ZODIAC) {
    const [fm, fd] = z.from
    const [tm, td] = z.to
    if (z.key === 'capricorn') {
      if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return z.key
    } else if ((m === fm && day >= fd) || (m === tm && day <= td)) {
      return z.key
    }
  }
  return ''
}

/**
 * 完整农历信息
 * {
 *   yearInGanZhi: '甲辰',
 *   shengXiao: '龙',
 *   monthInChinese: '正',
 *   dayInChinese: '初一',
 *   fullText: '甲辰年正月初一',
 *   festivals: [...] // 同 getFestivals
 * }
 */
export function getLunarInfo(date) {
  const d = date instanceof Date ? date : new Date(date)
  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  return {
    yearInGanZhi: lunar.getYearInGanZhi(),
    shengXiao: lunar.getYearShengXiao(),
    monthInChinese: lunar.getMonthInChinese(),
    dayInChinese: lunar.getDayInChinese(),
    fullText: `${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    festivals: getFestivals(d),
  }
}

/**
 * 今日黄历（宜/忌/值神/星宿）
 * {
 *   yi: ['出行', '祭祀', ...],
 *   ji: ['开市', '动土', ...],
 *   positionZhi: '青龙',  // 值神（胎神）
 *   xiu: '角',  // 28 星宿
 *   xiuSong: '角宿吉...', // 歌诀
 *   pengZuGan: '甲不开仓财物耗散',  // 彭祖百忌-天干
 *   pengZuZhi: '子不问卜自惹灾殃',  // 彭祖百忌-地支
 *   taiSui: '壬子',  // 太岁
 * }
 */
export function getDayAlmanac(date) {
  const d = date instanceof Date ? date : new Date(date)
  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  return {
    yi: lunar.getDayYi() || [],
    ji: lunar.getDayJi() || [],
    positionTai: lunar.getDayPositionTai() || '',
    xiu: lunar.getXiu ? (lunar.getXiu() || '') : '',
    xiuSong: lunar.getXiuSong ? (lunar.getXiuSong() || '') : '',
    pengZuGan: lunar.getPengZuGan() || '',
    pengZuZhi: lunar.getPengZuZhi() || '',
    taiSui: lunar.getDayPositionTaiSui ? (lunar.getDayPositionTaiSui() || '') : '',
  }
}

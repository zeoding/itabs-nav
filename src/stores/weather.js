import { ref } from 'vue'
import { defineStore } from 'pinia'
import { $t, getLanguage } from '@/composables/useI18n'
import { WEATHER_API, NET_API, GEO_API } from '@/config/api'
import http from '@/utils/http'
import { getDaily, getAny, setDaily } from '@/utils/dailyCache'
import { getSetting, setSetting, migrateSetting } from '@/db'

/** 按天气描述文本映射 emoji（中英文关键字） */
export function iconByText(text) {
  const s = String(text || '')
  if (/雷|thunder/i.test(s)) return '⛈'
  if (/雪|冰雹|snow|sleet|hail/i.test(s)) return '❄️'
  if (/雨|rain|drizzle|shower/i.test(s)) return '🌧'
  if (/雾|霾|沙|尘|fog|mist|haze|dust|sand/i.test(s)) return '🌫'
  if (/阴|overcast/i.test(s)) return '☁️'
  if (/云|cloud/i.test(s)) return '⛅'
  if (/晴|clear|sunny|fine/i.test(s)) return '☀️'
  if (/风|wind|gale/i.test(s)) return '💨'
  return '🌤'
}

const CITY_KEY = 'weatherCity'
const LEGACY_CITY_KEY = 'itab.weather.city'
export const DEFAULT_CITY = 'Shenzhen'

/** 城市默认先回退常量，store 创建后异步从 IDB（及 localStorage 遗留）补齐 */
async function loadSavedCity() {
  return migrateSetting(CITY_KEY, LEGACY_CITY_KEY, DEFAULT_CITY)
}

async function saveCity(c) {
  try {
    await setSetting(CITY_KEY, c)
  } catch {
    /* ignore */
  }
}

async function hasSavedCity() {
  try {
    return (await getSetting(CITY_KEY, null)) != null
  } catch {
    return false
  }
}

let ipResolved = false
async function resolveCityByIP() {
  try {
    // &_= 时间戳对齐原 fetch cache:'no-store' 的绕缓存意图（axios 无等价选项）
    const json = await http.get(`${NET_API.myip()}&_=${Date.now()}`)
    const root = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? json.data : json
    const parts = String(root.region || '').split(/\s+/).filter(Boolean)
    return parts[2] || parts[1] || root.district || null
  } catch {
    return null
  }
}

/** 每日缓存 key：按城市 + 语言隔离 */
function weatherCacheKey(city, lang) {
  return `itabs.cache.weather.${String(city || '').trim().toLowerCase()}|${lang || 'zh'}`
}

function normalizeWeatherArgs(targetCity, force) {
  let city = targetCity
  let f = force
  if (typeof city === 'boolean') {
    f = city
    city = undefined
  } else if (city && typeof city === 'object') {
    f = city.force ?? city.refresh ?? false
    city = city.city
  }
  if (f && typeof f === 'object') f = f.force ?? f.refresh ?? false
  return { city, force: !!f }
}

async function locateCityFn() {
  if (!('geolocation' in navigator)) return null
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 6000,
      maximumAge: 10 * 60 * 1000,
    })
  })
  const { latitude, longitude } = pos.coords
  const url = GEO_API.reverse(latitude, longitude)
  // Nominatim 自带缓存响应头，走 http 封装即可；HTTP 失败与原 fetch 行为一致返回 null
  let j
  try {
    j = await http.get(url)
  } catch {
    return null
  }
  const a = j.address || {}
  return a.city || a.town || a.county || a.state || a.region || a.country || null
}

const LIFE_DEFS = [
  ['clothing', 'dressing', '👕'],
  ['uv', 'uv', '☀️'],
  ['car_wash', 'carWash', '🚗'],
  ['drying', 'drying', '🧺'],
  ['air_conditioner', 'ac', '❄️'],
  ['cold_risk', 'coldRisk', '🤧'],
  ['exercise', 'exercise', '🏃'],
  ['comfort', 'comfort', '😌'],
  ['travel', 'travel', '✈️'],
  ['fishing', 'fish', '🎣'],
  ['allergy', 'allergy', '🌿'],
  ['sunscreen', 'sunscreen', '🧴'],
  ['mood', 'mood', '😊'],
  ['beer', 'beer', '🍺'],
  ['umbrella', 'umbrella', '☂️'],
  ['traffic', 'traffic', '🚦'],
  ['air_purifier', 'airPurifier', '🌬️'],
  ['pollen', 'pollen', '🌾'],
]

function mapLife(indices) {
  if (!indices || typeof indices !== 'object') return []
  const out = []
  for (const [apiKey, labelKey, icon] of LIFE_DEFS) {
    const it = indices[apiKey]
    if (!it) continue
    out.push({
      icon,
      label: $t(`weather.life.${labelKey}`),
      value: it.level || it.brief || '',
      advice: it.advice || '',
    })
  }
  return out
}

function toHourKey(time) {
  const m = /(\d{2}):(\d{2})/.exec(String(time || ''))
  return m ? `${m[1]}${m[2]}` : String(time || '')
}

function parse(root, fallbackCity) {
  if (!root || typeof root !== 'object') return null
  if (root.temperature == null && root.city == null) return null
  const forecast = (Array.isArray(root.forecast) ? root.forecast : []).slice(0, 7).map((d) => ({
    date: d.date || '',
    min: d.temp_min,
    max: d.temp_max,
    icon: iconByText(d.weather_day || d.weather_night),
    desc: d.weather_day || d.weather_night || '',
    sunrise: d.sunrise || '',
    sunset: d.sunset || '',
    uv: d.uv_index,
    hourly: [],
  }))
  const todayHourly = (Array.isArray(root.hourly_forecast) ? root.hourly_forecast : []).slice(0, 24).map((h) => ({
    time: toHourKey(h.time),
    temp: h.temperature,
    icon: iconByText(h.weather),
    desc: h.weather || '',
    humidity: h.humidity,
    wind: h.wind_speed,
    precipMM: h.precip,
    chanceOfRain: h.pop,
    chanceOfSnow: 0,
  }))
  const first = forecast[0] || {}
  return {
    city: root.city || fallbackCity,
    region: root.district || root.province || '',
    country: '',
    temp: root.temperature,
    feels: root.feels_like,
    humidity: root.humidity,
    wind: null,
    windText: root.wind_power || '',
    windDir: root.wind_direction || '',
    windDeg: 0,
    desc: root.weather || '',
    icon: iconByText(root.weather),
    pressure: root.pressure,
    visibility: root.visibility,
    cloudCover: root.cloud,
    dewPoint: null,
    uvIndex: root.uv,
    precipMM: root.precipitation,
    aqi: root.aqi,
    aqiCategory: root.aqi_category || '',
    localObsTime: root.report_time,
    sunrise: first.sunrise || '',
    sunset: first.sunset || '',
    moonrise: '',
    moonset: '',
    moonPhase: '',
    moonIllumination: '',
    alerts: Array.isArray(root.alerts) ? root.alerts : [],
    todayHourly,
    forecast,
    life: mapLife(root.life_indices),
  }
}

/** 天气 Store（原 useWeather 迁移至 Pinia） */
export const useWeatherStore = defineStore('weather', () => {
  const city = ref(DEFAULT_CITY)
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const locating = ref(false)
  const lastUpdated = ref(null)
  const fromCache = ref(false)

  // 初始化城市（IDB / localStorage 遗留迁移），不阻塞 store 创建
  loadSavedCity().then((c) => {
    if (c) city.value = c
  })

  async function load(targetCity, force) {
    const args = normalizeWeatherArgs(targetCity, force)
    targetCity = args.city
    force = args.force
    if (targetCity) {
      city.value = targetCity
      await saveCity(targetCity)
    } else if (!(await hasSavedCity()) && !ipResolved) {
      // 新用户无历史城市：IP 定位一次，失败则沿用 DEFAULT_CITY
      ipResolved = true
      const ipCity = await resolveCityByIP()
      if (ipCity) {
        city.value = ipCity
        await saveCity(ipCity)
      }
    }
    const lang = getLanguage() === 'en' ? 'en' : 'zh'
    const cacheKey = weatherCacheKey(city.value, lang)
    if (!force) {
      const hit = await getDaily(cacheKey)
      if (hit && hit.payload) {
        data.value = hit.payload
        lastUpdated.value = hit.savedAt || null
        fromCache.value = true
        error.value = null
        return hit.payload
      }
    }
    loading.value = true
    error.value = null
    try {
      const langParam = lang === 'en' ? '&lang=en' : ''
      const url = `${WEATHER_API.current(city.value)}&extended=true&forecast=true&hourly=true&indices=true${langParam}`
      // &_= 时间戳对齐原 fetch cache:'no-store' 的绕缓存意图；非 2xx 由 http 封装统一抛错
      const json = await http.get(`${url}&_=${Date.now()}`)
      const root = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? json.data : json
      const parsed = parse(root, city.value)
      if (!parsed) throw new Error($t('weather.error'))
      data.value = parsed
      lastUpdated.value = Date.now()
      fromCache.value = false
      await setDaily(cacheKey, parsed)
      return parsed
    } catch (e) {
      const stale = await getAny(cacheKey)
      if (stale && stale.payload) {
        data.value = stale.payload
        lastUpdated.value = stale.savedAt || null
        fromCache.value = true
      } else {
        data.value = null
      }
      error.value = e.message || $t('weather.error')
      return null
    } finally {
      loading.value = false
    }
  }

  async function locate() {
    locating.value = true
    try {
      const resolved = await locateCityFn()
      if (resolved) {
        city.value = resolved
        await saveCity(resolved)
        await load(resolved)
        return resolved
      }
      return null
    } finally {
      locating.value = false
    }
  }

  return {
    city,
    data,
    loading,
    error,
    locating,
    lastUpdated,
    fromCache,
    load,
    locate,
  }
})

/** 计算 24h 内最高/最低温度区间 */
export function tempRange(hourly) {
  if (!hourly || !hourly.length) return { min: 0, max: 0 }
  let min = Infinity, max = -Infinity
  hourly.forEach((h) => {
    const t = Number(h.temp)
    if (t < min) min = t
    if (t > max) max = t
  })
  return { min, max }
}

/** 24h 温度点归一化到 0~100 */
export function tempLinePoints(hourly, width = 320, height = 60) {
  if (!hourly || !hourly.length) return ''
  const { min, max } = tempRange(hourly)
  const range = max - min || 1
  const stepX = width / (hourly.length - 1)
  return hourly
    .map((h, i) => {
      const x = i * stepX
      const y = height - ((Number(h.temp) - min) / range) * height
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

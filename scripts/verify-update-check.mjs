/**
 * 临时验证脚本：确认「版本更新检查」的判定矩阵符合预期。
 *
 * 做法：从真实构建产物 dist/js/dialogs-*.js 中抽取编译后的
 * compareVersion / normalizeVersion 两个纯函数，与真实源码 useUpdateChecker.js
 * 组合后运行判定矩阵 —— 被验证的比较逻辑确实来自产物，不是重新实现的。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST_JS = join(process.cwd(), 'dist', 'js')
const file = readdirSync(DIST_JS).find((f) => f.startsWith('dialogs-') && f.endsWith('.js'))
const raw = readFileSync(join(DIST_JS, file), 'utf-8')

function grab(startMarker, endMarker) {
  const s = raw.indexOf(startMarker)
  if (s < 0) throw new Error(`未找到起点: ${startMarker}`)
  const e = raw.indexOf(endMarker, s)
  if (e < 0) throw new Error(`未找到终点: ${endMarker}`)
  return raw.slice(s, e)
}

// 产物中的编译后实现（确认真实构建行为，而非测试里重写一遍）
const compareVersion = new Function(`${grab('function Fu(', 'var Iu=')} return Fu`)()
const normalizeVersion = new Function(`${grab('function Yu(', 'async function Xu(')} return Yu`)()

// 产物内联的本地构建标识 = 「用户当前正在运行的版本」
const LOCAL = {
  version: raw.match(/Vu=`([^`]+)`/)?.[1],
  buildTime: Number(raw.match(/Hu=(\d+)/)?.[1]),
}
console.log(`产物内联本地标识: version=${LOCAL.version}  buildTime=${LOCAL.buildTime}\n`)

// 用真实源码 + 产物里的比较函数组装被测对象
const src = readFileSync(join(process.cwd(), 'src', 'composables', 'useUpdateChecker.js'), 'utf-8')
const body = src
  .replace(/^import .*$/gm, '')
  .replace(/export const updateState/g, 'const updateState')
  .replace(/export function useUpdateChecker[\s\S]*$/m, '')
  .concat('\nreturn { check, updateState, dismiss, ignoreVersion }\n')

const factory = new Function(
  'compareVersion', 'normalizeVersion', 'localStorage', 'fetch', 'document',
  '__APP_VERSION__', '__BUILD_TIME__',
  body
)

function makeRuntime({ remote, ignored = null } = {}) {
  const store = new Map()
  if (ignored) store.set('itabs-nav:update-ignored', ignored)
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  }
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  const fetch = async () => ({ ok: true, status: 200, json: async () => remote })
  const api = factory(
    compareVersion, normalizeVersion, localStorage, fetch, document,
    LOCAL.version, LOCAL.buildTime
  )
  return { ...api, store }
}

const results = []
async function expect(name, rt, opts, want) {
  const got = await rt.check(opts)
  const ok = got === want
  results.push(ok)
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  console.log(`     期望 ${want} / 实际 ${got}`)
}

const OLD = { version: '0.1.0', buildTime: LOCAL.buildTime }
const NEW_SAME_VER = { version: '0.1.0', buildTime: LOCAL.buildTime + 60000 }

console.log('── 判定矩阵 ──\n')

await expect('① 同版本号 + 仅重新构建（原 P0 恒失效场景）',
  makeRuntime({ remote: NEW_SAME_VER }), {}, 'available')

await expect('② 构建时间与版本均相同 → 无更新',
  makeRuntime({ remote: { ...OLD } }), {}, 'latest')

await expect('③ 版本号提升 + buildTime 缺失 → 次级判据兜底',
  makeRuntime({ remote: { version: '0.2.0', buildTime: 0 } }), {}, 'available')

await expect('④ 该版本已被「忽略」→ ignored（不再谎报 latest）',
  makeRuntime({ remote: { version: '0.2.0', buildTime: LOCAL.buildTime + 60000 }, ignored: '0.2.0' }),
  { manual: true }, 'ignored')

await expect('⑤ 忽略的是 0.1.9，来了 0.2.0 → 仍应提示',
  makeRuntime({ remote: { version: '0.2.0', buildTime: LOCAL.buildTime + 60000 }, ignored: '0.1.9' }),
  {}, 'available')

await expect('⑥ 忽略值带 v 前缀 → 归一化后仍匹配',
  makeRuntime({ remote: { version: '0.2.0', buildTime: LOCAL.buildTime + 60000 }, ignored: 'v0.2.0' }),
  {}, 'ignored')

// ⑦ 原 P1 回归：点过「稍后」后，再发布更高版本必须还能提示
{
  const rt = makeRuntime({ remote: { version: '0.2.0', buildTime: LOCAL.buildTime + 60000 } })
  await rt.check({})
  rt.dismiss()
  const sameVer = await rt.check({})
  rt.updateState.available = null
  const newer = makeRuntime({ remote: { version: '0.3.0', buildTime: LOCAL.buildTime + 120000 } })
  newer.updateState.dismissedVersion = '0.2.0'
  const gotNewer = await newer.check({})
  const ok = sameVer === 'dismissed' && gotNewer === 'available'
  results.push(ok)
  console.log(`${ok ? '✅' : '❌'} ⑦ 「稍后」0.2.0 后：同版本=${sameVer}，来了 0.3.0=${gotNewer}`)
}

// ⑧ 手动检查绕过「稍后」
{
  const rt = makeRuntime({ remote: { version: '0.2.0', buildTime: LOCAL.buildTime + 60000 } })
  rt.updateState.dismissedVersion = '0.2.0'
  const auto = await rt.check({})
  const manual = await rt.check({ manual: true })
  const ok = auto === 'dismissed' && manual === 'available'
  results.push(ok)
  console.log(`${ok ? '✅' : '❌'} ⑧ 自动=${auto} / 手动=${manual}`)
}

// ⑨ 远端数据非法 → error
{
  const rt = makeRuntime({ remote: null })
  const got = await rt.check({})
  const ok = got === 'error'
  results.push(ok)
  console.log(`${ok ? '✅' : '❌'} ⑨ 远端数据非法 → ${got}`)
}

const pass = results.filter(Boolean).length
console.log(`\n── 结果: ${pass}/${results.length} 通过 ──`)
process.exit(pass === results.length ? 0 : 1)

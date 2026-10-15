/**
 * 版本号工具
 */

/**
 * 语义化版本比较（SemVer 核心语义，足够本项目使用）
 *
 * 规则（与 semver 2.0.0 一致的部分）：
 *   - 前缀 v / V 自动去除；缺段按 0 补齐（0.1 ≈ 0.1.0）
 *   - 主版本段按数字比较；非数字段按 0 处理（容错脏数据）
 *   - 预发布号（-beta.1 等）：有预发布号的版本 **小于** 同号正式版
 *     （1.0.0-beta < 1.0.0），预发布号之间按「数字段数值比较、
 *     数字段小于字母段、多段优先」的规则逐段比较
 *
 * 早期实现直接用 Number() 解析整段，会把 '0-beta' 解析成 0 而与正式版判等，
 * 导致预发布版本永远收不到正式版更新提示。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} a>b 为 1，相等为 0，a<b 为 -1
 */
export function compareVersion(a, b) {
  const pa = parse(a)
  const pb = parse(b)

  // 1) 主版本段逐个比较
  const len = Math.max(pa.parts.length, pb.parts.length)
  for (let i = 0; i < len; i++) {
    const na = pa.parts[i] ?? 0
    const nb = pb.parts[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }

  // 2) 主版本相同：无预发布号 > 有预发布号（1.0.0 > 1.0.0-beta）
  if (!pa.pre && !pb.pre) return 0
  if (!pa.pre) return 1
  if (!pb.pre) return -1

  // 3) 双方都有预发布号：逐段比较
  const plen = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < plen; i++) {
    const sa = pa.pre[i]
    const sb = pb.pre[i]
    // 段数少的优先级低（1.0.0-alpha < 1.0.0-alpha.1）
    if (sa === undefined) return -1
    if (sb === undefined) return 1
    const na = /^\d+$/.test(sa)
    const nb = /^\d+$/.test(sb)
    if (na && nb) {
      const va = Number(sa)
      const vb = Number(sb)
      if (va > vb) return 1
      if (va < vb) return -1
    } else if (na !== nb) {
      // 数字段优先级低于字母段
      return na ? -1 : 1
    } else {
      // 同为字母段：字典序
      if (sa > sb) return 1
      if (sa < sb) return -1
    }
  }
  return 0
}

/**
 * 解析版本字符串为 { parts: number[], pre: string[]|null }
 * - parts：主版本数字段（缺省补齐由比较逻辑用 ?? 0 处理）
 * - pre：预发布段数组（'-' 之后按 '.' 切分）；无预发布号时为 null
 */
function parse(v) {
  const raw = String(v ?? '').trim().replace(/^v/i, '')
  // 构建元数据（+build）不参与优先级比较，先剥离
  const withoutBuild = raw.split('+')[0]
  const dash = withoutBuild.indexOf('-')
  const coreStr = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const preStr = dash === -1 ? '' : withoutBuild.slice(dash + 1)

  const parts = coreStr
    .split('.')
    .map((s) => {
      const n = Number(s)
      return Number.isFinite(n) ? n : 0
    })

  const pre = preStr ? preStr.split('.').filter((s) => s !== '') : null
  return { parts, pre }
}

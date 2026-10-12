/**
 * 版本号工具
 */

/**
 * 语义化版本比较（数字段 x.y.z，足够本项目使用）
 * - 前缀 v / V 自动去除；缺段按 0 补齐（0.1 ≈ 0.1.0）
 * @param {string} a
 * @param {string} b
 * @returns {number} a>b 为 1，相等为 0，a<b 为 -1
 */
export function compareVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.')
  const pb = String(b).replace(/^v/i, '').split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i]) || 0
    const nb = Number(pb[i]) || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

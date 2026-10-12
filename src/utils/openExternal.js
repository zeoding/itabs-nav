/**
 * 外链打开统一出口（协议白名单）
 *
 * 背景：站点 / 引擎 url 属用户数据，可经「导入备份」注入任意字符串；
 * 直接 window.open(url) 时 javascript: 等伪协议会在新标签页执行脚本。
 * 所有新标签页外链跳转统一走 openExternal，仅放行 http/https。
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

/** 协议前缀（scheme）检测：`javascript:`、`ftp://`、`data:` 等都算有显式协议 */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

/**
 * 是否为可安全跳转的外链（http/https，或可补全为 https 的无协议地址）。
 * - 带任意协议前缀的按原样解析判定（javascript:/ftp:/data: 均不放行）
 * - 无协议前缀按 https 意图补全，与 config/api.js FAVICON_API 的推导规则一致，
 *   兼容「github.com」式输入
 */
export function isSafeHttpUrl(url) {
  if (typeof url !== 'string') return false
  const raw = url.trim()
  if (!raw) return false
  try {
    const candidate = SCHEME_RE.test(raw) ? raw : `https://${raw}`
    return SAFE_PROTOCOLS.has(new URL(candidate).protocol)
  } catch {
    return false
  }
}

/**
 * 新标签页打开外部链接。
 * - 非白名单协议（javascript:/data:/action: 等）一律忽略，不抛错不跳转
 * - 无协议前缀的地址补全 https:// 后打开（原始字符串会被浏览器当作相对路径）
 */
export function openExternal(url) {
  if (!isSafeHttpUrl(url)) return
  const raw = url.trim()
  const target = SCHEME_RE.test(raw) ? raw : `https://${raw}`
  window.open(target, '_blank', 'noopener')
}

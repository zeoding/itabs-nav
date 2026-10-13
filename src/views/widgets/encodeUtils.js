/**
 * 编解码纯算法工具（零依赖）
 *
 * 为什么放在 views/widgets/ 而不是 src/utils/：
 *   vite.config.js 的 codeSplitting 把 src/utils/** 归入 app-runtime 块（首屏即加载），
 *   而这些函数只被「编码解码」小组件使用。放在这里可随组件一起懒加载，
 *   不污染首屏包体积。
 *
 * 约定：所有 decode 类函数在输入非法时抛 Error，由调用方捕获并展示提示。
 */

/* ------------------------------------------------------------------ *
 * Base64
 * ------------------------------------------------------------------ */

/** 字符串 → UTF-8 字节数组 */
function toBytes(str) {
  return new TextEncoder().encode(str)
}

/** UTF-8 字节数组 → 字符串 */
function fromBytes(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** 字节数组 → 二进制字符串（供 btoa 使用） */
function bytesToBinary(bytes) {
  let bin = ''
  // 分块拼接，避免超长字符串参数溢出
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return bin
}

export function base64Encode(str) {
  return btoa(bytesToBinary(toBytes(str)))
}

export function base64Decode(str) {
  // 兼容 URL-safe 变体与缺失的 padding
  let s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  if (!s) return ''
  const pad = s.length % 4
  if (pad === 1) throw new Error('Base64 长度非法')
  if (pad) s += '='.repeat(4 - pad)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('包含非 Base64 字符')
  return fromBytes(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
}

/* ------------------------------------------------------------------ *
 * Base58（比特币/IPFS 地址常用）
 * ------------------------------------------------------------------ */

/** Base58 字母表：去掉了易混淆的 0 O I l */
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B58_MAP = (() => {
  const m = Object.create(null)
  for (let i = 0; i < B58_ALPHABET.length; i++) m[B58_ALPHABET[i]] = i
  return m
})()

export function base58Encode(str) {
  const bytes = toBytes(str)
  if (bytes.length === 0) return ''

  // 前导 0 字节在 Base58 中表示为前导 '1'
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  // 按 256 → 58 进制逐字节转换，digits 为低位在前
  const digits = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }

  let out = '1'.repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]]
  return out
}

export function base58Decode(str) {
  const s = String(str).trim()
  if (!s) return ''

  let zeros = 0
  while (zeros < s.length && s[zeros] === '1') zeros++

  // 58 → 256 进制，bytes 为低位在前
  const bytes = []
  for (let i = zeros; i < s.length; i++) {
    const ch = s[i]
    const val = B58_MAP[ch]
    if (val === undefined) throw new Error(`包含非 Base58 字符「${ch}」`)
    let carry = val
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>>= 8
    }
  }

  const out = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[zeros + i] = bytes[bytes.length - 1 - i]
  }
  return fromBytes(out)
}

/* ------------------------------------------------------------------ *
 * URL 编码
 * ------------------------------------------------------------------ */

export function urlEncode(str, component = true) {
  return component ? encodeURIComponent(str) : encodeURI(str)
}

export function urlDecode(str) {
  try {
    return decodeURIComponent(String(str).replace(/\+/g, ' '))
  } catch {
    throw new Error('URL 转义序列非法')
  }
}

/* ------------------------------------------------------------------ *
 * HTML 实体
 * ------------------------------------------------------------------ */

const HTML_NAMED = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** 是否编码非 ASCII 字符（默认否，只处理 HTML 敏感字符） */
export function htmlEncode(str, allChars = false) {
  let out = String(str).replace(/[&<>"']/g, (c) => HTML_NAMED[c])
  if (allChars) {
    out = out.replace(/[\u0080-\uffff]/g, (c) => `&#${c.charCodeAt(0)};`)
  }
  return out
}

export function htmlDecode(str) {
  return String(str).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m
      return String.fromCodePoint(code)
    }
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
    return named[body.toLowerCase()] ?? m
  })
}

/* ------------------------------------------------------------------ *
 * Unicode 转义（\uXXXX）
 * ------------------------------------------------------------------ */

export function unicodeEncode(str) {
  let out = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // 可打印 ASCII 原样保留，其余转 \uXXXX
    out += code >= 0x20 && code <= 0x7e ? str[i] : `\\u${code.toString(16).padStart(4, '0')}`
  }
  return out
}

export function unicodeDecode(str) {
  let s = String(str).trim()
  // 兼容 \u{1F600} 形式
  s = s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, hex) => {
    const code = parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : m
  })
  // 兼容 \xXX 形式
  s = s.replace(/\\x([0-9a-fA-F]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/* ------------------------------------------------------------------ *
 * Hex / 二进制
 * ------------------------------------------------------------------ */

export function hexEncode(str, upper = false) {
  const hex = Array.from(toBytes(str), (b) => b.toString(16).padStart(2, '0')).join('')
  return upper ? hex.toUpperCase() : hex
}

export function hexDecode(str) {
  const s = String(str).replace(/[\s,]/g, '').replace(/^0x/i, '')
  if (!s) return ''
  if (s.length % 2) throw new Error('Hex 长度必须为偶数')
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('包含非 Hex 字符')
  const bytes = new Uint8Array(s.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.substr(i * 2, 2), 16)
  return fromBytes(bytes)
}

export function binaryEncode(str, sep = ' ') {
  return Array.from(toBytes(str), (b) => b.toString(2).padStart(8, '0')).join(sep)
}

export function binaryDecode(str) {
  const s = String(str).replace(/[^01]/g, '')
  if (!s) return ''
  if (s.length % 8) throw new Error('二进制位数必须是 8 的倍数')
  const bytes = new Uint8Array(s.length / 8)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.substr(i * 8, 8), 2)
  return fromBytes(bytes)
}

/* ------------------------------------------------------------------ *
 * JWT（仅解析，不验签）
 * ------------------------------------------------------------------ */

export function jwtDecode(token) {
  const parts = String(token).trim().split('.')
  if (parts.length < 2) throw new Error('JWT 至少需要两段（header.payload）')
  const decodePart = (p) => {
    const json = base64Decode(p.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  }
  const result = {
    header: decodePart(parts[0]),
    payload: decodePart(parts[1]),
  }
  if (parts[2]) result.signature = parts[2]
  // 附带可读时间字段，方便排查过期
  const claims = result.payload || {}
  if (typeof claims.exp === 'number') result.expired = claims.exp * 1000 < Date.now()
  return JSON.stringify(result, null, 2)
}

/* ------------------------------------------------------------------ *
 * 古典密码
 * ------------------------------------------------------------------ */

const A_CODE = 65
const a_CODE = 97

/** 凯撒位移：只处理英文字母，其余字符原样保留 */
export function caesar(text, shift = 3, decode = false) {
  const n = ((Number(shift) || 0) % 26 + 26) % 26
  const k = decode ? (26 - n) % 26 : n
  return String(text).replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? A_CODE : a_CODE
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base)
  })
}

/** ROT13：凯撒位移 13 的特例，自逆 */
export function rot13(text) {
  return caesar(text, 13, false)
}

/** 埃特巴什（Atbash）：字母表镜像，自逆 */
export function atbash(text) {
  return String(text).replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? A_CODE : a_CODE
    return String.fromCharCode(base + (25 - (ch.charCodeAt(0) - base)))
  })
}

/** 维吉尼亚密码 */
export function vigenere(text, key, decode = false) {
  const k = String(key || '').replace(/[^a-zA-Z]/g, '')
  if (!k) throw new Error('维吉尼亚密码需要字母密钥')
  let ki = 0
  return String(text).replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? A_CODE : a_CODE
    const shift = k[ki % k.length].toUpperCase().charCodeAt(0) - A_CODE
    ki++
    const idx = ch.charCodeAt(0) - base
    const out = decode ? (idx - shift + 26) % 26 : (idx + shift) % 26
    return String.fromCharCode(base + out)
  })
}

/* ---- 摩斯电码 ---- */

const MORSE_MAP = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
}

const MORSE_REVERSE = Object.fromEntries(
  Object.entries(MORSE_MAP).map(([k, v]) => [v, k])
)

export function morseEncode(text) {
  return String(text)
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('')
        .map((ch) => MORSE_MAP[ch] ?? '')
        .filter(Boolean)
        .join(' ')
    )
    .join(' / ')
}

export function morseDecode(code) {
  return String(code)
    .trim()
    .split(/\s*\/\s*/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((sym) => MORSE_REVERSE[sym] ?? '')
        .join('')
    )
    .join(' ')
}

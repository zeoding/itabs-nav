/**
 * RSA 非对称加密工具（基于浏览器原生 Web Crypto API，零第三方依赖）
 *
 * - 加密/解密：RSA-OAEP + SHA-256
 * - 签名/验签：RSASSA-PKCS1-v1_5 + SHA-256
 * - 密钥格式：PEM（SPKI 公钥 / PKCS#8 私钥），与 OpenSSL 互通
 *
 * 注意：RSA-OAEP 单次可加密的明文长度受限（模长 - 2*摘要长 - 2）
 *   2048 位 + SHA-256 → 最大 190 字节。超长会抛错，由调用方提示。
 */

const RSA_OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' }
const RSA_SIGN = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

/* ---------------- PEM <-> ArrayBuffer ---------------- */

function pemToBuffer(pem) {
  const body = String(pem)
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('PEM 内容为空')
  const bin = atob(body)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer
}

function bufferToPem(buffer, label) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  const b64 = btoa(bin)
  const lines = b64.match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

/* ---------------- Base64 负载辅助 ---------------- */

function b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function bytesToB64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** 检测运行环境是否支持 Web Crypto（file:// 且非 localhost 时可能不可用） */
export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

function assertCrypto() {
  if (!isCryptoAvailable()) {
    throw new Error('当前环境不支持 Web Crypto（需 HTTPS 或 localhost）')
  }
}

/* ---------------- 生成密钥对 ---------------- */

/**
 * 生成 RSA 密钥对
 * @param {number} bits 模长，常用 2048 / 4096
 * @returns {Promise<{publicKey: string, privateKey: string}>} PEM 文本
 */
export async function generateKeyPair(bits = 2048) {
  assertCrypto()
  const pair = await crypto.subtle.generateKey(
    {
      name: RSA_OAEP.name,
      modulusLength: Number(bits) || 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: RSA_OAEP.hash,
    },
    true,
    ['encrypt', 'decrypt']
  )
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ])
  return {
    publicKey: bufferToPem(spki, 'PUBLIC KEY'),
    privateKey: bufferToPem(pkcs8, 'PRIVATE KEY'),
  }
}

/* ---------------- 加密 / 解密 ---------------- */

export async function encrypt(text, publicKeyPem) {
  assertCrypto()
  if (!String(publicKeyPem).includes('BEGIN')) throw new Error('请填写 PEM 格式的公钥')
  const key = await crypto.subtle.importKey(
    'spki',
    pemToBuffer(publicKeyPem),
    RSA_OAEP,
    false,
    ['encrypt']
  )
  const data = new TextEncoder().encode(text)
  try {
    const buf = await crypto.subtle.encrypt(RSA_OAEP, key, data)
    return bytesToB64(new Uint8Array(buf))
  } catch {
    // 长度超限是 RSA-OAEP 最常见的报错
    throw new Error('明文过长，RSA 单次加密上限约 190 字节（2048 位密钥）')
  }
}

export async function decrypt(b64, privateKeyPem) {
  assertCrypto()
  if (!String(privateKeyPem).includes('BEGIN')) throw new Error('请填写 PEM 格式的私钥')
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(privateKeyPem),
    RSA_OAEP,
    false,
    ['decrypt']
  )
  try {
    const buf = await crypto.subtle.decrypt(RSA_OAEP, key, b64ToBytes(b64))
    return new TextDecoder().decode(buf)
  } catch {
    throw new Error('解密失败：私钥不匹配或密文已损坏')
  }
}

/* ---------------- 签名 / 验签 ---------------- */

export async function sign(text, privateKeyPem) {
  assertCrypto()
  if (!String(privateKeyPem).includes('BEGIN')) throw new Error('请填写 PEM 格式的私钥')
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(privateKeyPem),
    RSA_SIGN,
    false,
    ['sign']
  )
  const buf = await crypto.subtle.sign(RSA_SIGN, key, new TextEncoder().encode(text))
  return bytesToB64(new Uint8Array(buf))
}

export async function verify(text, signatureB64, publicKeyPem) {
  assertCrypto()
  if (!String(publicKeyPem).includes('BEGIN')) throw new Error('请填写 PEM 格式的公钥')
  const key = await crypto.subtle.importKey(
    'spki',
    pemToBuffer(publicKeyPem),
    RSA_SIGN,
    false,
    ['verify']
  )
  const ok = await crypto.subtle.verify(
    RSA_SIGN,
    key,
    b64ToBytes(signatureB64),
    new TextEncoder().encode(text)
  )
  return ok
}

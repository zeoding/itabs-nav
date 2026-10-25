<script setup>
/**
 * 编码解码 / 加密解密 小组件
 *
 * 能力范围（市面上常规工具的合集）：
 *  - 编码解码：Base64 / URL / HTML 实体 / Unicode 转义 / Hex / 二进制 / JWT 解析 / 摩斯电码
 *  - 古典密码：凯撒 / ROT13 / 埃特巴什 / 维吉尼亚
 *  - 哈希摘要：MD5 / SHA-1 / SHA-256 / SHA-512 / SHA-3 / RIPEMD-160
 *  - 对称加密：AES / DES / 三重DES / RC4 / Rabbit（可选模式与填充）
 *  - 非对称加密：RSA-OAEP 加解密 + RSASSA 签名验签 + 密钥对生成（Web Crypto，零依赖）
 *
 * 实现说明：
 *  - 纯算法部分见 encodeUtils.js（零依赖）；RSA 见 encodeRsa.js（Web Crypto）
 *  - crypto-js 仅供哈希与对称加密使用，随本组件懒加载，不进首屏包
 *  - 哈希/对称/编码同步计算，RSA 异步；统一走 debounce + async run() 一条管线
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import CryptoJS from 'crypto-js'
import { useMessage } from '@/composables/useMessage'
import { $t } from '@/composables/useI18n'
import { copyText } from '@/utils/clipboard'
import * as rsa from './encodeRsa'
import {
  base64Encode, base64Decode,
  base58Encode, base58Decode,
  urlEncode, urlDecode,
  htmlEncode, htmlDecode,
  unicodeEncode, unicodeDecode,
  hexEncode, hexDecode,
  binaryEncode, binaryDecode,
  jwtDecode,
  caesar, rot13, atbash, vigenere,
  morseEncode, morseDecode,
} from './encodeUtils'

const message = useMessage()

/* ---------------- 算法分组 ---------------- */

const GROUPS = [
  { key: 'encode', labelKey: 'encodeDecode.groups.encode' },
  { key: 'classic', labelKey: 'encodeDecode.groups.classic' },
  { key: 'hash', labelKey: 'encodeDecode.groups.hash' },
  { key: 'sym', labelKey: 'encodeDecode.groups.sym' },
  { key: 'asym', labelKey: 'encodeDecode.groups.asym' },
]

/** 对称加密可选模式与填充 */
const MODES = {
  CBC: CryptoJS.mode.CBC,
  ECB: CryptoJS.mode.ECB,
  CFB: CryptoJS.mode.CFB,
  OFB: CryptoJS.mode.OFB,
  CTR: CryptoJS.mode.CTR,
}
const PADDINGS = {
  Pkcs7: CryptoJS.pad.Pkcs7,
  ZeroPadding: CryptoJS.pad.ZeroPadding,
  NoPadding: CryptoJS.pad.NoPadding,
  Iso10126: CryptoJS.pad.Iso10126,
  AnsiX923: CryptoJS.pad.AnsiX923,
}

/** 同步实现的对称加密：Cipher 取自 CryptoJS */
function symEncrypt(Cipher, text, { key, iv, mode, padding }) {
  if (!key) throw new Error('请填写密钥')
  const opt = { mode: MODES[mode] || MODES.CBC, padding: PADDINGS[padding] || PADDINGS.Pkcs7 }
  // ECB 不使用 IV，传入反而会报错
  if (opt.mode !== MODES.ECB && iv) opt.iv = CryptoJS.enc.Utf8.parse(iv)
  const out = Cipher.encrypt(CryptoJS.enc.Utf8.parse(text), CryptoJS.enc.Utf8.parse(key), opt)
  // 显式取 Base64：CryptoJS.format 只提供 OpenSSL/Hex，没有 Base64 格式化器
  return out.ciphertext.toString(CryptoJS.enc.Base64)
}

function symDecrypt(Cipher, text, { key, iv, mode, padding }) {
  if (!key) throw new Error('请填写密钥')
  const opt = { mode: MODES[mode] || MODES.CBC, padding: PADDINGS[padding] || PADDINGS.Pkcs7 }
  if (opt.mode !== MODES.ECB && iv) opt.iv = CryptoJS.enc.Utf8.parse(iv)
  const out = Cipher.decrypt(String(text).trim(), CryptoJS.enc.Utf8.parse(key), opt)
  const text2 = out.toString(CryptoJS.enc.Utf8)
  if (!text2) throw new Error('解密失败：密钥/IV/模式不匹配')
  return text2
}

/**
 * 算法注册表
 *  - needsKey/needsIv：是否显示对应输入框
 *  - oneWay：单向（哈希），方向开关锁死为「加密」
 *  - decodeOnly：仅解码（JWT）
 *  - async：需要 await
 */
const ALGOS = [
  /* --- 编码 / 解码 --- */
  { key: 'base64', group: 'encode', label: 'Base64', enc: base64Encode, dec: base64Decode },
  { key: 'base58', group: 'encode', label: 'Base58', enc: base58Encode, dec: base58Decode },
  { key: 'url', group: 'encode', label: 'URL', enc: (t) => urlEncode(t, true), dec: urlDecode },
  { key: 'html', group: 'encode', label: 'HTML', enc: (t) => htmlEncode(t, false), dec: htmlDecode },
  { key: 'unicode', group: 'encode', label: 'Unicode', enc: unicodeEncode, dec: unicodeDecode },
  { key: 'hex', group: 'encode', label: 'Hex', enc: (t) => hexEncode(t, false), dec: hexDecode },
  { key: 'binary', group: 'encode', label: 'Binary', enc: (t) => binaryEncode(t, ' '), dec: binaryDecode },
  { key: 'morse', group: 'encode', label: 'Morse', enc: morseEncode, dec: morseDecode },
  { key: 'jwt', group: 'encode', label: 'JWT', decodeOnly: true, dec: jwtDecode },

  /* --- 古典密码 --- */
  { key: 'caesar', group: 'classic', label: 'Caesar', needsShift: true, enc: (t, o) => caesar(t, o.shift, false), dec: (t, o) => caesar(t, o.shift, true) },
  { key: 'rot13', group: 'classic', label: 'ROT13', enc: rot13, dec: rot13 },
  { key: 'atbash', group: 'classic', label: 'Atbash', enc: atbash, dec: atbash },
  { key: 'vigenere', group: 'classic', label: 'Vigenère', needsKey: true, enc: (t, o) => vigenere(t, o.key, false), dec: (t, o) => vigenere(t, o.key, true) },

  /* --- 哈希摘要（单向） --- */
  { key: 'md5', group: 'hash', label: 'MD5', oneWay: true, hash: (t) => CryptoJS.MD5(t).toString() },
  { key: 'sha1', group: 'hash', label: 'SHA-1', oneWay: true, hash: (t) => CryptoJS.SHA1(t).toString() },
  { key: 'sha256', group: 'hash', label: 'SHA-256', oneWay: true, hash: (t) => CryptoJS.SHA256(t).toString() },
  { key: 'sha512', group: 'hash', label: 'SHA-512', oneWay: true, hash: (t) => CryptoJS.SHA512(t).toString() },
  { key: 'sha3', group: 'hash', label: 'SHA-3', oneWay: true, hash: (t) => CryptoJS.SHA3(t, { outputLength: 512 }).toString() },
  { key: 'ripemd160', group: 'hash', label: 'RIPEMD-160', oneWay: true, hash: (t) => CryptoJS.RIPEMD160(t).toString() },

  /* --- 对称加密 --- */
  { key: 'aes', group: 'sym', label: 'AES', needsKey: true, needsIv: true, needsMode: true, enc: (t, o) => symEncrypt(CryptoJS.AES, t, o), dec: (t, o) => symDecrypt(CryptoJS.AES, t, o) },
  { key: 'des', group: 'sym', label: 'DES', needsKey: true, needsIv: true, needsMode: true, enc: (t, o) => symEncrypt(CryptoJS.DES, t, o), dec: (t, o) => symDecrypt(CryptoJS.DES, t, o) },
  { key: 'tripledes', group: 'sym', label: '3DES', needsKey: true, needsIv: true, needsMode: true, enc: (t, o) => symEncrypt(CryptoJS.TripleDES, t, o), dec: (t, o) => symDecrypt(CryptoJS.TripleDES, t, o) },
  { key: 'rc4', group: 'sym', label: 'RC4', needsKey: true, enc: (t, o) => symEncrypt(CryptoJS.RC4, t, o), dec: (t, o) => symDecrypt(CryptoJS.RC4, t, o) },
  { key: 'rabbit', group: 'sym', label: 'Rabbit', needsKey: true, needsIv: true, needsMode: true, enc: (t, o) => symEncrypt(CryptoJS.Rabbit, t, o), dec: (t, o) => symDecrypt(CryptoJS.Rabbit, t, o) },

  /* --- 非对称加密（Web Crypto，异步） --- */
  { key: 'rsa', group: 'asym', label: 'RSA', isRsa: true },
]

const ALGO_MAP = Object.fromEntries(ALGOS.map((a) => [a.key, a]))

/* ---------------- 状态 ---------------- */

const group = ref('encode')
const algoKey = ref('base64')
const direction = ref('enc')      // enc = 编码/加密，dec = 解码/解密
const input = ref('')
const output = ref('')
const error = ref('')
const busy = ref(false)

/* 参数 */
const shift = ref(3)
const secretKey = ref('')
const iv = ref('')
const mode = ref('CBC')
const padding = ref('Pkcs7')

/* RSA 专用 */
const rsaAction = ref('encrypt')  // encrypt | decrypt | sign | verify | keygen
const rsaBits = ref(2048)
const rsaPublicKey = ref('')
const rsaPrivateKey = ref('')
/** 验签用的签名串 */
const rsaSignature = ref('')

const algo = computed(() => ALGO_MAP[algoKey.value] || ALGO_MAP.base64)
const groupAlgos = computed(() => ALGOS.filter((a) => a.group === group.value))

/** 方向开关是否可用：哈希单向、JWT 仅解码 */
const canToggleDirection = computed(() => !algo.value.oneWay && !algo.value.decodeOnly)
const effectiveDirection = computed(() => {
  if (algo.value.oneWay) return 'enc'
  if (algo.value.decodeOnly) return 'dec'
  return direction.value
})

const dirLabel = computed(() => {
  if (algo.value.oneWay) return $t('encodeDecode.dir.hash')
  if (algo.value.decodeOnly) return $t('encodeDecode.dir.decode')
  return effectiveDirection.value === 'enc' ? $t('encodeDecode.dir.encode') : $t('encodeDecode.dir.decode')
})

const ivDisabled = computed(() => mode.value === 'ECB')

/* ---------------- 计算管线 ---------------- */

async function run() {
  error.value = ''
  // RSA 走独立分支（异步 + 密钥输入区）
  if (algo.value.isRsa) {
    await runRsa()
    return
  }
  const text = input.value
  if (!text) {
    output.value = ''
    return
  }
  try {
    const opts = { shift: shift.value, key: secretKey.value, iv: iv.value, mode: mode.value, padding: padding.value }
    if (algo.value.oneWay) {
      output.value = algo.value.hash(text)
    } else if (effectiveDirection.value === 'enc') {
      output.value = algo.value.enc(text, opts)
    } else {
      output.value = algo.value.dec(text, opts)
    }
  } catch (e) {
    output.value = ''
    error.value = e?.message || String(e)
  }
}

async function runRsa() {
  try {
    if (rsaAction.value === 'keygen') {
      busy.value = true
      const pair = await rsa.generateKeyPair(rsaBits.value)
      rsaPublicKey.value = pair.publicKey
      rsaPrivateKey.value = pair.privateKey
      output.value = `${pair.publicKey}\n\n${pair.privateKey}`
      return
    }
    if (!input.value) {
      output.value = ''
      return
    }
    busy.value = true
    if (rsaAction.value === 'encrypt') {
      output.value = await rsa.encrypt(input.value, rsaPublicKey.value)
    } else if (rsaAction.value === 'decrypt') {
      output.value = await rsa.decrypt(input.value, rsaPrivateKey.value)
    } else if (rsaAction.value === 'sign') {
      output.value = await rsa.sign(input.value, rsaPrivateKey.value)
    } else if (rsaAction.value === 'verify') {
      // 验签：输入框放原文，签名串在独立输入框
      const ok = await rsa.verify(input.value, rsaSignature.value, rsaPublicKey.value)
      output.value = ok ? $t('encodeDecode.rsa.verifyOk') : $t('encodeDecode.rsa.verifyFail')
    }
  } catch (e) {
    output.value = ''
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

/* 任一输入变化 → 防抖重算（RSA 密钥生成较慢，防抖给足） */
let timer = null
watch(
  [input, algoKey, direction, shift, secretKey, iv, mode, padding, rsaAction, rsaBits, rsaPublicKey, rsaPrivateKey, rsaSignature],
  () => {
    clearTimeout(timer)
    timer = setTimeout(run, 150)
  }
)

onMounted(run)
onUnmounted(() => clearTimeout(timer))

/* ---------------- 动作 ---------------- */

async function copyOut() {
  if (!output.value) return
  const ok = await copyText(output.value)
  if (ok) message.success($t('encodeDecode.copied'))
  else message.error($t('encodeDecode.copyFail'))
}

/** 结果回填到输入并翻转方向（解码 → 编码 的往返验证很常用） */
function swap() {
  if (!output.value) return
  input.value = output.value
  if (canToggleDirection.value) {
    direction.value = effectiveDirection.value === 'enc' ? 'dec' : 'enc'
  }
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}

/** 切换分组时自动选中该组第一个算法 */
watch(group, () => {
  const first = ALGOS.find((a) => a.group === group.value)
  if (first && first.group !== algo.value.group) algoKey.value = first.key
})

/** RSA 动作切换时重置方向相关状态 */
watch(rsaAction, () => {
  error.value = ''
})

const inputLen = computed(() => input.value.length)
const outputLen = computed(() => output.value.length)
</script>

<template>
  <div class="ed">
    <!-- 分组切换 -->
    <div class="ed-groups">
      <button
        v-for="g in GROUPS"
        :key="g.key"
        class="ed-group"
        :class="{ active: group === g.key }"
        type="button"
        @click="group = g.key"
      >{{ $t(g.labelKey) }}</button>
    </div>

    <!-- 算法选择 -->
    <div class="ed-algos">
      <button
        v-for="a in groupAlgos"
        :key="a.key"
        class="ed-algo"
        :class="{ active: algoKey === a.key }"
        type="button"
        @click="algoKey = a.key"
      >{{ a.label }}</button>
    </div>

    <!-- 参数区 -->
    <div v-if="!algo.isRsa" class="ed-opts">
      <!-- 方向开关 -->
      <div class="ed-opt">
        <span class="ed-opt-label">{{ $t('encodeDecode.direction') }}</span>
        <div class="ed-seg">
          <button
            class="ed-seg-btn"
            :class="{ active: effectiveDirection === 'enc' }"
            type="button"
            :disabled="!canToggleDirection"
            @click="direction = 'enc'"
          >{{ algo.oneWay ? $t('encodeDecode.dir.hash') : $t('encodeDecode.dir.encode') }}</button>
          <button
            class="ed-seg-btn"
            :class="{ active: effectiveDirection === 'dec' }"
            type="button"
            :disabled="!canToggleDirection"
            @click="direction = 'dec'"
          >{{ $t('encodeDecode.dir.decode') }}</button>
        </div>
      </div>

      <!-- 凯撒位移 -->
      <div v-if="algo.needsShift" class="ed-opt">
        <span class="ed-opt-label">{{ $t('encodeDecode.shift') }}</span>
        <input v-model.number="shift" class="ed-input ed-input-sm" type="number" min="0" max="25" />
      </div>

      <!-- 密钥 -->
      <div v-if="algo.needsKey || algo.needsIv" class="ed-opt ed-opt-grow">
        <span class="ed-opt-label">{{ algo.group === 'classic' ? $t('encodeDecode.vigenereKey') : $t('encodeDecode.key') }}</span>
        <input v-model="secretKey" class="ed-input" type="text" :placeholder="$t('encodeDecode.keyPlaceholder')" />
      </div>

      <!-- IV（对称加密） -->
      <template v-if="algo.needsIv">
        <div class="ed-opt ed-opt-grow">
          <span class="ed-opt-label">IV</span>
          <input
            v-model="iv"
            class="ed-input"
            type="text"
            :disabled="ivDisabled"
            :placeholder="ivDisabled ? $t('encodeDecode.ivEcbHint') : $t('encodeDecode.ivPlaceholder')"
          />
        </div>
        <div class="ed-opt">
          <span class="ed-opt-label">{{ $t('encodeDecode.mode') }}</span>
          <select v-model="mode" class="ed-input ed-input-sm">
            <option v-for="(_, k) in MODES" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
        <div class="ed-opt">
          <span class="ed-opt-label">{{ $t('encodeDecode.padding') }}</span>
          <select v-model="padding" class="ed-input ed-input-sm">
            <option v-for="(_, k) in PADDINGS" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
      </template>
    </div>

    <!-- RSA 参数区 -->
    <div v-else class="ed-opts ed-opts-rsa">
      <div class="ed-opt">
        <span class="ed-opt-label">{{ $t('encodeDecode.rsa.action') }}</span>
        <select v-model="rsaAction" class="ed-input ed-input-sm">
          <option value="encrypt">{{ $t('encodeDecode.rsa.encrypt') }}</option>
          <option value="decrypt">{{ $t('encodeDecode.rsa.decrypt') }}</option>
          <option value="sign">{{ $t('encodeDecode.rsa.sign') }}</option>
          <option value="verify">{{ $t('encodeDecode.rsa.verify') }}</option>
          <option value="keygen">{{ $t('encodeDecode.rsa.keygen') }}</option>
        </select>
      </div>
      <div v-if="rsaAction === 'keygen'" class="ed-opt">
        <span class="ed-opt-label">{{ $t('encodeDecode.rsa.bits') }}</span>
        <select v-model.number="rsaBits" class="ed-input ed-input-sm">
          <option :value="1024">1024</option>
          <option :value="2048">2048</option>
          <option :value="4096">4096</option>
        </select>
      </div>

      <div v-if="rsaAction !== 'keygen'" class="ed-keys">
        <div class="ed-key-col">
          <span class="ed-opt-label">{{ $t('encodeDecode.rsa.publicKey') }}</span>
          <textarea v-model="rsaPublicKey" class="ed-key-box" :placeholder="$t('encodeDecode.rsa.pemHint')" />
        </div>
        <div class="ed-key-col">
          <span class="ed-opt-label">{{ $t('encodeDecode.rsa.privateKey') }}</span>
          <textarea v-model="rsaPrivateKey" class="ed-key-box" :placeholder="$t('encodeDecode.rsa.pemHint')" />
        </div>
        <div v-if="rsaAction === 'verify'" class="ed-key-col">
          <span class="ed-opt-label">{{ $t('encodeDecode.rsa.signature') }}</span>
          <textarea v-model="rsaSignature" class="ed-key-box" :placeholder="$t('encodeDecode.rsa.signatureHint')" />
        </div>
      </div>
    </div>

    <!-- 双栏输入 / 输出 -->
    <div class="ed-panes">
      <div class="ed-pane">
        <div class="ed-pane-head">
          <span class="ed-pane-title">
            {{ algo.isRsa && rsaAction === 'keygen' ? $t('encodeDecode.rsa.keyPairOut') : $t('encodeDecode.input') }}
          </span>
          <span class="ed-count">{{ inputLen }}</span>
        </div>
        <textarea
          v-model="input"
          class="ed-textarea"
          :placeholder="$t('encodeDecode.inputPlaceholder')"
          spellcheck="false"
          :disabled="algo.isRsa && rsaAction === 'keygen'"
        />
      </div>

      <div class="ed-pane">
        <div class="ed-pane-head">
          <span class="ed-pane-title">{{ $t('encodeDecode.output') }}</span>
          <span class="ed-count">{{ outputLen }}</span>
        </div>
        <textarea
          :value="output"
          class="ed-textarea"
          :class="{ 'has-error': !!error }"
          readonly
          spellcheck="false"
          :placeholder="busy ? $t('encodeDecode.computing') : $t('encodeDecode.outputPlaceholder')"
        />
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="ed-error">{{ error }}</div>

    <!-- 动作条 -->
    <div class="ed-actions">
      <span class="ed-dir-hint">{{ $t('encodeDecode.currentDir', { d: dirLabel }) }}</span>
      <div class="ed-btns">
        <button class="ed-btn" type="button" :disabled="!output" @click="copyOut">
          {{ $t('encodeDecode.copy') }}
        </button>
        <button class="ed-btn" type="button" :disabled="!output" @click="swap">
          {{ $t('encodeDecode.swap') }}
        </button>
        <button class="ed-btn ghost" type="button" @click="clearAll">
          {{ $t('encodeDecode.clear') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.ed {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

/* 分组 */
.ed-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ed-group {
  padding: 5px 12px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: rgba(127, 127, 127, 0.1);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover { color: @text; background: rgba(127, 127, 127, 0.18); }

  &.active {
    color: #fff;
    background: @accent;
  }
}

/* 算法条 */
.ed-algos {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding-bottom: 2px;
}

.ed-algo {
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text-soft;
  background: rgba(127, 127, 127, 0.07);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover { border-color: color-mix(in srgb, @accent 40%, transparent); color: @accent; }

  &.active {
    color: @accent;
    background: @accent-soft;
    border-color: color-mix(in srgb, @accent 45%, transparent);
    font-weight: 600;
  }
}

/* 参数区 */
.ed-opts {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.06);
}

.ed-opts-rsa {
  flex-direction: column;
  align-items: stretch;
}

.ed-opt {
  display: flex;
  align-items: center;
  gap: 6px;

  &.ed-opt-grow { flex: 1; min-width: 140px; }
}

.ed-opt-label {
  font-size: 11px;
  color: @text-soft;
  white-space: nowrap;
}

.ed-input {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;

  &:focus { border-color: @accent; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }

  &.ed-input-sm { flex: 0 0 auto; width: 74px; }
}

/* 方向分段控件 */
.ed-seg {
  display: flex;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.12);
}

.ed-seg-btn {
  padding: 5px 12px;
  border: none;
  font-size: 12px;
  color: @text-soft;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &.active { color: #fff; background: @accent; }
  &:disabled { cursor: not-allowed; opacity: 0.75; }
  &:disabled.active { opacity: 1; }
}

/* RSA 密钥区 */
.ed-keys {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.ed-key-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ed-key-box {
  width: 100%;
  height: 62px;
  resize: vertical;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid rgba(127, 127, 127, 0.22);
  background: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;
  word-break: break-all;

  &:focus { border-color: @accent; }
}

/* 双栏 */
.ed-panes {
  flex: 1;
  min-height: 180px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ed-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ed-pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 4px;
}

.ed-pane-title {
  font-size: 11px;
  font-weight: 600;
  color: @text-soft;
}

.ed-count {
  font-size: 10px;
  color: @text-soft;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.ed-textarea {
  flex: 1;
  min-height: 0;
  resize: none;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: @text;
  outline: none;
  word-break: break-all;
  transition: border-color 0.15s ease;

  &:focus { border-color: @accent; }
  &:read-only { background: rgba(127, 127, 127, 0.05); }
  &:disabled { opacity: 0.5; }

  &.has-error { border-color: #ef4444; }
}

/* 错误 */
.ed-error {
  font-size: 12px;
  color: #ef4444;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
}

/* 动作条 */
.ed-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ed-dir-hint {
  font-size: 11px;
  color: @text-soft;
}

.ed-btns {
  display: flex;
  gap: 8px;
}

.ed-btn {
  padding: 6px 14px;
  border: none;
  border-radius: @radius-pill;
  font-size: 12px;
  color: #fff;
  background: @accent;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;

  &:hover:not(:disabled) { opacity: 0.88; }
  &:active:not(:disabled) { transform: scale(0.97); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &.ghost {
    color: @text-soft;
    background: rgba(127, 127, 127, 0.12);

    &:hover { color: @text; background: rgba(127, 127, 127, 0.2); }
    &:disabled { opacity: 0.4; }
  }
}

/* 窄屏：双栏改上下堆叠 */
@media (max-width: 640px) {
  .ed-panes {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .ed-textarea { min-height: 110px; }
}
</style>

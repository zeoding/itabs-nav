/**
 * 文本差异算法（纯函数，无 Vue / 无 DOM 依赖）
 *
 * 对外只暴露 diffLines / diffWords / buildDiffStats / applyIgnoreOptions /
 * normalizeLines / splitWords 六个能力，供 ContentDiffPreview 组件消费。
 *
 * 算法：
 *  1. 行级 diff 走 Myers 贪心算法（O(ND)，D 为差异规模），带公共前后缀裁剪，
 *     保证「插入 / 删除 / 修改」语义正确而非简单地按行号对齐。
 *  2. 行内（词级）diff 复用同一套 Myers 内核，在字符/token 序列上再跑一次，
 *     用于「修改」行的高亮细分。
 *
 * 设计约束：
 *  - 不引入任何第三方 diff 库（保持纯前端零新增依赖）
 *  - 大输入有上限保护（MAX_LINES / MAX_CHARS），避免 O(ND) 在最坏情况下卡死主线程
 */

/** 行级 diff 的最大行数（超出直接降级为「全部替换」提示） */
export const MAX_LINES = 4000
/** 字段最大字符数（单侧） */
export const MAX_CHARS = 400000
/** 行内词级 diff 的单行最大字符数（超出则整行标为修改，不做词级细分） */
const MAX_INLINE_CHARS = 2000
/** Myers 算法在单行内的最大编辑距离预算（超出退化为整体替换） */
const MAX_INLINE_D = 300

/**
 * 统一换行符并按行切分。
 * - `\r\n` / `\r` 统一成 `\n`
 * - 行尾多余的一个空行（文件以换行结尾）不计入行数，避免「末尾换行=多一行差异」
 * @param {string} text
 * @returns {string[]}
 */
export function normalizeLines(text) {
  if (typeof text !== 'string' || text === '') return []
  const unified = text.replace(/\r\n?/g, '\n')
  const lines = unified.split('\n')
  // 以 \n 结尾时末位是空串，属于「结尾换行」而非真实空行
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * 按「忽略项」预处理行，仅用于比较，不改变展示原文。
 * @param {string[]} lines
 * @param {{ ignoreCase?: boolean, ignoreWhitespace?: boolean }} options
 * @returns {string[]} 与输入等长的比较键数组
 */
export function applyIgnoreOptions(lines, options = {}) {
  const { ignoreCase = false, ignoreWhitespace = false } = options
  return lines.map((line) => {
    let key = line
    // 先折叠空白再转小写；顺序不影响结果，但折叠能让「a b」与「ab」等价仅在全忽略时成立
    if (ignoreWhitespace) key = key.replace(/\s+/g, '').trim()
    if (ignoreCase) key = key.toLowerCase()
    return key
  })
}

/**
 * 词级切分：把一行拆成「单词 / 数字 / 单个非字母数字字符」的 token 序列，
 * 使「foo=1」与「foo=2」只把 `1` / `2` 标为差异，而不是整串。
 * @param {string} line
 * @returns {string[]}
 */
export function splitWords(line) {
  if (!line) return []
  return line.match(/[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/g) || []
}

/**
 * Myers 贪心 diff 内核（O(ND)）。
 * 输入两个「比较键」数组，返回按原序排列的操作序列：
 *   { type: 'equal' | 'del' | 'ins', aIndex, bIndex }
 * 其中 del 读 aIndex，ins 读 bIndex，equal 两者都有。
 *
 * @param {string[]} a
 * @param {string[]} b
 * @param {number} maxD 编辑距离预算，超出返回 null（由调用方降级）
 * @returns {Array<{type: string, aIndex: number, bIndex: number}>|null}
 */
function myersDiff(a, b, maxD = Infinity) {
  const n = a.length
  const m = b.length

  // 公共前后缀裁剪：真实场景差异通常集中在中间，裁剪后可极大缩短 D 的搜索范围
  let start = 0
  while (start < n && start < m && a[start] === b[start]) start++
  let endA = n
  let endB = m
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const midN = midA.length
  const midM = midB.length

  const ops = []
  // 前缀：全部相等
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', aIndex: i, bIndex: i })

  const addMiddle = (middleOps) => {
    for (const op of middleOps) {
      ops.push({ ...op, aIndex: op.aIndex + start, bIndex: op.bIndex + start })
    }
  }

  if (midN === 0) {
    for (let j = 0; j < midM; j++) addMiddle([{ type: 'ins', aIndex: 0, bIndex: j }])
  } else if (midM === 0) {
    for (let i = 0; i < midN; i++) addMiddle([{ type: 'del', aIndex: i, bIndex: 0 }])
  } else {
    const middle = myersCore(midA, midB, maxD)
    if (!middle) return null
    addMiddle(middle)
  }

  // 后缀：全部相等（aIndex 从 endA 起，bIndex 从 endB 起，两者同步推进）
  for (let k = 0; endA + k < n; k++) {
    ops.push({ type: 'equal', aIndex: endA + k, bIndex: endB + k })
  }

  return ops
}

/**
 * Myers 核心（针对已裁剪的中间段），返回相对索引的操作序列。
 * 采用经典 V 数组 + 分阶段回溯（saved trace）实现，保证 O(ND) 时间。
 * @returns {Array<{type: string, aIndex: number, bIndex: number}>|null}
 */
function myersCore(a, b, maxD) {
  const n = a.length
  const m = b.length
  const max = Math.min(n + m, maxD === Infinity ? n + m : maxD)
  const offset = max
  // trace[d] 记录第 d 轮迭代后的 V 数组快照，用于回溯路径
  const trace = []

  let v = new Int32Array(2 * max + 1)
  let found = -1

  for (let d = 0; d <= max; d++) {
    // 快照当前 V（回溯依赖）
    trace.push(Int32Array.from(v))
    for (let k = -d; k <= d; k += 2) {
      let x
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1] // 向下（插入）
      } else {
        x = v[offset + k - 1] + 1 // 向右（删除）
      }
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
    if (found >= 0) break
  }

  if (found < 0) return null // 超出预算，由调用方降级

  // 回溯：从 (n, m) 逆推至 (0, 0)
  const ops = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const vPrev = trace[d]
    const k = x - y
    let prevK
    if (k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = vPrev[offset + prevK]
    const prevY = prevX - prevK

    // 先走「蛇形」的对角线（相等部分）
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ type: 'equal', aIndex: x, bIndex: y })
    }
    if (x > prevX) {
      // 删除（向右）
      x--
      ops.push({ type: 'del', aIndex: x, bIndex: y })
    } else {
      // 插入（向下）
      y--
      ops.push({ type: 'ins', aIndex: x, bIndex: y })
    }
  }
  // 剩余的对角线（d=0 段）
  while (x > 0 && y > 0) {
    x--
    y--
    ops.push({ type: 'equal', aIndex: x, bIndex: y })
  }

  return ops.reverse()
}

/**
 * 行级 diff：返回扁平的差异行序列（已做「修改」配对）。
 *
 * 输出项：
 *   { type: 'equal' | 'add' | 'del' | 'modify',
 *     aLine, bLine, aNo, bNo }
 * 其中 `modify` 表示同一位置既有删又有增，已配对成一行（左右并排展示）。
 *
 * @param {string} leftText
 * @param {string} rightText
 * @param {{ ignoreCase?: boolean, ignoreWhitespace?: boolean }} [options]
 * @returns {{ rows: Array<object>, truncated: boolean }}
 */
export function diffLines(leftText, rightText, options = {}) {
  const aLines = normalizeLines(leftText)
  const bLines = normalizeLines(rightText)

  if (aLines.length > MAX_LINES || bLines.length > MAX_LINES) {
    return { rows: [], truncated: true }
  }

  const aKeys = applyIgnoreOptions(aLines, options)
  const bKeys = applyIgnoreOptions(bLines, options)

  const ops = myersDiff(aKeys, bKeys)
  if (!ops) return { rows: [], truncated: true }

  // 把相邻的 del 与 ins 块配对成 modify，提升可读性：
  // 一个 del 块紧跟一个 ins 块时，按顺序两两配对成「修改」行。
  const rows = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.type === 'equal') {
      rows.push({
        type: 'equal',
        aLine: aLines[op.aIndex],
        bLine: bLines[op.bIndex],
        aNo: op.aIndex + 1,
        bNo: op.bIndex + 1,
      })
      i++
      continue
    }

    // 收集连续的 del 块 / ins 块（Myers 输出里可能交错，先按类型分桶）
    const delQueue = []
    const insQueue = []
    while (i < ops.length && ops[i].type !== 'equal') {
      const cur = ops[i]
      if (cur.type === 'del') {
        delQueue.push({ line: aLines[cur.aIndex], no: cur.aIndex + 1 })
      } else {
        insQueue.push({ line: bLines[cur.bIndex], no: cur.bIndex + 1 })
      }
      i++
    }

    let minLen = Math.min(delQueue.length, insQueue.length)
    const maxLen = Math.max(delQueue.length, insQueue.length)

    if (minLen === 0) {
      // 纯新增或纯删除，不配对
      for (const d of delQueue) rows.push({ type: 'del', aLine: d.line, bLine: null, aNo: d.no, bNo: null })
      for (const s of insQueue) rows.push({ type: 'add', aLine: null, bLine: s.line, aNo: null, bNo: s.no })
    } else {
      // 前 minLen 组配对为「修改」，剩余部分按纯增/纯删处理
      for (let k = 0; k < minLen; k++) {
        rows.push({
          type: 'modify',
          aLine: delQueue[k].line,
          bLine: insQueue[k].line,
          aNo: delQueue[k].no,
          bNo: insQueue[k].no,
        })
      }
      for (let k = minLen; k < delQueue.length; k++) {
        rows.push({ type: 'del', aLine: delQueue[k].line, bLine: null, aNo: delQueue[k].no, bNo: null })
      }
      for (let k = minLen; k < insQueue.length; k++) {
        rows.push({ type: 'add', aLine: null, bLine: insQueue[k].line, aNo: null, bNo: insQueue[k].no })
      }
      void maxLen
    }
  }

  return { rows, truncated: false }
}

/**
 * 行内词级 diff：给「修改」行生成左右两段分段高亮。
 * 返回 { left: [...], right: [...] }，每段 { text, changed }。
 * 任一侧过长时降级为整段高亮，保证不卡主线程。
 *
 * @param {string} aLine
 * @param {string} bLine
 * @param {{ ignoreCase?: boolean, ignoreWhitespace?: boolean }} [options]
 */
export function diffWords(aLine, bLine, options = {}) {
  const aWords = splitWords(aLine)
  const bWords = splitWords(bLine)

  if (aWords.length > MAX_INLINE_CHARS || bWords.length > MAX_INLINE_CHARS) {
    return {
      left: [{ text: aLine, changed: true }],
      right: [{ text: bLine, changed: true }],
    }
  }

  const aKeys = applyIgnoreOptions(aWords, options)
  const bKeys = applyIgnoreOptions(bWords, options)
  const ops = myersDiff(aKeys, bKeys, MAX_INLINE_D)

  // 词级 diff 超出预算：退化为整行高亮，语义仍正确（该行确实变了）
  if (!ops) {
    return {
      left: [{ text: aLine, changed: true }],
      right: [{ text: bLine, changed: true }],
    }
  }

  const left = []
  const right = []
  const push = (arr, text, changed) => {
    if (!text) return
    const last = arr[arr.length - 1]
    if (last && last.changed === changed) last.text += text
    else arr.push({ text, changed })
  }

  for (const op of ops) {
    if (op.type === 'equal') {
      push(left, aWords[op.aIndex] ?? '', false)
      push(right, bWords[op.bIndex] ?? '', false)
    } else if (op.type === 'del') {
      push(left, aWords[op.aIndex] ?? '', true)
    } else {
      push(right, bWords[op.bIndex] ?? '', true)
    }
  }

  return { left, right }
}

/**
 * 统计差异规模（用于顶部概览与「完全一致」判定）。
 * @param {Array<object>} rows diffLines 产出的行
 * @returns {{ added: number, removed: number, modified: number, same: number, total: number, changed: number }}
 */
export function buildDiffStats(rows) {
  const stats = { added: 0, removed: 0, modified: 0, same: 0, total: rows.length, changed: 0 }
  for (const row of rows) {
    if (row.type === 'add') stats.added++
    else if (row.type === 'del') stats.removed++
    else if (row.type === 'modify') stats.modified++
    else stats.same++
  }
  stats.changed = stats.added + stats.removed + stats.modified
  return stats
}

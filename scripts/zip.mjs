/**
 * 打包 dist 目录为 zip
 * 用法：
 *   node scripts/zip.mjs                # 自动取 package.json 的 version + 当前时间戳
 *   node scripts/zip.mjs my-build        # 自定义后缀
 *   node scripts/zip.mjs --out=releases  # 自定义输出目录
 */
// adm-zip 动态 import：依赖未装时给出明确提示
let AdmZip
try {
  const mod = await import('adm-zip')
  AdmZip = mod.default
} catch (e) {
  if (e instanceof Error && /Cannot find package 'adm-zip'/.test(e.message)) {
    console.error('❌ 缺少依赖 adm-zip')
    console.error('   请先执行: npm install')
    process.exit(1)
  }
  throw e
}
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/** 解析 package.json */
const pkg = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf-8')
)

/** 时间戳：YYYYMMDD-HHmm */
function ts() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes())
  )
}

/** CLI 参数解析 */
function parseArgs(argv) {
  const out = { suffix: '', outDir: 'release' }
  for (const a of argv) {
    if (a.startsWith('--out=')) out.outDir = a.slice('--out='.length)
    else if (!a.startsWith('--')) out.suffix = a
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

const distDir = join(ROOT, 'dist')
if (!existsSync(distDir)) {
  console.error('❌ dist 目录不存在，请先执行 npm run build')
  process.exit(1)
}

const outAbs = join(ROOT, args.outDir)
if (!existsSync(outAbs)) mkdirSync(outAbs, { recursive: true })

const fileName = [
  pkg.name,
  `v${pkg.version}`,
  args.suffix || ts(),
].filter(Boolean).join('-') + '.zip'

const zipPath = join(outAbs, fileName)
const zip = new AdmZip()

// 递归遍历 dist 目录，把每个文件以相对路径直接放入 zip 根目录
// 例：dist/assets/index.js → zip 内为 "assets/index.js"
function walkAndAdd(dir, basePath) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    // 相对 zip 根的 entry 路径（不带 dist/ 前缀）
    const entryName = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      walkAndAdd(full, entryName)
    } else if (entry.isFile()) {
      // addLocalFile(localPath, zipPath)：第二个参数是文件在 zip 内的目录前缀
      // 把 entryName 的目录部分作为 zipPath，文件名作为 entry 名
      const lastSlash = entryName.lastIndexOf('/')
      const zipPath = lastSlash >= 0 ? entryName.slice(0, lastSlash) : ''
      zip.addLocalFile(full, zipPath, lastSlash >= 0 ? entryName.slice(lastSlash + 1) : '')
    }
  }
}
walkAndAdd(distDir, '')

// 写入 zip 文件
zip.writeZip(zipPath)

const size = statSync(zipPath).size
const sizeMB = (size / 1024 / 1024).toFixed(2)
console.log(`✅ 打包完成: ${zipPath}`)
console.log(`   大小: ${sizeMB} MB`)

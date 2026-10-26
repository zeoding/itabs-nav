import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { pwaPlugin } from './scripts/pwa.mjs'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))

/**
 * 本次配置加载的时间戳（毫秒）
 * - 同时用于 __BUILD_TIME__ 注入与 dist/version.json 的 buildTime，
 *   两者必须取同一值，否则运行时会把自己判定成「有新版本」而误报。
 */
const BUILD_TIME = Date.now()

/** 构建时间（本地时区，格式 YYYY-MM-DD HH:mm），注入为全局常量 __BUILD_DATE__ */
function buildDateString() {
  const d = new Date(BUILD_TIME)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 从 CHANGELOG.md 提取指定版本的更新说明
 * - 只识别与发布版本精确匹配的段落标题（## 0.2.0 或 ## v0.2.0），
 *   取到下一个同级标题为止；没有对应段落返回空串（UI 不展示 notes）
 */
function extractNotes(version) {
  const file = resolve(ROOT, 'CHANGELOG.md')
  if (!existsSync(file)) return ''
  const text = readFileSync(file, 'utf-8')
  const lines = text.split(/\r?\n/)
  const heading = new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}\\s*$`)
  const start = lines.findIndex((l) => heading.test(l))
  if (start === -1) return ''
  const body = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n').trim()
}

/**
 * 构建完成后在 dist/ 生成 version.json（运行时更新检查的远程元信息）
 * - buildTime：本次构建时间戳，运行时更新的**主判据**（见 useUpdateChecker）
 * - version：语义化版本号，作次级判据与展示用（人工维护，可能滞后）
 * - notes 取自 CHANGELOG.md 中与 version 匹配的段落（可选维护）
 */
function versionMetaPlugin() {
  return {
    name: 'version-meta',
    apply: 'build',
    closeBundle() {
      const meta = {
        version: pkg.version,
        buildTime: BUILD_TIME,
        notes: extractNotes(pkg.version),
      }
      writeFileSync(resolve(ROOT, 'dist', 'version.json'), JSON.stringify(meta, null, 2))
      console.log(`[version-meta] dist/version.json → v${meta.version} @ ${new Date(BUILD_TIME).toISOString()}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools({ launchEditor: 'code' }), versionMetaPlugin(), pwaPlugin()],
  // 路径别名：源码内统一用 @/... 引入，不再使用 ./ ../ 相对路径
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Less：全局变量/混入自动注入每个 Less 文件（组件内直接用，无需手动引入）
  css: {
    preprocessorOptions: {
      less: {
        additionalData: `@import "@/styles/variables.less";`,
      },
    },
  },
  // 全局编译期常量
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDateString()),
    // 与 dist/version.json 的 buildTime 同源，供运行时判断构建产物是否已更新
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  // 相对路径：dist 可直接 file:// 预览或部署到任意子路径，否则绝对 /assets 会 404 白屏
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // 产物目录
    outDir: 'dist',
    // 静态资源兜底目录（assetFileNames 函数未命中的类型落到这里）
    assetsDir: 'assets',
    // 关闭 source map（生产包不需；调试可用 sourcemap=true 临时开启）
    sourcemap: false,
    // 每次构建前清空 dist，避免旧 hash 产物残留
    emptyOutDir: true,
    // 提醒：分包粒度（widget-libs 单块 ~900KB 为 echarts+xlsx 懒加载重依赖，已知可控）
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // 控制分包粒度（Vite 8 / Rolldown：manualChunks 已废弃，用 codeSplitting.groups 代替）：
        // - vendor-core：vue / pinia / dexie / axios 等首屏框架依赖，独立长效缓存
        // - vendor-ui：remixicon 图标库（tree-shake 后）
        // - lunar-libs：lunar-javascript 农历库，仅懒加载方引用，首屏不下载
        // - vendor：其余 node_modules 兜底
        // - dialogs：各弹窗懒加载 chunk；- app-runtime：composables / stores / utils
        // 注意（实测结论）：
        // 1. Rolldown 会把 group 命中模块的依赖递归吸入同一 chunk；group 命中的模块
        //    按 priority 取最高者，未命中 group 的模块跟随引用方所在 chunk。
        // 2. 不要把 vendor-core 的 priority 调到 vendor-ui 之上，
        //    否则 @remixicon/vue 的 2.7MB 单文件 barrel 会失去 tree-shaking，
        //    vendor-ui 从 ~400KB 膨胀到 ~3MB 并触发超限警告（已实测复现两遍）。
        // 3. dialogs 必须「纯懒加载」：App.vue 的弹窗全部 defineAsyncComponent，
        //    SearchBar 的 EngineEditor 也是懒加载 + 首次打开才挂载；
        //    任何首屏组件静态引入 dialogs 组内文件（含 ConfirmHost），都会把该 chunk
        //    连同其吸入的 lunar-libs 等依赖一起变成首屏 preload。
        // 4. priority 越大越先匹配：vendor-ui(28) > crypto/qr/lunar-libs(25) >
        //    vendor-core/app-runtime(22/21) > dialogs/widget-libs(20) > vendor(10)；
        //    共享代码必须落在比引用方更高 priority 的组里，否则被吸入懒加载块形成反向静态依赖。
        codeSplitting: {
          groups: [
            {
              // 首屏框架依赖独立成块：priority 高于 dialogs，从 dialogs 的吸入范围里
              // 摘出来，让 dialogs 成为纯弹窗代码块——弹窗改动不再连带重下框架代码。
              // priority 必须低于 vendor-ui（见上方注意事项 2）。
              name: 'vendor-core',
              test: /node_modules[\\/](vue|@vue|pinia|dexie|axios)/,
              priority: 22,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/]@remixicon[\\/]vue/,
              priority: 28,
            },
            {
              // 农历库 ~300KB：WidgetsBar 首帧后动态 import、CalendarDialog 经 utils/lunar 引用，
              // 独立成块保证首屏不下载（若与 remixicon 同组会被首屏静态依赖连带变 eager）
              name: 'lunar-libs',
              test: /node_modules[\\/]lunar-javascript/,
              priority: 25,
            },
            {
              // 周报统计 widget 专用重依赖（echarts/xlsx）：
              // 只被 WeekReportPreview 引用，独立分包保证只在打开该 widget 时下载，
              // 且避免落进 vendor 兜底块（防止将来首屏依赖与其混包）
              name: 'widget-libs',
              test: /node_modules[\\/](echarts|xlsx)/,
              priority: 20,
            },
            {
              // 编码解码 widget 专用依赖（crypto-js）：
              // 独立成块，避免被 widget-libs 的递归吸入规则带走，
              // 否则打开编码工具会连带下载 echarts+xlsx（合计约 900KB）
              name: 'crypto-libs',
              test: /node_modules[\\/]crypto-js/,
              priority: 25,
            },
            {
              // 二维码 widget 专用依赖（qrcode-generator 生成 / jsqr 解码）：
              // 独立分包，仅打开该 widget 时下载，避免落进 vendor 兜底块被首屏连带加载
              name: 'qr-libs',
              test: /node_modules[\\/](qrcode-generator|jsqr)/,
              priority: 25,
            },
            {
              // 弹窗/编辑器类懒加载 chunk 的统一归集。
              // 注意：WidgetPreviewDialog 必须列在这里 —— 它内部静态引入了全部
              // widget 预览组件，是 dialogs 块体积的主要来源；漏掉它会落进 vendor
              // 兜底块，与首屏依赖混包并失去独立缓存。
              // ConfirmHost 不在本组：App.vue 静态同步引入，会让 dialogs 失去纯懒加载。
              name: 'dialogs',
              test: /(TodoDialog|CalendarDialog|WeatherDialog|HotDialog|WorldTimeDialog|WidgetPreviewDialog|EngineEditor|SettingsPanel|SiteEditor)/,
              priority: 20,
            },
            {
              // 基础设施静态块：composables / stores / utils / config / components / data / directives。
              // priority 高于 dialogs：弹窗引用到的共享模块必须留在静态块，
              // 否则会被 dialogs 吸入，产生 首屏/app-runtime → dialogs 的静态反向依赖，
              // 把 dialogs（连带 lunar-libs）拖回首屏 preload。
              // 必须锚定 src/：否则会命中 node_modules 里的同名目录
              // （实测 echarts/lib/utils 被吸入，app-runtime 膨胀 200KB+）。
              // utils/lunar.js 例外（负向断言排除）：它静态引用 lunar-javascript，
              // 必须跟随懒加载方（CalendarDialog / WidgetsBar 动态 import）。
              name: 'app-runtime',
              test: /[\\/]src[\\/](composables|stores|utils|config|components|data|directives)[\\/](?!lunar)/,
              priority: 21,
            },
          ],
        },
        // 按类型分目录存放（强缓存友好：文件名均带 hash）：
        // - js/：入口 + 懒加载 chunk（含 codeSplitting 命名的 vendor-ui / dialogs 等）
        // - css/：从 Vue SFC / Less 抽出的样式
        // - images/：png/jpg/gif/svg/webp/avif/ico（当前项目图片走远程 URL，此为预留）
        // - fonts/：woff2/ttf/otf/eot；- media/：音视频；其余落到 assets/ 兜底
        // 注意 assetFileNames 在 Rolldown 下收到的是 assetInfo 对象，
        // 文件名取 names[0]（新）兼容 name（旧），仅按后缀判断，与原文件所在目录无关。
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const rawName =
            (Array.isArray(assetInfo.names) && assetInfo.names[0]) ||
            assetInfo.name ||
            ''
          const name = rawName.split('?')[0]
          if (/\.css$/i.test(name)) return 'css/[name]-[hash][extname]'
          if (/\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)$/i.test(name)) {
            return 'images/[name]-[hash][extname]'
          }
          if (/\.(woff2?|ttf|otf|eot)$/i.test(name)) {
            return 'fonts/[name]-[hash][extname]'
          }
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i.test(name)) {
            return 'media/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
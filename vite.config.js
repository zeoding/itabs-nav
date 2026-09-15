import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fileURLToPath, URL } from 'node:url'

/** 构建时间（本地时区，格式 YYYY-MM-DD HH:mm），注入为全局常量 __BUILD_DATE__ */
function buildDateString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools({ launchEditor: 'code' })],
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
    __BUILD_DATE__: JSON.stringify(buildDateString()),
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
    // 关闭清空选项：让外部脚本可同步产物；如需每次重建可打开 emptyOutDir
    emptyOutDir: true,
    // 提醒：分包粒度
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        // 控制分包粒度（Vite 8 / Rolldown：manualChunks 已废弃，用 codeSplitting.groups 代替）：
        // - vendor-ui：lunar-javascript / remixicon 图标库（tree-shake 后约 400KB）
        // - thesvg-icons：运行时按需 import，首屏不下载，独立长效缓存
        // - vendor：其余 node_modules 兜底
        // - dialogs：各弹窗懒加载 chunk；- app-runtime：composables / stores / utils
        // 注意（实测结论）：
        // 1. Rolldown 会把 group 命中模块的依赖递归吸入同一 chunk，无视其他 group 的 test，
        //    所以 vue 等核心库实际跟随引用方走，vendor-core 经常不单独成块——属正常现象。
        // 2. 不要把 vendor-core 的 priority 调到 vendor-ui/dialogs 之上，
        //    否则 @remixicon/vue 的 2.7MB 单文件 barrel 会失去 tree-shaking，
        //    vendor-ui 从 ~400KB 膨胀到 ~3MB 并触发超限警告（已实测复现两遍）。
        // 3. priority 越大越先匹配：thesvg-icons(30) > vendor-ui/dialogs(20) > vendor-core(15) > vendor(10)。
        codeSplitting: {
          groups: [
            {
              name: 'vendor-core',
              test: /node_modules[\\/](vue|@vue|dexie)/,
              priority: 15,
            },
            {
              name: 'thesvg-icons',
              test: /node_modules[\\/]@thesvg[\\/]icons/,
              priority: 30,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](lunar-javascript|@remixicon[\\/]vue)/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
            },
            {
              name: 'dialogs',
              test: /(TodoDialog|CalendarDialog|WeatherDialog|HotDialog|EngineEditor|SettingsPanel|SiteEditor|ConfirmHost)/,
              priority: 20,
            },
            {
              name: 'app-runtime',
              test: /[\\/](composables|stores|utils)[\\/]/,
              priority: 10,
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
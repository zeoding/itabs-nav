# itabs-nav — 类 iTab 浏览器导航页

> 一个**纯前端**、模仿 iTab 风格的浏览器导航页框架。所有数据（导航、设置、待办、日程）存在浏览器 **IndexedDB** 中，无需后端、无需登录、刷新即用。

玻璃拟态卡片、柔和渐变、搜索引擎栏、自定义多面板、拖拽排序、时钟/天气/热榜/日历/待办小组件……

---

## 📁 仓库说明

当前仓库即 `itabs-nav` 本体（v0.1+），所有新功能开发与维护均在此目录下进行。

下文所有说明均针对本目录。

---

## ✨ 特性

### 导航核心
- 🚀 **多面板支持**：默认首页 + 用户自定义面板（左侧图标条切换，支持滚轮切换、拖拽排序）
- 🔍 **搜索引擎栏**：9 个内置引擎（百度 / 必应 / 谷歌 / DuckDuckGo / 搜狗 / 360 / 夸克 / Yandex / 微信），点击触发器展开横向胶囊浮层，可新增 / 删除自定义引擎
- 📌 **站点 CRUD**：添加 / 编辑 / 删除 / 调整大小（6 种尺寸：1x1 / 1x2 / 2x1 / 2x2 / 2x4 / 4x2）
- 🖱️ **拖拽排序**：HTML5 DnD（站点卡片、待办、面板均支持）
- 🖱️ **右键菜单**：站点卡片右键编辑 / 删除 / 调整大小；添加卡片右键进入「编辑主页」模式
- 🎨 **玻璃拟态 UI**：Less 变量 + `backdrop-filter` 模糊

### 小组件
- ⏰ **实时时钟**（24h 制 HH:mm:ss，数字滚动进场动画 + 秒冒号闪烁）
- 🌤 **天气**（uapis 聚合接口；IP 定位 + Nominatim 逆地理回退城市，每日缓存，卡片可手动刷新）
- 🔥 **热搜榜**（百度 / 微博 / 知乎 / 抖音 / B 站；uapis 主源 + imsyy 备源 fallback，每日缓存）
- ✅ **待办**（未完成 / 已完成 / 回收站 + 批量操作 + 拖拽排序）
- 📅 **日历**（含农历/宜忌/节日/黄历）
- 💬 **每日一言**（uapis 随机一言，每日缓存，支持复制/刷新）
- ❄️ **飘雪特效**（右上快捷区开关，状态持久化）
- 🧰 **工具卡片**：站点 `kind` 扩展，点击打开预览弹窗（最小化后由底部任务栏承接）
  - ✂️ 文本分割（逗号/分号/斜杠/换行/自定义分隔，去重/计数/分组，CSV 导出）
  - 📫 免费邮箱 / 🖼️ 壁纸库（Wallhaven 搜索，sfw）

### 个性化
- 🎨 **主题色**：颜色选择器 + 6 套预设
- 🌙 **深浅色**：浅色 / 深色 / 跟随系统
- 🖼️ **壁纸**：纯色 / 渐变 / 自定义 URL / 随机图（可定时刷新）
- 🌐 **国际化**：`zh-CN` / `en`，全组件覆盖
- 📐 **网格列数**：自适应 / 4 / 5 / 6 列
- 🔍 **极简模式**：隐藏侧栏 + 小组件/站点区，只保留搜索框并下移 `18vh`
  - 搜索框走 `transform` 过渡（`content padding` 保持不动，避免双动画打架导致先下跳再上漂）
  - 下方内容隐藏时快速下沉淡出（`0.22s`，与搜索框同向）；回显时错峰 `0.12s` 再上浮淡入（`0.38s/0.45s`），并带 `visibility` + `inert`/`aria-hidden`，不可见时不可聚焦
  - 侧栏为 `fixed` 定位，显隐只做 `opacity/visibility` 淡入淡出，不引起重排
- ↔️ **侧栏收起**：状态持久化（ui store → IndexedDB），收起后 `content padding-left` 过渡回收

### 数据
- 💾 **备份恢复**：设置 → 数据管理，一键导出 / 导入 JSON（含站点/设置/待办/日程）
- ♻️ **重置清空**：重置外观设置 / 清空全部数据（含二次确认）

### 工程
- ⚡ **Vite 8**（Rolldown）+ Vue 3（Composition API + `<script setup>`）+ Pinia
- 📦 **按需加载**：天气/待办/日历/热搜/设置/站点编辑等弹窗走 `defineAsyncComponent`，首屏 JS 减半
- 🗂️ **代码分割**：`codeSplitting.groups`（vendor-core / vendor-ui / thesvg-icons / vendor / dialogs / app-runtime；`@remixicon/vue` 需保持 tree-shaking，勿提高 vendor-core 优先级）
- 🗜️ **打包 zip**：`npm run build:zip` 一键生成部署包（`base: './'`，解压即 `index.html` + `favicon.ico` + `js/ + css/ + images/ + fonts/ + media/`，支持 `file://` 预览；文件名均带 hash）
- 🕰️ **构建时间**：`__BUILD_DATE__` 编译期常量（本地时区 `YYYY-MM-DD HH:mm`）
- 🛡️ **错误隔离**：每个弹窗独立错误边界，单组件崩溃不影响全局
- 💡 **v-tip**：自研全局 tooltip 指令替代原生 title
- 🌐 **API 收口**：所有对外网络地址只允许出现在 `src/config/api.js`（uapis 聚合接口 + picsum/Wallhaven/Nominatim/imsyy 备源）
- 🖼️ **图标策略**：站点 favicon 直取目标站 `/favicon.ico`（失败回退字母头像）；引擎图标走 `@thesvg/icons` 懒加载独立分包

---

## 🚀 快速开始

> 环境要求：Node `^20.19.0 || >=22.12.0`（见 `package.json engines`）。

```bash
# 安装依赖
npm install

# 开发模式（http://localhost:5173）
npm run dev

# 构建生产版本
npm run build

# 打包成 zip（输出到 ./release/）
npm run build:zip

# 预览构建产物
npm run preview
```

---

## 📦 脚本

| 脚本 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite dev server |
| `npm run build` | 构建到 `dist/` |
| `npm run build:zip` | 构建 + 打包为 `release/itabs-nav-v{version}-{时间戳}.zip` |
| `npm run zip` | 仅打包 zip（dist 已存在时） |
| `npm run preview` | 本地预览构建产物 |

### zip 脚本选项

```bash
# 自定义后缀
node scripts/zip.mjs release-candidate
# → itabs-nav-v0.1.0-release-candidate.zip

# 自定义输出目录
node scripts/zip.mjs --out=releases
# → releases/itabs-nav-v0.1.0-20240310-1230.zip
```

zip 文件**不含** dist 目录层，解压后直接是 `index.html` + `assets/`。

---

## 🏗️ 目录结构

```
itabs-nav/
├─ index.html                # Vite 构建入口（必须在根目录，public/ 下的 html 不会被打包）
├─ public/
│  └─ favicon.ico            # 静态资源原样拷贝到 dist/（index.html 以 ./favicon.ico 引用，兼容 file:// 与子路径）
├─ vite.config.js              # Vite 配置（Less 全局变量注入 + manualChunks 拆分 + 相对 base）
├─ package.json
├─ scripts/
│  └─ zip.mjs                  # 打包 zip 脚本
└─ src/
   ├─ main.js                  # 入口（Pinia + $t + v-tip 注册）
   ├─ App.vue                  # 根布局（多面板 + 滚轮切换 + 弹窗宿主 + 任务栏 + 极简模式过渡）
   ├─ styles/
   │  ├─ main.less              # 全局样式（变量 + 玻璃工具类 + 动画）
   │  ├─ variables.less         # Less 变量（主题/圆角/过渡，自动注入各组件）
   │  └─ mobile.less            # 响应式
   ├─ config/
   │  └─ api.js                # 对外 API 唯一收口（uapis/热榜/一言/壁纸/Wallhaven/favicon/搜索引擎）
   ├─ data/
   │  └─ regions.js            # 地区数据
   ├─ utils/                   # http / dailyCache / lunar / thesvg / fullscreenMixin
   ├─ db/
   │  └─ index.js              # IndexedDB 数据层（sites/settings/todos/events/cache，v6；widgets 为旧版遗留表仅保留）
   ├─ stores/                  # Pinia（sites/settings/panels/todos/events/weather/hot/saying/ui）
   ├─ i18n/                    # 国际化字典（zh-CN.js / en.js，zh-CN 为 fallback）
   ├─ composables/
   │  ├─ useI18n.js            # 国际化（轻量自研）
   │  ├─ useMessage.js         # 全局消息提示
   │  ├─ useConfirm.js         # 全局确认弹窗
   │  ├─ useTip.js             # tooltip 逻辑
   │  └─ useEscapeClose.js     # Esc 关闭弹窗
   ├─ directives/
   │  └─ tip.js                # v-tip 全局指令
   ├─ components/
   │  ├─ BaseDialog.vue        # 弹窗基座
   │  └─ feedback/             # ConfirmHost / MessageHost / TipHost / AsyncLoading
   └─ views/
      ├─ layout/               # Sidebar / WidgetsBar / SayingFooter / Snowfall / WidgetTaskbar
      ├─ search/               # SearchBar / EngineEditor
      ├─ sites/                # SiteGrid / SiteCard / SiteContextMenu / SiteEditor / AddCardMenu
      ├─ dialogs/              # Weather / Todo / Calendar / Hot / WidgetPreview
      ├─ settings/             # SettingsPanel / SettingsGeneral / SettingsData / SettingsAbout
       ├─ widgets/              # SplitTextPreview / EmailPreview / WallpaperPreview
       └─ split/                # 文本分割工具（Panel/Input/Options/Output/Actions）
```

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 状态 | Pinia（sites/settings/panels/todos/events/weather/hot/saying/ui） |
| 构建 | Vite 8 + Rolldown |
| 存储 | IndexedDB（Dexie 封装，DB `itabs-nav-db` v6：sites/settings/todos/events/cache；widgets 为旧版遗留表仅保留） |
| 拖拽 | HTML5 DnD（站点/待办/面板） |
| HTTP | axios（经 `src/utils/http.js`，对外地址收口于 `src/config/api.js`） |
| 日期 | lunar-javascript（农历 / 节气） |
| 图标 | @remixicon/vue + @thesvg/icons（后者独立分包懒加载）；站点 favicon 直取目标站 `/favicon.ico` |
| 打包 | adm-zip（devDep） |
| 样式 | Less（变量全局注入 + 玻璃拟态） |

---

## 🌍 国际化

支持 `zh-CN` / `en` 两种语言，**全组件覆盖**（设置、弹窗、上下文菜单、占位文案）。

切换方式：**设置 → 外观 → 语言**

新增语言：编辑 `src/i18n/zh-CN.js`（作为 fallback）后，新增 `src/i18n/<locale>.js` 即可，结构自动识别。

---

## 🐛 调试

- 控制台无额外日志
- IndexedDB 存储位置：DevTools → Application → IndexedDB → `itabs-nav-db`（v6）
- 包含 5 张活跃表：`sites` / `settings` / `todos` / `events` / `cache`（天气/热榜/一言每日缓存，不进备份；`widgets` 为旧版遗留表仅保留）

清空所有数据：设置 → 数据管理 → 清空全部数据，或控制台执行：
```js
// DevTools Console
indexedDB.deleteDatabase('itabs-nav-db')
location.reload()
```

---

## 📋 路线图

### ✅ 已实现
- [x] 多面板 + 自定义面板
- [x] 拖拽排序（站点、面板、待办）
- [x] 6 种站点尺寸
- [x] 右键菜单 + 编辑主页模式 + 滚轮切换面板
- [x] 主题色 + 6 套预设 + 深浅色（跟随系统）
- [x] 壁纸（渐变/纯色/URL/随机 + 定时刷新）
- [x] 国际化（中/英）
- [x] 时钟/天气/热搜/日历/待办/一言/飘雪小组件
- [x] 工具卡（文本分割 / 免费邮箱 / 壁纸库）+ 预览弹窗 + 最小化任务栏
- [x] 极简模式 + 侧栏收起（含搜索框下移动过渡 + 下方内容错峰淡入淡出）
- [x] JSON 备份导出 / 恢复导入 / 重置清空
- [x] 一键打包 zip（`file://` 可预览，`__BUILD_DATE__` 构建时间）
- [x] 弹窗懒加载 + loading 占位
- [x] 代码分割（vendor-core / vendor-ui / thesvg-icons / vendor / dialogs / app-runtime）

### 📭 计划中
- [ ] 浏览器扩展（Manifest V3）
- [ ] 远程 widget 加载

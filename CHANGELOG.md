# Changelog

本文件记录每个发布版本的更新说明。构建时 `vite.config.js` 的 versionMetaPlugin
会自动提取与 `package.json` version 匹配的段落写入 `dist/version.json`，
供运行时「版本更新提醒」展示（发布新版本时：bump version + 在顶部追加一段 `## x.y.z`）。

## 0.1.0

- iTab 风格导航页首个版本：玻璃拟态、搜索引擎栏、多面板、拖拽排序
- 小组件：时钟 / 天气 / 待办 / 日历 / 热榜 / 周报统计
- 无后端，数据存浏览器 IndexedDB

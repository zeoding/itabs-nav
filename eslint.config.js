import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

export default [
  // 全局忽略：构建产物 / 依赖 / 打包缓存
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      '.dist-extract/**',
      '.npm-cache/**',
    ],
  },

  js.configs.recommended,
  // 用 essential 档：只管正确性。recommended 里的模板格式规则
  // （max-attributes-per-line 等）与项目现有的紧凑模板风格全面冲突，不上。
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // vite.config.js 的编译期常量
        __BUILD_DATE__: 'readonly',
      },
    },
  },

  {
    files: ['vite.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      // 项目组件以单词命名为惯例（App / Sidebar / SiteCard...），不强制多词
      'vue/multi-word-component-names': 'off',
    },
  },
]

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { registerPwa } from '@/composables/usePwa'
import '@/styles/main.less'
import { $t } from '@/composables/useI18n'
import { vTip, hookTipGlobalHide } from '@/directives/tip'

const app = createApp(App)
app.use(createPinia())
// $t 全局注册：所有组件模板内直接 $t('...')，无需逐文件 useI18n 解构
// （响应式：$t 读取模块级 currentLang，语言切换时引用它的渲染自动更新）
app.config.globalProperties.$t = $t
// v-tip 全局指令：替代原生 title（统一样式 tips）
app.directive('tip', vTip)
hookTipGlobalHide()
app.mount('#app')
registerPwa()
import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as db from '@/db'

/**
 * 日程事件 Store（只读）
 * - 日历弹窗仅用 events + load 做日期点标展示
 * - 写链路（add/update/remove）已移除：如需恢复日程编辑，同步恢复 db/index.js 对应函数
 */
export const useEventsStore = defineStore('events', () => {
  const events = ref([])

  async function load() {
    events.value = await db.getAllEvents()
  }

  return { events, load }
})

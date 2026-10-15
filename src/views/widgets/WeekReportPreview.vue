<script setup>
/**
 * 周报统计 widget（移植自 work-online 的 views/weekReport.vue）
 *
 * 功能：
 *  - 上传周报 .xlsx（读第 2 个工作表，需含「申请人 / ECR申请部门 / 变更类型」列）
 *    支持「选择文件」与拖拽到面板两种导入方式
 *  - 汇总表：变更类型 × 部门矩阵 + 百分比；明细表：申请人 × 部门矩阵
 *  - 饼图（按变更类型）+ 柱状图（按申请人，可缩放）
 *  - 数据与生成时间持久化到 settings 表（weekReport.data / weekReport.savedAt）
 *
 * 相比原版的适配（行为差异见 detailRows）：
 *  - echarts 按需引入（core + Pie/Bar），实例挂 ref、卸载 dispose、
 *    ResizeObserver 跟随弹窗/全屏尺寸变化自动 resize
 *  - element-plus 按钮换本地样式；dayjs 换原生格式化；uniqBy 手写
 *  - localStorage 改走 IndexedDB settings 表（进备份）
 *  - 明细表部门列按「申请人 × 部门」逐格计数（原版把该申请人全部条数
 *    记在首次出现的部门列，跨部门申请时其余部门恒为 0）；每行总数与
 *    合计行数值不变
 *  - UI 文案沿用同目录其他 widget 的字面量中文（暂不接入 i18n，同既定模式）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import * as XLSX from 'xlsx'
import { getSetting, setSetting } from '@/db'
import { useMessage } from '@/composables/useMessage'
import { useConfirm } from '@/composables/useConfirm'
import { useSettingsStore } from '@/stores/settings'
import { RiFileUploadLine, RiDeleteBinLine } from '@remixicon/vue'

echarts.use([
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const message = useMessage()
const { confirm } = useConfirm()
const settingsStore = useSettingsStore()
const { isDark } = storeToRefs(settingsStore)

const DATA_KEY = 'weekReport.data'
const SAVED_AT_KEY = 'weekReport.savedAt'

const rows = ref([])
const savedAt = ref(null)
const fileRef = ref(null)
const isDragging = ref(false)
let dragDepth = 0

/* ---------------- 表格（computed 派生，选完文件即更新） ---------------- */

const deptList = computed(() =>
  [...new Set(rows.value.map((r) => r['ECR申请部门']).filter(Boolean))]
)
const typeList = computed(() =>
  [...new Set(rows.value.map((r) => r['变更类型']).filter(Boolean))]
)

const detailColumns = computed(() => ['申请人', ...deptList.value, '总数'])
const totalColumns = computed(() => ['变更类型', ...deptList.value, '总数', '百分比'])

const detailRows = computed(() => {
  const list = rows.value
  if (!list.length) return []
  const depts = deptList.value
  const seen = new Set()
  const perApplicant = []
  for (const item of list) {
    const name = item['申请人']
    if (seen.has(name)) continue
    seen.add(name)
    const row = { '申请人': name }
    for (const d of depts) {
      row[d] = list.filter((u) => u['申请人'] === name && u['ECR申请部门'] === d).length
    }
    row['总数'] = list.filter((u) => u['申请人'] === name).length
    perApplicant.push(row)
  }
  const totalRow = { '申请人': '总数' }
  for (const d of depts) {
    totalRow[d] = perApplicant.reduce((s, r) => s + (r[d] || 0), 0)
  }
  totalRow['总数'] = perApplicant.reduce((s, r) => s + r['总数'], 0)
  return [...perApplicant, totalRow]
})

const totalRows = computed(() => {
  const list = rows.value
  if (!list.length) return []
  const depts = deptList.value
  const perType = typeList.value.map((t) => {
    const row = { '变更类型': t }
    for (const d of depts) {
      row[d] = list.filter((u) => u['变更类型'] === t && u['ECR申请部门'] === d).length
    }
    row['总数'] = list.filter((u) => u['变更类型'] === t).length
    return row
  })
  const totalRow = { '变更类型': '总数' }
  for (const d of depts) {
    totalRow[d] = perType.reduce((s, r) => s + (r[d] || 0), 0)
  }
  totalRow['总数'] = perType.reduce((s, r) => s + r['总数'], 0)
  const grand = totalRow['总数']
  return [...perType, totalRow].map((r) => ({
    ...r,
    '百分比': grand ? `${((r['总数'] / grand) * 100).toFixed(2)}%` : '0.00%',
  }))
})

/* ---------------- 图表（echarts 按需，实例随组件销毁） ---------------- */

const overviewEl = ref(null)
const detailEl = ref(null)
let overviewChart = null
let detailChart = null
let resizeObserver = null

/** 图表文字色随深浅色切换（echarts 默认深灰，暗色下不可读） */
const chartText = computed(() => (isDark.value ? '#cbd5e1' : '#334155'))
const chartSubText = computed(() => (isDark.value ? '#94a3b8' : '#64748b'))

function renderCharts() {
  if (!rows.value.length) return
  renderOverview()
  renderDetail()
}

function renderOverview() {
  if (!overviewEl.value) return
  if (!overviewChart) overviewChart = echarts.init(overviewEl.value)
  overviewChart.setOption(
    {
      title: { text: '汇总图', left: 'left', textStyle: { color: chartText.value, fontSize: 14 } },
      tooltip: { trigger: 'item' },
      legend: { bottom: 'bottom', textStyle: { color: chartSubText.value } },
      series: [
        {
          type: 'pie',
          radius: '50%',
          label: { show: true, formatter: '{b}: {c} ({d}%)', color: chartText.value },
          data: totalRows.value
            .filter((r) => r['变更类型'] !== '总数')
            .map((r) => ({ value: r['总数'], name: r['变更类型'] })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    },
    { notMerge: true }
  )
}

function renderDetail() {
  if (!detailEl.value) return
  if (!detailChart) detailChart = echarts.init(detailEl.value)
  // 副本排序（原版在渲染函数里原地 sort 改了表格数据源）
  const sorted = [...detailRows.value.filter((r) => r['申请人'] !== '总数')].sort(
    (a, b) => a['总数'] - b['总数']
  )
  detailChart.setOption(
    {
      title: { text: '明细图', left: 'left', textStyle: { color: chartText.value, fontSize: 14 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {},
      grid: { left: '0%', right: '2%', bottom: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: sorted.map((r) => r['申请人']),
        axisLabel: { color: chartSubText.value },
      },
      yAxis: { type: 'value', axisLabel: { color: chartSubText.value } },
      dataZoom: [{ show: true, bottom: 0, start: 0, xAxisIndex: [0] }],
      series: [
        {
          type: 'bar',
          label: { show: true, position: 'top', color: chartText.value },
          barWidth: 12,
          data: sorted.map((r) => r['总数']),
        },
      ],
    },
    { notMerge: true }
  )
}

watch(rows, () => nextTick(renderCharts))
watch(isDark, () => nextTick(renderCharts))

/* ---------------- 文件读取 + 持久化 ---------------- */

function handleFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选择同一文件
  readFile(file)
}

function readFile(file) {
  if (!file) return
  if (!/\.xlsx$/i.test(file.name)) {
    message.error('仅支持 .xlsx 文件')
    return
  }
  const reader = new FileReader()
  reader.onerror = () => message.error('文件读取失败')
  reader.onload = (ev) => {
    try {
      const workbook = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[1]]
      if (!sheet) throw new Error('missing sheet')
      // 键清洗（沿用原版）：表头含换行符时去掉
      const parsed = XLSX.utils.sheet_to_json(sheet).map((item) => {
        const out = {}
        for (const key in item) out[key.replace(/[\r\n]/g, '')] = item[key]
        return out
      })
      const required = ['申请人', 'ECR申请部门', '变更类型']
      if (!parsed.length || !required.every((k) => k in parsed[0])) {
        message.error('解析失败：第 2 个工作表需包含「申请人 / ECR申请部门 / 变更类型」列')
        return
      }
      rows.value = parsed
      savedAt.value = formatDate(new Date())
      persist()
    } catch {
      message.error('解析失败：无法读取该 xlsx 文件')
    }
  }
  reader.readAsArrayBuffer(file)
}

/* 拖拽导入：dragenter/leave 用计数抵消子元素冒泡导致的闪烁 */
function onDragEnter(e) {
  if (!e.dataTransfer?.types?.includes('Files')) return
  dragDepth++
  isDragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) isDragging.value = false
}

function onDrop(e) {
  dragDepth = 0
  isDragging.value = false
  readFile(e.dataTransfer?.files?.[0])
}

async function persist() {
  try {
    await Promise.all([
      setSetting(DATA_KEY, rows.value),
      setSetting(SAVED_AT_KEY, savedAt.value),
    ])
  } catch {
    /* 持久化失败不阻塞本次展示 */
  }
}

/** 清空已生成的统计数据（表格 + 图表 + 持久化记录） */
async function clearData() {
  const ok = await confirm({
    title: '清空统计数据',
    message: '将清除已生成的表格、图表及保存记录，确定清空？',
    okText: '清空',
    danger: true,
  })
  if (!ok) return
  rows.value = []
  savedAt.value = null
  await persist()
  message.success('已清空')
}

/** 原版 dayjs().format('YYYY-MM-DD HH:mm:ss') 的原生等价 */
function formatDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    overviewChart?.resize()
    detailChart?.resize()
  })
  if (overviewEl.value) resizeObserver.observe(overviewEl.value)
  if (detailEl.value) resizeObserver.observe(detailEl.value)
  // 上次的数据与生成时间（settings 表，进备份）
  const [data, at] = await Promise.all([
    getSetting(DATA_KEY, null),
    getSetting(SAVED_AT_KEY, null),
  ])
  if (Array.isArray(data) && data.length) {
    rows.value = data
    savedAt.value = at || null
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  overviewChart?.dispose()
  detailChart?.dispose()
  overviewChart = null
  detailChart = null
})
</script>

<template>
  <div
    class="week-report"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <transition name="wr-fade">
      <div v-if="isDragging" class="drop-overlay">
        <RiFileUploadLine size="40" aria-hidden="true" />
        <p>松开以导入周报 xlsx</p>
      </div>
    </transition>
    <div class="toolbar">
      <input
        ref="fileRef"
        type="file"
        accept=".xlsx"
        class="file-input"
        @change="handleFile"
      />
      <button class="wr-btn" type="button" @click="fileRef?.click()">
        <RiFileUploadLine size="16" aria-hidden="true" />
        选择文件
      </button>
      <button
        v-if="rows.length"
        class="wr-btn danger"
        type="button"
        @click="clearData"
      >
        <RiDeleteBinLine size="16" aria-hidden="true" />
        清空
      </button>
      <span v-show="savedAt" class="gen-tag">生成时间: {{ savedAt }}</span>
    </div>

    <div class="panels">
      <div class="tables">
        <div v-if="!rows.length" class="empty-hint">
          <RiFileUploadLine size="34" aria-hidden="true" />
          <p>选择或拖拽周报 xlsx 开始统计<br />（第 2 个工作表需含「申请人 / ECR申请部门 / 变更类型」列）</p>
        </div>
        <template v-else>
          <table class="wr-table">
            <thead>
              <tr>
                <td :colspan="totalColumns.length" class="table-title">汇总表</td>
              </tr>
              <tr>
                <th v-for="c in totalColumns" :key="c">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in totalRows"
                :key="i"
                :class="{ sum: i === totalRows.length - 1 }"
              >
                <td v-for="c in totalColumns" :key="c">{{ row[c] }}</td>
              </tr>
            </tbody>
          </table>
          <table class="wr-table">
            <thead>
              <tr>
                <td :colspan="detailColumns.length" class="table-title">明细表</td>
              </tr>
              <tr>
                <th v-for="c in detailColumns" :key="c">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in detailRows"
                :key="i"
                :class="{ sum: i === detailRows.length - 1 }"
              >
                <td v-for="c in detailColumns" :key="c">{{ row[c] }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div class="charts">
        <div ref="overviewEl" v-show="rows.length" class="chart overview"></div>
        <div ref="detailEl" v-show="rows.length" class="chart detail"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.week-report {
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px dashed @accent;
  border-radius: @radius-card;
  color: @accent;
  font-size: 14px;
  font-weight: 600;
  background: color-mix(in srgb, @accent 10%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;

  p {
    margin: 0;
  }
}

.wr-fade-enter-active,
.wr-fade-leave-active {
  transition: opacity @tr;
}

.wr-fade-enter-from,
.wr-fade-leave-to {
  opacity: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.file-input {
  display: none;
}

.wr-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: @radius-pill;
  cursor: pointer;
  font-size: 13px;
  color: #fff;
  background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
  transition: transform @tr, box-shadow @tr;

  &:hover {
    box-shadow: 0 4px 14px color-mix(in srgb, @accent 40%, transparent);
  }

  &:active {
    transform: scale(0.96);
  }

  /* 清空按钮：危险色 */
  &.danger {
    background: #ef4444;

    &:hover {
      box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
    }
  }
}

.gen-tag {
  padding: 3px 10px;
  border-radius: @radius-pill;
  font-size: 12px;
  color: @text-soft;
  background: @icon-bg;
}

.panels {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 14px;
  min-height: 0;
}

.tables {
  flex: 1.2;
  min-width: 320px;

  /* 空数据时 charts 区为空，表格区占满整行，空态提示才能在整个内容区居中 */
  &:has(.empty-hint) {
    flex: 1 1 100%;
  }
}

.charts {
  flex: 1;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart {
  width: 100%;

  &.overview {
    height: 280px;
  }

  &.detail {
    height: 340px;
  }
}

.wr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 16px;

  th,
  td {
    border: 1px solid color-mix(in srgb, @text 16%, transparent);
    padding: 6px 10px;
    text-align: center;
  }

  th {
    background: @icon-bg;
    font-weight: 600;
  }

  .table-title {
    background: linear-gradient(135deg, @accent, color-mix(in srgb, @accent 60%, #fff));
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    padding: 8px;
  }

  tr.sum td {
    font-weight: 600;
    background: @icon-bg;
  }
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 12px;
  color: @text-soft;
  font-size: 13px;
  text-align: center;

  p {
    margin: 0;
    line-height: 1.6;
  }
}
</style>

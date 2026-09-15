
<script setup>
/**
 * 全屏飘雪（canvas）
 * - fixed 覆盖、pointer-events 穿透，不拦截任何交互
 * - z-index 9500：在页面内容之上、弹窗遮罩（10000）之下
 * - 尊重 prefers-reduced-motion：开启减少动态时不渲染
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref(null)
const COUNT = 130
let raf = 0
let flakes = []
let ctx = null
let w = 0
let h = 0

function resize() {
  if (!canvas.value) return
  w = canvas.value.width = window.innerWidth
  h = canvas.value.height = window.innerHeight
}

function spawn(fromTop) {
  const r = 1 + Math.random() * 2.5
  return {
    x: Math.random() * w,
    y: fromTop ? -10 : Math.random() * h,
    r,
    s: 0.4 + Math.random() * 1.2,
    drift: Math.random() * 0.6 - 0.3,
    phase: Math.random() * Math.PI * 2,
    // 半径大的近景片画六角结晶并缓慢旋转，小的远景点保持圆点
    crystal: r > 1.8,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.02,
  }
}

/** 六角冰晶：一根主枝 + 两对小分叉，转 60° 画三遍 */
function drawCrystal(f) {
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.rotate(f.rot)
  const R = f.r * 2.2
  ctx.lineWidth = Math.max(1, f.r * 0.45)
  ctx.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI / 3)
    ctx.beginPath()
    ctx.moveTo(-R, 0)
    ctx.lineTo(R, 0)
    // 两对分叉
    const b = R * 0.45
    const t = R * 0.3
    ctx.moveTo(b, 0)
    ctx.lineTo(b - t, -t)
    ctx.moveTo(b, 0)
    ctx.lineTo(b - t, t)
    ctx.moveTo(-b, 0)
    ctx.lineTo(-b + t, -t)
    ctx.moveTo(-b, 0)
    ctx.lineTo(-b + t, t)
    ctx.stroke()
  }
  ctx.restore()
}

function tick() {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  for (const f of flakes) {
    f.y += f.s
    f.phase += 0.01
    f.x += f.drift + Math.sin(f.phase) * 0.4
    if (f.y > h + 10) Object.assign(f, spawn(true))
    if (f.x > w + 10) f.x = -10
    else if (f.x < -10) f.x = w + 10
    ctx.globalAlpha = 0.45 + (f.r / 3.5) * 0.5
    if (f.crystal) {
      f.rot += f.rotSpeed
      drawCrystal(f)
    } else {
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  flakes = Array.from({ length: COUNT }, () => spawn(false))
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas ref="canvas" class="snowfall" aria-hidden="true" />
</template>

<style scoped lang="less">
.snowfall {
  position: fixed;
  inset: 0;
  z-index: 9500;
  pointer-events: none;
}
</style>

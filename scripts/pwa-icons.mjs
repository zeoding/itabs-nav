// Reproducible, dependency-free PNG icons with a maskable-safe compass mark.
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const name = Buffer.from(type)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([size, name, data, crc])
}
function icon(size) {
  const data = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const radius = Math.hypot(dx, dy)
      const ring = Math.abs(radius - 0.285) < 0.016
      const u = (dx - dy) / Math.SQRT2
      const v = (dx + dy) / Math.SQRT2
      const needle = Math.abs(u) / 0.23 + Math.abs(v) / 0.075 < 1
      const white = ring || (needle && u >= 0)
      const tint = needle && u < 0
      const offset = y * (1 + size * 4) + 1 + x * 4
      const t = (x + y) / (2 * size)
      data[offset] = white ? 255 : tint ? 190 : Math.round(79 + t * 45)
      data[offset + 1] = white ? 255 : tint ? 200 : Math.round(70 - t * 12)
      data[offset + 2] = white ? 255 : tint ? 255 : 229
      data[offset + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0)),
  ])
}
const directory = new URL('../public/icons/', import.meta.url)
await mkdir(directory, { recursive: true })
for (const [name, size] of [['pwa-192.png', 192], ['pwa-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await writeFile(new URL(name, directory), icon(size))
  console.log(`Generated ${name} (${size}x${size})`)
}

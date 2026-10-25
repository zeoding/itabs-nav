/**
 * 触发浏览器下载：Blob → 隐藏 <a> → click → 延迟 revokeObjectURL。
 * dataURL 下载（QrCodePreview 等）可直接赋给 a.href，无需本工具。
 */
export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟回收，避免部分浏览器在下载发起前就失效
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

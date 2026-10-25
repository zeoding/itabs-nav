/**
 * 复制文本到剪贴板，返回是否成功。
 * - 优先 navigator.clipboard（需要安全上下文：HTTPS / localhost）
 * - 降级：隐藏 textarea + execCommand('copy')（file:// 等非安全上下文）
 *
 * 全项目复制行为的统一收口（WidgetTaskbar / SayingFooter / EncodeDecode /
 * SplitText / QrCode / Email 六处此前各持一份逐字重复的实现），
 * 成功/失败提示与高亮状态由调用方自行处理。
 */
export async function copyText(text) {
  if (text == null) return false
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 权限被拒 / 非安全上下文，走降级 */
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

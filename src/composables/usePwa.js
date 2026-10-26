import { reactive } from 'vue'

export const pwaState = reactive({
  supported: false,
  installed: false,
  canInstall: false,
  offlineReady: false,
  updateReady: false,
  updating: false,
})

let registration = null
let registrationPromise = null
let installPrompt = null
let started = false
let activationPromise = null
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

/** Production only: file:// and insecure contexts retain the normal web experience. */
export function registerPwa() {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator) ||
      !window.isSecureContext || !/^https?:$/.test(location.protocol)) return
  started = true
  pwaState.supported = true
  pwaState.installed = standalone()
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    pwaState.canInstall = !pwaState.installed
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    pwaState.canInstall = false
    pwaState.installed = true
  })
  // Only reload the tab whose user explicitly accepted an update.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pwaState.updating) location.reload()
  })
  const base = new URL(import.meta.env.BASE_URL, document.baseURI)
  registrationPromise = navigator.serviceWorker.register(new URL('sw.js', base), {
    scope: base.pathname,
    updateViaCache: 'none',
  }).then((reg) => {
    registration = reg
    const sync = () => {
      pwaState.updateReady = Boolean(reg.waiting && navigator.serviceWorker.controller)
      pwaState.offlineReady = Boolean(reg.active)
    }
    const observe = () => {
      const worker = reg.installing
      if (worker) worker.addEventListener('statechange', sync)
      sync()
    }
    reg.addEventListener('updatefound', observe)
    observe()
    return reg
  }).catch((error) => {
    console.warn('[PWA] Service worker registration failed:', error)
    return null
  })
  let lastCheck = 0
  const check = () => {
    if (!registration || !navigator.onLine || document.visibilityState !== 'visible' ||
        Date.now() - lastCheck < 60 * 60 * 1000) return
    lastCheck = Date.now()
    registration.update().catch(() => {})
  }
  document.addEventListener('visibilitychange', check)
  window.addEventListener('online', check)
}

async function install() {
  const prompt = installPrompt
  if (!prompt) return false
  installPrompt = null
  pwaState.canInstall = false
  try {
    await prompt.prompt()
    return (await prompt.userChoice).outcome === 'accepted'
  } catch {
    return false
  }
}

/** Wait until the complete new cache exists; never reload into a half-installed build. */
async function activateUpdate() {
  const reg = registration || await registrationPromise
  if (!reg) return false
  if (!reg.waiting) await reg.update()
  const worker = reg.installing
  if (worker) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('PWA installation timed out')), 60000)
      function finish(error) {
        clearTimeout(timeout)
        worker.removeEventListener('statechange', changed)
        if (error) reject(error)
        else resolve()
      }
      function changed() {
        if (worker.state === 'installed' || worker.state === 'activated') finish()
        else if (worker.state === 'redundant') finish(new Error('PWA installation failed'))
      }
      worker.addEventListener('statechange', changed)
      changed()
    })
  }
  if (!reg.waiting) return false
  pwaState.updating = true
  const waiting = reg.waiting
  // controllerchange normally reloads first. Surface activation failures instead of hanging.
  await new Promise((resolve, reject) => {
    const changed = () => { clearTimeout(timeout); resolve() }
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
      pwaState.updating = false
      reject(new Error('PWA activation timed out'))
    }, 15000)
    navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  })
  return true
}

export function applyPwaUpdate() {
  if (!activationPromise) activationPromise = activateUpdate().finally(() => { activationPromise = null })
  return activationPromise
}

export function usePwa() {
  return { pwaState, install }
}

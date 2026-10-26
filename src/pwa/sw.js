/* Build template, emitted as /<deployment>/sw.js by scripts/pwa.mjs. */
/* global BUILD */
/* __PWA_BUILD__ */

const SCOPE = new URL(self.registration.scope)
const PREFIX = `itabs-pwa:${encodeURIComponent(SCOPE.href)}:`
const CACHE = `${PREFIX}${BUILD.version}`
const URLS = BUILD.precache.map((entry) => new URL(entry, SCOPE).href)
const PRECACHE = new Set(URLS)
const SHELL = new URL(BUILD.shell, SCOPE).href

function inScope(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)
}

function excluded(url) {
  const relative = url.pathname.slice(SCOPE.pathname.length)
  return /(^|\/)api(?:\/|$)/i.test(relative) || /(^|\/)version\.json$/i.test(relative)
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      // Fetch everything before writing: a failed fetch must never leave a usable partial version.
      const responses = []
      for (const url of URLS) {
        const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin', redirect: 'error' }))
        if (!response.ok || response.type === 'opaque' || response.redirected) {
          throw new Error(`Precache failed: ${url}`)
        }
        responses.push(response)
      }
      const cache = await caches.open(CACHE)
      for (let index = 0; index < URLS.length; index++) {
        await cache.put(URLS[index], responses[index])
      }
      // No skipWaiting here: first installation activates naturally, updates wait for consent.
    } catch (error) {
      await caches.delete(CACHE)
      throw error
    }
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!inScope(url) || excluded(url)) return
  if (request.mode === 'navigate') {
    // Always use this worker's HTML, never a newer network shell with older JS/CSS.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      return await cache.match(SHELL) || new Response('App shell unavailable', { status: 503 })
    })())
    return
  }
  // Exact URL membership: queries and unrelated resources must not enter the cache.
  if (!PRECACHE.has(url.href)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    return await cache.match(url.href) || fetch(request)
  })())
})

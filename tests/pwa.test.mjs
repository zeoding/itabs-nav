import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { pwaPlugin } from '../scripts/pwa.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'itabs-pwa-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const publicDir = path.join(root, 'public')
  await mkdir(path.join(publicDir, 'icons'), { recursive: true })
  await writeFile(path.join(publicDir, 'favicon.ico'), 'favicon')
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.write('IHDR', 12)
  png.writeUInt32BE(192, 16)
  png.writeUInt32BE(192, 20)
  await writeFile(path.join(publicDir, 'icons', 'app icon.png'), png)
  await writeFile(path.join(publicDir, 'icons', 'ignored.svg'), '<svg/>')
  return { root, publicDir, base: './', build: {} }
}

function bundle(html = '<html>app-v1</html>') {
  return {
    'index.html': { type: 'asset', fileName: 'index.html', source: html },
    'js/app.js': { type: 'chunk', fileName: 'js/app.js', code: 'app-v1' },
    'js/lazy.js': { type: 'chunk', fileName: 'js/lazy.js', code: 'lazy-v1' },
    'css/app.css': { type: 'asset', fileName: 'css/app.css', source: new Uint8Array([65, 66]) },
    'fonts/a.woff2': { type: 'asset', fileName: 'fonts/a.woff2', source: new Uint8Array([1, 2]) },
    'nested/page.html': { type: 'asset', fileName: 'nested/page.html', source: '<html>nested</html>' },
    'version.json': { type: 'asset', fileName: 'version.json', source: '{}' },
    'api/data.js': { type: 'chunk', fileName: 'api/data.js', code: 'private' },
    'js/app.js.map': { type: 'asset', fileName: 'js/app.js.map', source: '{}' },
  }
}

async function build(config, outputs = bundle()) {
  const plugin = pwaPlugin()
  plugin.configResolved(config)
  const emitted = new Map()
  await plugin.generateBundle.handler.call({ emitFile: (asset) => emitted.set(asset.fileName, asset.source) }, {}, outputs)
  const source = emitted.get('sw.js')
  const metadata = JSON.parse(source.match(/const BUILD = (.*);/)[1])
  return { plugin, emitted, source, metadata }
}

// CacheStorage is shared by worker instances. Responses are cloned like the browser API.
function storage() {
  const data = new Map()
  let failPut = false
  return {
    data,
    set failPut(value) { failPut = value },
    async keys() { return [...data.keys()] },
    async delete(name) { return data.delete(name) },
    async open(name) {
      if (!data.has(name)) data.set(name, new Map())
      const entries = data.get(name)
      return {
        async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone() },
        async put(key, response) {
          if (failPut) throw new Error('quota exceeded')
          entries.set(typeof key === 'string' ? key : key.url, response.clone())
        },
      }
    },
  }
}

function worker(source, { scope = 'https://example.test/apps/nav/', caches = storage() } = {}) {
  const listeners = new Map()
  const calls = []
  const state = { offline: false, bad: null, skip: 0, claims: 0, label: 'network' }
  const self = {
    registration: { scope },
    clients: { async claim() { state.claims++ } },
    async skipWaiting() { state.skip++ },
    addEventListener(type, handler) { listeners.set(type, handler) },
  }
  vm.runInNewContext(source, {
    self, caches, URL, Request, Response, Set,
    async fetch(request) {
      const url = typeof request === 'string' ? request : request.url
      calls.push({ url, request })
      if (state.offline) throw new Error('offline')
      return new Response(`${state.label}:${url}`, { status: state.bad === url ? 500 : 200 })
    },
  })
  return {
    caches, calls, state, scope,
    async event(type, extra = {}) {
      const waits = []
      listeners.get(type)({ ...extra, waitUntil(promise) { waits.push(promise) } })
      await Promise.all(waits)
    },
    async request(url, options = {}) {
      let response
      listeners.get('fetch')({
        request: { url: new URL(url, scope).href, method: 'GET', mode: 'cors', ...options },
        respondWith(promise) { response = promise },
      })
      return response ? await response : undefined
    },
  }
}

test('build-only plugin emits relative manifest, complete deterministic precache and build hash', async (t) => {
  const config = await fixture(t)
  const first = await build(config)
  assert.equal(first.plugin.apply, 'build')
  assert.equal(first.plugin.generateBundle.order, 'post')
  assert.deepEqual([...first.emitted.keys()].sort(), ['manifest.webmanifest', 'sw.js'])
  const manifest = JSON.parse(first.emitted.get('manifest.webmanifest'))
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.icons[0].src, './icons/app%20icon.png')
  assert.equal(manifest.icons[0].sizes, '192x192')
  assert.deepEqual(first.metadata.precache, [
    './css/app.css', './favicon.ico', './fonts/a.woff2', './icons/app%20icon.png',
    './index.html', './js/app.js', './js/lazy.js', './manifest.webmanifest', './nested/page.html',
  ])
  assert.match(first.metadata.version, /^[a-f0-9]{64}$/)
  assert.equal(first.source.includes('__PWA_BUILD__'), false)
  const second = await build(config, Object.fromEntries(Object.entries(bundle()).reverse()))
  assert.equal(first.source, second.source)
  for (const [key, field] of [['index.html', 'source'], ['js/app.js', 'code'], ['css/app.css', 'source'], ['nested/page.html', 'source']]) {
    const changed = bundle()
    changed[key][field] = 'changed bytes'
    assert.notEqual((await build(config, changed)).metadata.version, first.metadata.version, key)
  }
  await writeFile(path.join(config.publicDir, 'favicon.ico'), 'new favicon')
  assert.notEqual((await build(config)).metadata.version, first.metadata.version)
})

test('HTML link works at root and nested entries; optional public files and collisions', async (t) => {
  const config = await fixture(t)
  const { plugin } = await build(config)
  const root = plugin.transformIndexHtml.handler('', { filename: path.join(config.root, 'index.html') })
  const nested = plugin.transformIndexHtml.handler('', { filename: path.join(config.root, 'nested/page.html') })
  assert.equal(root[0].attrs.href, './manifest.webmanifest')
  assert.equal(nested[0].attrs.href, '../manifest.webmanifest')
  assert.equal(root[0].attrs.rel, 'manifest')
  const noPublic = await build({ ...config, publicDir: false })
  assert.equal(noPublic.metadata.precache.includes('./favicon.ico'), false)
  await assert.rejects(build(config, {}), /index.html/)
  const collision = bundle()
  collision['sw.js'] = { type: 'asset', fileName: 'sw.js', source: 'other worker' }
  await assert.rejects(build(config, collision), /collision/)
})

test('install populates every scope-relative resource; initial activation does not require SKIP_WAITING', async (t) => {
  const { source, metadata } = await build(await fixture(t))
  const sw = worker(source)
  await sw.event('install')
  assert.equal(sw.state.skip, 0)
  assert.equal(sw.calls.length, metadata.precache.length)
  assert.deepEqual(sw.calls.map(({ url }) => url), metadata.precache.map((url) => new URL(url, sw.scope).href))
  assert.ok(sw.calls.every(({ request }) => request.cache === 'reload' && request.redirect === 'error'))
  assert.equal([...sw.caches.data.values()][0].size, metadata.precache.length)
  await sw.event('activate')
  assert.equal(sw.state.claims, 1)
  assert.equal(sw.state.skip, 0)
  await sw.event('message', { data: { type: 'IGNORE' } })
  assert.equal(sw.state.skip, 0)
  await sw.event('message', { data: { type: 'SKIP_WAITING' } })
  assert.equal(sw.state.skip, 1)
})

test('failed install or quota failure removes partial new version and preserves existing caches', async (t) => {
  const { source } = await build(await fixture(t))
  for (const failure of ['network', 'http', 'quota']) {
    const caches = storage()
    await caches.open('unrelated')
    const sw = worker(source, { caches })
    if (failure === 'network') sw.state.offline = true
    if (failure === 'http') sw.state.bad = new URL('./js/lazy.js', sw.scope).href
    if (failure === 'quota') caches.failPut = true
    await assert.rejects(sw.event('install'))
    assert.deepEqual(await caches.keys(), ['unrelated'])
    assert.equal(sw.state.skip, 0)
  }
})

test('offline navigation serves versioned shell; only exact static resources are intercepted', async (t) => {
  const { source } = await build(await fixture(t))
  const sw = worker(source)
  await sw.event('install')
  sw.state.offline = true
  const callsBefore = sw.calls.length
  const shell = `network:${sw.scope}index.html`
  for (const url of ['./', './route/deep?x=1', './index.html?x=1']) {
    assert.equal(await (await sw.request(url, { mode: 'navigate' })).text(), shell)
  }
  assert.equal(await (await sw.request('./js/lazy.js')).text(), `network:${sw.scope}js/lazy.js`)
  assert.equal(sw.calls.length, callsBefore)
  for (const [url, options] of [
    ['./api/users', { mode: 'navigate' }], ['./version.json', { mode: 'navigate' }],
    ['./nested/version.json', {}], ['./js/app.js?fresh=1', {}], ['./unknown.png', {}],
    ['https://third.test/app.js', {}], ['/other/index.html', { mode: 'navigate' }],
    ['/apps/nav-evil/index.html', { mode: 'navigate' }], ['./index.html', { method: 'POST', mode: 'navigate' }],
  ]) assert.equal(await sw.request(url, options), undefined, url)
})

test('new build waits, old worker retains old shell, activation cleans only exact scope namespace', async (t) => {
  const config = await fixture(t)
  const oldBuild = await build(config)
  const newBuild = await build(config, bundle('<html>app-v2</html>'))
  const caches = storage()
  const old = worker(oldBuild.source, { caches })
  const next = worker(newBuild.source, { caches })
  const neighbor = worker(oldBuild.source, { caches, scope: 'https://example.test/apps/nav-extra/' })
  old.state.label = 'old-build'
  next.state.label = 'new-build'
  await old.event('install')
  await neighbor.event('install')
  await caches.open('another-app')
  const oldName = (await caches.keys())[0]
  await next.event('install')
  assert.equal(next.state.skip, 0)
  assert.ok((await caches.keys()).includes(oldName))
  assert.equal(await (await old.request('./route', { mode: 'navigate' })).text(), `old-build:${old.scope}index.html`)
  await next.event('message', { data: { type: 'SKIP_WAITING' } })
  await next.event('activate')
  assert.equal(await (await next.request('./route', { mode: 'navigate' })).text(), `new-build:${next.scope}index.html`)
  assert.equal((await caches.keys()).includes(oldName), false)
  assert.equal((await caches.keys()).length, 3)
  assert.ok((await caches.keys()).includes('another-app'))
  neighbor.state.offline = true
  assert.equal((await neighbor.request('./js/app.js')).status, 200)
})

test('missing shell does not mix in network HTML; static miss uses network without runtime caching', async (t) => {
  const { source } = await build(await fixture(t))
  const sw = worker(source)
  const response = await sw.request('./route', { mode: 'navigate' })
  assert.equal(response.status, 503)
  assert.equal(sw.calls.length, 0)
  assert.equal((await sw.request('./js/app.js')).status, 200)
  assert.equal([...sw.caches.data.values()][0].size, 0)
})

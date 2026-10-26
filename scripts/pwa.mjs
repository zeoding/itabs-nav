import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const templateURL = new URL('../src/pwa/sw.js', import.meta.url)
const excluded = (name) => /(^|\/)api(?:\/|$)/i.test(name) || /(^|\/)version\.json$/i.test(name)
const bytes = (source) => Buffer.from(source)
const urlPath = (name) => name.split('/').map(encodeURIComponent).join('/')

async function optionalFile(file) {
  try { return await readFile(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Zero-dependency, build-only Vite plugin. Register the emitted ./sw.js separately. */
export function pwaPlugin() {
  let config
  return {
    name: 'itabs-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) { config = resolved },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        // Relative to each HTML output, never the origin root (base is './').
        const filename = context?.filename
          ? path.relative(config?.root ?? process.cwd(), context.filename).replaceAll('\\', '/')
          : 'index.html'
        const href = path.posix.relative(path.posix.dirname(filename), 'manifest.webmanifest')
        return [{ tag: 'link', attrs: { rel: 'manifest', href: href.startsWith('.') ? href : `./${href}` }, injectTo: 'head' }]
      },
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        if (!config) throw new Error('pwaPlugin requires Vite configResolved before generateBundle')
        const files = new Map()
        for (const output of Object.values(bundle)) {
          const name = output.fileName
          if (['sw.js', 'manifest.webmanifest'].includes(name)) throw new Error(`PWA output collision: ${name}`)
          if (excluded(name) || /\.map$/i.test(name)) continue
          files.set(name, bytes(output.type === 'chunk' ? output.code : output.source))
        }
        if (!files.has('index.html')) throw new Error('PWA requires an emitted index.html app shell')

        const icons = []
        if (config.publicDir !== false && config.build?.copyPublicDir !== false) {
          const publicDir = config.publicDir ?? path.resolve(config.root, 'public')
          const favicon = await optionalFile(path.join(publicDir, 'favicon.ico'))
          if (favicon) files.set('favicon.ico', favicon)
          let entries
          try { entries = await readdir(path.join(publicDir, 'icons'), { withFileTypes: true }) } catch (error) {
            if (error.code !== 'ENOENT') throw error
            entries = []
          }
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isFile() || !/\.png$/i.test(entry.name)) continue
            const data = await readFile(path.join(publicDir, 'icons', entry.name))
            const name = `icons/${entry.name}`
            files.set(name, data)
            const icon = { src: `./${urlPath(name)}`, type: 'image/png', purpose: entry.name.startsWith('maskable-') ? 'maskable' : 'any' }
            // PNG IHDR carries dimensions, so filenames need not follow a convention.
            if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.toString('ascii', 12, 16) === 'IHDR') {
              icon.sizes = `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`
            }
            icons.push(icon)
          }
        }
        const manifest = `${JSON.stringify({
          id: './', name: 'itabs导航页', short_name: 'itabs', lang: 'zh-CN',
          start_url: './', scope: './', display: 'standalone',
          background_color: '#ffffff', theme_color: '#6366f1', icons,
        }, null, 2)}\n`
        files.set('manifest.webmanifest', Buffer.from(manifest))
        const names = [...files.keys()].sort()
        const hash = createHash('sha256')
        // Length-prefixed records avoid ambiguous content/name concatenation.
        const template = await readFile(templateURL, 'utf8')
        hash.update(template)
        for (const name of names) {
          const content = files.get(name)
          hash.update(JSON.stringify([name, content.length])).update('\0').update(content)
        }
        const version = hash.digest('hex')
        const precache = names.map((name) => `./${urlPath(name)}`)
        const worker = template.replace('/* __PWA_BUILD__ */', `const BUILD = ${JSON.stringify({ version, precache, shell: './index.html' })};`)
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker })
      },
    },
  }
}

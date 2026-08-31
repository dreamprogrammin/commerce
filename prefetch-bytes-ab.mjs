// A/B по трафику: раскладка байтов по видам, с предзагрузкой и без.
import { chromium } from 'playwright'
const BLOCK = process.argv.includes('--block')
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

const urlById = new Map()
const kinds = new Map()
let blocked = 0
cdp.on('Network.requestWillBeSent', e => urlById.set(e.requestId, e.request.url))
cdp.on('Network.loadingFinished', (e) => {
  const u = urlById.get(e.requestId)
  if (!u) return
  const k = u.includes('_payload.json') ? 'payload'
    : /\.(js|mjs)(\?|$)/.test(u) ? 'script'
      : (/\.(webp|jpg|jpeg|png|avif|svg)(\?|$)/.test(u) || u.includes('/storage/')) ? 'image'
        : /\.(woff2?|ttf)(\?|$)/.test(u) ? 'font'
          : 'прочее'
  const v = kinds.get(k) || { n: 0, b: 0 }
  v.n++; v.b += e.encodedDataLength
  kinds.set(k, v)
})

if (BLOCK) {
  await p.route('**/_payload.json*', async (route) => {
    if (new URL(route.request().url()).pathname === '/_payload.json') return route.continue()
    blocked++
    await route.abort()
  })
}
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(700) }
await p.waitForTimeout(5000)

let total = 0
console.log(`\n${BLOCK ? 'БЕЗ предзагрузки' : 'как сейчас'}:`)
for (const [k, v] of [...kinds.entries()].sort((a, b) => b[1].b - a[1].b)) {
  total += v.b
  console.log(`  ${k.padEnd(8)} ${String(v.n).padStart(3)} запросов  ${String(Math.round(v.b / 1024)).padStart(4)} КБ`)
}
console.log(`  ИТОГО ${Math.round(total / 1024)} КБ${BLOCK ? `, отброшено ${blocked}` : ''}`)
await browser.close()

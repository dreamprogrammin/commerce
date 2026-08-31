// Во что обходится no-cache на варианте _card при повторном заходе.
import { chromium } from 'playwright'
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
let phase = 'первый'
const urlById = new Map(); const rows = []
cdp.on('Network.requestWillBeSent', e => urlById.set(e.requestId, { url: e.request.url, phase }))
cdp.on('Network.responseReceived', (e) => { const v = urlById.get(e.requestId); if (v) v.cached = e.response.fromDiskCache })
cdp.on('Network.loadingFinished', (e) => { const v = urlById.get(e.requestId); if (v) rows.push({ ...v, b: e.encodedDataLength }) })

const show = (name) => {
  const r = rows.filter(x => x.phase === name && (/\.webp/.test(x.url) || x.url.includes('/storage/')))
  const card = r.filter(x => /_card\.webp/.test(x.url))
  const other = r.filter(x => !/_card\.webp/.test(x.url))
  const kb = a => Math.round(a.reduce((s, x) => s + x.b, 0) / 1024)
  console.log(`\n── ${name} ──`)
  console.log(`  _card:      ${String(card.length).padStart(3)} запросов  ${String(kb(card)).padStart(4)} КБ`)
  console.log(`  остальные:  ${String(other.length).padStart(3)} запросов  ${String(kb(other)).padStart(4)} КБ`)
}

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
for (let y = 0; y <= 4000; y += 800) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(600) }
await p.waitForTimeout(3000)
show('первый')

phase = 'уход'
// панель прячется при скролле вниз — поднимаемся, чтобы вернуть её
await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }))
await p.waitForTimeout(400)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }))
await p.waitForTimeout(900)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
phase = 'возврат'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
for (let y = 0; y <= 4000; y += 800) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(600) }
await p.waitForTimeout(4000)
show('возврат')
await browser.close()

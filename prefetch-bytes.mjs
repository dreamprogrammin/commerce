// Реально переданные байты предзагрузки (encodedDataLength), а не
// content-length: Vercel отдаёт потоком и заголовка не ставит.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

const byId = new Map()
const totals = new Map()
cdp.on('Network.requestWillBeSent', e => byId.set(e.requestId, e.request.url))
cdp.on('Network.loadingFinished', (e) => {
  const url = byId.get(e.requestId)
  if (!url) return
  let key
  try { key = new URL(url).pathname } catch { return }
  const kind = url.includes('_payload.json') ? 'payload' : (/\.(js|mjs)(\?|$)/.test(url) ? 'script' : (/\.(webp|jpg|jpeg|png|avif|svg)(\?|$)/.test(url) || url.includes('/storage/') ? 'image' : 'other'))
  const v = totals.get(key) || { n: 0, b: 0, kind }
  v.n++; v.b += e.encodedDataLength
  totals.set(key, v)
})

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(15000)
const snap = () => {
  const sum = { payload: { n: 0, b: 0 }, script: { n: 0, b: 0 }, image: { n: 0, b: 0 }, other: { n: 0, b: 0 } }
  let dup = 0
  for (const v of totals.values()) {
    sum[v.kind].n += v.n; sum[v.kind].b += v.b
    if (v.n > 1 && v.kind === 'payload') dup += v.b - v.b / v.n
  }
  return { sum, dup }
}
const a = snap()
console.log(`=== ${BASE}, без прокрутки ===`)
for (const [k, v] of Object.entries(a.sum)) console.log(`  ${k.padEnd(8)} ${String(v.n).padStart(3)} запросов  ${String(Math.round(v.b / 1024)).padStart(4)} КБ`)
console.log(`  из предзагрузки впустую на повторах: ${Math.round(a.dup / 1024)} КБ`)
console.log('\n  повторяющиеся:')
for (const [k, v] of [...totals.entries()].filter(([, v]) => v.n > 1 && v.kind === 'payload').sort((x, y) => y[1].b - x[1].b))
  console.log(`    ${v.n}× ${String(Math.round(v.b / 1024)).padStart(4)} КБ  ${k.slice(0, 50)}`)

for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(700) }
await p.waitForTimeout(5000)
const b = snap()
console.log(`\n=== после прокрутки до низа ===`)
for (const [k, v] of Object.entries(b.sum)) console.log(`  ${k.padEnd(8)} ${String(v.n).padStart(3)} запросов  ${String(Math.round(v.b / 1024)).padStart(4)} КБ`)
console.log(`  из предзагрузки впустую на повторах: ${Math.round(b.dup / 1024)} КБ`)
await browser.close()

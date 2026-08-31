// Предзагрузка маршрутов: сколько и чего Nuxt тянет за ссылки в кадре.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

const hits = new Map()
p.on('response', async (r) => {
  const u = r.url()
  if (!u.includes('_payload.json')) return
  let size = 0
  try { size = Number((await r.headerValue('content-length')) || 0) } catch {}
  const key = new URL(u).pathname
  const v = hits.get(key) || { n: 0, kb: 0, statuses: [] }
  v.n++; v.kb += size / 1024; v.statuses.push(r.status())
  hits.set(key, v)
})

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(15000)
console.log('=== без прокрутки ===')
let total = 0, dup = 0
for (const [k, v] of [...hits.entries()].sort((a, b) => b[1].kb - a[1].kb)) {
  total += v.kb
  if (v.n > 1) dup += v.kb - v.kb / v.n
  console.log(`  ${String(v.n).padStart(2)}× ${String(Math.round(v.kb)).padStart(4)} КБ  ${k.slice(0, 52)}  ${v.n > 1 ? '← ПОВТОРЫ' : ''}`)
}
console.log(`  итого ${Math.round(total)} КБ, из них впустую на повторах ${Math.round(dup)} КБ`)

hits.clear()
for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(700) }
await p.waitForTimeout(4000)
console.log('\n=== добавилось при прокрутке до низа ===')
let t2 = 0
for (const [k, v] of [...hits.entries()].sort((a, b) => b[1].kb - a[1].kb).slice(0, 12)) { t2 += v.kb; console.log(`  ${String(v.n).padStart(2)}× ${String(Math.round(v.kb)).padStart(4)} КБ  ${k.slice(0, 52)}`) }
console.log(`  ещё ${Math.round(t2)} КБ за ${[...hits.values()].reduce((a, v) => a + v.n, 0)} запросов`)
await browser.close()

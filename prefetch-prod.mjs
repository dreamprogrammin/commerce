// Предзагрузка на проде: сколько запросов, какие коды, сколько байт.
import { chromium } from 'playwright'
const SCROLL = process.argv.includes('--scroll')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
const byId = new Map()
const rows = []
cdp.on('Network.requestWillBeSent', e => byId.set(e.requestId, e.request.url))
cdp.on('Network.responseReceived', (e) => { const u = byId.get(e.requestId); if (u) byId.set(e.requestId, { url: u, status: e.response.status }) })
cdp.on('Network.loadingFinished', (e) => {
  const v = byId.get(e.requestId)
  if (!v || typeof v === 'string') return
  rows.push({ url: v.url, status: v.status, b: e.encodedDataLength })
})
await p.goto('https://uhti.kz/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
const conn = await p.evaluate(() => { const c = navigator.connection; return c ? `${c.effectiveType} saveData=${c.saveData}` : 'нет' })
if (SCROLL) { for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(700) } ; await p.waitForTimeout(5000) }

const pay = rows.filter(r => r.url.includes('_payload.json'))
const byPath = new Map()
for (const r of pay) { const k = new URL(r.url).pathname; const v = byPath.get(k) || { n: 0, b: 0, st: new Set() }; v.n++; v.b += r.b; v.st.add(r.status); byPath.set(k, v) }
const total = pay.reduce((a, r) => a + r.b, 0)
let dup = 0
for (const v of byPath.values()) if (v.n > 1) dup += v.b - v.b / v.n
console.log(`connection: ${conn}${SCROLL ? ', с прокруткой до низа' : ', без прокрутки'}`)
console.log(`payload-запросов ${pay.length}, уникальных ${byPath.size}, суммарно ${Math.round(total / 1024)} КБ, впустую на повторах ${Math.round(dup / 1024)} КБ`)
for (const [k, v] of [...byPath.entries()].sort((a, b) => b[1].b - a[1].b).slice(0, 8))
  console.log(`  ${String(v.n).padStart(2)}× ${String(Math.round(v.b / 1024)).padStart(4)} КБ  ${[...v.st].join('/')}  ${k.slice(0, 46)}`)
const all = rows.reduce((a, r) => a + r.b, 0)
console.log(`\nвсего передано за сессию: ${Math.round(all / 1024)} КБ, доля предзагрузки ${Math.round(total / all * 100)}%`)
await browser.close()

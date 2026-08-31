// Продолжение аудита: чем на самом деле являются «нелениво загружаемые»
// картинки, во что обходятся скрипты и шрифты.
import { chromium } from 'playwright'
const BASE = 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

const res = []
p.on('response', async (r) => {
  let size = 0
  try { size = Number((await r.headerValue('content-length')) || 0) } catch {}
  res.push({ url: r.url(), type: r.request().resourceType(), size })
})
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)

const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map((el) => {
  const r = el.getBoundingClientRect()
  const src = el.currentSrc || el.src || ''
  return { lazy: el.loading === 'lazy', data: src.startsWith('data:'), top: Math.round(r.top + scrollY), src: src.slice(0, 40) }
}))
const eager = imgs.filter(i => !i.lazy)
console.log('=== 5 картинок без loading="lazy" ===')
for (const i of eager) console.log(`  y=${String(i.top).padStart(5)}  ${i.data ? 'data: URI (подложка, сети не стоит)' : 'СЕТЬ  ' + i.src}`)

console.log('\n=== скрипты ===')
const scripts = res.filter(r => r.type === 'script')
const sizes = scripts.map(s => s.size).sort((a, b) => b - a)
console.log(`  запросов ${scripts.length}, суммарно ${Math.round(sizes.reduce((a, b) => a + b, 0) / 1024)} КБ`)
console.log(`  мельче 5 КБ: ${sizes.filter(s => s < 5120).length}, мельче 1 КБ: ${sizes.filter(s => s < 1024).length}`)
console.log(`  крупнейшие: ${sizes.slice(0, 6).map(s => Math.round(s / 1024) + 'КБ').join(', ')}`)

console.log('\n=== шрифты ===')
for (const f of res.filter(r => r.type === 'font')) console.log(`  ${Math.round(f.size / 1024)} КБ  ${f.url.split('/').pop().slice(0, 50)}`)

console.log('\n=== запросы к данным ===')
for (const f of res.filter(r => r.type === 'fetch' || r.type === 'xhr')) {
  const u = new URL(f.url)
  console.log(`  ${String(Math.round(f.size / 1024)).padStart(4)} КБ  ${u.pathname.slice(0, 40)}${u.search.slice(0, 40)}`)
}
await browser.close()

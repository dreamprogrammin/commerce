// Смещаются ли секции при пролистывании вниз.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const isDesktop = process.argv.includes('--desktop')
const ctx = await browser.newContext(isDesktop
  ? { viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
console.log(isDesktop ? 'десктоп 1280×900' : 'мобилка 390×844')
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__cls = 0
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
const pos = () => p.evaluate(() => {
  const o = {}
  for (const h of document.querySelector('.home-content').querySelectorAll('h2')) o[h.textContent.trim().slice(0, 18)] = Math.round(h.getBoundingClientRect().top + scrollY)
  return { o, h: Math.round(document.body.scrollHeight) }
})
const b = await pos()
for (let y = 400; y <= 6000; y += 400) { await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(350) }
await p.waitForTimeout(1500)
const a = await pos()
console.log(`высота: ${b.h} → ${a.h}`)
let moved = 0
for (const [k, v] of Object.entries(a.o)) {
  const d = b.o[k] === undefined ? null : v - b.o[k]
  if (d) moved++
  console.log(`  ${d === null ? '(новая)' : d === 0 ? 'на месте' : `СДВИГ ${d > 0 ? '+' : ''}${d}`}   ${k}`)
}
console.log(`сдвинулось: ${moved} | CLS: ${await p.evaluate(() => +window.__cls.toFixed(4))}`)
await browser.close()

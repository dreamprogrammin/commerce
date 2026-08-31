// Кто именно сдвигается: разбор CLS по источникам.
import { chromium } from 'playwright'
const DESK = process.argv.includes('--desktop')
const [w, h, dpr] = DESK ? [1280, 900, 2] : [390, 844, 3]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: !DESK, hasTouch: !DESK, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__cls = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      window.__cls.push({
        v: e.value,
        t: Math.round(e.startTime),
        src: (e.sources || []).map(s => ({
          tag: s.node ? (s.node.tagName || '') + (s.node.className && typeof s.node.className === 'string' ? '.' + s.node.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : '?',
          txt: s.node?.textContent?.trim().slice(0, 30) || '',
          from: Math.round(s.previousRect?.top ?? 0),
          to: Math.round(s.currentRect?.top ?? 0),
        })),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
// прокручиваем — секции ниже экрана разворачиваются именно здесь
for (let y = 0; y <= 7000; y += 400) {
  await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y)
  await p.waitForTimeout(400)
}
await p.waitForTimeout(3000)
const cls = await p.evaluate(() => window.__cls)
const total = cls.reduce((a, c) => a + c.v, 0)
console.log(`${DESK ? 'десктоп' : 'мобилка'}: CLS ${total.toFixed(4)}, сдвигов ${cls.length}\n`)
for (const c of cls.sort((a, b) => b.v - a.v).slice(0, 8)) {
  console.log(`  ${c.v.toFixed(4)} на ${c.t} мс`)
  for (const s of c.src.slice(0, 3)) console.log(`      ${s.tag.slice(0, 42)}  ${s.from} → ${s.to}   «${s.txt}»`)
}
await browser.close()

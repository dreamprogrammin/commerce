import { chromium } from 'playwright'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
const p = await c.newPage()
await p.goto('https://localhost:3111/catalog', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)
for (let y = 0; y <= 4000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(400) }
await p.waitForTimeout(1500)
const r = await p.evaluate(() => {
  // ближайший заголовок выше плитки
  const out = []
  for (const el of document.querySelectorAll('[style*="--ct-tint"]')) {
    const t = getComputedStyle(el).getPropertyValue('--ct-tint').trim()
    let n = el, h = null
    while (n && !h) { n = n.parentElement; h = n?.querySelector?.('h2') }
    out.push(`${(h?.textContent || '?').trim().slice(0, 16).padEnd(18)} ${t}`)
  }
  return [...new Set(out)]
})
console.log('секции каталога:'); for (const x of r) console.log('   ' + x)
await b.close()

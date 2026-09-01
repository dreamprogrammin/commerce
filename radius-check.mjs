import { chromium } from 'playwright'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
const p = await c.newPage()
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)
console.log(await p.evaluate(() => {
  const el = document.querySelector('.mbn-lens__pill')
  if (!el) return 'линзы нет'
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return `radius=${cs.borderRadius} размер=${Math.round(r.width)}×${Math.round(r.height)}`
}))
await b.close()

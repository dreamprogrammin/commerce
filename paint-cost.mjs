// Что делает отрисовку главной дорогой: слои, дорогие свойства, наблюдатели.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const r = await p.evaluate(() => {
  const all = [...document.querySelectorAll('*')]
  const hit = { 'backdrop-filter': [], 'filter': [], 'will-change': [], 'transform': [], 'position: sticky': [], 'box-shadow': [], 'border-radius + overflow': [], 'opacity < 1': [] }
  for (const el of all) {
    const c = getComputedStyle(el)
    const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
    if (c.backdropFilter && c.backdropFilter !== 'none') hit['backdrop-filter'].push(tag)
    if (c.filter && c.filter !== 'none') hit['filter'].push(tag)
    if (c.willChange && c.willChange !== 'auto') hit['will-change'].push(tag)
    if (c.transform && c.transform !== 'none') hit['transform'].push(tag)
    if (c.position === 'sticky') hit['position: sticky'].push(tag)
    if (c.boxShadow && c.boxShadow !== 'none') hit['box-shadow'].push(tag)
    if (parseFloat(c.opacity) < 1) hit['opacity < 1'].push(tag)
    if (c.borderRadius !== '0px' && (c.overflow === 'hidden' || c.overflowX === 'auto')) hit['border-radius + overflow'].push(tag)
  }
  return { total: all.length, hit: Object.fromEntries(Object.entries(hit).map(([k, v]) => [k, { n: v.length, sample: [...new Set(v)].slice(0, 3) }])) }
})

console.log(`узлов всего: ${r.total}\n`)
console.log('свойство'.padEnd(26), 'узлов'.padStart(6), '  примеры')
for (const [k, v] of Object.entries(r.hit).sort((a, b) => b[1].n - a[1].n)) {
  if (!v.n) continue
  console.log(k.padEnd(26), String(v.n).padStart(6), '  ' + v.sample.map(s => s.slice(0, 26)).join(', '))
}
await browser.close()

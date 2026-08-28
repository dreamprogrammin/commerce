// Сколько узлов появляется по мере прохода страницы до низа.
import { chromium } from 'playwright'
const BASE = 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const snap = async (label) => {
  const r = await p.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    cards: document.querySelectorAll('.pc-card').length,
    imgs: document.querySelectorAll('img').length,
  }))
  console.log(`${label.padEnd(22)} узлов ${String(r.nodes).padStart(5)}  карточек ${String(r.cards).padStart(4)}  картинок ${String(r.imgs).padStart(4)}`)
  return r
}
await snap('первый экран')
for (const y of [1500, 3000, 4500, 6000, 7300]) {
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y)
  await p.waitForTimeout(2500)
  await snap(`прокрутили до ${y}`)
}
// карусели: сколько товаров в каждой, если пролистать
const car = await p.evaluate(() => [...document.querySelectorAll('.home-content section, .home-content > div')].map(el => {
  const h2 = el.querySelector('h2'); const n = el.querySelectorAll('.pc-card').length
  return n ? { name: h2?.textContent.trim().slice(0, 28) || '?', n } : null
}).filter(Boolean))
console.log('\nкарточки по секциям:', car.map(c => `${c.name}=${c.n}`).join(', '))
await browser.close()

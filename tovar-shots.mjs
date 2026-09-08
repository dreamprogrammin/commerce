// Снимки страницы товара по макету Товар.dc.html.
import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/55af8941-0e66-410c-bfb7-8a8049dadce7/scratchpad'
const PROD = 'https://gvsdevsvzgcivpphcuai.supabase.co'
const MODE = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'desktop'
const SLUG = process.argv.find(a => a.startsWith('--slug='))?.slice(7)
  || 'trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey'
const TAG = process.argv.find(a => a.startsWith('--tag='))?.slice(6) || MODE
const view = MODE === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 }
const b = await chromium.launch()
const ctx = await b.newContext({ ...view, bypassCSP: true })
await ctx.route('**/storage/v1/object/public/**', async (r) => {
  const u = new URL(r.request().url())
  if (u.host.includes('supabase.co')) return r.continue()
  try { const f = await fetch(PROD + u.pathname); await r.fulfill({ status: f.status, contentType: 'image/webp', body: Buffer.from(await f.arrayBuffer()) }) } catch { await r.fulfill({ status: 404, body: '' }) }
})
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
const p = await ctx.newPage()
await p.goto(`http://localhost:3004/catalog/products/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForSelector('.pg-stage'); await p.waitForTimeout(12000)
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600)
await p.screenshot({ path: `${SC}/tv-${TAG}-top.png` })
console.log(TAG, await p.evaluate(() => {
  const z = document.querySelector('.pg-zoom-cta')
  const bt = document.querySelector('.pdp-bonus-text')
  return {
    'кнопка Увеличить видна': z ? getComputedStyle(z).display !== 'none' : false,
    'курсор ленты': getComputedStyle(document.querySelector('.pg-slider')).cursor,
    'тень слайда': getComputedStyle(document.querySelector('.pg-slide')).filter.slice(0, 46),
    'бонус фон': getComputedStyle(document.querySelector('.pdp-bonus')).backgroundImage.slice(0, 64),
    'бонус заливка': bt ? getComputedStyle(bt).webkitTextFillColor : null,
  }
}))
await b.close()

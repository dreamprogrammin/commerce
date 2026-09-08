// Снимки просмотра фото: как выглядит по макету PhotoViewer.dc.html.
import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/55af8941-0e66-410c-bfb7-8a8049dadce7/scratchpad'
const MODE = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'desktop'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3003'
const view = MODE === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const b = await chromium.launch()
const ctx = await b.newContext({ ...view, bypassCSP: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
// локальные бакеты пусты — картинки берём с боевого хранилища, только чтение
await ctx.route('**/storage/v1/object/public/**', async (route) => {
  const u = new URL(route.request().url())
  if (u.host.includes('supabase.co'))
    return route.continue()
  try {
    const f = await fetch('https://gvsdevsvzgcivpphcuai.supabase.co' + u.pathname)
    await route.fulfill({ status: f.status, contentType: 'image/webp', body: Buffer.from(await f.arrayBuffer()) })
  }
  catch { await route.fulfill({ status: 404, body: '' }) }
})
const p = await ctx.newPage()
await p.goto(`${BASE}/catalog/products/trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForSelector('.pg-stage'); await p.waitForTimeout(11000)
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400)
const box = await p.locator('.pg-stage').boundingBox()
await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await p.waitForTimeout(2600)
await p.screenshot({ path: `${SC}/pv-${MODE}-open.png` })       // с подсказкой
await p.waitForTimeout(2600)                                     // подсказка гаснет
await p.screenshot({ path: `${SC}/pv-${MODE}-rest.png` })
await p.locator('.pv-zoom').click()                              // увеличение
await p.waitForTimeout(900)
await p.screenshot({ path: `${SC}/pv-${MODE}-zoom.png` })
console.log('снимки готовы')
await b.close()

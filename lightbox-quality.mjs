// Какой вариант картинки показывает лайтбокс и во сколько это обходится.
import { chromium } from 'playwright'
const PROD = 'https://gvsdevsvzgcivpphcuai.supabase.co'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3005'
const MODE = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'mobile'
const SLUG = 'trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey'
const view = MODE === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const b = await chromium.launch()
const mirror = new Map()
const ctx = await b.newContext({ ...view, bypassCSP: true })
await ctx.route('**/storage/v1/object/public/**', async (r) => {
  const u = new URL(r.request().url())
  if (u.host.includes('supabase.co')) return r.continue()
  const key = PROD + u.pathname
  try {
    let hit = mirror.get(key)
    if (!hit) { const f = await fetch(key); hit = { status: f.status, body: Buffer.from(await f.arrayBuffer()) }; mirror.set(key, hit) }
    await r.fulfill({ status: hit.status, contentType: 'image/webp', body: hit.body })
  } catch { await r.fulfill({ status: 404, body: '' }) }
})
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
const p = await ctx.newPage()
const rows = []
p.on('response', async (r) => {
  const u = r.url()
  if (!u.includes('/product-images/') || !u.includes('bozhya-korovka-296y')) return
  let size = 0
  try { size = Number((await r.headerValue('content-length')) || 0) } catch {}
  rows.push({ f: u.split('/').pop(), size })
})
await p.goto(`${BASE}/catalog/products/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForSelector('.pg-stage'); await p.waitForTimeout(12000)
const before = rows.length
await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await p.waitForFunction(() => { const i = document.querySelector('[role="dialog"] .pv-img'); return i && i.naturalWidth > 0 }, null, { timeout: 60000 })
await p.waitForTimeout(3500)
const opened = rows.slice(before)
const kb = a => (a.reduce((s, r) => s + r.size, 0) / 1024).toFixed(0)
console.log(`\n${MODE} ${view.viewport.width}px DPR${view.deviceScaleFactor}`)
console.log('  вариант в кадре:', await p.evaluate(() => {
  const i = document.querySelector('[role="dialog"] .pv-img')
  return `${(i.currentSrc || '').split('/').pop()?.slice(-12)}  natural ${i.naturalWidth}×${i.naturalHeight}`
}))
console.log(`  открытие лайтбокса: +${opened.length} файлов, +${kb(opened)} КБ`)
opened.forEach(r => console.log(`     ${(r.size / 1024).toFixed(1).padStart(6)} КБ  ${r.f.slice(-18)}`))
await b.close()

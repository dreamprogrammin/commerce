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
/*
 * Подмена картинок нужна только когда локальные бакеты пусты. Включать её
 * флагом --mirror, а не всегда: `ctx.route` ОТКЛЮЧАЕТ браузерный кеш для
 * перехваченных запросов, даже при простом `continue()`. Из-за этого
 * предзагрузка и последующая подмена одного и того же файла считаются двумя
 * закачками — на первом замере просмотру приписалось вдвое больше, чем он
 * берёт на самом деле.
 */
const MIRROR = process.argv.includes('--mirror')
if (MIRROR) await ctx.route('**/storage/v1/object/public/**', async (r) => {
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
// дожидаемся тишины: иначе хвост загрузки страницы попадёт в счёт открытия
// (на первом замере так и вышло — два лишних файла приписались просмотру)
let quiet = 0
let seen = rows.length
while (quiet < 5) {
  await p.waitForTimeout(400)
  if (rows.length === seen) quiet++
  else { quiet = 0; seen = rows.length }
}
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
const byKind = k => opened.filter(r => r.f.includes(k))
console.log(`     из них кадры: md ${byKind('_md').length} шт / ${kb(byKind('_md'))} КБ, lg ${byKind('_lg').length} шт / ${kb(byKind('_lg'))} КБ; миниатюры sm ${byKind('_sm').length} шт / ${kb(byKind('_sm'))} КБ`)

// листаем на следующий кадр — он тоже обязан дойти до полного размера
const beforeNext = rows.length
await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  const next = [...d.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Следующее фото')
  if (next) next.click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
})
await p.waitForTimeout(4000)
const afterNext = rows.slice(beforeNext)
console.log(`  пролистали на кадр 2: +${afterNext.length} файлов, +${kb(afterNext)} КБ`)
afterNext.forEach(r => console.log(`     ${(r.size / 1024).toFixed(1).padStart(6)} КБ  ${r.f.slice(-18)}`))
console.log('  вариант в кадре 2:', await p.evaluate(() => {
  const im = document.querySelector('[role="dialog"] .pv-img:nth-of-type(1)')
  const all = [...document.querySelectorAll('[role="dialog"] .pv-img')]
  const i = all.findIndex(x => x.getAttribute('fetchpriority') === 'high')
  const cur = all[i] || im
  return `${(cur.currentSrc || '').split('/').pop()?.slice(-12)}  natural ${cur.naturalWidth}×${cur.naturalHeight}`
}))
await b.close()

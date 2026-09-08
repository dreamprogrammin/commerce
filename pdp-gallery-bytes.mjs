// Сколько весит галерея товара при загрузке страницы: кадры отдельно от миниатюр.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3002'
const MODE = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'mobile'
const SLUG = 'trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey'
const view = MODE === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const b = await chromium.launch()
const ctx = await b.newContext({ ...view, bypassCSP: true })
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
const frames = rows.filter(r => /_md\.webp|_lg\.webp|_card\.webp/.test(r.f))
const thumbs = rows.filter(r => /_sm\.webp/.test(r.f))
const kb = a => (a.reduce((s, r) => s + r.size, 0) / 1024).toFixed(0)
console.log(`\n${MODE} ${view.viewport.width}px DPR${view.deviceScaleFactor} — ${BASE}`)
console.log(`  кадров галереи скачано: ${frames.length} (${kb(frames)} КБ)`)
frames.forEach(r => console.log(`     ${(r.size / 1024).toFixed(1).padStart(5)} КБ  ${r.f.slice(-18)}`))
console.log(`  миниатюр скачано:       ${thumbs.length} (${kb(thumbs)} КБ)`)
console.log(`  ВСЕГО по галерее:       ${rows.length} файлов, ${kb(rows)} КБ`)

// сколько стоит открыть лайтбокс
const before = rows.length
await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await p.waitForTimeout(9000)
const lb = rows.slice(before)
console.log(`  открытие лайтбокса:     +${lb.length} файлов, +${kb(lb)} КБ`)
await b.close()

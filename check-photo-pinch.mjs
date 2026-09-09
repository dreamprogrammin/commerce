// Щипок двумя пальцами в полноэкранном просмотре фото.
// Playwright не умеет мультитач напрямую — шлём touchPoints через CDP,
// браузер сам разворачивает их в pointer-события.
import { chromium } from 'playwright'

const SC = '/tmp/claude-1000/-home-malik-projects-commerce/55af8941-0e66-410c-bfb7-8a8049dadce7/scratchpad'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3004'
const SLUG = 'trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey'
const PROD = 'https://gvsdevsvzgcivpphcuai.supabase.co'

let fails = 0
function ok(name, pass, detail = '') {
  if (!pass) fails++
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true })
const mirror = new Map()
await ctx.route('**/storage/v1/object/public/**', async (r) => {
  const u = new URL(r.request().url())
  if (u.host.includes('supabase.co')) return r.continue()
  const key = PROD + u.pathname
  try {
    let hit = mirror.get(key)
    if (!hit) {
      const f = await fetch(key)
      hit = { status: f.status, body: Buffer.from(await f.arrayBuffer()) }
      mirror.set(key, hit)
    }
    await r.fulfill({ status: hit.status, contentType: 'image/webp', body: hit.body })
  }
  catch { await r.fulfill({ status: 404, body: '' }) }
})
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
const p = await ctx.newPage()
const fullSizeRequests = []
p.on('request', (r) => {
  const u = r.url()
  if (u.includes('/product-images/') && u.includes('_lg.webp'))
    fullSizeRequests.push(u)
})
const cdp = await ctx.newCDPSession(p)

await p.goto(`${BASE}/catalog/products/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForSelector('.pg-stage'); await p.waitForTimeout(12000)
await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await p.waitForSelector('[role="dialog"] .pv-img', { timeout: 60000 })
// без загруженной картинки natural = 0, и ограничение сдвига считалось бы по
// габаритам блока, а не по нарисованной фотографии — проверка была бы мнимой
await p.waitForFunction(() => {
  const i = document.querySelector('[role="dialog"] .pv-img')
  return i && i.naturalWidth > 0
}, null, { timeout: 60000 })
await p.waitForTimeout(900)

const state = () => p.evaluate(() => {
  const img = document.querySelector('[role="dialog"] .pv-img')
  const t = getComputedStyle(img).transform
  const m = new DOMMatrixReadOnly(t)
  return { zoom: Math.round(m.a * 100) / 100, x: Math.round(m.e), y: Math.round(m.f),
    counter: document.querySelector('[role="dialog"] .pv-counter')?.textContent?.trim() }
})
ok('просмотр открылся', (await state()).counter?.startsWith('1 /'))

async function touch(type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i })) })
}
// щипок: разводим пальцы от центра
async function pinch(cx, cy, from, to, steps = 12) {
  await touch('touchStart', [[cx - from, cy], [cx + from, cy]])
  for (let i = 1; i <= steps; i++) {
    const r = from + ((to - from) * i) / steps
    await touch('touchMove', [[cx - r, cy], [cx + r, cy]])
    await p.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await p.waitForTimeout(700)
}

const box = await p.locator('.pv-stage').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

const before = await state()
await pinch(cx, cy, 40, 150)
const zoomed = await state()
console.log(`     масштаб ${before.zoom} → ${zoomed.zoom}`)
ok('щипок увеличивает', zoomed.zoom > before.zoom + 0.2, `${before.zoom} → ${zoomed.zoom}`)
await p.screenshot({ path: `${SC}/pinch-zoomed.png` })

// панорамирование одним пальцем в увеличенном кадре
const beforePan = await state()
await touch('touchStart', [[cx, cy]])
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - i * 12, cy]]); await p.waitForTimeout(16) }
await touch('touchEnd', [])
await p.waitForTimeout(600)
const panned = await state()
ok('одним пальцем возит увеличенный кадр', Math.abs(panned.x - beforePan.x) > 30, `сдвиг ${beforePan.x} → ${panned.x}`)
ok('кадр при этом не пролистался', panned.counter === beforePan.counter, panned.counter)

// щипком обратно — должно вернуться к единице и сбросить сдвиг
await pinch(cx, cy, 150, 30)
const back = await state()
ok('щипок обратно возвращает исходный размер', back.zoom === 1, `масштаб ${back.zoom}`)
ok('сдвиг сброшен', back.x === 0 && back.y === 0, `${back.x},${back.y}`)

// свайп одним пальцем на неувеличенном кадре по-прежнему листает
await touch('touchStart', [[cx + 120, cy]])
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx + 120 - i * 20, cy]]); await p.waitForTimeout(16) }
await touch('touchEnd', [])
await p.waitForTimeout(900)
ok('свайп листает как раньше', (await state()).counter === '2 / 14', (await state()).counter)

// Быстрое пролистывание не должно заказывать полный размер каждому кадру:
// «пробежаться в поисках нужного фото» стоило столько же, сколько вдумчивый
// просмотр (8 листаний рывком = 8 полноразмерных файлов), а лишние закачки
// отнимали канал у того кадра, на котором в итоге остановились — на 3G он
// доходил до резкости 953мс вместо 522мс.
await p.keyboard.press('Escape')
await p.waitForTimeout(1200)
await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await p.waitForFunction(() => {
  const i = document.querySelector('[role="dialog"] .pv-img')
  return i && i.naturalWidth > 0
}, null, { timeout: 60000 })
await p.waitForTimeout(2500)
const beforeFlick = new Set(fullSizeRequests).size
for (let i = 0; i < 6; i++) {
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(120)
}
await p.waitForTimeout(4000)
const flickCost = new Set(fullSizeRequests).size - beforeFlick
ok('быстрое пролистывание не тянет полный размер каждому кадру', flickCost <= 2,
  `за 6 листаний рывком запрошено полноразмерных: ${flickCost}`)

/*
 * Закрытие обязано доигрываться, а не обрываться. Раньше `v-if` стоял на самом
 * Teleport: окно снималось из DOM в тот же кадр, и уходу негде было
 * проиграться — открытие плавное, закрытие обрыв. Ловим полукадры: должен
 * найтись момент, когда окно ещё в DOM, но уже полупрозрачное.
 */
await p.keyboard.press('Escape')
await p.waitForTimeout(1200)
await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await p.waitForFunction(() => !!document.querySelector('.pv-root'), null, { timeout: 60000 })
await p.waitForTimeout(1500)
const closeFilm = await p.evaluate(async () => {
  const film = []
  const t0 = performance.now()
  let done
  const ready = new Promise((r) => { done = r })
  const tick = () => {
    const el = document.querySelector('.pv-root')
    film.push({ t: Math.round(performance.now() - t0), есть: !!el, o: el ? Number(getComputedStyle(el).opacity) : null })
    if (performance.now() - t0 < 900) requestAnimationFrame(tick)
    else done()
  }
  requestAnimationFrame(tick)
  document.querySelector('.pv-root')?.querySelectorAll('button').forEach((b) => {
    if (b.getAttribute('aria-label') === 'Закрыть') b.click()
  })
  await ready
  return film
})
const midFade = closeFilm.filter(f => f.есть && f.o > 0.02 && f.o < 0.98).length
const goneAt = closeFilm.find(f => !f.есть)?.t ?? null
ok('закрытие плавное, а не обрывом', midFade >= 3, `полупрозрачных кадров: ${midFade}`)
ok('окно всё же снимается из DOM', goneAt !== null && goneAt < 700, goneAt === null ? 'не снялось за 900мс' : `через ${goneAt}мс`)

await p.screenshot({ path: `${SC}/pinch-after.png` })

// --- мышиный путь: он переехал на ту же модель translate+scale ---------------
const dctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, bypassCSP: true })
await dctx.route('**/storage/v1/object/public/**', async (r) => {
  const u = new URL(r.request().url())
  if (u.host.includes('supabase.co')) return r.continue()
  const key = PROD + u.pathname
  try {
    let hit = mirror.get(key)
    if (!hit) { const f = await fetch(key); hit = { status: f.status, body: Buffer.from(await f.arrayBuffer()) }; mirror.set(key, hit) }
    await r.fulfill({ status: hit.status, contentType: 'image/webp', body: hit.body })
  }
  catch { await r.fulfill({ status: 404, body: '' }) }
})
const d = await dctx.newPage()
await d.goto(`${BASE}/catalog/products/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await d.waitForSelector('.pg-stage'); await d.waitForTimeout(12000)
await d.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.pg-slide').click() })
await d.waitForFunction(() => {
  const i = document.querySelector('[role="dialog"] .pv-img')
  return i && i.naturalWidth > 0
}, null, { timeout: 60000 })
await d.waitForTimeout(900)
const dstate = () => d.evaluate(() => {
  const img = document.querySelector('[role="dialog"] .pv-img')
  const m = new DOMMatrixReadOnly(getComputedStyle(img).transform)
  return { zoom: Math.round(m.a * 100) / 100, x: Math.round(m.e) }
})
const dbox = await d.locator('.pv-stage').boundingBox()
ok('мышью: до клика масштаб 1', (await dstate()).zoom === 1)
await d.mouse.click(dbox.x + dbox.width * 0.35, dbox.y + dbox.height * 0.4)
await d.waitForTimeout(700)
const clicked = await dstate()
ok('мышью: клик увеличивает', clicked.zoom > 1, `масштаб ${clicked.zoom}`)
ok('мышью: увеличено не по центру, а по точке клика', clicked.x !== 0, `сдвиг ${clicked.x}`)
await d.mouse.move(dbox.x + dbox.width * 0.8, dbox.y + dbox.height * 0.5)
await d.waitForTimeout(500)
const scanned = await dstate()
ok('мышью: наведение водит по картинке', scanned.x !== clicked.x, `${clicked.x} → ${scanned.x}`)
/*
 * Зажатая мышь в увеличенном кадре НЕ должна возить картинку: возка — жест
 * мобильный. Поведение здесь ровно то, что было до щипка (сверено запуском
 * сборки на 64c2872): протяжка засчитывается браузером за клик и гасит
 * увеличение. Проверяем именно это, чтобы возка мышью не приползла обратно.
 */
await d.mouse.move(dbox.x + dbox.width * 0.8, dbox.y + dbox.height * 0.5)
await d.waitForTimeout(300)
await d.mouse.down()
for (let i = 1; i <= 8; i++) {
  await d.mouse.move(dbox.x + dbox.width * 0.8 - i * ((dbox.width * 0.55) / 8), dbox.y + dbox.height * 0.6)
  await d.waitForTimeout(20)
}
await d.mouse.up()
await d.waitForTimeout(600)
const dragged = await dstate()
ok('мышью: протяжка в увеличенном кадре не возит картинку', dragged.zoom === 1 && dragged.x === 0,
  `масштаб ${dragged.zoom}, сдвиг ${dragged.x}`)

await d.mouse.click(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2)
await d.waitForTimeout(700)
ok('мышью: клик снова увеличивает', (await dstate()).zoom > 1)

console.log(fails === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${fails}`)
await b.close()
process.exit(fails === 0 ? 0 : 1)

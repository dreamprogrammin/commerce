// Проверка галереи товара: клик мышью, драг, вес на загрузке, лайтбокс.
// Локальный dev-сервер + подмена пустого локального хранилища на боевое
// (только чтение картинок): иначе локально бакеты пусты и мерить нечего.
import { chromium } from 'playwright'

const SC = process.env.SC || '/tmp/claude-1000/-home-malik-projects-commerce/55af8941-0e66-410c-bfb7-8a8049dadce7/scratchpad'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'
const MODE = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'desktop'
const SLUG = process.argv.find(a => a.startsWith('--slug='))?.slice(7)
  || 'trenazhyor-igra-3-v-1-bozhya-korovka-296y-skakalka-kolcebros-raketa-muzyka-i-pult-dlya-aktivnyh-detey'
const PROD_STORAGE = 'https://gvsdevsvzgcivpphcuai.supabase.co'

const view = MODE === 'mobile'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

let fails = 0
function ok(name, pass, detail = '') {
  if (!pass)
    fails++
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...view, ignoreHTTPSErrors: true, bypassCSP: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) }
  catch {}
})

// картинки берём с боевого хранилища, всё остальное — с локального сервера
const mirror = new Map()
await ctx.route('**/storage/v1/object/public/**', async (route) => {
  const u = new URL(route.request().url())
  if (u.host.includes('supabase.co'))
    return route.continue()
  const target = PROD_STORAGE + u.pathname + u.search
  try {
    let hit = mirror.get(target)
    if (!hit) {
      const r = await fetch(target)
      hit = { status: r.status, ct: r.headers.get('content-type') || 'image/webp', body: Buffer.from(await r.arrayBuffer()) }
      mirror.set(target, hit)
    }
    await route.fulfill({ status: hit.status, contentType: hit.ct, headers: { 'content-length': String(hit.body.length) }, body: hit.body })
  }
  catch {
    await route.fulfill({ status: 404, body: '' })
  }
})

const p = await ctx.newPage()
const img = []
p.on('response', async (r) => {
  if (!/product-images/.test(r.url()))
    return
  let size = 0
  try { size = Number((await r.headerValue('content-length')) || 0) }
  catch {}
  img.push({ f: r.url().split('/').pop(), size, status: r.status() })
})
p.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 180)))

await p.goto(`${BASE}/catalog/products/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForSelector('.pg-stage', { timeout: 90000 })
await p.waitForTimeout(10000)
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(500)

console.log(`\n=== ${MODE} ${view.viewport.width}×${view.viewport.height} DPR${view.deviceScaleFactor} — ${BASE} ===`)

// 1. вес на загрузке
const framesLoaded = await p.evaluate(() =>
  [...document.querySelectorAll('.pg-slide img:not([aria-hidden])')].filter(i => i.naturalWidth > 0 && !(i.currentSrc || '').startsWith('data:')).length)
const slideCount = await p.evaluate(() => document.querySelectorAll('.pg-slide').length)
const bytes = img.reduce((a, r) => a + r.size, 0)
console.log(`кадров в галерее: ${slideCount}; файлов товара скачано: ${img.length} (${(bytes / 1024).toFixed(0)} КБ)`)
ok('на загрузке грузятся не все кадры', framesLoaded <= 2, `загружено кадров: ${framesLoaded} из ${slideCount}`)

// 2. дальние кадры показывают блюр, а не серый прямоугольник
const farBlur = await p.evaluate(() => {
  const slides = [...document.querySelectorAll('.pg-slide')]
  const far = slides[slides.length - 1]
  return { hasBlurImg: !!far?.querySelector('img[aria-hidden="true"]'), src: (far?.querySelector('img[aria-hidden="true"]')?.getAttribute('src') || '').slice(0, 22) }
})
ok('у дальнего кадра осталась размытая подложка', farBlur.hasBlurImg, farBlur.src)

// 3. клик мышью открывает лайтбокс
const b = await p.locator('.pg-stage').boundingBox()
await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
await p.waitForTimeout(2200)
let opened = await p.evaluate(() => !!document.querySelector('[role="dialog"]'))
if (!opened) {
  const diag = await p.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y)
    const chain = []
    let n = e
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) chain.push(`${n.tagName}.${(n.className || '').toString().slice(0, 30)}`)
    return { chain, mounted: !!document.querySelector('#__nuxt')?.__vue_app__, scrollY }
  }, [b.x + b.width / 2, b.y + b.height / 2])
  console.log('     диагностика:', JSON.stringify(diag))
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await p.waitForTimeout(2200)
  const second = await p.evaluate(() => !!document.querySelector('[role="dialog"]'))
  console.log('     повторный клик открыл:', second)
  opened = second
}
ok('клик мышью по фото открывает лайтбокс', opened)

if (opened) {
  const fit = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const im = [...d.querySelectorAll('.pv-img')].find(i => i.naturalWidth > 0)
    const r = im.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), vw: innerWidth, vh: innerHeight }
  })
  ok('фото в лайтбоксе влезает по ширине', fit.left >= 0 && fit.left + fit.w <= fit.vw, `${fit.w}×${fit.h} at ${fit.left},${fit.top} / окно ${fit.vw}×${fit.vh}`)
  ok('фото в лайтбоксе влезает по высоте', fit.top >= 0 && fit.top + fit.h <= fit.vh, `низ на ${fit.top + fit.h}, окно ${fit.vh}`)
  // «влезает» мало: до фикса дескрипторов srcset картинка ужималась до 224px
  // посреди чёрного экрана — формально влезала. Сверяемся не с окном (по
  // макету белая карточка ограничена 820px и полосы по бокам — это норма),
  // а с самой карточкой: кадр обязан занимать её целиком.
  const fill = await p.evaluate(() => {
    const card = document.querySelector('.pv-card')
    const im = document.querySelector('.pv-img')
    const cs = getComputedStyle(card)
    const cw = card.getBoundingClientRect().width - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight)
    const ch = card.getBoundingClientRect().height - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom)
    const r = im.getBoundingClientRect()
    return { cw: Math.round(cw), ch: Math.round(ch), iw: Math.round(r.width), ih: Math.round(r.height) }
  })
  ok('кадр занимает карточку целиком', fill.iw >= fill.cw * 0.98 && fill.ih >= fill.ch * 0.98, `кадр ${fill.iw}×${fill.ih} в карточке ${fill.cw}×${fill.ch}`)

  // Стрелки-кнопки по макету только на широком экране
  const arrowsVisible = await p.evaluate(() => {
    const a = document.querySelector('.pv-arrow--next')
    return a ? getComputedStyle(a).display !== 'none' : false
  })
  ok(MODE === 'desktop' ? 'стрелки-кнопки есть на десктопе' : 'стрелок-кнопок нет на телефоне', MODE === 'desktop' ? arrowsVisible : !arrowsVisible)

  const lbLoaded = await p.evaluate(() => {
    const im = [...document.querySelectorAll('[role="dialog"] .pv-img')]
    return { total: im.length, loaded: im.filter(i => i.naturalWidth > 0).length }
  })
  ok('лайтбокс не тянет все кадры разом', lbLoaded.loaded <= 6, `загружено ${lbLoaded.loaded} из ${lbLoaded.total}`)

  // шапка не поверх: сравниваем пиксель там, где она была
  const px = await p.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, 20)
    const dlg = document.querySelector('[role="dialog"]')
    const zDlg = Number(getComputedStyle(dlg).zIndex)
    const tops = [...document.querySelectorAll('*')].filter((e) => {
      const c = getComputedStyle(e)
      return (c.position === 'fixed' || c.position === 'sticky') && e.getBoundingClientRect().top < 90 && e.getBoundingClientRect().height > 20 && !dlg.contains(e) && e !== dlg && Number(c.zIndex) >= zDlg
    }).map(e => `${e.tagName}#${e.id || '-'}.${(e.className || '').toString().split(' ')[0]}=z${getComputedStyle(e).zIndex}`)
    // панель Nuxt DevTools живёт только в dev — она не про боевую вёрстку
    // оверлеи vue/nuxt devtools живут только в dev — они не про боевую вёрстку
    const real = tops.filter(t => !/devtools|vue-tracer|nuxt-island/i.test(t))
    return { zDlg, above: real, all: tops, atTop: el?.tagName }
  })
  ok('шапка/плашка не перекрывают просмотр', px.above.length === 0, `z лайтбокса ${px.zDlg}; выше или вровень: ${px.above.join(', ') || 'нет'} (все: ${px.all.join(', ') || 'нет'})`)
  await p.screenshot({ path: `${SC}/fix-${MODE}-lightbox.png` })

  // счётчик и крестик видимы
  const chrome = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const counter = d.querySelector('.pv-counter')
    const r = counter?.getBoundingClientRect()
    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    return { counterText: counter?.textContent?.trim(), hitIsCounter: hit === counter || counter?.contains(hit) }
  })
  ok('счётчик кадров виден поверх', chrome.hitIsCounter, chrome.counterText)

  // стрелки на клавиатуре внутри лайтбокса
  const before = await p.evaluate(() => document.querySelector('[role="dialog"] .pv-counter')?.textContent?.trim())
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(900)
  const afterArrow = await p.evaluate(() => document.querySelector('[role="dialog"] .pv-counter')?.textContent?.trim())
  ok('стрелки листают лайтбокс', before === '1 / 14' && afterArrow === '2 / 14', `${before} → ${afterArrow}`)
  await p.keyboard.press('ArrowLeft')
  await p.waitForTimeout(900)

  // пролистать до 3-го и закрыть — лента должна пойти следом
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(700)
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(1000)
  // сверяемся с тем кадром, который лайтбокс показывает на самом деле:
  // сколько раз нажалась стрелка — дело плавающее, а синхронизация нет
  const shown = await p.evaluate(() => Number((document.querySelector('[role="dialog"] .pv-counter')?.textContent || '').split('/')[0].trim()))
  await p.keyboard.press('Escape')
  await p.waitForTimeout(1500)
  const sync = await p.evaluate(() => ({
    dot: [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')),
    scrollLeft: Math.round(document.querySelector('.pg-slider').scrollLeft),
    clientW: document.querySelector('.pg-slider').clientWidth,
  }))
  ok('после закрытия лента встала на тот же кадр', shown > 1 && sync.dot === shown - 1 && Math.abs(sync.scrollLeft - (shown - 1) * sync.clientW) < 8, `в лайтбоксе был кадр ${shown}, лента: ${JSON.stringify(sync)}`)
}

// 4. драг мышью листает
await p.evaluate(() => { const s = document.querySelector('.pg-slider'); s.scrollTo({ left: 0 }); window.scrollTo(0, 0) })
await p.waitForTimeout(900)
const b2 = await p.locator('.pg-stage').boundingBox()
const cy = b2.y + b2.height / 2
const from = b2.x + b2.width - 40
const dist = Math.round(b2.width * 0.75)
await p.mouse.move(from, cy)
await p.mouse.down()
const trace = []
for (let i = 1; i <= 16; i++) {
  await p.mouse.move(from - (dist * i) / 16, cy)
  trace.push(await p.evaluate(() => Math.round(document.querySelector('.pg-slider').scrollLeft)))
}
await p.mouse.up()
await p.waitForTimeout(1400)
const afterDrag = await p.evaluate(() => ({
  scrollLeft: Math.round(document.querySelector('.pg-slider').scrollLeft),
  clientW: document.querySelector('.pg-slider').clientWidth,
  dot: [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')),
  snap: getComputedStyle(document.querySelector('.pg-slider')).scrollSnapType,
}))
console.log(`  scrollLeft во время драга: ${trace.join(' ')}`)
ok('драг мышью двигает ленту', trace[trace.length - 1] > 20)
ok('драг мышью долистывает до следующего кадра', afterDrag.dot === 1 && Math.abs(afterDrag.scrollLeft - afterDrag.clientW) < 8, JSON.stringify(afterDrag))
ok('снап вернулся после драга', afterDrag.snap.includes('mandatory'), afterDrag.snap)

// 4a. короткая протяжка и рывок тоже должны листать.
// До фикса кадр менялся только после протяжки больше ПОЛОВИНЫ кадра (405px из
// 810), а скорость не учитывалась вовсе — со стороны «иногда не листается».
async function dragBy(px, steps, pause) {
  await p.evaluate(() => { const s = document.querySelector('.pg-slider'); s.scrollTo({ left: 0, behavior: 'auto' }); window.scrollTo(0, 0) })
  await p.waitForTimeout(1100)
  const bx = await p.locator('.pg-stage').boundingBox()
  const y = bx.y + bx.height / 2
  const from = bx.x + bx.width - 60
  await p.mouse.move(from, y)
  await p.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(from - (px * i) / steps, y)
    if (pause) await p.waitForTimeout(pause)
  }
  await p.mouse.up()
  await p.waitForTimeout(1500)
  return p.evaluate(() => [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')))
}
ok('короткая протяжка (100px) листает', await dragBy(100, 10, 12) === 1)
ok('быстрый рывок (120px) листает', await dragBy(120, 3, 0) === 1)
ok('случайное дрожание (25px) не листает', await dragBy(25, 6, 12) === 0)

// 4b. свайп пальцем (лента листается нативно — mouse-обработчики её не трогают)
if (MODE === 'mobile') {
  await p.evaluate(() => { document.querySelector('.pg-slider').scrollTo({ left: 0 }); window.scrollTo(0, 0) })
  await p.waitForTimeout(900)
  const sb = await p.locator('.pg-stage').boundingBox()
  const sy = sb.y + sb.height / 2
  await p.touchscreen.tap(sb.x + sb.width / 2, sy)
  await p.waitForTimeout(1500)
  const tapOpened = await p.evaluate(() => !!document.querySelector('[role="dialog"]'))
  ok('тап пальцем открывает лайтбокс', tapOpened)
  if (tapOpened) { await p.keyboard.press('Escape'); await p.waitForTimeout(1000) }
  const snapAfterTap = await p.evaluate(() => getComputedStyle(document.querySelector('.pg-slider')).scrollSnapType)
  ok('после тапа привязка кадров на месте', snapAfterTap.includes('mandatory'), snapAfterTap)
  await p.evaluate(() => { const s = document.querySelector('.pg-slider'); s.scrollTo({ left: 0 }); window.scrollTo(0, 0) })
  await p.waitForTimeout(900)
  await p.evaluate(() => document.querySelector('.pg-slider').scrollBy({ left: document.querySelector('.pg-slider').clientWidth, behavior: 'smooth' }))
  await p.waitForTimeout(1600)
  const afterSwipe = await p.evaluate(() => ({
    dot: [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')),
    thumb: [...document.querySelectorAll('.pg-thumb')].findIndex(t => t.classList.contains('pg-thumb--active')),
  }))
  ok('прокрутка ленты ведёт точки и миниатюры', afterSwipe.dot === 1 && afterSwipe.thumb === 1, JSON.stringify(afterSwipe))
}

// 4c. клик по дальней миниатюре должен доезжать до неё, а не до соседней
await p.evaluate(() => { document.querySelector('.pg-slider').scrollTo({ left: 0 }); window.scrollTo(0, 0) })
await p.waitForTimeout(900)
const thumbs = await p.evaluate(() => document.querySelectorAll('.pg-thumb').length)
const target = Math.min(9, thumbs - 1)
await p.evaluate(i => document.querySelectorAll('.pg-thumb')[i].click(), target)
await p.waitForTimeout(2200)
const afterThumb = await p.evaluate(() => ({
  dot: [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')),
  frame: Math.round(document.querySelector('.pg-slider').scrollLeft / document.querySelector('.pg-slider').clientWidth),
}))
ok(`клик по миниатюре №${target + 1} доезжает до неё`, afterThumb.dot === target && afterThumb.frame === target, JSON.stringify(afterThumb))

// 5. клик по плашке скидки
const badge = await p.locator('.pg-discount').boundingBox().catch(() => null)
if (badge) {
  await p.mouse.click(badge.x + badge.width / 2, badge.y + badge.height / 2)
  await p.waitForTimeout(1500)
  ok('клик по плашке скидки открывает лайтбокс', await p.evaluate(() => !!document.querySelector('[role="dialog"]')))
  await p.keyboard.press('Escape')
  await p.waitForTimeout(900)
}
else {
  console.log('  (у товара нет скидки — плашку не проверить)')
}

// 6. клавиатура
await p.evaluate(() => document.querySelector('.pg-slider').focus())
await p.keyboard.press('Enter')
await p.waitForTimeout(1600)
ok('лайтбокс открывается с клавиатуры (Enter)', await p.evaluate(() => !!document.querySelector('[role="dialog"]')))
await p.keyboard.press('Escape')
await p.waitForTimeout(900)
await p.evaluate(() => { document.querySelector('.pg-slider').scrollTo({ left: 0 }); document.querySelector('.pg-slider').focus() })
await p.waitForTimeout(600)
await p.keyboard.press('ArrowRight')
await p.waitForTimeout(1000)
ok('стрелка вправо листает ленту', await p.evaluate(() => [...document.querySelectorAll('.pg-dot')].findIndex(d => d.classList.contains('pg-dot--active')) === 1))

await p.screenshot({ path: `${SC}/fix-${MODE}-page.png` })
console.log(fails === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${fails}`)
await browser.close()
process.exit(fails === 0 ? 0 : 1)

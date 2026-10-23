/*
 * «Скидки — мозаика» на главной (макет DiscountMosaic.dc.html, 23 октября 2026).
 *
 * Серверная разметка:
 *  1) секция стоит между «Популярными категориями» и «Популярными брендами»
 *     (ищется только внутри `.home-content`: в подвале есть свои одноимённые
 *     секции);
 *  2) заголовок «<Сезон> скидки до N%», и N — наибольшая плашка из плиток, а
 *     не цифра из макета;
 *  3) плитки ведут на товары, цена со скидкой ниже старой, мелкие плитки между
 *     крупными идут парами (иначе дыра в двухстрочной сетке);
 *  4) «Смотреть все» — на `/catalog/promotions`;
 *  5) кадров в разметке нет: без этого на телефоне при медленной сети 12
 *     кадров ленты качались до DOMContentLoaded (замер 23.10.2026, `--perf`).
 * Браузер, 1440 и 390 (нумерация своя):
 *  5) размеры из макета: плитки 132×186 и 272×380 (на телефоне 104×166 и
 *     216×340), радиус карточки 24 (на телефоне 0 и во всю ширину экрана);
 *  6) стрелки: на телефоне их нет; на десктопе «назад» скрыта в начале ленты,
 *     «вперёд» листает; кадры есть только у плиток рядом с видимой частью
 *     ленты и добавляются при листании;
 *  7) протяжка мышью листает ленту и не открывает товар под курсором, а
 *     обычный клик открывает;
 *  8) нет горизонтальной прокрутки страницы и ошибок консоли / гидратации.
 *
 *   node check-discount-mosaic.mjs --base=http://localhost:3157 [--shots=<папка>]
 *   node check-discount-mosaic.mjs --base=... --perf   — какие картинки ленты
 *     качаются до DOMContentLoaded и до load на 390px, Slow 4G, CPU ×4
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const BASE = arg('base') || 'http://localhost:3157'
const SHOTS = arg('shots')
const PERF = process.argv.includes('--perf')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;| /g, ' ').replace(/\s+/g, ' ').trim()
const money = text => Number(String(text).replace(/\D/g, ''))

async function serverChecks() {
  console.log(`\n== серверная разметка ${BASE}/`)
  const html = await (await fetch(`${BASE}/`)).text()
  const content = html.slice(html.indexOf('home-content'))
  const iCats = content.indexOf('Популярные категории')
  const iMosaic = content.indexOf('id="dm-title"')
  const iBrands = content.indexOf('Популярные бренды')
  check(iMosaic > 0, 'секция есть в серверной разметке')
  if (iMosaic < 0)
    return
  check(iCats > 0 && iCats < iMosaic && iMosaic < iBrands, 'место — между «Популярными категориями» и «Популярными брендами»')

  const start = content.lastIndexOf('<section', iMosaic)
  const section = content.slice(start, content.indexOf('</section>', iMosaic))
  const title = plain(section.match(/id="dm-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '')
  const tm = title.match(/^(Зимние|Весенние|Летние|Осенние) скидки до (\d+)%$/)
  check(Boolean(tm), `заголовок «${title}»`)

  const tiles = section.split('<a ').slice(1).filter(a => /class="dm-tile/.test(a)).map((a) => {
    const href = a.match(/href="([^"]+)"/)?.[1] ?? ''
    return {
      href,
      big: /dm-tile--big/.test(a.slice(0, a.indexOf('>'))),
      percent: Number(a.match(/class="dm-badge"[^>]*>\s*−(\d+)%/)?.[1] ?? Number.NaN),
      now: money(a.match(/class="dm-price__now"[^>]*>([^<]+)</)?.[1] ?? ''),
      old: money(a.match(/class="dm-price__old"[^>]*>([^<]+)</)?.[1] ?? ''),
      img: /<img[^>]+class="dm-img"/.test(a) || /<img[^>]+dm-img/.test(a),
    }
  })
  console.log(`  плиток ${tiles.length}, крупных ${tiles.filter(t => t.big).length}`)
  check(tiles.length > 0 && tiles.length <= 19, 'плиток от 1 до 19')
  check(tiles.every(t => /^\/catalog\/products\/[\w-]+$/.test(t.href)), 'каждая плитка ведёт на страницу товара')
  check(tiles.every(t => t.percent > 0 && t.now > 0 && t.old > t.now), 'у каждой плитки плашка −N% и цена ниже старой')
  check(tiles.every(t => !t.img), 'кадров в серверной разметке нет — вставляются, когда лента подходит к экрану')
  const max = Math.max(...tiles.map(t => t.percent))
  check(tm && Number(tm[2]) === max, `«до ${tm?.[2]}%» = наибольшая плашка (${max}%)`)
  const runs = tiles.map(t => (t.big ? '|' : 's')).join('').split('|')
  check(runs.every(r => r.length % 2 === 0), `мелкие между крупными парами (${runs.map(r => r.length).join(', ')})`)
  check(/href="\/catalog\/promotions"[^>]*class="dm-more"|class="dm-more"[^>]*href="\/catalog\/promotions"/.test(section)
    || /<a[^>]*href="\/catalog\/promotions"[^>]*>[\s\S]*?Смотреть все/.test(section), '«Смотреть все» ведёт на /catalog/promotions')

  const data = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
  console.log(`  вес: HTML ${(html.length / 1024).toFixed(1)} КБ, секция ${(section.length / 1024).toFixed(1)} КБ, __NUXT_DATA__ ${(data.length / 1024).toFixed(1)} КБ`)
}

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

async function open(browser, viewport, opts = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: opts.dpr ?? 1,
    isMobile: Boolean(opts.mobile),
    hasTouch: Boolean(opts.mobile),
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || /hydration/i.test(m.text()))
      errors.push(m.text())
  })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.locator('.dm-card').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  return { context, page, errors }
}

function geometry(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.dm-card')
    const rail = document.querySelector('.dm-rail')
    const big = document.querySelector('.dm-tile--big')
    const small = document.querySelector('.dm-tile:not(.dm-tile--big)')
    const cs = el => getComputedStyle(el)
    const box = el => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null
    const op = sel => { const el = document.querySelector(sel); return el ? { display: cs(el).display, opacity: cs(el).opacity } : null }
    return {
      cardW: Math.round(card.getBoundingClientRect().width),
      radius: cs(card).borderTopLeftRadius,
      padding: cs(card).padding,
      title: { size: cs(document.querySelector('.dm-title')).fontSize, weight: cs(document.querySelector('.dm-title')).fontWeight, text: document.querySelector('.dm-title').textContent.trim() },
      big: box(big),
      small: box(small),
      gap: cs(rail).columnGap,
      prev: op('.dm-arrow--prev'),
      next: op('.dm-arrow--next'),
      more: document.querySelector('.dm-more').innerText.trim(),
      pageW: document.documentElement.scrollWidth,
      scrollLeft: rail.scrollLeft,
      badge: { bg: cs(document.querySelector('.dm-badge')).backgroundColor, size: cs(document.querySelector('.dm-badge')).fontSize },
      nowColor: cs(document.querySelector('.dm-price__now')).color,
    }
  })
}

async function desktopChecks(browser) {
  console.log('\n== браузер 1440')
  const { context, page, errors } = await open(browser, DESKTOP)
  const g = await geometry(page)
  console.log(`  ${JSON.stringify(g)}`)
  check(g.radius === '24px' && g.padding === '28px 32px 30px', `карточка: радиус ${g.radius}, поля ${g.padding}`)
  check(g.small?.w === 132 && g.small?.h === 186, `мелкая плитка ${g.small?.w}×${g.small?.h} (макет 132×186)`)
  check(!g.big || (g.big.w === 272 && g.big.h === 380), `крупная плитка ${g.big?.w}×${g.big?.h} (макет 272×380)`)
  check(g.gap === '8px', `зазор ленты ${g.gap}`)
  check(g.title.size === '36px' && g.title.weight === '800', `заголовок ${g.title.size}/${g.title.weight} (макет: clamp(26px,2.6vw,36px), 800)`)
  check(g.more === 'Смотреть все', `кнопка «${g.more}»`)
  check(g.prev?.opacity === '0' && g.next?.opacity === '1', `в начале ленты «назад» скрыта (${g.prev?.opacity}), «вперёд» видна (${g.next?.opacity})`)
  check(g.pageW <= DESKTOP.width, `без горизонтальной прокрутки страницы (${g.pageW})`)
  if (SHOTS)
    await page.locator('.dm-wrap').screenshot({ path: `${SHOTS}/mosaic-1440.png` })

  const frames = () => page.evaluate(() => ({ imgs: document.querySelectorAll('.dm-img').length, tiles: document.querySelectorAll('.dm-tile').length }))
  const framesBefore = await frames()
  check(framesBefore.imgs > 0 && framesBefore.imgs < framesBefore.tiles, `кадры только у плиток рядом с видимой частью ленты (${framesBefore.imgs} из ${framesBefore.tiles})`)

  await page.locator('.dm-arrow--next button').click()
  await page.waitForTimeout(700)
  const afterArrow = await geometry(page)
  check(afterArrow.scrollLeft > 200, `«вперёд» пролистала ленту на ${afterArrow.scrollLeft}px`)
  check(afterArrow.prev?.opacity === '1', '«назад» появилась')
  const framesAfter = await frames()
  check(framesAfter.imgs > framesBefore.imgs, `после листания кадров больше (${framesBefore.imgs} → ${framesAfter.imgs})`)
  await page.locator('.dm-arrow--prev button').click()
  await page.waitForTimeout(700)

  // Протяжка мышью: старт на мелкой плитке в видимой части ленты.
  const rail = await page.locator('.dm-rail').boundingBox()
  const x = rail.x + rail.width * 0.6
  const y = rail.y + rail.height * 0.3
  const before = await page.evaluate(() => document.querySelector('.dm-rail').scrollLeft)
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 15; i++)
    await page.mouse.move(x - i * 20, y)
  await page.mouse.up()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => document.querySelector('.dm-rail').scrollLeft)
  check(after - before > 200, `протяжка на 300px сдвинула ленту на ${after - before}px`)
  check(new URL(page.url()).pathname === '/', `после протяжки остались на главной (${new URL(page.url()).pathname})`)

  // Обычный клик по видимой плитке открывает товар.
  const href = await page.evaluate(() => {
    const rail = document.querySelector('.dm-rail').getBoundingClientRect()
    const tile = [...document.querySelectorAll('.dm-tile')].find((t) => {
      const r = t.getBoundingClientRect()
      return r.left >= rail.left && r.right <= rail.right
    })
    tile?.setAttribute('data-check', '1')
    return tile?.getAttribute('href')
  })
  await page.locator('.dm-tile[data-check="1"]').click()
  await page.waitForURL(u => new URL(u).pathname === href, { timeout: 15000 }).catch(() => {})
  check(new URL(page.url()).pathname === href, `клик открыл товар (${new URL(page.url()).pathname.slice(0, 60)})`)

  check(errors.length === 0, `ошибок консоли и гидратации: ${errors.length}${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`)
  await context.close()
}

async function phoneChecks(browser) {
  console.log('\n== браузер 390 (DPR 3, тач)')
  const { context, page, errors } = await open(browser, PHONE, { dpr: 3, mobile: true })
  const g = await geometry(page)
  console.log(`  ${JSON.stringify(g)}`)
  check(g.cardW === PHONE.width && g.radius === '0px', `карточка во всю ширину (${g.cardW}), радиус ${g.radius}`)
  check(g.padding === '22px 12px 16px', `поля карточки ${g.padding} (макет 22 12 16)`)
  check(g.small?.w === 104 && g.small?.h === 166, `мелкая плитка ${g.small?.w}×${g.small?.h} (макет 104×166)`)
  check(!g.big || (g.big.w === 216 && g.big.h === 340), `крупная плитка ${g.big?.w}×${g.big?.h} (макет 216×340)`)
  check(g.title.size === '26px', `заголовок ${g.title.size}`)
  check(g.more === 'Все', `кнопка «${g.more}»`)
  check(g.prev?.display === 'none' && g.next?.display === 'none', 'стрелок нет')
  check(g.pageW <= PHONE.width, `без горизонтальной прокрутки страницы (${g.pageW})`)

  // Какой вариант картинки выбран для видимых плиток при DPR 3.
  await page.waitForTimeout(1500)
  const imgs = await page.evaluate(() => [...document.querySelectorAll('.dm-tile')].slice(0, 5).map(t => ({
    big: t.classList.contains('dm-tile--big'),
    src: (t.querySelector('img')?.currentSrc || '').split('/').pop(),
    loaded: (t.querySelector('img')?.naturalWidth || 0) > 0,
  })))
  console.log(`  кадры: ${JSON.stringify(imgs)}`)
  check(imgs.every(i => i.loaded), 'кадры видимых плиток загрузились')
  check(imgs.filter(i => !i.big).every(i => /_sm\.webp$/.test(i.src)), 'мелкие плитки берут вариант sm (400px)')
  if (SHOTS)
    await page.locator('.dm-wrap').screenshot({ path: `${SHOTS}/mosaic-390.png` })
  check(errors.length === 0, `ошибок консоли и гидратации: ${errors.length}${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`)
  await context.close()
}

async function perfCheck(browser) {
  console.log('\n== картинки ленты до DCL и load (390, DPR 3, Slow 4G, CPU ×4), три прогона')
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(`${BASE}/?perf=${run}`, { waitUntil: 'load', timeout: 120000 })
    const r = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const files = new Set([...document.querySelectorAll('.dm-img')].flatMap(i => [i.getAttribute('src'), ...(i.getAttribute('srcset') || '').split(',').map(s => s.trim().split(' ')[0])]).filter(Boolean))
      const res = performance.getEntriesByType('resource').filter(e => files.has(e.name))
      const imgs = performance.getEntriesByType('resource').filter(e => e.initiatorType === 'img')
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd || performance.now()),
        mosaicBeforeDcl: res.filter(e => e.startTime < nav.domContentLoadedEventEnd).length,
        mosaicBeforeLoad: res.length,
        imagesBeforeLoad: imgs.length,
      }
    })
    console.log(`  прогон ${run}: DCL ${r.dcl} мс, load ${r.load} мс; картинок ленты до DCL ${r.mosaicBeforeDcl}, до load ${r.mosaicBeforeLoad} (всего картинок до load ${r.imagesBeforeLoad})`)
    if (run === 1)
      check(r.mosaicBeforeDcl === 0, `картинки ленты не качаются до DOMContentLoaded (${r.mosaicBeforeDcl})`)
    await context.close()
  }
}

console.log(`сайт ${BASE}`)
await serverChecks()
const browser = await chromium.launch()
try {
  if (PERF) {
    await perfCheck(browser)
  }
  else {
    await desktopChecks(browser)
    await phoneChecks(browser)
  }
}
finally {
  await browser.close()
}
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nВсё зелёное')
process.exit(fails.length ? 1 : 0)

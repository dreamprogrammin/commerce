/*
 * «Товар летит в корзину» — макет design_handoff_cart_fly (Товар.dc.html).
 *
 * Страж следит за призраком: он живёт в body с data-cart-fly, стартует от
 * картинки товара и приземляется в иконку корзины. Проверяются четыре вещи,
 * каждая из которых уже ломалась в прототипе:
 *   1) на мобильной ширине цель — нижняя панель, а не шапка;
 *   2) на прокрученной странице товара источник — нажатая кнопка (галерея
 *      уехала за экран);
 *   3) на десктопе цель — корзина в шапке;
 *   4) при prefers-reduced-motion полёта нет вовсе.
 * И пятая, с 25.11.2026: на телефоне, когда прокрутка вниз спрятала нижнюю
 * панель, товар летит ВНИЗ, в её корзину, а панель выезжает навстречу. До
 * этого спрятанная панель выпадала из выбора цели, и товар улетал вверх — на
 * этих страницах в пустой правый верхний угол. Проверяется на главной (6), на
 * прокрученной странице товара (3) и в «Рекомендуем» корзины (7) — на двух
 * последних за навигацией едет липкая панель, и она не должна оказаться под ней.
 *
 * Гостевая корзина в базу не пишется, аналитика не шлётся; по превью или бою
 * (`--base=https://…`) не грузятся и картинки из хранилища — трафик Supabase.
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3007'

// Ставится ДО клика: призрак живёт ~0.5-0.8с, скриншотами такое не поймать.
function recorder() {
  window.__fly = null
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node.dataset.cartFly === undefined)
          continue
        const tile = node.firstElementChild?.firstElementChild
        const track = { samples: [], removed: false, image: '', to: null }
        window.__fly = track
        track.image = tile ? getComputedStyle(tile).backgroundImage : ''
        // Куда призрак летит — точно, из последнего ключевого кадра: внешний
        // узел ведёт по X, средний по Y. Последний снятый кадр для этого не
        // годится: под конец полёт по высоте резко ускоряется, и кадр на 16 мс
        // раньше конца стоит на 20–40px выше цели.
        const end = (el, i) => Number((el?.getAnimations?.()[0]?.effect?.getKeyframes?.().at(-1)?.transform || '').match(/-?[\d.]+/g)?.[i])
        const to = { x: Math.round(end(node, 0)), y: Math.round(end(node.firstElementChild, 1)) }
        if (Number.isFinite(to.x) && Number.isFinite(to.y))
          track.to = to
        const tick = () => {
          if (!node.isConnected) {
            track.removed = true
            return
          }
          const r = (tile ?? node).getBoundingClientRect()
          track.samples.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }
  })
  // Скрипт стартует до разметки: на этот момент document.body ещё null, и
  // observe(null) молча убивает наблюдатель — первый заход я так и потерял.
  const start = () => observer.observe(document.body, { childList: true })
  if (document.body)
    start()
  else
    document.addEventListener('DOMContentLoaded', start)
}

const centerOf = sel => (s) => {
  const el = document.querySelector(s)
  if (!el)
    return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}

const dist = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y))

// В странице: нижняя панель — спрятана ли, где её верх и корзина, прокрутка.
function navState() {
  const nav = document.querySelector('nav.mbn-bar')
  const cart = nav?.querySelector('[data-cart-target]')?.getBoundingClientRect()
  return {
    hidden: !!nav?.classList.contains('mbn-bar--hidden'),
    top: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    cart: cart ? { x: Math.round(cart.left + cart.width / 2), y: Math.round(cart.top + cart.height / 2) } : null,
    y: Math.round(window.scrollY),
  }
}

// В странице: липкая панель, что едет за навигацией, — внизу ли она и где её низ.
function barState([selector, downClass]) {
  const el = document.querySelector(selector)
  if (!el)
    return null
  return { down: el.classList.contains(downClass), bottom: Math.round(el.getBoundingClientRect().bottom) }
}

// Колесом вниз, пока помеченный элемент не встанет в середину экрана: панель
// прячется по-настоящему (прокрутка вниз дальше 280px), а касание потом не
// прокручивает страницу само.
async function wheelTo(page, selector) {
  for (let i = 0; i < 120; i++) {
    const top = await page.evaluate(s => document.querySelector(s)?.getBoundingClientRect().top ?? -1, selector)
    if (top < 560)
      return top
    await page.mouse.wheel(0, Math.max(40, Math.min(150, top - 420)))
    await page.waitForTimeout(70)
  }
  return null
}

// Финиш призрака у корзины панели, панель на месте, липкая панель над ней.
function checkDockLanding(fly, rest, after, bar) {
  if (fly?.samples.length && rest.cart) {
    const first = fly.samples[0]
    const last = fly.samples[fly.samples.length - 1]
    check(!!fly.to && dist(fly.to, rest.cart) <= 2, `цель полёта — корзина нижней панели на месте (${fly.to ? `${fly.to.x}, ${fly.to.y}` : '—'}; корзина ${rest.cart.x}, ${rest.cart.y})`)
    check(dist(last, rest.cart) < 60, `финиш у корзины нижней панели (${dist(last, rest.cart)}px; по высоте ${first.y} → ${last.y})`)
  }
  check(!after.hidden && !!after.cart && dist(after.cart, rest.cart) <= 2, `панель выехала и стоит на месте${after.hidden ? ' — нет, спрятана' : ''}`)
  if (bar !== undefined)
    check(!!bar && !bar.down && bar.bottom <= after.top, `липкая панель над навигацией (низ ${bar?.bottom}, верх навигации ${after.top})`)
}

const browser = await chromium.launch()
const fails = []

async function context(opts) {
  const ctx = await browser.newContext(opts)
  const local = /localhost|127\.0\.0\.1/.test(BASE)
  await ctx.route(local
    ? /\/rest\/v1\/rpc\/save_guest_cart|googletagmanager\.com|google-analytics\.com/
    : /\/rest\/v1\/rpc\/save_guest_cart|googletagmanager\.com|google-analytics\.com|\/storage\/v1\//, route => route.abort())
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
    }
    catch {}
  })
  const page = await ctx.newPage()
  await page.addInitScript(recorder)
  return { ctx, page }
}

function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

// ---------- 1. Мобильная главная: полёт от карточки в нижнюю панель ----------
{
  const { ctx, page } = await context({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const btn = page.locator('button.pc-add').first()
  // Прокрутка к карточке — один прыжок на ~680px, и на следующем кадре панель
  // начинает прятаться: нажатие приходится на уезжающую панель. Корзина ниже
  // меряется до этого, на месте; полностью спрятанная панель — сценарий 6.
  await btn.scrollIntoViewIfNeeded()
  const cardImage = await page.evaluate(centerOf(), '.pc-card .aspect-square')
  const navCart = await page.evaluate(centerOf(), '.mbn-icon-wrap[data-cart-target]')
  const headerCart = await page.evaluate(centerOf(), '.sh-mobile__btn[data-cart-target]')
  await btn.click()
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)

  console.log('\n1) мобильная главная')
  check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
  if (fly?.samples.length) {
    const first = fly.samples[0]
    const last = fly.samples[fly.samples.length - 1]
    check(dist(first, cardImage) < 90, `старт у картинки товара (${dist(first, cardImage)}px)`)
    check(!!fly.to && dist(fly.to, navCart) <= 2, `цель полёта — корзина нижней панели (${fly.to ? `${fly.to.x}, ${fly.to.y}` : '—'}; корзина ${navCart.x}, ${navCart.y})`)
    check(dist(last, navCart) < 60, `финиш у корзины нижней панели (${dist(last, navCart)}px)`)
    check(dist(last, navCart) < dist(last, headerCart), 'цель — панель, а не шапка')
    check(fly.image.includes('http'), 'на плитке картинка товара')
    check(fly.removed, 'призрак снят после приземления')
  }
  await ctx.close()
}

// ---------- 2. Страница товара: сначала от галереи, потом от кнопки ----------
{
  const { ctx, page } = await context({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('a[href^="/catalog/products/"]').first().click()
  await page.waitForURL('**/catalog/products/**')
  await page.waitForTimeout(2500)
  const rest = await page.evaluate(navState)

  console.log('\n2) страница товара, галерея на виду')
  const slide = await page.evaluate(centerOf(), '.pg-slide[data-fly-origin]')
  await page.locator('.pdp-cta--pill').first().click()
  await page.waitForTimeout(1400)
  const fromGallery = await page.evaluate(() => window.__fly)
  check(!!fromGallery && fromGallery.samples.length > 3, `призрак летит (кадров: ${fromGallery?.samples.length ?? 0})`)
  if (fromGallery?.samples.length && slide) {
    const first = fromGallery.samples[0]
    check(dist(first, slide) < 90, `старт у кадра галереи (${dist(first, slide)}px)`)
    check(fromGallery.image.includes('http'), 'на плитке картинка товара')
  }

  console.log('\n3) страница товара прокручена — источник кнопка')
  await page.evaluate(() => { window.__fly = null })
  await page.mouse.wheel(0, 2600)
  await page.waitForTimeout(900)
  const galleryVisible = await page.evaluate(() => {
    const el = document.querySelector('.pg-slide[data-fly-origin]')
    if (!el)
      return false
    const r = el.getBoundingClientRect()
    return r.bottom > 0 && r.top < window.innerHeight
  })
  // Товар уже в корзине — в липкой панели теперь степпер, жмём «+».
  const plus = page.locator('.pdp-sticky button[aria-label="Увеличить количество"], button[aria-label="Увеличить количество"]').last()
  const plusBox = await plus.boundingBox()
  const before = await page.evaluate(navState)
  await plus.click()
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)
  const after = await page.evaluate(navState)
  const bar = await page.evaluate(barState, ['.pdp-buybar', 'pdp-buybar--down'])

  check(!galleryVisible, 'галерея действительно за экраном')
  check(before.hidden, 'нижняя панель спрятана прокруткой')
  check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
  if (fly?.samples.length && plusBox) {
    const first = fly.samples[0]
    const btnCenter = { x: Math.round(plusBox.x + plusBox.width / 2), y: Math.round(plusBox.y + plusBox.height / 2) }
    check(dist(first, btnCenter) < 90, `старт у нажатой кнопки (${dist(first, btnCenter)}px)`)
    check(fly.removed, 'призрак снят после приземления')
  }
  checkDockLanding(fly, rest, after, bar)
  await ctx.close()
}

// ---------- 4. Десктоп: цель — корзина в шапке ----------
{
  const { ctx, page } = await context({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const btn = page.locator('button.pc-add').first()
  await btn.scrollIntoViewIfNeeded()
  // Шапка после прокрутки ещё доезжает (стекло, отступы): замер без паузы
  // ловил корзину на 5px в стороне от места, где она встанет.
  await page.waitForTimeout(600)
  const headerCart = await page.evaluate(centerOf(), '.sh-icon-btn[data-cart-target]')
  await btn.click()
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)

  console.log('\n4) десктоп')
  check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
  if (fly?.samples.length && headerCart) {
    const last = fly.samples[fly.samples.length - 1]
    check(!!fly.to && dist(fly.to, headerCart) <= 2, `цель полёта — корзина в шапке (${fly.to ? `${fly.to.x}, ${fly.to.y}` : '—'}; корзина ${headerCart.x}, ${headerCart.y})`)
    check(dist(last, headerCart) < 60, `финиш у корзины в шапке (${dist(last, headerCart)}px)`)
  }
  await ctx.close()
}

// ---------- 5. prefers-reduced-motion: полёта нет ----------
{
  const { ctx, page } = await context({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const btn = page.locator('button.pc-add').first()
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  // Стор пишется в localStorage не мгновенно — на 900мс проверка ловила пустоту.
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)
  const inCart = await page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('uhti-cart-v1') || '{}').items || []).length
    }
    catch {
      return 0
    }
  })

  console.log('\n5) prefers-reduced-motion')
  check(fly === null, 'призрака нет')
  check(inCart > 0, 'товар всё равно добавлен в корзину')
  await ctx.close()
}

// ---------- 6. Телефон, панель спрятана прокруткой: товар летит вниз, в неё ----------
{
  const { ctx, page } = await context({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const rest = await page.evaluate(navState)
  const marked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.pc-add')].find(b => b.getBoundingClientRect().top + window.scrollY > 1100)
    btn?.setAttribute('data-fly-guard', '')
    return !!btn
  })

  console.log('\n6) телефон, нижняя панель спрятана прокруткой')
  check(marked, 'есть карточка ниже 1100px')
  if (marked) {
    await wheelTo(page, '[data-fly-guard]')
    await page.waitForTimeout(500)
    const before = await page.evaluate(navState)
    const tap = await page.evaluate(centerOf(), '[data-fly-guard]')
    await page.touchscreen.tap(tap.x, tap.y)
    await page.waitForTimeout(1400)
    const fly = await page.evaluate(() => window.__fly)
    const after = await page.evaluate(navState)

    check(before.hidden && !rest.hidden, `панель спрятана прокруткой (страница на ${before.y}px)`)
    check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
    checkDockLanding(fly, rest, after)
    check(after.y === before.y, 'страница не прокрутилась')
  }
  await ctx.close()
}

// ---------- 7. Корзина: «Рекомендуем» на прокрученной странице ----------
// За навигацией здесь едет панель «Оформить заказ».
{
  const { ctx, page } = await context({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  // «Рекомендуем» — товары из категорий корзины, и страница должна быть
  // длиннее экрана, иначе панели нечего прятать: в корзину кладутся четыре
  // товара с акций. Щелчок — из страницы: Playwright упирался в уведомления.
  await page.goto(`${BASE}/catalog/promotions`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => document.querySelector('button.pc-add')?.click())
    await page.waitForTimeout(700)
  }
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  const rest = await page.evaluate(navState)
  const marked = await page.waitForSelector('.cart-rail button.pc-add', { timeout: 20000 })
    .then(() => page.evaluate(() => {
      document.querySelector('.cart-rail button.pc-add').setAttribute('data-fly-guard', '')
      return true
    }))
    .catch(() => false)

  console.log('\n7) корзина, «Рекомендуем» на прокрученной странице')
  check(marked, 'в корзине есть «Рекомендуем»')
  if (marked) {
    await wheelTo(page, '[data-fly-guard]')
    await page.waitForTimeout(500)
    const before = await page.evaluate(navState)
    const tap = await page.evaluate(centerOf(), '[data-fly-guard]')
    await page.touchscreen.tap(tap.x, tap.y)
    await page.waitForTimeout(1400)
    const fly = await page.evaluate(() => window.__fly)
    const after = await page.evaluate(navState)
    const bar = await page.evaluate(barState, ['.cart-mobile-cta', 'cart-mobile-cta--at-bottom'])

    check(before.hidden, `панель спрятана прокруткой (страница на ${before.y}px)`)
    check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
    checkDockLanding(fly, rest, after, bar)
  }
  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: анимация корзины работает' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

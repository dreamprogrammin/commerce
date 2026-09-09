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
        const track = { samples: [], removed: false, image: '' }
        window.__fly = track
        track.image = tile ? getComputedStyle(tile).backgroundImage : ''
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

const browser = await chromium.launch()
const fails = []

async function context(opts) {
  const ctx = await browser.newContext(opts)
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
  await plus.click()
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)

  check(!galleryVisible, 'галерея действительно за экраном')
  check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
  if (fly?.samples.length && plusBox) {
    const first = fly.samples[0]
    const btnCenter = { x: Math.round(plusBox.x + plusBox.width / 2), y: Math.round(plusBox.y + plusBox.height / 2) }
    check(dist(first, btnCenter) < 90, `старт у нажатой кнопки (${dist(first, btnCenter)}px)`)
    check(fly.removed, 'призрак снят после приземления')
  }
  await ctx.close()
}

// ---------- 4. Десктоп: цель — корзина в шапке ----------
{
  const { ctx, page } = await context({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const btn = page.locator('button.pc-add').first()
  await btn.scrollIntoViewIfNeeded()
  const headerCart = await page.evaluate(centerOf(), '.sh-icon-btn[data-cart-target]')
  await btn.click()
  await page.waitForTimeout(1400)
  const fly = await page.evaluate(() => window.__fly)

  console.log('\n4) десктоп')
  check(!!fly && fly.samples.length > 3, `призрак летит (кадров: ${fly?.samples.length ?? 0})`)
  if (fly?.samples.length && headerCart) {
    const last = fly.samples[fly.samples.length - 1]
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

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: анимация корзины работает' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

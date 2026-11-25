/*
 * Нижняя панель телефона по макету MobileNav.dc.html — вариант 1c холста
 * «Тосты мобилка» в Claude Design (25.11.2026).
 *
 * На телефоне о добавлении в корзину говорит сама панель, тоста нет:
 *   — над корзиной на 2,2 с всплывает подсказка «+1 ещё N ₸ до бесплатной»,
 *     у порога — «Доставка по Алматы бесплатная»;
 *   — вокруг корзины кольцо: доля пути до бесплатной доставки (15 000 ₸);
 *   — панель, спрятанная прокруткой, выезжает: подсказка живёт в ней;
 *   — где над панелью липкая панель страницы (покупка на карточке товара,
 *     «Оформить» в корзине), подсказка встаёт над ней, а не на её «+».
 * Для посылки в другой город порога нет: ни кольца, ни счёта до бесплатной.
 * На десктопе панели нет — тост «Добавили в корзину» прежний.
 *
 * Сумма корзины сверяется со стором, порог и подъём над липкими панелями —
 * с числами из MobileBottomNav.vue и constants/index.ts.
 *
 * Гостевая корзина в базу не пишется, аналитика не шлётся; по превью или бою
 * (`--base=https://…`) не грузятся и картинки из хранилища — трафик Supabase.
 * `--shots=<папка>` — снимки подсказки для глаз (в репозиторий не класть).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3007'
const SHOTS = process.argv.find(a => a.startsWith('--shots='))?.slice(8) || ''
const FREE = 15000

const browser = await chromium.launch()
const fails = []

function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

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
  await ctx.addInitScript(toastRecorder)
  return { ctx, page: await ctx.newPage() }
}

// Все тосты, что показывались со загрузки страницы. Смотреть на экран в
// момент проверки мало: тост живёт 4 с и успевал уйти, пока страж ждал
// подсказку, — «тоста нет» проходило и там, где тост был.
function toastRecorder() {
  window.__seenToasts = []
  const seen = new WeakSet()
  const scan = () => {
    for (const toast of document.querySelectorAll('[data-sonner-toast]')) {
      const title = toast.querySelector('[data-title]')?.textContent.trim()
      if (title && !seen.has(toast)) {
        seen.add(toast)
        window.__seenToasts.push(title)
      }
    }
  }
  const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true })
  if (document.body)
    start()
  else
    document.addEventListener('DOMContentLoaded', start)
}
const seenToasts = () => window.__seenToasts ?? []

const PHONE = { deviceScaleFactor: 2, isMobile: true, hasTouch: true }

// В странице: всё про панель, корзину, кольцо и подсказку разом.
function navInfo() {
  const nav = document.querySelector('nav.mbn-bar')
  const box = el => el ? el.getBoundingClientRect() : null
  const cart = box(nav?.querySelector('[data-cart-target]'))
  const tip = nav?.querySelector('.mbn-tip')
  const tipBox = box(tip)
  const ring = nav?.querySelector('.mbn-ring')
  return {
    present: !!nav && getComputedStyle(nav).display !== 'none',
    hidden: !!nav?.classList.contains('mbn-bar--hidden'),
    top: nav ? Math.round(box(nav).top) : null,
    cartX: cart ? Math.round(cart.left + cart.width / 2) : null,
    tipShown: !!tip?.classList.contains('mbn-tip--shown'),
    tipOpacity: tip ? Number(getComputedStyle(tip).opacity) : null,
    // Части подсказки разделяет отступ, а не пробел: текст — по частям.
    tipText: tip ? [...tip.children].map(c => c.textContent.trim()).join(' ') : '',
    tipPlus: tip?.querySelector('.mbn-tip__plus')?.textContent.trim() ?? '',
    tip: tipBox ? { left: Math.round(tipBox.left), right: Math.round(tipBox.right), top: Math.round(tipBox.top), bottom: Math.round(tipBox.bottom) } : null,
    ring: ring ? Number.parseFloat(getComputedStyle(ring).getPropertyValue('--mbn-ring')) : null,
    said: nav?.querySelector('[role="status"]')?.textContent.trim() ?? '',
  }
}

// Стор корзины — для суммы и для шагов, которые кнопками долго набирать.
function cartState() {
  const store = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia?._s.get('cartStore')
  if (!store)
    return null
  return { subtotal: store.subtotal, count: store.totalItems, ids: store.items.map(i => i.product.id), prices: store.items.map(i => Number(i.product.final_price ?? i.product.price)) }
}

function cartCall([method, ...args]) {
  const store = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia?._s.get('cartStore')
  return store ? (store[method](...args), true) : false
}

const toastTitles = () => [...document.querySelectorAll('[data-sonner-toast] [data-title]')].map(t => t.textContent.trim())

const money = n => String(Math.round(n)).replace(/\B(?=(?:\d{3})+(?!\d))/g, '\u00A0')
const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol

// Подсказка на телефоне: над чем стоит и куда смотрит стрелка.
function checkTipPlace(n, overTop, what) {
  check(n.tipShown && n.tipOpacity === 1, `подсказка на экране (${n.tipOpacity})`)
  if (!n.tip)
    return
  check(near(n.tip.bottom, overTop - 10, 1), `подсказка в 10px над ${what} (низ ${n.tip.bottom}, верх ${what} ${overTop})`)
  // Стрелка 10px стоит в 15px от правого края — её середина в 20px от края.
  check(near(n.tip.right - 20, n.cartX, 2), `стрелка над корзиной (${n.tip.right - 20}, корзина ${n.cartX})`)
  check(n.tip.left >= 8, `подсказка в экране (левый край ${n.tip.left})`)
}

// ---------- 1. Главная: подсказка, кольцо, тоста нет ----------
// 768 — планшет: нижняя панель видна до 1024px, и тоста там тоже нет.
for (const [width, height] of [[390, 844], [360, 844], [768, 1024]]) {
  const { ctx, page } = await context({ viewport: { width, height }, ...PHONE })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  console.log(`\n1) главная, ${width}px`)
  const empty = await page.evaluate(navInfo)
  check(empty.present && empty.ring === null && !empty.tipShown, 'пустая корзина: кольца и подсказки нет')

  // Прячем панель колесом, как человек: вниз дальше 280px — и дальше, пока
  // на экране не окажется карточка с «в корзину» (на главной между ними
  // баннеры и категории).
  const cardInView = () => [...document.querySelectorAll('button.pc-add')].some((b) => {
    const r = b.getBoundingClientRect()
    return r.top > 90 && r.bottom < window.innerHeight - 120
  })
  for (let i = 0; i < 90; i++) {
    await page.mouse.wheel(0, 150)
    await page.waitForTimeout(70)
    if (i >= 3 && await page.evaluate(cardInView))
      break
  }
  await page.waitForTimeout(500)
  const hiddenBefore = (await page.evaluate(navInfo)).hidden
  // Нажатие из страницы: Playwright сам прокрутил бы к кнопке и показал панель.
  const marked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.pc-add')].find((b) => {
      const r = b.getBoundingClientRect()
      return r.top > 90 && r.bottom < window.innerHeight - 120
    })
    if (!btn)
      return false
    btn.closest('.pc-card')?.setAttribute('data-nav-guard', '')
    btn.click()
    return true
  })
  check(marked, 'на экране есть карточка с «в корзину»')
  await page.waitForFunction(() => document.querySelector('.mbn-tip--shown'), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(450)
  const n = await page.evaluate(navInfo)
  const cart = await page.evaluate(cartState)

  check(hiddenBefore, 'до нажатия панель спрятана прокруткой')
  check(!n.hidden, 'после добавления панель выехала')
  checkTipPlace(n, n.top, 'навигацией')
  check(!!cart && cart.count === 1, `в корзине одна штука (${cart?.count})`)
  if (cart) {
    const left = FREE - cart.subtotal
    // Перед ₸ — неразрывный пробел, как везде на сайте: знак не уходит на строку один.
    check(n.tipText === `+1 ещё ${money(left)}\u00A0₸ до бесплатной`, `текст «${n.tipText}» (сумма ${cart.subtotal})`)
    check(near(n.ring, (cart.subtotal / FREE) * 100, 0.2), `кольцо — доля пути (${n.ring}%, ждём ${((cart.subtotal / FREE) * 100).toFixed(1)}%)`)
  }
  check(n.said.startsWith('Добавили в корзину'), `диктору сказано: «${n.said}»`)
  await page.waitForTimeout(700)
  const seen1 = await page.evaluate(seenToasts)
  check(seen1.length === 0, `тоста о добавлении не было (${seen1.join(' | ') || '—'})`)
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-home-${width}.png`, clip: { x: 0, y: height - 200, width, height: 200 } })

  // «+» той же карточки, пока подсказка на экране: счёт складывается, кольцо едет.
  const ringBefore = n.ring
  await page.evaluate(() => document.querySelector('[data-nav-guard] button[aria-label="Увеличить количество"]')?.click())
  await page.waitForTimeout(120)
  const mid = await page.evaluate(navInfo)
  await page.waitForTimeout(600)
  const n2 = await page.evaluate(navInfo)
  const cart2 = await page.evaluate(cartState)
  check(n2.tipPlus === '+2', `второй «+» в окне подсказки — «${n2.tipPlus}»`)
  if (cart2)
    check(near(n2.ring, (cart2.subtotal / FREE) * 100, 0.2), `кольцо доехало (${n2.ring}%)`)
  check(mid.ring > ringBefore + 0.05 && mid.ring < n2.ring - 0.05, `кольцо наполняется плавно (${ringBefore} → ${mid.ring} → ${n2.ring})`)

  await page.waitForTimeout(2400)
  const gone = await page.evaluate(navInfo)
  check(!gone.tipShown && gone.tipOpacity === 0, `через 2,2 с подсказка ушла (${gone.tipOpacity})`)
  check(gone.ring !== null, 'кольцо осталось')

  // Убрали, пока подсказка на экране: уходит сразу — на её место встаёт тост
  // удаления, а «+1 ещё N ₸» уже неверно.
  await page.evaluate(() => document.querySelector('[data-nav-guard] button[aria-label="Увеличить количество"]')?.click())
  await page.waitForTimeout(400)
  const again = (await page.evaluate(navInfo)).tipShown
  await page.evaluate(() => document.querySelector('[data-nav-guard] button[aria-label="Уменьшить количество"]')?.click())
  await page.waitForTimeout(350)
  const cut = await page.evaluate(navInfo)
  check(again && !cut.tipShown && cut.tipOpacity === 0, `убрали из корзины — подсказка ушла сразу (была ${again}, прозрачность ${cut.tipOpacity})`)

  if (width === 390) {
    // ---------- 2. Порог пройден ----------
    console.log('\n2) порог бесплатной доставки')
    const c = await page.evaluate(cartState)
    const need = Math.ceil(FREE / c.prices[0])
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], Math.max(need, c.count + 1)])
    await page.waitForTimeout(500)
    const free = await page.evaluate(navInfo)
    check(free.tipText === 'Доставка по Алматы бесплатная' && free.tipPlus === '', `текст «${free.tipText}», без «+N»`)
    check(free.ring === 100, `кольцо полное (${free.ring}%)`)
    if (SHOTS)
      await page.screenshot({ path: `${SHOTS}/nav-tip-free-${width}.png`, clip: { x: 0, y: height - 200, width, height: 200 } })
    await page.waitForTimeout(2800)

    // ---------- 3. Посылка в другой город: порога нет ----------
    console.log('\n3) посылка в другой город')
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], 1])
    await page.evaluate(cartCall, ['setDeliveryMethod', 'post'])
    await page.waitForTimeout(300)
    check((await page.evaluate(navInfo)).ring === null, 'кольца нет')
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], 2])
    await page.waitForTimeout(500)
    const post = await page.evaluate(navInfo)
    check(post.tipText === '+1 в корзине', `текст «${post.tipText}»`)
    await page.evaluate(cartCall, ['setDeliveryMethod', 'courier'])

    // ---------- 4. Корзину опустошили ----------
    console.log('\n4) корзина опустела')
    await page.evaluate(cartCall, ['removeItem', c.ids[0]])
    await page.waitForTimeout(600)
    const none = await page.evaluate(navInfo)
    check(none.ring === null && !none.tipShown, 'кольца и подсказки нет')
    check((await page.evaluate(toastTitles)).includes('Товар убрали из корзины'), 'тост удаления на телефоне остался')
  }
  await ctx.close()
}

// ---------- 5–6. Карточка товара и корзина: подсказка над липкой панелью ----------
{
  const { ctx, page } = await context({ viewport: { width: 390, height: 844 }, ...PHONE })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('a[href^="/catalog/products/"]').first().click()
  await page.waitForURL('**/catalog/products/**')
  await page.waitForTimeout(2500)
  console.log('\n5) страница товара')
  await page.locator('.pdp-buybar .pdp-cta--pill').click()
  await page.waitForFunction(() => document.querySelector('.mbn-tip--shown'), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(450)
  const n = await page.evaluate(navInfo)
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.pdp-buybar')
    return el ? { top: Math.round(el.getBoundingClientRect().top), down: el.classList.contains('pdp-buybar--down') } : null
  })
  check(!!bar && !bar.down, 'панель покупки над навигацией')
  if (bar)
    checkTipPlace(n, bar.top, 'панелью покупки')
  await page.waitForTimeout(700)
  const seen5 = await page.evaluate(seenToasts)
  check(seen5.length === 0, `тоста о добавлении не было (${seen5.join(' | ') || '—'})`)
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-pdp-390.png`, clip: { x: 0, y: 844 - 240, width: 390, height: 240 } })
  await page.waitForTimeout(2600)

  // Тост о доставке страница корзины показывает, только пока сумма ниже
  // порога, — нажимать «Больше» надо там, иначе «тостов нет» пройдёт впустую.
  // «Больше» есть не у всякого товара (запас склада): нет — кладётся ещё один.
  const pressMore = async () => {
    await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    const before = await page.evaluate(cartState)
    const pressed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button[aria-label="Больше"]')].find(b => !b.disabled)
      btn?.click()
      return !!btn
    })
    return { before, pressed }
  }
  let more = await pressMore()
  if (!more.pressed) {
    await page.goto(`${BASE}/catalog/promotions`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.querySelector('button.pc-add')?.click())
    await page.waitForTimeout(1200)
    more = await pressMore()
  }
  console.log('\n6) корзина')
  check(more.pressed, 'в корзине есть доступный «Больше»')
  check(!!more.before && more.before.subtotal < FREE, `сумма до нажатия ниже порога (${more.before?.subtotal})`)
  await page.waitForFunction(() => document.querySelector('.mbn-tip--shown'), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(450)
  const c = await page.evaluate(navInfo)
  const cta = await page.evaluate(() => {
    const el = document.querySelector('.cart-mobile-cta')
    return el ? { top: Math.round(el.getBoundingClientRect().top), above: el.classList.contains('cart-mobile-cta--above-nav') } : null
  })
  check(!!cta && cta.above, 'кнопка оформления над навигацией')
  if (cta)
    checkTipPlace(c, cta.top, 'кнопкой оформления')
  await page.waitForTimeout(700)
  const seen6 = await page.evaluate(seenToasts)
  check(seen6.length === 0, `тостов о доставке не было (${seen6.join(' | ') || '—'})`)
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-cart-390.png`, clip: { x: 0, y: 844 - 240, width: 390, height: 240 } })
  await ctx.close()
}

// ---------- 7. Десктоп: панели нет, тост прежний ----------
{
  const { ctx, page } = await context({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const add = page.locator('button.pc-add').first()
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await page.waitForSelector('[data-sonner-toast]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  console.log('\n7) десктоп')
  check(!(await page.evaluate(navInfo)).present, 'нижней панели нет')
  check((await page.evaluate(toastTitles)).includes('Добавили в корзину'), 'тост «Добавили в корзину» на месте')
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nЗЕЛЁНЫЙ: нижняя панель по макету')
process.exit(fails.length ? 1 : 0)

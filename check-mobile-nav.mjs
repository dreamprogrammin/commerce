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
 *
 * Удаление (владелец 25.11.2026: «тост убрать, сделать как при добавлении,
 * только чтобы сигнализировал правильно») — та же подсказка, но:
 *   — красное «−1» вместо «+1», корзина на миг «проседает», кольцо убывает;
 *   — позиция ушла целиком — «Вернуть» прямо на подсказке, и живёт она 4 с,
 *     как жил тост удаления; опустела корзина — «корзина пуста»;
 *   — тоста удаления, «Корзина очищена» и тостов о доставке на телефоне нет.
 * На десктопе панели нет — тосты «Добавили в корзину» и «Товар убрали из
 * корзины» прежние.
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
  const cartEl = nav?.querySelector('[data-cart-target]')
  const tip = nav?.querySelector('.mbn-tip')
  const tipBox = box(tip)
  const sign = tip?.querySelector('.mbn-tip__sign, .mbn-tip__plus')
  const undo = tip?.querySelector('.mbn-tip__undo')
  const undoBox = box(undo)
  const ring = nav?.querySelector('.mbn-ring')
  return {
    present: !!nav && getComputedStyle(nav).display !== 'none',
    hidden: !!nav?.classList.contains('mbn-bar--hidden'),
    top: nav ? Math.round(box(nav).top) : null,
    cartX: cart ? Math.round(cart.left + cart.width / 2) : null,
    tipShown: !!tip?.classList.contains('mbn-tip--shown'),
    tipOpacity: tip ? Number(getComputedStyle(tip).opacity) : null,
    tipRemove: !!tip?.classList.contains('mbn-tip--remove'),
    // Части подсказки разделяет отступ, а не пробел: текст — по частям, без
    // кнопки «Вернуть». До 25.11.2026 знак лежал в .mbn-tip__plus.
    tipText: tip ? [...tip.children].filter(c => c.tagName !== 'BUTTON').map(c => c.textContent.trim()).filter(Boolean).join(' ') : '',
    tipSign: sign?.textContent.trim() ?? '',
    signColor: sign ? getComputedStyle(sign).color : null,
    undo: undoBox
      ? {
          text: undo.textContent.trim(),
          disabled: undo.disabled,
          x: Math.round(undoBox.left + undoBox.width / 2),
          y: Math.round(undoBox.top + undoBox.height / 2),
          // Палец попадёт в кнопку, только если её ничто не накрывает.
          hit: undo.contains(document.elementFromPoint(undoBox.left + undoBox.width / 2, undoBox.top + undoBox.height / 2)),
        }
      : null,
    tip: tipBox ? { left: Math.round(tipBox.left), right: Math.round(tipBox.right), top: Math.round(tipBox.top), bottom: Math.round(tipBox.bottom) } : null,
    ring: ring ? Number.parseFloat(getComputedStyle(ring).getPropertyValue('--mbn-ring')) : null,
    said: nav?.querySelector('[role="status"]')?.textContent.trim() ?? '',
    // Анимации самой корзины (не кольца и не иконки): кадры transform.
    cartAnim: cartEl ? cartEl.getAnimations().map(a => a.effect.getKeyframes().map(k => k.transform).join(' ')) : [],
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
  check(n2.tipSign === '+2', `второй «+» в окне подсказки — «${n2.tipSign}»`)
  if (cart2)
    check(near(n2.ring, (cart2.subtotal / FREE) * 100, 0.2), `кольцо доехало (${n2.ring}%)`)
  check(mid.ring > ringBefore + 0.05 && mid.ring < n2.ring - 0.05, `кольцо наполняется плавно (${ringBefore} → ${mid.ring} → ${n2.ring})`)

  await page.waitForTimeout(2400)
  const gone = await page.evaluate(navInfo)
  check(!gone.tipShown && gone.tipOpacity === 0, `через 2,2 с подсказка ушла (${gone.tipOpacity})`)
  check(gone.ring !== null, 'кольцо осталось')

  // «−», а позиция остаётся: та же подсказка о том, что убрали, — красное
  // «−1», корзина «проседает», кольцо убывает. «Вернуть» не нужен: товар на месте.
  const minusBtn = () => document.querySelector('[data-nav-guard] button[aria-label="Уменьшить количество"]')?.click()
  await page.evaluate(minusBtn)
  await page.waitForTimeout(60)
  const dip = await page.evaluate(navInfo)
  await page.waitForTimeout(500)
  const minus = await page.evaluate(navInfo)
  const cartM = await page.evaluate(cartState)
  console.log('   — убрали одну штуку')
  check(minus.tipRemove && minus.tipText === `−1 ещё ${money(FREE - (cartM?.subtotal ?? 0))}\u00A0₸ до бесплатной`, `текст «${minus.tipText}» (сумма ${cartM?.subtotal})`)
  check(minus.signColor === 'rgb(248, 113, 113)', `«−1» красный, не синий, как «+1» (${minus.signColor})`)
  check(!minus.undo, 'без «Вернуть»: позиция в корзине')
  check(dip.cartAnim.some(k => k.includes('scale(0.8)')), `корзина «проседает» (${dip.cartAnim.join(' / ') || 'анимации нет'})`)
  check(!!cartM && near(minus.ring, (cartM.subtotal / FREE) * 100, 0.2) && minus.ring < gone.ring, `кольцо убыло (${gone.ring} → ${minus.ring}%)`)
  check(minus.said.startsWith('Убрали из корзины'), `диктору сказано: «${minus.said}»`)
  checkTipPlace(minus, minus.top, 'навигацией')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-minus-${width}.png`, clip: { x: 0, y: height - 200, width, height: 200 } })

  // «−» на последней штуке: позиция ушла целиком — «Вернуть» на подсказке.
  // Тоста удаления на телефоне нет: о нём говорит подсказка.
  await page.evaluate(minusBtn)
  await page.waitForTimeout(450)
  const out = await page.evaluate(navInfo)
  console.log('   — убрали последнюю')
  check(out.tipRemove && out.tipText === '−1 корзина пуста', `текст «${out.tipText}»`)
  check(!!out.undo && out.undo.text === 'Вернуть' && !out.undo.disabled && out.undo.hit, `«Вернуть» на подсказке и доступен пальцу (${JSON.stringify(out.undo)})`)
  check(out.ring === null, 'кольца нет — корзина пуста')
  check(out.said === 'Убрали из корзины. Корзина пуста', `диктору сказано: «${out.said}»`)
  checkTipPlace(out, out.top, 'навигацией')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-removed-${width}.png`, clip: { x: 0, y: height - 200, width, height: 200 } })
  // Нажатие пальцем в точку на экране, а не click() по элементу: так видно,
  // что кнопку ничто не накрывает и что нажатие не забирает панель.
  if (out.undo)
    await page.touchscreen.tap(out.undo.x, out.undo.y)
  await page.waitForTimeout(500)
  const back = await page.evaluate(navInfo)
  const cartB = await page.evaluate(cartState)
  check(cartB?.count === 1 && !back.tipShown, `«Вернуть» вернул товар (${cartB?.count} шт.), подсказка ушла`)
  check(!!cartB && near(back.ring, (cartB.subtotal / FREE) * 100, 0.2), `кольцо вернулось (${back.ring}%)`)
  const seenOut = await page.evaluate(seenToasts)
  check(seenOut.length === 0, `тостов не было — ни о добавлении, ни об удалении (${seenOut.join(' | ') || '—'})`)

  if (width === 390) {
    // «Вернуть» живёт 4 с, как жил тост удаления, и потом не нажимается.
    console.log('   — «Вернуть» живёт 4 с')
    await page.evaluate(minusBtn)
    await page.waitForTimeout(3000)
    const at3 = await page.evaluate(navInfo)
    await page.waitForTimeout(1500)
    const at45 = await page.evaluate(navInfo)
    check(at3.tipShown && at3.tipOpacity === 1 && !!at3.undo, 'через 3 с подсказка с «Вернуть» ещё на экране')
    check(!at45.tipShown && at45.tipOpacity === 0 && (!at45.undo || at45.undo.disabled), `через 4,5 с ушла, «Вернуть» выключен (${JSON.stringify(at45.undo)})`)
    // Обратно в корзину — для сценариев ниже.
    await page.evaluate(() => document.querySelector('[data-nav-guard] button.pc-add')?.click())
    await page.waitForTimeout(2600)

    // ---------- 2. Порог пройден ----------
    console.log('\n2) порог бесплатной доставки')
    const c = await page.evaluate(cartState)
    const need = Math.ceil(FREE / c.prices[0])
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], Math.max(need, c.count + 1)])
    await page.waitForTimeout(500)
    const free = await page.evaluate(navInfo)
    check(free.tipText === 'Доставка по Алматы бесплатная' && free.tipSign === '', `текст «${free.tipText}», без «+N»`)
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
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], 1])
    await page.waitForTimeout(500)
    const postMinus = await page.evaluate(navInfo)
    check(postMinus.tipRemove && postMinus.tipText === '−1 из корзины', `убрали — «${postMinus.tipText}»`)
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], 2])
    await page.evaluate(cartCall, ['setDeliveryMethod', 'courier'])

    // ---------- 4. Позицию в 2 штуки убрали целиком ----------
    console.log('\n4) позиция ушла целиком')
    await page.evaluate(cartCall, ['removeItem', c.ids[0]])
    await page.waitForTimeout(600)
    const none = await page.evaluate(navInfo)
    check(none.tipText === '−2 корзина пуста' && !!none.undo, `«−» на всё количество: «${none.tipText}», с «Вернуть»`)
    check(none.ring === null, 'кольца нет')
    check(!(await page.evaluate(seenToasts)).includes('Товар убрали из корзины'), 'тоста удаления на телефоне нет')
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

  // «−» в панели покупки на последней штуке: подсказка с «Вернуть» — тоже
  // над панелью покупки, и «Вернуть» возвращает товар.
  await page.evaluate(() => document.querySelector('.pdp-buybar button[aria-label="Уменьшить количество"]')?.click())
  await page.waitForTimeout(450)
  const pr = await page.evaluate(navInfo)
  const bar2 = await page.evaluate(() => {
    const el = document.querySelector('.pdp-buybar')
    return el ? { top: Math.round(el.getBoundingClientRect().top), down: el.classList.contains('pdp-buybar--down') } : null
  })
  console.log('   — убрали в панели покупки')
  check(pr.tipRemove && pr.tipText === '−1 корзина пуста' && !!pr.undo && pr.undo.hit, `подсказка «${pr.tipText}» с «Вернуть»`)
  check(!!bar2 && !bar2.down, 'панель покупки на месте')
  if (bar2)
    checkTipPlace(pr, bar2.top, 'панелью покупки')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-pdp-removed-390.png`, clip: { x: 0, y: 844 - 240, width: 390, height: 240 } })
  if (pr.undo)
    await page.touchscreen.tap(pr.undo.x, pr.undo.y)
  await page.waitForTimeout(600)
  check((await page.evaluate(cartState))?.count === 1, '«Вернуть» вернул товар')
  const seen5b = await page.evaluate(seenToasts)
  check(seen5b.length === 0, `тостов не было (${seen5b.join(' | ') || '—'})`)

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
  await page.waitForTimeout(2600)

  // × у позиции: подсказка с «Вернуть» встаёт над кнопкой оформления, и
  // «Вернуть» возвращает позицию. Позиций нужно две: уйди единственная —
  // кнопка оформления пропадёт вместе с ней.
  const ctaBox = () => {
    const el = document.querySelector('.cart-mobile-cta')
    return el ? { top: Math.round(el.getBoundingClientRect().top), above: el.classList.contains('cart-mobile-cta--above-nav') } : null
  }
  const addCard = () => {
    const btn = document.querySelector('button.pc-add')
    btn?.click()
    return !!btn
  }
  if (!(await page.evaluate(addCard))) {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.evaluate(addCard)
    await page.waitForTimeout(1200)
    await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(2600)
  const beforeX = await page.evaluate(cartState)
  await page.evaluate(() => document.querySelector('button[aria-label="Убрать из корзины"]')?.click())
  await page.waitForTimeout(450)
  const x = await page.evaluate(navInfo)
  const ctaX = await page.evaluate(ctaBox)
  console.log('   — убрали позицию крестиком')
  check((beforeX?.ids.length ?? 0) >= 2, `в корзине было две позиции (${beforeX?.ids.length})`)
  check(x.tipRemove && x.tipSign.startsWith('−') && !!x.undo && x.undo.hit, `подсказка «${x.tipText}» с «Вернуть»`)
  check(!!ctaX && ctaX.above, 'кнопка оформления осталась над навигацией')
  if (ctaX)
    checkTipPlace(x, ctaX.top, 'кнопкой оформления')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/nav-tip-cart-removed-390.png`, clip: { x: 0, y: 844 - 240, width: 390, height: 240 } })
  if (x.undo)
    await page.touchscreen.tap(x.undo.x, x.undo.y)
  await page.waitForTimeout(600)
  const afterUndo = await page.evaluate(cartState)
  check(!!beforeX && afterUndo?.count === beforeX.count && afterUndo.ids.join() === beforeX.ids.join(), `«Вернуть» вернул позицию на место (${beforeX?.count} → ${afterUndo?.count} шт.)`)

  // «Очистить»: о том, что корзина пуста, говорит подсказка, а не тост.
  // У кнопки две подписи — для узкого экрана и широкого; жмём видимую.
  await page.waitForTimeout(400)
  const countAll = afterUndo?.count ?? 0
  const clearPressed = await page.evaluate(() => {
    const label = [...document.querySelectorAll('button span')].find(s => s.textContent.trim() === 'Очистить' && s.offsetParent !== null)
    label?.closest('button')?.click()
    return !!label
  })
  await page.waitForTimeout(600)
  const cleared = await page.evaluate(navInfo)
  const clearedCart = await page.evaluate(cartState)
  console.log('   — очистили корзину')
  check(clearPressed && clearedCart?.count === 0, `«Очистить» нажата, корзина пуста (${clearedCart?.count} шт.)`)
  check(cleared.tipShown && cleared.tipText === `−${countAll} корзина пуста` && !cleared.undo, `подсказка «${cleared.tipText}» на экране, без «Вернуть»`)
  const seenAll = await page.evaluate(seenToasts)
  check(seenAll.length === 0, `тостов в корзине не было (${seenAll.join(' | ') || '—'})`)
  await ctx.close()
}

// ---------- 6а. Узкий экран, 320: самая длинная подсказка в экране ----------
// «−1 Доставка по Алматы бесплатная Вернуть» шире места над панелью на 320.
// Без потолка ширины подсказка уезжала за левый край экрана (−22px); с ним
// текст обрезается многоточием, а «−1» и «Вернуть» целы.
{
  const { ctx, page } = await context({ viewport: { width: 320, height: 700 }, ...PHONE })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector('button.pc-add')?.click())
    await page.waitForTimeout(900)
  }
  const c = await page.evaluate(cartState)
  console.log('\n6а) узкий экран, 320px')
  check(c?.ids.length === 2, `в корзине две позиции (${c?.ids.length})`)
  if (c?.ids.length === 2) {
    await page.evaluate(cartCall, ['updateQuantity', c.ids[0], Math.ceil(FREE / c.prices[0]) + 1])
    await page.waitForTimeout(2600)
    await page.evaluate(cartCall, ['removeItem', c.ids[1]])
    await page.waitForTimeout(450)
    const n = await page.evaluate(navInfo)
    check(n.tipText === '−1 Доставка по Алматы бесплатная' && !!n.undo, `подсказка «${n.tipText}» с «Вернуть»`)
    checkTipPlace(n, n.top, 'навигацией')
    check(!!n.tip && n.tip.right <= 320, `правый край в экране (${n.tip?.right})`)
    check(!!n.undo && n.undo.hit, '«Вернуть» на экране и нажимается')
    if (SHOTS)
      await page.screenshot({ path: `${SHOTS}/nav-tip-320.png`, clip: { x: 0, y: 700 - 200, width: 320, height: 200 } })
  }
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
  await page.locator('button[aria-label="Уменьшить количество"]').first().click()
  await page.waitForTimeout(700)
  check((await page.evaluate(seenToasts)).includes('Товар убрали из корзины'), 'тост «Товар убрали из корзины» на месте')
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nЗЕЛЁНЫЙ: нижняя панель по макету')
process.exit(fails.length ? 1 : 0)

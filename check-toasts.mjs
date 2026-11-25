/*
 * Уведомления по макету «Тосты.dc.html».
 *
 * Проверяется то, что макет задаёт числами и поведением: белая карточка 380px
 * на радиусе 14, чип иконки с фотографией товара, название второй строкой,
 * действие в цвете акцента, полоса времени жизни и её остановка под курсором,
 * стопка не длиннее трёх, позиция снизу справа и снизу над таб-баром.
 *
 * На телефоне (с 25.11.2026, владелец: «тост на мобилке слишком большой»)
 * карточка плотнее макета: по макету она была 113px в высоту, теперь ~75 —
 * чип 30, фото 34, заголовок 13px, название товара одной строкой, крестик 24.
 * Проверяется на 390 и 360.
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3007'

const fails = []
/**
 * Дождаться, пока тост доедет. Мерить сразу нельзя: появление длится 220мс, и
 * замер попадал в середину — «снизу 93» вместо 96.
 */
async function settled(page) {
  await page.waitForSelector('[data-sonner-toast]', { timeout: 15000 })
  await page.evaluate(() => { window.__toastTop = undefined })
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-sonner-toast]')
    if (!t)
      return false
    const top = t.getBoundingClientRect().top
    const prev = window.__toastTop
    window.__toastTop = top
    return prev !== undefined && Math.abs(prev - top) < 0.5
  }, null, { polling: 120, timeout: 10000 })
}

function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

function readToast() {
  const t = document.querySelector('[data-sonner-toast]')
  if (!t)
    return null
  const pick = sel => t.querySelector(sel)
  const style = el => (el ? getComputedStyle(el) : null)
  const rect = t.getBoundingClientRect()
  const bar = getComputedStyle(pick('[data-content]'), '::after')
  const action = style(pick('[data-button]'))
  const chip = style(pick('.uh-toast-chip'))
  const thumb = style(pick('.uh-toast-thumb'))
  const close = style(pick('[data-close-button]'))
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    product: t.classList.contains('uh-toast--product'),
    right: Math.round(window.innerWidth - rect.right),
    bottom: Math.round(window.innerHeight - rect.bottom),
    radius: getComputedStyle(t).borderRadius,
    title: pick('[data-title]')?.textContent?.trim(),
    description: pick('[data-description]')?.textContent?.trim() || '',
    descriptionClamp: style(pick('[data-description]'))?.webkitLineClamp,
    descriptionHeight: Math.round(pick('[data-description]')?.getBoundingClientRect().height ?? 0),
    titleSize: style(pick('[data-title]'))?.fontSize,
    titleHeight: Math.round(pick('[data-title]')?.getBoundingClientRect().height ?? 0),
    action: pick('[data-button]')?.textContent?.trim() || '',
    actionColor: action?.color,
    actionBg: action?.backgroundColor,
    chipSize: chip ? `${chip.width}×${chip.height}` : null,
    thumbSize: thumb ? `${thumb.width}×${thumb.height}` : null,
    hasThumb: !!pick('.uh-toast-thumb img'),
    closeSize: close ? `${close.width}×${close.height}` : null,
    bar: { height: bar.height, animation: bar.animationName, duration: bar.animationDuration, state: bar.animationPlayState },
  }
}

const browser = await chromium.launch()

async function open(opts) {
  const ctx = await browser.newContext(opts)
  // Гостевая корзина в базу не пишется, аналитика не шлётся; по превью или
  // бою (`--base=https://…`) не грузятся и картинки хранилища — трафик Supabase.
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
  return { ctx, page }
}

// ---------- 1. Десктоп: тост добавления в корзину ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const add = page.locator('button.pc-add').first()
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await settled(page)
  const t = await page.evaluate(readToast)

  console.log('\n1) десктоп, добавление в корзину')
  check(!!t, 'тост показан')
  if (t) {
    check(t.width === 380, `ширина 380 (${t.width})`)
    check(t.radius === '14px', `радиус 14 (${t.radius})`)
    check(t.right === 22 && Math.abs(t.bottom - 26) <= 1, `снизу справа (right ${t.right}, bottom ${t.bottom})`)
    check(t.title === 'Добавили в корзину', `заголовок «${t.title}»`)
    check(t.description.length > 0 && !t.description.includes('"'), 'название товара отдельной строкой без кавычек')
    check(t.descriptionClamp === '2', `обрезка в две строки (${t.descriptionClamp})`)
    check(t.chipSize === '38px×38px', `чип 38×38 (${t.chipSize})`)
    check(t.hasThumb, 'фотография товара в тосте')
    check(t.action === 'Перейти в корзину', `действие «${t.action}»`)
    check(t.actionBg === 'rgba(0, 0, 0, 0)', 'действие без плашки')
    check(t.closeSize === '28px×28px', `крестик 28×28 (${t.closeSize})`)
    check(t.bar.height === '3px' && t.bar.animation === 'uh-toast-bar', `полоса времени (${t.bar.height}, ${t.bar.animation})`)
    check(t.bar.duration === '4s', `полоса живёт столько же, сколько тост (${t.bar.duration})`)
  }

  // Наведение: библиотека останавливает отсчёт, полоса обязана встать с ним.
  await page.hover('[data-sonner-toast]')
  await page.waitForTimeout(150)
  const paused = await page.evaluate(() => getComputedStyle(document.querySelector('[data-sonner-toast] [data-content]'), '::after').animationPlayState)
  check(paused === 'paused', `под курсором полоса стоит (${paused})`)
  await page.mouse.move(10, 10)
  await ctx.close()
}

// ---------- 2. Стопка: не больше трёх, зазор 10 ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  // Каждый раз .first(): у добавленной карточки кнопка сменяется степпером,
  // и первой становится следующая — то есть каждый клик кладёт новый товар.
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('button.pc-add').first()
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    // Пауза не для тостов, а для стора: добавление ходит в базу и отбивает
    // повторные нажатия, пока запрос не вернулся.
    await page.waitForTimeout(800)
  }
  await settled(page)
  const stack = await page.evaluate(() => {
    // Только живые: уходящий тост ещё висит в разметке с data-visible="false".
    const list = [...document.querySelectorAll('[data-sonner-toast][data-visible="true"]')]
      .map(t => t.getBoundingClientRect())
      .sort((a, b) => a.top - b.top)
    return {
      count: list.length,
      gaps: list.slice(1).map((r, i) => Math.round(r.top - list[i].bottom)),
    }
  })
  console.log('\n2) стопка')
  check(stack.count === 3, `видно три тоста (${stack.count})`)
  check(stack.gaps.every(g => g === 10), `зазор 10 (${stack.gaps.join(', ')})`)
  await ctx.close()
}

// ---------- 3. Мобильный: снизу, над таб-баром, плотнее макета ----------
for (const width of [390, 360]) {
  const { ctx, page } = await open({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const add = page.locator('button.pc-add').first()
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await settled(page)
  const t = await page.evaluate(readToast)
  const navTop = await page.evaluate(() => {
    // Именно нижняя панель: прежний селектор '.mbn-bar, nav' брал первый nav
    // в разметке — навигацию подвала на 6500px, — и проверка проходила всегда.
    const nav = document.querySelector('nav.mbn-bar')
    return nav ? Math.round(nav.getBoundingClientRect().top) : null
  })
  const toastBottom = await page.evaluate(() => Math.round(document.querySelector('[data-sonner-toast]').getBoundingClientRect().bottom))

  console.log(`\n3) мобильный, ${width}px`)
  check(!!t, 'тост показан')
  if (t) {
    check(t.width === width - 20, `во всю ширину минус отступы (${t.width})`)
    check(Math.abs(t.bottom - 96) <= 1, `снизу, над таб-баром (${t.bottom})`)
    check(t.height <= 78, `высота не больше 78px (${t.height}; по макету было 113)`)
    check(t.chipSize === '30px×30px' && t.thumbSize === '34px×34px', `чип 30×30 и фото 34×34 (${t.chipSize}, ${t.thumbSize})`)
    check(t.titleSize === '13px' && t.titleHeight <= 18, `заголовок 13px в одну строку (${t.titleSize}, ${t.titleHeight}px)`)
    check(t.product && t.descriptionClamp === '1' && t.descriptionHeight <= 17, `название товара одной строкой (обрезка ${t.descriptionClamp}, ${t.descriptionHeight}px)`)
    check(t.closeSize === '24px×24px', `крестик 24×24 (${t.closeSize})`)
    check(t.bar.height === '3px' && t.bar.animation === 'uh-toast-bar', `полоса времени на месте (${t.bar.height})`)
  }
  check(navTop === null || toastBottom <= navTop, `тост не заезжает на таб-бар (низ ${toastBottom}, панель ${navTop})`)
  await ctx.close()
}

// ---------- 4. «Вернуть» возвращает товар в корзину ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const add = page.locator('button.pc-add').first()
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await page.waitForTimeout(900)
  await page.locator('button[aria-label="Уменьшить количество"]').first().click()
  await settled(page)

  const removal = await page.evaluate(readToast)
  console.log('\n4) удаление и возврат')
  check(removal?.title === 'Товар убрали из корзины', `заголовок «${removal?.title}»`)
  check(removal?.action === 'Вернуть', `действие «${removal?.action}»`)

  // .pc-stepper — степпер до 25.11.2026, .cc--on — плашка CartControl с товаром в корзине
  const emptied = await page.evaluate(() => document.querySelectorAll('.pc-stepper, .cc--on').length)
  await page.locator('[data-sonner-toast] [data-button]').first().click()
  await page.waitForTimeout(700)
  const restored = await page.evaluate(() => document.querySelectorAll('.pc-stepper, .cc--on').length)
  check(emptied === 0 && restored === 1, `товар вернулся в корзину (степперов было ${emptied}, стало ${restored})`)
  await ctx.close()
}

// ---------- 5. Страница товара: одно уведомление, а не два ----------
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('a[href^="/catalog/products/"]').first().click()
  await page.waitForURL('**/catalog/products/**')
  await page.waitForTimeout(2500)
  await page.locator('.pdp-cta--pill').first().click()
  // Добавление ходит в базу — ждём появления первого тоста, а не «на глазок».
  await page.waitForSelector('[data-sonner-toast]', { timeout: 15000 })
  await page.waitForTimeout(1200)
  const count = await page.evaluate(() => document.querySelectorAll('[data-sonner-toast][data-visible="true"]').length)
  console.log('\n5) страница товара')
  check(count === 1, `на одно нажатие один тост (${count})`)
  await ctx.close()
}

// ---------- 6. Корзина: тост не закрывает кнопку оформления ----------
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('button.pc-add').first()
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    await page.waitForTimeout(1200)
  }
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.locator('button[aria-label="Меньше"]').first().click()
  await settled(page)
  const boxes = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el)
        return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
    }
    return { toast: box('[data-sonner-toast]'), cta: box('.cart-mobile-cta') }
  })

  console.log('\n6) корзина на мобильном')
  check(!!boxes.cta, 'кнопка оформления на месте')
  check(
    !!boxes.toast && !!boxes.cta && boxes.toast.bottom <= boxes.cta.top,
    `тост выше кнопки оформления (тост ${boxes.toast?.bottom}, кнопка ${boxes.cta?.top})`,
  )
  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: тосты по макету' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

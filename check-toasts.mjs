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
 *
 * О корзине на телефоне тосты не говорят вовсе — ни о добавлении, ни об
 * удалении, ни об очистке: говорит нижняя панель (MobileNav.dc.html, вариант
 * 1c; удаление — по просьбе владельца 25.11.2026; страж check-mobile-nav.mjs).
 * Плотный тост на 390 и 360 проверяется на «Ссылка скопирована» в шапке
 * карточки товара — простом тосте, без чипа и фото. Богатые тосты на
 * телефоне остались только у избранного, а оно без входа недоступно, так что
 * чип 30 и фото 34 этот страж больше не проверяет.
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
  // Каждый тост с загрузки страницы: на экране он живёт 4 с, и «тоста нет»
  // по одному взгляду проходило бы и там, где он успел уйти.
  await ctx.addInitScript(() => {
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
  })
  const page = await ctx.newPage()
  return { ctx, page }
}

const seenToasts = () => window.__seenToasts ?? []

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

// ---------- 3. Мобильный: снизу, плотнее макета; о корзине — ни слова ----------
// Тост — «Ссылка скопирована» на карточке товара (см. шапку файла). Там над
// таб-баром стоит панель покупки, и тостер поднят над ней: низ на 168px.
for (const width of [390, 360]) {
  const { ctx, page } = await open({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin })
  // Системного «Поделиться» в браузере стража нет и не должно быть: иначе
  // страница отдала бы ссылку ему, а не в буфер с тостом.
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
    }
    catch {}
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const add = page.locator('button.pc-add').first()
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await page.waitForTimeout(1500)
  await page.locator('button[aria-label="Уменьшить количество"]').first().click()
  await page.waitForTimeout(1200)
  const cartToasts = await page.evaluate(seenToasts)

  await page.locator('a[href^="/catalog/products/"]').first().click()
  await page.waitForURL('**/catalog/products/**')
  await page.waitForTimeout(2500)
  await page.locator('button[aria-label="Поделиться"]').first().click()
  await settled(page)
  const t = await page.evaluate(readToast)
  const buybarTop = await page.evaluate(() => {
    const bar = document.querySelector('.pdp-buybar')
    return bar ? Math.round(bar.getBoundingClientRect().top) : null
  })
  const toastBottom = await page.evaluate(() => Math.round(document.querySelector('[data-sonner-toast]')?.getBoundingClientRect().bottom ?? -1))

  console.log(`\n3) мобильный, ${width}px`)
  check(cartToasts.length === 0, `тостов о корзине нет — ни о добавлении, ни об удалении (${cartToasts.join(' | ') || '—'})`)
  check(t?.title === 'Ссылка скопирована', `тост показан («${t?.title}»)`)
  if (t) {
    check(t.width === width - 20, `во всю ширину минус отступы (${t.width})`)
    check(Math.abs(t.bottom - 168) <= 1, `снизу, над панелью покупки (${t.bottom})`)
    check(t.height <= 78, `высота не больше 78px (${t.height}; по макету было 113)`)
    check(t.titleSize === '13px' && t.titleHeight <= 18, `заголовок 13px в одну строку (${t.titleSize}, ${t.titleHeight}px)`)
    check(t.closeSize === '24px×24px', `крестик 24×24 (${t.closeSize})`)
    check(t.bar.height === '3px' && t.bar.animation === 'uh-toast-bar', `полоса времени на месте (${t.bar.height})`)
  }
  check(buybarTop !== null && toastBottom <= buybarTop, `тост не заезжает на панель покупки (низ ${toastBottom}, панель ${buybarTop})`)
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
// На десктопе: на телефоне тоста о добавлении нет вовсе (сценарий 3).
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('a[href^="/catalog/products/"]').first().click()
  await page.waitForURL('**/catalog/products/**')
  await page.waitForTimeout(2500)
  await page.locator('button.pdp-cta:not(.pdp-cta--pill)').first().click()
  // Добавление ходит в базу — ждём появления первого тоста, а не «на глазок».
  await page.waitForSelector('[data-sonner-toast]', { timeout: 15000 })
  await page.waitForTimeout(1200)
  const count = await page.evaluate(() => document.querySelectorAll('[data-sonner-toast][data-visible="true"]').length)
  console.log('\n5) страница товара')
  check(count === 1, `на одно нажатие один тост (${count})`)
  await ctx.close()
}

// ---------- 6. Корзина на телефоне: тостов нет ----------
// До 25.11.2026 здесь проверялось, что тост не закрывает кнопку оформления.
// Теперь «Меньше», × и «Очистить» на телефоне показывают подсказку у корзины
// нижней панели, а не тост; её место над кнопкой оформления проверяет
// check-mobile-nav.mjs. Подъём тостера над кнопкой (toast.css) общий с
// панелью покупки и проверяется в сценарии 3.
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
  await page.evaluate(() => document.querySelector('button[aria-label="Меньше"]')?.click())
  await page.waitForTimeout(800)
  await page.evaluate(() => document.querySelector('button[aria-label="Убрать из корзины"]')?.click())
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('button span')].find(s => s.textContent.trim() === 'Очистить' && s.offsetParent !== null)
    label?.closest('button')?.click()
  })
  await page.waitForTimeout(1200)
  const seen = await page.evaluate(seenToasts)
  const left = await page.evaluate(() => document.querySelectorAll('button[aria-label="Убрать из корзины"]').length)

  console.log('\n6) корзина на мобильном')
  check(left === 0, `корзину очистили (позиций ${left})`)
  check(seen.length === 0, `тостов не было — ни «Меньше», ни ×, ни «Очистить» (${seen.join(' | ') || '—'})`)
  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: тосты по макету' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

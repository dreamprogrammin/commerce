/*
 * Галочка согласия с офертой на оформлении (31.10.2026) — только на ЛОКАЛЬНОМ
 * стенде: гостевая корзина пишется в базу (`save_guest_cart`), и на превью или
 * бою тестовый товар попал бы владельцу в «спрос».
 *
 * Зачем. Галочка стояла как `v-model:checked`, а у Checkbox из reka-ui 2 модель
 * — `modelValue`. Согласие было засчитано (`agreedToTerms = ref(true)`), а
 * галочка показывалась СНЯТОЙ; нажатие меняло только её вид — снять согласие
 * было нельзя.
 *
 * Проверяет на 1366 и 390 px:
 *  1) при открытии галочка стоит — как и согласие в форме;
 *  2) форма заполнена — «Оформить заказ» доступна; снятая галочка выключает её и
 *     объясняет почему; повторное нажатие всё возвращает;
 *  3) на телефоне — без горизонтальной прокрутки; без ошибок консоли.
 * Заказ НЕ отправляется: кнопка только проверяется на disabled.
 *
 *   node check-checkout-terms.mjs --base=http://localhost:3141
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: гостевая корзина пишется в базу')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const startedAt = new Date().toISOString()
const browser = await chromium.launch()
try {
  for (const { label, viewport } of [
    { label: '1366 px', viewport: { width: 1366, height: 900 } },
    { label: '390 px', viewport: { width: 390, height: 844 } },
  ]) {
    console.log(`\n== ${label}`)
    const ctx = await browser.newContext({ viewport })
    // Окно подписки на Telegram — как будто в нём уже нажали «Не сейчас»
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))

    await page.goto(`${BASE}/catalog/all`, { waitUntil: 'load', timeout: 120000 })
    await page.locator('button.pc-add').first().click({ timeout: 30000 })
    await page.waitForTimeout(1000)
    await page.goto(`${BASE}/checkout`, { waitUntil: 'load', timeout: 120000 })
    const terms = page.locator('#terms')
    await terms.waitFor({ timeout: 30000 })
    const state = () => terms.getAttribute('data-state')

    check(await state() === 'checked', 'при открытии галочка стоит — согласие засчитано и видно')

    await page.fill('#name', 'Проверка Галочки')
    await page.locator('#phone').pressSequentially('7011234567')
    await page.fill('#email', 'terms-check@example.test')
    await page.fill('#address', 'ул. Абая, 1')
    await page.locator('#address').blur()
    // Кнопок «Оформить заказ» две (сайдбар и нижняя панель телефона), видна
    // одна; по роли берётся только видимая — класс co-cta есть и у «Применить»
    const button = page.getByRole('button', { name: /Оформить заказ/ })
    check(await button.isEnabled(), 'форма заполнена — «Оформить заказ» доступна')

    await terms.click()
    check(await state() === 'unchecked', 'галочка снимается')
    check(await button.isDisabled(), 'без согласия «Оформить заказ» выключена')
    check(await page.locator('[data-testid=terms-hint]').isVisible(), 'и объяснено почему')

    await terms.click()
    check(await state() === 'checked' && await button.isEnabled(), 'галочку вернули — оформить снова можно')
    check(!(await page.locator('[data-testid=terms-hint]').isVisible()), 'подсказка ушла')

    if (viewport.width < 768)
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальной прокрутки')
    check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
    if (process.env.SHOTS)
      await page.locator('#terms').locator('xpath=..').screenshot({ path: `${process.env.SHOTS}/checkout-terms-${viewport.width}.png` })
    await ctx.close()
  }
}
finally {
  await browser.close()
  // Гостевые корзины, заведённые прогоном, — только локальная база
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', `since=${startedAt}`], { input: `DELETE FROM public.guest_carts WHERE created_at >= :'since';`, encoding: 'utf8' })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

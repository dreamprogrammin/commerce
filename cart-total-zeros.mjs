/*
 * Барабан «Итого» в мобильной кнопке корзины.
 *
 * Страница /cart удерживается (keepalive), и пока она лежит в кэше, её
 * разметка отцеплена от документа: высота колонок ноль, барабан подвинуть
 * нельзя. Если корзина менялась в это время, при возврате на страницу
 * кнопка показывала прежнюю сумму, а после смены числа знаков — нули.
 *
 * Страж сверяет второй заход на страницу с тем, что показывает та же
 * страница после перезагрузки.
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3007'

// Что нарисовано на барабанах: сдвиг ленты в долях её высоты.
function readCounter() {
  const root = document.querySelector('.cart-mobile-cta')
  if (!root)
    return 'НЕТ ПАНЕЛИ'
  return [...root.querySelectorAll('.digit-column')].map((col) => {
    const ribbon = col.querySelector('.digit-ribbon')
    const height = ribbon.getBoundingClientRect().height
    const matrix = new DOMMatrixReadOnly(getComputedStyle(ribbon).transform)
    return height ? String(Math.round(-matrix.m42 / (height / 10))) : '?'
  }).join('')
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
  }
  catch {}
})
const page = await ctx.newPage()
const cartLink = () => page.locator('a[href="/cart"]:visible').first()

async function addFromHome(index) {
  const btn = page.locator('button.pc-add').nth(index)
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.waitForTimeout(700)
}

async function openCart() {
  await cartLink().click()
  await page.waitForURL('**/cart')
  await page.waitForTimeout(1800)
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await addFromHome(0)
await openCart()
const first = await page.evaluate(readCounter)

// Корзина меняется, пока страница лежит в кэше удержания.
await page.goBack()
await page.waitForTimeout(1500)
await addFromHome(2)
await openCart()
const second = await page.evaluate(readCounter)
await page.screenshot({ path: 'cart-total-second-visit.png' })

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const afterReload = await page.evaluate(readCounter)

console.log(`первый заход:        ${first}`)
console.log(`второй заход:        ${second}`)
console.log(`после перезагрузки:  ${afterReload}`)

const ok = second === afterReload && !/^0+$/.test(second) && second !== first
console.log(ok
  ? 'ЗЕЛЁНЫЙ: кнопка показывает настоящую сумму сразу при возврате'
  : 'КРАСНЫЙ: сумма в кнопке не совпадает с настоящей')
await browser.close()
process.exit(ok ? 0 : 1)

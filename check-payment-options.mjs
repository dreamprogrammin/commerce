/*
 * Проверка способа оплаты на оформлении: карты быть не должно, остаются Kaspi
 * и наличные, по умолчанию выбран Kaspi.
 *
 * Гостю логин не нужен: товар кладётся кликом по button.pc-add, дальше
 * /checkout открывается сразу. Заказ НЕ оформляется — доходим до формы.
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`${BASE}/catalog/girls`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button.pc-add', { timeout: 60000 })
const add = page.locator('button.pc-add').first()
await add.scrollIntoViewIfNeeded()
await add.click()
await page.waitForTimeout(1500)

await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

await page.waitForFunction(() => {
  return [...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'Способ оплаты')
}, null, { timeout: 30000 })

const state = await page.evaluate(() => {
  const head = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === 'Способ оплаты')
  const box = head.closest('section') || head.parentElement
  const opts = [...box.querySelectorAll('button')].map(b => ({
    text: b.innerText.replace(/\n/g, ' | '),
    active: b.className.includes('co-opt--active'),
  }))
  return { opts }
})

console.log(JSON.stringify(state, null, 2))

{
  const box = page.locator('section', { has: page.locator('h2', { hasText: 'Способ оплаты' }) }).first()
  await box.scrollIntoViewIfNeeded()
  await box.screenshot({ path: 'payment-options.png' })
}

const texts = (state.opts ?? []).map(o => o.text.toLowerCase()).join(' ')
const checks = [
  ['карта убрана', !texts.includes('карт')],
  ['есть Kaspi', texts.includes('kaspi')],
  ['есть наличные', texts.includes('наличн')],
  ['вариантов ровно два', (state.opts ?? []).length === 2],
  ['по умолчанию Kaspi', (state.opts ?? [])[0]?.active === true],
  ['нет ошибок в консоли', errors.length === 0],
]
for (const [name, ok] of checks)
  console.log(`${ok ? '✅' : '❌'} ${name}`)
if (errors.length)
  console.log('ошибки:', errors.slice(0, 3))

await browser.close()
process.exit(checks.every(c => c[1]) ? 0 : 1)

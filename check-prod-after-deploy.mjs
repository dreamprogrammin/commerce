/**
 * Живой сайт после выкатки: витрина открывается, консоль чистая,
 * корзина принимает товар.
 *   node check-prod-after-deploy.mjs
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 140)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 140)}`))

for (const path of ['/', '/catalog/girls/kukly', '/brand/lol-surprise']) {
  const resp = await page.goto(`https://uhti.kz${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const cards = await page.locator('a[href^="/catalog/products/"]').count()
  console.log(`${resp.status()} ${path} — карточек ${cards}`)
}

// корзина: кладём товар и смотрим счётчик — вход не нужен
await page.goto('https://uhti.kz/catalog/girls/kukly', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
const add = page.locator('button.pc-add').first()
if (await add.count()) {
  await add.click()
  await page.waitForTimeout(2500)
  await page.goto('https://uhti.kz/cart', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const empty = (await page.locator('body').innerText()).includes('Корзина пуста')
  console.log(`корзина после добавления: ${empty ? 'ПУСТА — плохо' : 'товар на месте'}`)
}
else {
  console.log('кнопка добавления не найдена')
}

console.log(`ошибок консоли: ${errors.length}${errors.length ? `\n   ${errors.join('\n   ')}` : ''}`)
await browser.close()

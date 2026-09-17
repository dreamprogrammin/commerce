/*
 * Срок доставки, который видит покупатель, обязан совпадать с опубликованными
 * условиями.
 *
 * Почему это проверяется. На `/terms` написано «По Алматы: 1-3 рабочих дня»,
 * а на четырёх видимых местах сайта стояло «1–2 дня» (найдено 17 сентября
 * 2026 глазами, на скриншоте карточки товара):
 *
 *   • карточка товара — плашка «Доставка 1–2 дня по Алматы» и строка
 *     «Курьером по Алматы · 1–2 дня»;
 *   • оформление — «Курьером · за 1–2 дня по Алматы»;
 *   • бренд-лендинг — плитка «Доставка 1–2 дня» (BrandTrustRow).
 *
 * Ровно это расхождение уже разбирали в августе на макетах лендинга: в
 * `constants/brandStaticText.ts` и `BrandLandingHero.vue` лежат комментарии о
 * том, что «1–2 дня» из прототипа противоречит условиям и заменено на 1–3.
 * До этих четырёх мест правка тогда не дошла.
 *
 * Обещать быстрее, чем написано в условиях, — это обещание, за которое
 * магазин отвечает: покупатель видит его в момент выбора способа доставки.
 *
 * Стенд — сборка (оформление рисуется только на клиенте, поэтому браузер):
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-delivery-days.mjs --base=http://localhost:3127
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const PRODUCT = '/catalog/products/akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let'
// LEGO рисуется своим шаблоном без этой плитки — берём любой стандартный.
const BRAND = '/brand/cada'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

/*
 * `networkidle` на бою не наступает — живут вебсокеты и аналитика, и ожидание
 * упирается в таймаут. Ждём разметку и даём гидратации дорисовать.
 */
async function visibleText(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ')
}

console.log('\n1) карточка товара')
{
  const t = await visibleText(PRODUCT)
  check(!/1[–-]2 дн/.test(t), 'нет обещания «1–2 дня»')
  check(/1[–-]3 дн/.test(t), 'срок назван как в условиях — 1–3 дня')
}

console.log('\n2) бренд-лендинг')
{
  const t = await visibleText(BRAND)
  check(!/1[–-]2 дн/.test(t), 'нет обещания «1–2 дня»')
}

console.log('\n3) оформление заказа (рисуется на клиенте)')
{
  // Кладём товар кликом по карточке, как это делает покупатель, — без входа.
  await page.goto(`${BASE}${PRODUCT}`, { waitUntil: 'domcontentloaded' })
  await page.locator('button:has-text("Добавить в корзину")').first().click()
  await page.waitForTimeout(1200)
  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check(/Курьером/.test(t), 'блок выбора доставки виден')
  check(!/1[–-]2 дн/.test(t), 'нет обещания «1–2 дня»')
}

console.log('\n4) сами условия не менялись')
{
  const t = await visibleText('/terms')
  check(/1-3 рабочих дня|1–3 рабочих дня/.test(t), 'на /terms по-прежнему 1-3 рабочих дня по Алматы')
}

await browser.close()
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

/**
 * Поиск на сайте: находит ли «лего», не падает ли на запятой, ведёт ли Enter
 * на страницу результатов.
 *   node search-check.mjs            (локальный dev на 3311)
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3311'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 140)))

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('.sticky-row__search, button:has-text("Найти товары")').first().click()
await page.waitForTimeout(1200)

const input = page.locator('input[type="search"]').filter({ visible: true }).first()
const results = () => page.locator('a[href*="/catalog/products/"]').count()
/** Счётчик в шапке шторки: «Товары · 20». Он считает только найденное. */
async function foundInDrawer() {
  const label = await page.locator('text=/Товары · \\d+/').first().textContent().catch(() => null)
  return label ? Number(label.replace(/\D+/g, '')) : 0
}

async function type(q) {
  await input.fill('')
  await input.type(q, { delay: 40 })
  await page.waitForTimeout(2000)
  return await results()
}

await type('лего')
check(await foundInDrawer() > 0, `шторка: «лего» находит товары (${await foundInDrawer()})`)
await type('машинки')
check(await foundInDrawer() > 0, `«машинки» находит товары (${await foundInDrawer()})`)
await type('кукла, лол')
check((await page.locator('text=Ошибка при поиске').count()) === 0,
  'запятая в запросе больше не роняет поиск')

// Бренд-подсказка
await type('лего')
/*
 * Ищем подсказку именно в шторке, под заголовком «Бренды»: ссылки на бренды
 * есть и на главной под шторкой, и по ним проверка была бы зелёной всегда.
 */
const brandChip = page.locator('h3:has-text("Бренды") + div a[href*="/brand/"], h3:has-text("Бренды") ~ div a[href*="/brand/"]')
check(await brandChip.count() > 0, `бренд предлагается подсказкой: ${(await brandChip.first().textContent().catch(() => '—') || '—').trim()}`)

// Enter уводит на страницу результатов
await input.press('Enter')
await page.waitForTimeout(2500)
check(page.url().includes('/search?q='), `Enter ведёт на страницу результатов: ${page.url()}`)
const onPage = await results()
check(onPage > 0, `на странице результатов есть товары (${onPage})`)
await page.screenshot({ path: 'search-results.png' })

// Прямой заход по ссылке
await page.goto(`${BASE}/search?q=${encodeURIComponent('конструктор лего')}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
check(await results() > 0, `ссылка «/search?q=конструктор лего» открывается со списком (${await results()})`)

// Старая ссылка из истории браузера или из переписки
await page.goto(`${BASE}/catalog/all?q=${encodeURIComponent('лего')}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
check(page.url().includes('/search?q='), `старая ссылка /catalog/all?q= уводит на результаты: ${page.url()}`)
check(await results() > 0, `и показывает найденное (${await results()})`)

await page.goto(`${BASE}/search?q=абракадабра`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
check(await page.locator('text=Ничего не найдено').count() > 0, 'на пустой запрос — честное «Ничего не найдено»')

check(errors.length === 0, `ошибок страницы: ${errors.length ? errors.join(' | ') : 'нет'}`)
await browser.close()
if (failed) process.exitCode = 1

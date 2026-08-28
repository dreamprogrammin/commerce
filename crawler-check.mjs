// Увидит ли поисковый робот содержимое, которое рисуется по мере подхода.
//
// Googlebot выполняет JS, но НЕ скроллит: он рисует страницу в очень высоком
// виртуальном окне. Поэтому проверяем два состояния — что лежит в сыром HTML
// и что видно после отрисовки в высоком окне БЕЗ прокрутки.
import { chromium } from 'playwright'

const UA = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

import { execSync } from 'node:child_process'
const raw = execSync(`curl -sk --compressed -A "${UA}" https://localhost:3111/`, { maxBuffer: 64 * 1024 * 1024 }).toString()

const browser = await chromium.launch()
async function render(w, h, label) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: UA, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(14000)
  // НИКАКОЙ прокрутки — робот её не делает
  const r = await p.evaluate(() => ({
    text: document.body.innerText,
    cat: new Set([...document.querySelectorAll('a[href^="/catalog/"]')].map(a => a.getAttribute('href')).filter(h => !h.includes('products'))).size,
    brand: new Set([...document.querySelectorAll('a[href^="/brand/"]')].map(a => a.getAttribute('href'))).size,
    prod: new Set([...document.querySelectorAll('a[href*="/catalog/products/"]')].map(a => a.getAttribute('href'))).size,
  }))
  await ctx.close()
  return { label, w, h, ...r }
}

const marks = ['Интернет-магазин детских игрушек', 'Официальные бренды', 'Популярные категории', 'Популярные бренды', 'Хиты продаж', 'Акции и бонусы']

console.log('=== сырой HTML (что отдаёт сервер) ===')
for (const m of marks) console.log(`  ${m.padEnd(34)} ${raw.includes(m) ? 'есть' : 'НЕТ'}`)
const count = (s, re) => new Set(s.match(re) || []).size
console.log(`  ссылок: категории ${count(raw, /href="\/catalog\/[a-z0-9-]+"/g)}, бренды ${count(raw, /href="\/brand\/[a-z0-9-]+"/g)}, товары ${count(raw, /href="\/catalog\/products\/[a-z0-9-]+"/g)}`)

for (const [w, h, label] of [[411, 731, 'обычное окно робота'], [411, 12000, 'высокое виртуальное окно']]) {
  const r = await render(w, h, label)
  console.log(`\n=== после отрисовки, ${label} ${w}×${h}, БЕЗ прокрутки ===`)
  for (const m of marks) console.log(`  ${m.padEnd(34)} ${r.text.includes(m) ? 'есть' : 'НЕТ'}`)
  console.log(`  ссылок: категории ${r.cat}, бренды ${r.brand}, товары ${r.prod}`)
}
await browser.close()

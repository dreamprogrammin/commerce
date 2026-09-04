/**
 * Шторка поиска на мобильной ширине: не наезжают ли «-N%» и «В наличии».
 *   BASE=http://localhost:3313 node drawer-badges.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3313'
const browser = await chromium.launch()
const WIDTH = Number(process.env.WIDTH || 390)
const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('.sticky-row__search').first().click()
await page.waitForTimeout(1000)
await page.locator('input[type="search"]').filter({ visible: true }).first().type('лего', { delay: 40 })
await page.waitForTimeout(3000)

const rows = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]')
  const cards = dlg ? [...dlg.querySelectorAll('a[href*="/catalog/products/"]')] : []
  const pack = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) } }
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) > 0 && Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) > 0

  return cards.slice(0, 8).map((card) => {
    const nodes = [...card.querySelectorAll('span, div')]
    const discount = nodes.find(n => /^-\d+%$/.test(n.textContent.trim()))
    const stock = nodes.find(n => /^(В наличии|Нет в наличии)$/.test(n.textContent.trim()))
    const stockPill = stock?.closest('div')
    const old = nodes.find(n => getComputedStyle(n).textDecorationLine.includes('line-through'))
    const cardBox = pack(card)
    return {
      скидка: discount ? pack(discount) : null,
      наличие: stockPill ? pack(stockPill) : null,
      сумма: old ? pack(old) : null,
      наезжают: discount && stockPill ? overlap(pack(discount), pack(stockPill)) : false,
      скидкаОбрезана: discount ? pack(discount).r > cardBox.r - 4 : false,
      /*
       * Зазор считаем только когда плашки на ОДНОЙ строке: после переноса они
       * оказываются одна под другой, и горизонтальное расстояние теряет смысл.
       */
      наОднойСтроке: discount && stockPill
        ? Math.min(pack(discount).b, pack(stockPill).b) - Math.max(pack(discount).t, pack(stockPill).t) > 0
        : false,
      зазор: discount && stockPill ? pack(stockPill).l - pack(discount).r : null,
    }
  })
})

console.log(JSON.stringify(rows.slice(0, 4), null, 1))
const withBoth = rows.filter(r => r.скидка && r.наличие)
check(withBoth.length > 0, `строк со скидкой и наличием: ${withBoth.length}`)
check(withBoth.every(r => !r.наезжают), `плашки не накрывают друг друга (наезжают в ${withBoth.filter(r => r.наезжают).length})`)
const sameLine = withBoth.filter(r => r.наОднойСтроке)
check(sameLine.every(r => Math.abs(r.зазор ?? 99) >= 4),
  sameLine.length
    ? `на одной строке между ними зазор (минимум ${Math.min(...sameLine.map(r => Math.abs(r.зазор ?? 99)))}px)`
    : 'плашки разведены по разным строкам — наезжать нечему')
check(withBoth.every(r => !r.скидкаОбрезана), 'скидка не обрезана краем карточки')

await page.screenshot({ path: `drawer-badges-${WIDTH}.png` })
await browser.close()
if (failed) process.exitCode = 1

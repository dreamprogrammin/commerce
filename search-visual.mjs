/**
 * Картинки и вёрстка в результатах поиска — на мобильной ширине.
 * Стенд поднимается с ПРОД-данными (иначе бакеты пустые и картинок нет вовсе).
 *   BASE=http://localhost:3313 node search-visual.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3313'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await page.goto(`${BASE}/search?q=${encodeURIComponent('лего')}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)

const shot = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href*="/catalog/products/"]')]
  const imgs = cards.map(c => c.querySelector('img')).filter(Boolean)
  const last = cards[cards.length - 1]?.getBoundingClientRect()
  const bar = document.querySelector('nav[class*="fixed"], [class*="tabbar"], footer')?.getBoundingClientRect()
  return {
    карточек: cards.length,
    картинокЗагрузилось: imgs.filter(i => i.naturalWidth > 0).length,
    ошибкаНеЗагрузилось: document.body.innerText.includes('Не загрузилось'),
    ширинаДокумента: document.documentElement.scrollWidth,
    ширинаОкна: document.documentElement.clientWidth,
    высотаПервойКарточки: Math.round(cards[0]?.getBoundingClientRect().height || 0),
    низПоследнейКарточки: Math.round(last?.bottom || 0),
    верхПанели: bar ? Math.round(bar.top) : null,
  }
})
console.log(JSON.stringify(shot, null, 1))

check(shot.карточек > 0, `карточки есть (${shot.карточек})`)
check(shot.картинокЗагрузилось === shot.карточек, `картинки загрузились: ${shot.картинокЗагрузилось} из ${shot.карточек}`)
check(!shot.ошибкаНеЗагрузилось, 'на странице нет «Не загрузилось»')
check(shot.ширинаДокумента <= shot.ширинаОкна, `нет горизонтальной прокрутки (${shot.ширинаДокумента} ≤ ${shot.ширинаОкна})`)
check(shot.высотаПервойКарточки < 130, `строка не раздута по высоте (${shot.высотаПервойКарточки}px)`)

// прокрутка до конца: последняя карточка не должна прятаться под таб-баром
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(1200)
const tail = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href*="/catalog/products/"]')]
  const last = cards[cards.length - 1]?.getBoundingClientRect()
  const bar = [...document.querySelectorAll('div,nav')].find(el => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return s.position === 'fixed' && r.bottom >= window.innerHeight - 4 && r.height > 40 && r.width > 200
  })
  return { низПоследней: Math.round(last?.bottom || 0), верхПанели: bar ? Math.round(bar.getBoundingClientRect().top) : null }
})
console.log('после прокрутки:', JSON.stringify(tail))
check(tail.верхПанели === null || tail.низПоследней <= tail.верхПанели + 2,
  `последняя карточка не уходит под нижнюю панель (низ ${tail.низПоследней}, панель ${tail.верхПанели})`)

await page.screenshot({ path: 'search-fixed-mobile.png' })

// ── та же проверка для шторки поиска ──────────────────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('.sticky-row__search').first().click()
await page.waitForTimeout(1000)
await page.locator('input[type="search"]').filter({ visible: true }).first().type('лего', { delay: 40 })
await page.waitForTimeout(3000)

const drawer = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]')
  const cards = dlg ? [...dlg.querySelectorAll('a[href*="/catalog/products/"]')] : []
  const imgs = cards.map(c => c.querySelector('img')).filter(Boolean)
  return {
    карточек: cards.length,
    загрузилось: imgs.filter(i => i.naturalWidth > 0).length,
    ошибка: (dlg?.innerText || '').includes('Не загрузилось'),
  }
})
console.log('шторка:', JSON.stringify(drawer))
check(drawer.карточек > 0 && drawer.загрузилось === drawer.карточек,
  `в шторке картинки тоже загрузились: ${drawer.загрузилось} из ${drawer.карточек}`)
check(!drawer.ошибка, 'и в шторке нет «Не загрузилось»')
await page.screenshot({ path: 'search-fixed-drawer.png' })

await browser.close()
if (failed) process.exitCode = 1

/**
 * Десктопный поиск: выпадашка с результатами под полем шапки.
 *
 * Владелец: «на десктопе нужно сделать выпадашку с результатами, а не выходить
 * в отдельную страницу». Выпадашка в коде была, но закрывалась сама в тот же
 * кадр — слой Popover считал фокус в поле «фокусом снаружи».
 *   BASE=http://localhost:3313 node desktop-search.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3311'
const PROD_STORAGE = 'https://gvsdevsvzgcivpphcuai.supabase.co'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

// Картинки — с прода: локальные бакеты пустые (см. search-visual.mjs).
await context.route('**/storage/v1/object/public/**', async (route) => {
  const url = new URL(route.request().url())
  try {
    const res = await fetch(PROD_STORAGE + url.pathname + url.search)
    if (!res.ok)
      return route.abort()
    await route.fulfill({
      status: 200,
      contentType: res.headers.get('content-type') || 'image/webp',
      body: Buffer.from(await res.arrayBuffer()),
    })
  }
  catch {
    await route.abort()
  }
})

const page = await context.newPage()

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

const input = page.locator('.sh-search__input').first()
await input.click()
await input.type('лего', { delay: 60 })
await page.waitForTimeout(2500)

const box = await page.evaluate(() => {
  const pop = document.querySelector('[role="listbox"]')
  const items = pop ? [...pop.querySelectorAll('a[href*="/catalog/products/"]')] : []
  /*
   * Настоящие картинки — те, что указывают на вариант `_sm.webp`. Рядом с
   * каждой ProgressiveImage рисует ещё и LQIP-заглушку из data:URI, и если
   * считать всё подряд, проверка меряет заглушки.
   */
  const imgs = pop ? [...pop.querySelectorAll('img')].filter(i => (i.currentSrc || i.src || '').includes('/storage/')) : []
  /*
   * Меряем по ФОРМЕ поиска, а не по <input>: видимая строка поиска — это вся
   * форма с иконкой и полями, input внутри неё уже на ширину иконки.
   */
  const field = document.querySelector('form.sh-search')?.getBoundingClientRect()
  const r = pop?.getBoundingClientRect()
  return {
    открыта: !!pop,
    товаров: items.length,
    брендов: pop ? [...pop.querySelectorAll('a[href*="/brand/"]')].length : 0,
    картинокЗагрузилось: imgs.filter(i => i.naturalWidth > 0).length,
    картинокВсего: imgs.length,
    подПолем: r && field ? r.top >= field.bottom - 2 : false,
    ширина: r ? Math.round(r.width) : 0,
    ширинаПоля: field ? Math.round(field.width) : 0,
    /* Панель должна быть ровно по полю: уже — «приклеена к краю», шире — вылезает. */
    поШиринеПоля: r && field ? Math.abs(r.width - field.width) <= 2 && Math.abs(r.left - field.left) <= 2 : false,
    вЭкране: r ? r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 200 : false,
    показатьВсе: (pop?.innerText || '').includes('Показать все'),
  }
})
console.log(JSON.stringify(box, null, 1))

check(box.открыта, 'выпадашка открывается прямо под полем')
check(box.товаров >= 5, `в ней товары (${box.товаров})`)
check(box.брендов > 0, `и бренд-подсказка (${box.брендов})`)
check(box.картинокЗагрузилось === box.картинокВсего && box.картинокВсего > 0,
  `картинки в выпадашке загрузились: ${box.картинокЗагрузилось} из ${box.картинокВсего}`)
check(box.подПолем && box.вЭкране, `висит под полем и не вылезает за экран (ширина ${box.ширина}px)`)
check(box.поШиринеПоля, `растянута по ширине поля (панель ${box.ширина}px, поле ${box.ширинаПоля}px)`)
check(box.показатьВсе, 'есть ссылка «Показать все» — страница остаётся как запасной путь')

await page.screenshot({ path: 'desktop-dropdown.png', clip: { x: 0, y: 0, width: 1440, height: 760 } })

// Стрелка вниз + Enter открывают товар, не уводя на страницу поиска
await input.press('ArrowDown')
await page.waitForTimeout(400)
await input.press('Enter')
await page.waitForTimeout(2500)
check(/\/(catalog\/products|brand)\//.test(page.url()), `стрелка+Enter открывают товар: ${page.url()}`)

// Клик мимо закрывает
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await input.click()
await input.type('лего', { delay: 50 })
await page.waitForTimeout(2200)
await page.mouse.click(20, 700)
await page.waitForTimeout(800)
check(await page.evaluate(() => !document.querySelector('[role="listbox"]')), 'клик мимо закрывает выпадашку')

await browser.close()
if (failed) process.exitCode = 1

/**
 * Страница результатов должна выглядеть как каталог: сетка карточек, шапка
 * сайта, цена со скидкой и бонусы на карточке.
 *
 * Стенд — ЛОКАЛЬНАЯ база (в ней уже лежит новая версия search_products), а
 * картинки подставляются с прода: локальные бакеты пустые.
 *   node search-page-grid.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3311'
const PROD_STORAGE = 'https://gvsdevsvzgcivpphcuai.supabase.co'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

// Картинки берём с прода: локальные бакеты пусты, иначе сетку не разглядеть.
await context.route('**/storage/v1/object/public/**', async (route) => {
  const url = new URL(route.request().url())
  try {
    const res = await fetch(PROD_STORAGE + url.pathname + url.search)
    if (!res.ok)
      return route.abort()
    const body = Buffer.from(await res.arrayBuffer())
    await route.fulfill({ status: 200, contentType: res.headers.get('content-type') || 'image/webp', body })
  }
  catch {
    await route.abort()
  }
})

const page = await context.newPage()
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await page.goto(`${BASE}/search?q=${encodeURIComponent('лего')}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

const desk = await page.evaluate(() => {
  const grid = document.querySelector('.grid.grid-cols-2')
  const cards = [...document.querySelectorAll('a[href*="/catalog/products/"]')]
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
  const imgs = [...document.querySelectorAll('img')].filter(i => (i.currentSrc || i.src || '').includes('/storage/'))
  return {
    сетка: !!grid,
    колонок: cols,
    карточек: cards.length,
    шапкаСайта: !!document.querySelector('header'),
    заголовок: document.querySelector('h1')?.textContent?.trim(),
    счётчик: document.body.innerText.match(/\d+ товар\w*/)?.[0] || null,
    картинокЗагрузилось: imgs.filter(i => i.naturalWidth > 0).length,
    картинокВсего: imgs.length,
    /*
     * Цену ищем в самой карточке сетки, а не в первой попавшейся ссылке на
     * товар: ссылка-картинка текста не содержит, и проверка врала.
     */
    ценаНаКарточке: grid ? /₸/.test(grid.children[0]?.innerText || '') : false,
    бонусыНаКарточке: grid ? /бонус/.test(grid.children[0]?.innerText || '') : false,
    прокруткаВбок: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }
})
console.log(JSON.stringify(desk, null, 1))

check(desk.сетка && desk.колонок >= 4, `на десктопе сетка каталога (${desk.колонок} колонки)`)
check(desk.карточек >= 15, `карточек в выдаче (${desk.карточек})`)
check(desk.шапкаСайта, 'страница в обычном макете сайта — с шапкой')
check(/лего/i.test(desk.заголовок || ''), `заголовок с запросом: «${desk.заголовок}»`)
check(!!desk.счётчик, `счётчик найденного: ${desk.счётчик}`)
check(desk.ценаНаКарточке, 'на карточке цена')
check(desk.бонусыНаКарточке, 'и бонусы — карточка та же, что в каталоге')
check(desk.картинокВсего > 0 && desk.картинокЗагрузилось === desk.картинокВсего,
  `картинки загрузились: ${desk.картинокЗагрузилось} из ${desk.картинокВсего}`)
check(!desk.прокруткаВбок, 'нет горизонтальной прокрутки')
await page.screenshot({ path: 'search-grid-desktop.png', clip: { x: 0, y: 0, width: 1440, height: 900 } })

// ── мобильная ширина ──────────────────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const mob = await page.evaluate(() => {
  const grid = document.querySelector('.grid.grid-cols-2')
  return {
    колонок: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    /*
     * Своих полей ввода на странице быть не должно: поиск живёт в шапке, а
     * второе поле под заголовком «Поиск: …» — это и есть та самая «кривая
     * вёрстка», на которую жаловался владелец.
     */
    видимыхПолейПоиска: [...document.querySelectorAll('input[type="search"]')].filter(i => !!i.offsetParent).length,
    прокруткаВбок: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }
})
console.log('мобильная:', JSON.stringify(mob))
check(mob.колонок === 2, `на телефоне две колонки (${mob.колонок})`)
check(mob.видимыхПолейПоиска === 0, `на телефоне нет второго поля поиска (видимых полей: ${mob.видимыхПолейПоиска})`)
check(!mob.прокруткаВбок, 'на телефоне нет горизонтальной прокрутки')
await page.screenshot({ path: 'search-grid-mobile.png' })

await browser.close()
if (failed) process.exitCode = 1

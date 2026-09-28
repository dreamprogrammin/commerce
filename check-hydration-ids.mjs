/*
 * id с сервера и из браузера совпадают: выпадающие фильтры и сортировка.
 *
 * Почему это проверяется (28 сентября 2026). Nuxt вычищает onServerPrefetch
 * из браузерной сборки, а Vue 3.5 по нему отмечает асинхронные границы, из
 * которых строит useId(). На сервере семь иконок шапки (@nuxt/icon) — границы,
 * в браузере — нет, и у каждого выпадающего меню на разделах каталога id
 * расходились: кнопка оставалась с серверным «reka-popover-trigger-v-0-7-5»,
 * а открытое меню ссылалось на «…v-0-0-5», которого на странице нет.
 * Программа чтения с экрана не узнавала, чьё это меню. Боевая сборка такие
 * расхождения атрибутов в консоль не пишет — поэтому проверяется по симптому:
 * открываем меню и смотрим, что ссылки между кнопкой и меню ведут на
 * существующие элементы. Правка — встроенный модуль в nuxt.config.ts
 * (keepServerPrefetchOnClient).
 *
 * Второй раздел — прямой заход по отфильтрованной ссылке. ISR на Vercel
 * строит страницу без query, а браузер при гидратации видел фильтр в адресе и
 * рисовал другое: «Hydration completed but contains mismatches» на каждом
 * таком заходе (бой, 28 сентября 2026) — это и было «плавающее» расхождение
 * 25–26 сентября. Правка — rendersWithoutQuery в pages/catalog/[...slug].vue.
 * Стенд без ISR проверять за прокси, срезающим query (как бой).
 *
 *   node check-hydration-ids.mjs --base=http://localhost:3127
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const PAGES = [
  '/catalog/boys/mashinki',
  '/catalog/girls/kukly',
  '/catalog/boys/letayushchie-igrushki',
  '/catalog/constructors-root',
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const FILTERED = [
  '/catalog/kiddy?materials=3',
  '/catalog/boys/mashinki/radioupravlyaemye-mashinki?sort_by=price_asc',
  '/catalog/boys/mashinki/radioupravlyaemye-mashinki?attr_pitanie=22',
  '/catalog/boys/mashinki/radioupravlyaemye-mashinki?price_min=10000',
]

console.log(`сайт ${BASE}`)
const browser = await chromium.launch()
try {
  console.log('\n== меню: кнопка и меню ссылаются друг на друга')
  for (const path of PAGES) {
    // На телефоне фильтры — шторкой, выпадающие меню — на десктопе
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
      .catch(() => {})
    await page.waitForTimeout(2500)

    const trigger = page.locator('button[aria-haspopup="dialog"]:visible').first()
    if (!(await trigger.count())) {
      check(false, `${path}: выпадающего меню на странице нет`)
      await page.close()
      continue
    }
    await trigger.click()
    await page.waitForTimeout(800)
    const r = await trigger.evaluate((el) => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]')
      const labelledby = dialog?.getAttribute('aria-labelledby') ?? null
      const controls = el.getAttribute('aria-controls')
      return {
        name: el.textContent.trim().slice(0, 30),
        triggerId: el.id,
        labelledby,
        labelledbyIsTrigger: !!labelledby && document.getElementById(labelledby) === el,
        controlsIsDialog: !!controls && !!dialog && document.getElementById(controls) === dialog,
      }
    })
    check(
      r.labelledbyIsTrigger && r.controlsIsDialog,
      `${path}: меню «${r.name}» ссылается на свою кнопку (${r.labelledby}${r.labelledbyIsTrigger ? '' : ` — а у кнопки ${r.triggerId}`})`,
    )
    await page.close()
  }

  console.log('\n== прямой заход по отфильтрованной ссылке — без расхождения гидратации')
  for (const path of FILTERED) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const mismatch = []
    page.on('console', (m) => {
      if (/Hydration/i.test(m.text()))
        mismatch.push(m.text())
    })
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForTimeout(3000)
    check(!mismatch.length, `${path}${mismatch.length ? ` — ${mismatch[0].slice(0, 90)}` : ''}`)
    await page.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

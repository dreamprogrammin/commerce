/*
 * Режим шапки не протекает со страницы LEGO на другие страницы.
 *
 * Почему это проверяется (23 сентября 2026). Лендинг LEGO гасит липкую шапку
 * правкой оболочки (`setShellOverride` в `lib/shell.ts`). Правка лежала в
 * переменной модуля, а модуль на сервере один на все запросы, и
 * `onScopeDispose` при серверной отрисовке не вызывается. После одного
 * запроса LEGO сервер отдавал нелипкую шапку и другим страницам: на бою в
 * разметке `/about`, `/terms`, `/brands`, `/brand/mokatoys` стояло
 * `position:static`. Vue на клиенте ждал липкую — расхождение гидратации, а
 * в DOM оставалась `position:static` плюс распорка под fixed-шапку: над
 * шапкой пустая полоса 74 px до первой прокрутки.
 *
 * Что проверяет:
 *  1) сервер: после запроса LEGO страницы с обычной шапкой отдаются с
 *     `position:fixed` — порядок запросов не важен;
 *  2) браузер: такие страницы без расхождения гидратации и без полосы над
 *     шапкой; на LEGO шапка после загрузки нелипкая, как задумано;
 *  3) переходы внутри сайта: LEGO → «О нас» — шапка снова липкая,
 *     обратно — снова нелипкая, и на экране LEGO, а не прежняя страница;
 *     с LEGO в карточку и «Назад» — тоже LEGO. Правка шапки, выставленная
 *     во время загрузки страницы, ломала её удержание в кэше: возврат
 *     оставлял на экране прежнюю страницу под адресом `/brand/lego`.
 *
 *   node check-shell-header.mjs --base=http://localhost:3129
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const LEGO = '/brand/lego'
const REGULAR = ['/about', '/terms', '/brands', '/brand/mokatoys']

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
async function ssrHeader(path) {
  const html = await (await fetch(`${BASE}${path}`)).text()
  return html.match(/style="position:(\w+);z-index:100/)?.[1] ?? 'нет шапки'
}
/** Режим шапки в браузере: position обёртки, высота распорки, отступ контента. */
async function liveHeader(page) {
  return page.evaluate(() => {
    const h = document.querySelector('[style*="z-index:100"],[style*="z-index: 100"]')
    const main = document.querySelector('main')
    return {
      position: h ? getComputedStyle(h).position : null,
      headerTop: h ? Math.round(h.getBoundingClientRect().top) : null,
      mainTop: main ? Math.round(main.getBoundingClientRect().top + window.scrollY) : null,
      headerH: h ? Math.round(h.getBoundingClientRect().height) : null,
    }
  })
}

console.log(`сайт ${BASE}\n\n1) сервер: после LEGO`)
for (const path of REGULAR) {
  await ssrHeader(LEGO)
  const pos = await ssrHeader(path)
  check(pos === 'fixed', `${path} после ${LEGO}: шапка ${pos}`)
}

console.log('\n2) браузер')
const browser = await chromium.launch()
try {
  for (const path of ['/about', '/terms']) {
    await ssrHeader(LEGO)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const mismatch = []
    page.on('console', m => /Hydration/i.test(m.text()) && mismatch.push(m.text()))
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForTimeout(2500)
    const h = await liveHeader(page)
    check(!mismatch.length, `${path}: гидратация без расхождений`)
    check(h.position === 'fixed' && h.headerTop <= 1, `${path}: шапка липкая и у верхнего края (${h.position}, top ${h.headerTop})`)
    check(h.mainTop !== null && h.mainTop <= h.headerH + 2, `${path}: над шапкой нет пустой полосы (контент с ${h.mainTop}px при шапке ${h.headerH}px)`)
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const mismatch = []
  const pageErrors = []
  page.on('console', m => /Hydration/i.test(m.text()) && mismatch.push(m.text()))
  page.on('pageerror', e => pageErrors.push(e.message.slice(0, 120)))
  await page.goto(`${BASE}${LEGO}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(2500)
  check(!mismatch.length, `${LEGO}: гидратация без расхождений`)
  check((await liveHeader(page)).position === 'static', `${LEGO}: шапка нелипкая, как задумано у лендинга`)

  console.log('\n3) переходы внутри сайта')
  const go = async (to) => {
    await page.evaluate((path) => {
      document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push(path)
    }, to)
    await page.waitForURL(url => url.pathname === to, { timeout: 20000 })
    await page.waitForTimeout(2000)
    return liveHeader(page)
  }
  const legoH1 = () => page.evaluate(() => [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null).map(h => h.textContent.trim().replace(/\s+/g, ' ')))
  check((await go('/about')).position === 'fixed', `${LEGO} → /about: шапка липкая`)
  check((await go(LEGO)).position === 'static', `/about → ${LEGO}: шапка снова нелипкая`)
  const h1Back = await legoH1()
  check(h1Back.includes('Конструкторы LEGO в Алматы'), `/about → ${LEGO}: на экране LEGO, а не прежняя страница (${JSON.stringify(h1Back)})`)
  check((await go('/brand/mokatoys')).position === 'fixed', `${LEGO} → /brand/mokatoys: шапка липкая`)

  // Путь покупателя: с LEGO в карточку набора и «Назад» в браузере. До
  // 23 сентября 2026 на бою здесь оставалась карточка под адресом LEGO и
  // падало «Cannot read properties of null (reading 'suspenseId')».
  await go(LEGO)
  const card = page.locator('a[href^="/catalog/products/"]:visible').first()
  const cardHref = await card.getAttribute('href')
  await go(cardHref)
  await page.goBack()
  await page.waitForURL(url => url.pathname === LEGO, { timeout: 20000 })
  await page.waitForTimeout(2500)
  const h1Card = await legoH1()
  check(h1Card.includes('Конструкторы LEGO в Алматы'), `${LEGO} → карточка → «Назад»: на экране LEGO (${JSON.stringify(h1Card)})`)
  check(!pageErrors.length, `ошибок страницы нет${pageErrors.length ? ` — ${pageErrors[0]}` : ''}`)
  await page.close()
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

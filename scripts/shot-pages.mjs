import { mkdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
// Полный визуальный прогон до/после обёртки scoped-стилей в @layer.
// Запускать из корня репозитория: из /tmp не разрешится импорт playwright.
// Запуск: node scripts/shot-pages.mjs <метка>     (before | after)
//
// Корзина наполняется через интерфейс, а не подделкой localStorage: так форма
// данных заведомо настоящая и заодно прогоняется реальный код добавления.
import { chromium } from 'playwright'

const label = process.argv[2] || 'run'
const base = process.env.BASE || 'http://localhost:3899'
const outDir = `${process.env.SHOTS_DIR || 'node_modules/.cache/uhti-shots'}/${label}`
mkdirSync(outDir, { recursive: true })

// Если Chromium не стартует из-за отсутствия libnspr4/libnss3/libasound, а
// поставить их системно нечем (sudo просит пароль), пакеты качаются
// `apt-get download` (root не нужен), распаковываются `dpkg-deb -x` и путь к
// ним передаётся сюда: EXTRA_LIB_PATH=/куда/распаковали/usr/lib/x86_64-linux-gnu
if (process.env.EXTRA_LIB_PATH) {
  process.env.LD_LIBRARY_PATH = [process.env.EXTRA_LIB_PATH, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':')
}

const widths = [['mobile', 390, 844], ['desktop', 1280, 1000]]
const report = []

const browser = await chromium.launch()

for (const [wName, width, height] of widths) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))

  const shot = async (name, settle = 900) => {
    await page.waitForTimeout(settle)
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await page.screenshot({ path: `${outDir}/${name}-${wName}.png`, fullPage: true })
    report.push({ name, w: wName, overflow, errors: errors.length })
    if (overflow > 0)
      console.log(`  ⚠ ${name}/${wName}: горизонтальный вылет ${overflow}px`)
    return overflow
  }

  const go = async (path) => {
    const r = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
    return r ? r.status() : 0
  }

  console.log(`\n──── ${wName} ────`)

  console.log(`home        http=${await go('/')}`)
  await shot('01-home')

  console.log(`catalog     http=${await go('/catalog')}`)
  await shot('02-catalog')

  // Листинг с атрибутными фильтрами — тут живут .cf-glass-btn, ради которых
  // всё и затевалось. /catalog — витрина категорий, товаров на ней нет.
  console.log(`listing     http=${await go('/catalog/all')}`)
  await shot('03-listing')

  // Панель фильтров. MobileCatalogDrawer и DynamicFilters в закрытом виде в
  // разметке отсутствуют, поэтому без этого шага они не проверяются вовсе.
  try {
    const fb = page.locator('button[aria-label="Фильтры"]').first()
    await fb.waitFor({ state: 'visible', timeout: 8000 })
    await fb.click({ timeout: 8000, force: true })
    await page.waitForTimeout(1800)
    const drawer = await page.locator('.mcd-aside, .df-aside').count()
    console.log(`  панель фильтров: элементов .mcd-aside/.df-aside = ${drawer}`)
    await shot('03b-filters')
    // Не пытаемся закрыть кнопкой или Escape: панель остаётся поверх страницы
    // и перехватывает клики, из-за чего дальше не добавлялись товары в корзину.
    // Перезагрузка возвращает заведомо чистое состояние.
    await go('/catalog/all')
    await page.waitForTimeout(800)
  }
  catch (e) {
    console.log(`  фильтры не открылись: ${e.message.split('\n')[0].slice(0, 70)}`)
  }

  // Наполняем корзину через интерфейс
  const addBtns = page.locator('[aria-label="В корзину"]')
  const n = await addBtns.count()
  let added = 0
  for (let i = 0; i < Math.min(n, 3); i++) {
    try {
      await addBtns.nth(i).click({ timeout: 4000 })
      await page.waitForTimeout(500)
      added++
    }
    catch { /* карточка могла быть перекрыта — не критично */ }
  }
  console.log(`в корзину добавлено: ${added} из найденных ${n}`)

  // Карточка товара
  const link = page.locator('a[href*="/catalog/products/"]').first()
  if (await link.count()) {
    const href = await link.getAttribute('href')
    console.log(`product     http=${await go(href)}`)
    await shot('04-product')
  }

  console.log(`cart        http=${await go('/cart')}`)
  const cartItems = await page.locator('article').count()
  console.log(`  позиций в корзине: ${cartItems}`)
  await shot('05-cart')

  console.log(`checkout    http=${await go('/checkout')}`)
  // Гостю через 800мс всплывает GuestBonusModal и перекрывает пол-страницы —
  // закрываем, иначе снимок бесполезен, а клики уходят в оверлей.
  await page.waitForTimeout(1500)
  try {
    await page.locator('button:has-text("Нет, спасибо")').first().click({ timeout: 4000 })
    await page.waitForTimeout(600)
    console.log('  модалка гостя закрыта')
  }
  catch { console.log('  модалки гостя не было') }
  await shot('06-checkout-courier')

  // Самовывоз — раскрывает секцию пунктов
  try {
    // Именно текстовый локатор: getByRole по доступному имени эту кнопку не
    // находит, хотя в DOM она есть и видима.
    const pickBtn = page.locator('button:has-text("Самовывоз")').first()
    await pickBtn.waitFor({ state: 'visible', timeout: 15000 })
    await pickBtn.scrollIntoViewIfNeeded({ timeout: 8000 })
    // липкая CTA-панель перекрывает низ экрана, поэтому force
    await pickBtn.click({ timeout: 8000, force: true })
    await page.waitForTimeout(1200)
    // Проверяем по заголовку секции и адресам пунктов, а не по слову
    // «Алматы»: оно есть и в локейшн-панели, и в поле города — по нему
    // проверка проходила даже когда самовывоз не включился.
    const hasSection = await page.locator('h2:has-text("Пункт самовывоза")').count()
    const pts = await page.locator('button:has-text("Розыбакиева"), button:has-text("пр.")').count()
    const stillCourier = await page.locator('h2:has-text("Дата")').count()
    console.log(`  секция «Пункт самовывоза»: ${hasSection}, пунктов: ${pts}, курьерские поля остались: ${stillCourier}`)
    await shot('07-checkout-pickup')
  }
  catch (e) {
    console.log(`  самовывоз не переключился: ${e.message.split('\n')[0].slice(0, 80)}`)
  }

  // Страницы, которым не нужно взаимодействие. Слаги живые: lego рисуется
  // кастомным шаблоном, cada — стандартным, так что покрыты оба. Если бренд
  // уберут из каталога, шаг отдаст 404 — это видно в выводе, а не молча.
  const plain = [
    ['08-brand-custom', '/brand/lego'],
    ['09-brand-standard', '/brand/cada'],
    ['10-brand-line', '/brand/lego/lego-city'],
    // Заказ читается по id, но RLS не отдаёт его анониму (проверено запросом
    // к orders — пустой ответ). Снимается состояние «заказ не найден»: этого
    // хватает для раскладки, но НЕ покрывает OrderTracker, OrderProgressBar и
    // OrderTrackerLottie — их видно только на реальном заказе, под логином.
    // 6 секунд — чтобы осело конфетти: canvas-confetti стреляет при монтаже,
    // и на 900мс снимок ловил летящие частицы, то есть чистый шум.
    ['11-order-success', '/order/success/00000000-0000-0000-0000-000000000000', 6000],
  ]
  for (const [name, path, settle] of plain) {
    console.log(`${name.padEnd(18)} http=${await go(path)}`)
    await shot(name, settle)
  }

  if (errors.length) {
    console.log(`  ошибки консоли (${errors.length}):`)
    for (const e of [...new Set(errors)].slice(0, 5)) console.log(`    ! ${e.slice(0, 150)}`)
  }
  await ctx.close()
}

await browser.close()
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2))
console.log(`\nСкриншотов: ${report.length}   →  ${outDir}`)

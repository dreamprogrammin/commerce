/**
 * Analytics поднимается по действию посетителя, а не в загрузку.
 *
 * Проверяем три вещи, каждая из которых может сломаться молча:
 *   1. при загрузке внешнего скрипта счётчика нет вовсе;
 *   2. очередь `dataLayer` при этом уже заполнена — просмотр страницы
 *      записан и не потеряется;
 *   3. скрипт приезжает и по касанию, и сам по себе через несколько секунд
 *      (иначе из статистики выпали бы все, кто ушёл, ничего не нажав).
 *
 * И с 28 сентября 2026 — кого НЕ считать (utils/analyticsOptOut.ts):
 *   4. автоматический браузер (`navigator.webdriver`) — счётчик не поднимается
 *      ни по касанию, ни сам: проверки сайта пачкали статистику;
 *   5. выключатель владельца: `?no_analytics=1` — подтверждение на экране,
 *      счётчик молчит и на следующих заходах без параметра; `?no_analytics=0`
 *      возвращает учёт.
 *
 * Проверки 1–3 и 5 изображают обычного посетителя: `navigator.webdriver`
 * подменён на `false`. Иначе счётчик теперь справедливо не поднимется.
 *
 * Стенд — боевая сборка, собранная с ТЕСТОВЫМ идентификатором:
 *   NUXT_PUBLIC_GTAG_ID=G-TEST00000 pnpm build
 *   node .output/server/index.mjs
 *   BASE=http://localhost:3000 node check-gtag-lazy.mjs
 */
import os from 'node:os'
import process from 'node:process'
import { chromium, devices } from 'playwright'

const SCRATCH = process.env.SC || os.tmpdir()
const BASE = process.env.BASE || 'http://localhost:3000'
const IS_GTAG = url => /googletagmanager\.com\/gtag\/js|gtag\/js\?id=/.test(url)

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

const browser = await chromium.launch()

/** Обычный посетитель — браузер не сообщает, что он автоматический. */
function asPerson(context) {
  return context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
}

async function open({ automated = false, context: given, path = '/' } = {}) {
  const context = given ?? await browser.newContext({ ...devices['Pixel 5'] })
  if (!automated && !given)
    await asPerson(context)
  const page = await context.newPage()
  const hits = []
  const t0 = Date.now()
  page.on('request', (r) => {
    if (IS_GTAG(r.url()))
      hits.push(Date.now() - t0)
  })
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 180000 })
  return { context, page, hits }
}

/*
 * Ждём, пока приложение оживёт: очередь и обработчики появляются только
 * после гидрации, а на медленной сети это дольше, чем кажется. Без этого
 * ожидания страж краснел на бою, хотя счётчик работал правильно.
 */
const waitForQueue = page => page.waitForFunction(
  () => (window.dataLayer?.length ?? 0) > 0,
  null,
  { timeout: 20000 },
).catch(() => {})

// ── 1. При загрузке счётчика нет, но очередь уже собрана ──────────────────
{
  const { context, page, hits } = await open()
  await waitForQueue(page)
  check(hits.length === 0, `при загрузке скрипт счётчика не запрошен (запросов: ${hits.length})`)

  const queue = await page.evaluate(() => (window.dataLayer || []).map(a => Array.from(a)[0]))
  check(queue.includes('config'), `очередь dataLayer собрана: ${JSON.stringify(queue)}`)
  await context.close()
}

// ── 2. Касание поднимает счётчик ──────────────────────────────────────────
{
  const { context, page, hits } = await open()
  await waitForQueue(page)
  await page.mouse.click(180, 400)
  await page.waitForTimeout(2500)
  check(hits.length > 0, `после касания скрипт запрошен (через ${hits[0] ?? '—'} мс от начала)`)
  await context.close()
}

// ── 3. Без действий счётчик поднимается сам ───────────────────────────────
{
  const { context, page, hits } = await open()
  await page.waitForTimeout(12000)
  check(hits.length > 0, `без действий счётчик поднялся сам (через ${hits[0] ?? '—'} мс)`)
  check(hits.length <= 2, `лишних запросов нет (всего ${hits.length})`)
  await page.screenshot({ path: `${SCRATCH}/gtag-lazy.png` })
  await context.close()
}

// ── 4. Автоматический браузер не считается ────────────────────────────────
{
  const { context, page, hits } = await open({ automated: true })
  await page.waitForTimeout(3000)
  await page.mouse.click(180, 400)
  await page.waitForTimeout(9000)
  check(hits.length === 0, `автоматический браузер: счётчик не поднялся ни по касанию, ни сам (запросов: ${hits.length})`)
  await context.close()
}

// ── 5. Выключатель владельца ──────────────────────────────────────────────
{
  const context = await browser.newContext({ ...devices['Pixel 5'] })
  await asPerson(context)
  const toastShown = page => page.waitForSelector('[data-sonner-toast]', { timeout: 15000 })
    .then(el => el.textContent())
    .catch(() => '')

  const off = await open({ context, path: '/?no_analytics=1' })
  const offText = await toastShown(off.page)
  check(offText.includes('выключен'), `?no_analytics=1 — подтверждение на экране: «${offText.trim()}»`)
  await off.page.mouse.click(180, 400)
  await off.page.waitForTimeout(9000)
  const flag = await off.page.evaluate(() => localStorage.getItem('uhti:no-analytics'))
  check(off.hits.length === 0 && flag === '1', `?no_analytics=1 — счётчик молчит (запросов: ${off.hits.length}), флаг записан: ${flag}`)
  await off.page.close()

  const later = await open({ context, path: '/' })
  await later.page.mouse.click(180, 400)
  await later.page.waitForTimeout(9000)
  check(later.hits.length === 0, `следующий заход без параметра — счётчик по-прежнему молчит (запросов: ${later.hits.length})`)
  await later.page.close()

  const on = await open({ context, path: '/?no_analytics=0' })
  const onText = await toastShown(on.page)
  check(onText.includes('включён'), `?no_analytics=0 — подтверждение на экране: «${onText.trim()}»`)
  await on.page.mouse.click(180, 400)
  await on.page.waitForTimeout(2500)
  check(on.hits.length > 0, `?no_analytics=0 — учёт вернулся, скрипт запрошен (запросов: ${on.hits.length})`)
  await context.close()
}

await browser.close()
console.log(failed ? '\n❌ есть падения' : '\n✅ всё сошлось')
process.exit(failed ? 1 : 0)

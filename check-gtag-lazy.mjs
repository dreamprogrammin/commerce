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

async function open() {
  const context = await browser.newContext({ ...devices['Pixel 5'] })
  const page = await context.newPage()
  const hits = []
  const t0 = Date.now()
  page.on('request', (r) => {
    if (IS_GTAG(r.url()))
      hits.push(Date.now() - t0)
  })
  await page.goto(BASE, { waitUntil: 'load', timeout: 180000 })
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

await browser.close()
console.log(failed ? '\n❌ есть падения' : '\n✅ всё сошлось')
process.exit(failed ? 1 : 0)

/**
 * Отложенная гидрация секций главной: разметка на месте сразу, оживление —
 * при прокрутке, и после него секции работают.
 *
 * Пять секций ниже первого экрана переведены на `hydrate-on-visible`. Риск
 * такой правки — не в вёрстке, а в двух вещах: текст мог пропасть из
 * серверной разметки (пострадал бы поиск) и секция могла остаться мёртвой
 * после прокрутки. Страж проверяет обе.
 *
 *   BASE=http://localhost:3000 node check-home-lazy.mjs
 */
import os from 'node:os'
import process from 'node:process'
import { chromium, devices } from 'playwright'

const SCRATCH = process.env.SC || os.tmpdir()
const BASE = process.env.BASE || 'http://localhost:3000'

const SECTIONS = [
  'Популярные категории',
  'Популярные бренды',
  'Товар дня',
  'Акции и бонусы',
  'Хиты продаж',
]

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

// ── 1. Текст есть в серверной разметке, без всякого JavaScript ────────────
const html = await (await fetch(BASE)).text()
for (const t of SECTIONS)
  check(html.includes(t), `в серверной разметке есть «${t}»`)

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3 })
const page = await context.newPage()
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 160)}`))

await page.goto(BASE, { waitUntil: 'load', timeout: 180000 })
await page.waitForTimeout(2500)

// ── 2. Секции видны после прокрутки ───────────────────────────────────────
for (const t of SECTIONS) {
  const node = page.getByText(t, { exact: false }).first()
  await node.scrollIntoViewIfNeeded({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)
  check(await node.isVisible().catch(() => false), `после прокрутки видно «${t}»`)
}

// ── 3. Ожившая секция работает: «Показать ещё» добавляет товары ───────────
const more = page.getByRole('button', { name: /Показать ещё/i }).first()
if (await more.count()) {
  const cards = () => page.locator('[data-testid="product-card"], .pc-add').count()
  await more.scrollIntoViewIfNeeded()
  const before = await cards()
  await more.click()
  await page.waitForTimeout(2500)
  const after = await cards()
  check(after > before, `«Показать ещё» добавила товары: ${before} → ${after}`)
}
else {
  check(false, 'кнопка «Показать ещё» не найдена')
}

check(errors.length === 0, `ошибок консоли: ${errors.length}${errors.length ? ` — ${errors[0]}` : ''}`)

await page.screenshot({ path: `${SCRATCH}/home-lazy.png`, fullPage: true })
console.log(`снимок: ${SCRATCH}/home-lazy.png`)
await browser.close()
process.exit(failed ? 1 : 0)

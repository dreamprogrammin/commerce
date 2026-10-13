/**
 * Возврат «Назад» на удержанную страницу каталога показывает СВОИ бренды,
 * линейки и вопросы, а не соседнего раздела.
 *
 * Зачем. `<NuxtPage :keepalive>` держит в памяти несколько экземпляров
 * `pages/catalog/[...slug].vue`, а бренды, линейки и SEO связки жили в
 * `useState` с постоянным ключом — одном на все экземпляры. На бою 13
 * октября 2026: «Девочкам + Cufan» → `/catalog` → «Мальчикам» → «Назад» ×2 —
 * у Cufan «Другие бренды» мальчиков (`/catalog/girls/brand/hstar`…), вопросы
 * раздела вместо своих, а фоновая перерисовка скрытой страницы падала в
 * консоль с `insertBefore`. Нужен второй заход — первый зелёный всегда.
 *
 *   BASE=http://localhost:3000 node check-catalog-back-state.mjs
 * (из корня репозитория; стенд — сборка с боевыми данными на чтение или бой)
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '')
const START = process.env.START || '/catalog/girls/brand/cufan'
const OTHER = process.env.OTHER || '/catalog/boys'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 160)))
page.on('console', (m) => {
  if (m.type() === 'error')
    errors.push(m.text().slice(0, 160))
})

function snapshot() {
  return page.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText,
    links: [...new Set([...document.querySelectorAll('a[href*="/brand/"]')].map(a => a.getAttribute('href')))].sort().join(','),
    h2: [...document.querySelectorAll('h2')].map(h => h.innerText.trim()).join(' | '),
  }))
}
async function follow(href) {
  await page.evaluate(h => document.querySelector(`a[href="${h}"]`).click(), href)
  await page.waitForURL(u => new URL(u).pathname === href)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}
async function back() {
  await page.goBack()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}

await page.goto(BASE + START, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const before = await snapshot()
await follow('/catalog')
await follow(OTHER)
await back()
await back()
const after = await snapshot()
await browser.close()

let failed = false
for (const key of Object.keys(before)) {
  const ok = before[key] === after[key]
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${key}${ok ? '' : `\n   было:  ${before[key]}\n   стало: ${after[key]}`}`)
}
const ok = errors.length === 0
if (!ok)
  failed = true
console.log(`${ok ? '✅' : '❌'} ошибок в консоли: ${errors.length}${ok ? '' : `\n   ${errors.join('\n   ')}`}`)
process.exit(failed ? 1 : 0)

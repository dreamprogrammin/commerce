/*
 * Уведомления не должны пересчитывать стили всей страницы на загрузке.
 *
 * Почему это проверяется. `vue-sonner` 2.0.9 по умолчанию берёт у <Toaster>
 * `dir: "auto"` и тогда на КАЖДОЙ отрисовке зовёт getDocumentDirection()
 * (`lib/index.js`, стр. 1165). У <html> сайта атрибута dir нет, поэтому та
 * идёт в window.getComputedStyle(document.documentElement) — принудительный
 * пересчёт стилей всей страницы в разгар загрузки.
 *
 * Замер 21 сентября 2026 (js-cpu-by-package.mjs, эмуляция телефона /4):
 * 121 мс из 125, что тратит библиотека на главной. С dir="ltr" — 3 мс.
 *
 * Проверяем не время (оно шумит на ±100 мс), а сам вызов: считаем
 * getComputedStyle(document.documentElement) за загрузку и первые секунды.
 *
 * Стенд — сборка:
 *   pnpm build && set -a && . ./.env && set +a && PORT=3127 node .output/server/index.mjs
 *   node check-toaster-dir.mjs --base=http://localhost:3127
 * Против боя: node check-toaster-dir.mjs --base=https://uhti.kz
 */
import process from 'node:process'
import { chromium, devices } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'] })
await context.addInitScript(() => {
  const orig = window.getComputedStyle
  window.__docStyleCalls = 0
  window.getComputedStyle = function (el, ...rest) {
    if (el === document.documentElement)
      window.__docStyleCalls++
    return orig.call(this, el, ...rest)
  }
})

for (const path of ['/', '/catalog/girls/kukly']) {
  const page = await context.newPage()
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 180000 })
  await page.waitForTimeout(3000)
  const calls = await page.evaluate(() => window.__docStyleCalls)
  const toaster = await page.locator('[data-sonner-toaster]').count()
  console.log(`\n${path}`)
  check(toaster > 0, `контейнер уведомлений на странице есть (${toaster})`)
  check(calls === 0, `getComputedStyle(<html>) за загрузку: ${calls} (ждём 0)`)
  await page.close()
}

await browser.close()
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

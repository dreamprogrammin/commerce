// Полная проверка поведения скролла при переходах.
// Кликаем только по ссылкам, УЖЕ видимым на экране: иначе Playwright сам
// подкрутит страницу к элементу и замер будет о другом.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 90)))
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

async function visibleIdx(sel) {
  return p.evaluate((s) => [...document.querySelectorAll(s)].findIndex((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  }), sel)
}
async function open(url, y) {
  await p.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(7000)
  if (y) { await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(800) }
  return p.evaluate(() => Math.round(window.scrollY))
}
const y = () => p.evaluate(() => Math.round(window.scrollY))

console.log(`стенд: ${BASE}\n`)

// 1. каталог → товар → назад
let from = await open('/catalog/all', 1800)
let i = await visibleIdx('a[href*="/catalog/products/"]')
await p.locator('a[href*="/catalog/products/"]').nth(i).click()
await p.waitForTimeout(6000)
const prod = await y()
await p.goBack(); await p.waitForTimeout(7000)
const back = await y()
console.log(`каталог(${from}) → товар: y=${prod} ${prod === 0 ? '✓ сверху' : '✗'} | назад: y=${back} ${Math.abs(back - from) < 150 ? '✓ вернул' : '✗ потерял'}`)

// 2. каталог → категория
from = await open('/catalog/all', 1500)
i = await visibleIdx('a[href^="/catalog/"]:not([href*="/products/"])')
if (i >= 0) {
  await p.locator('a[href^="/catalog/"]:not([href*="/products/"])').nth(i).click()
  await p.waitForTimeout(6000)
  console.log(`каталог(${from}) → категория: y=${await y()} ${(await y()) === 0 ? '✓ сверху' : '✗'}  путь ${await p.evaluate(() => location.pathname.slice(-20))}`)
}

// 3. нижняя навигация
await open('/catalog/all', 1400)
for (const href of ['/', '/cart', '/catalog']) {
  await p.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }))
  await p.waitForTimeout(500)
  // панель прячется при скролле вниз — поднимаемся, чтобы она вернулась
  await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }))
  await p.waitForTimeout(900)
  const el = p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`)
  if (!(await el.count())) { console.log(`нав ${href}: пункта нет`); continue }
  await el.click({ timeout: 20000 })
  await p.waitForTimeout(5500)
  console.log(`нав → ${href.padEnd(9)} путь ${(await p.evaluate(() => location.pathname)).padEnd(9)} y=${await y()} ${(await y()) === 0 ? '✓' : '✗'}`)
}

// 4. якорь на чужой странице
await p.goto(`${BASE}/catalog/all`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(5000)
const slug = await p.evaluate(() => document.querySelector('a[href*="/catalog/products/"]')?.getAttribute('href'))
await p.goto(`${BASE}${slug}#reviews`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(8000)
console.log(`якорь #reviews: y=${await y()} ${(await y()) > 300 ? '✓ доехал' : '✗'}`)

console.log(`\nошибок в консоли: ${errs.length}${errs.length ? ' — ' + errs[0] : ''}`)
await browser.close()

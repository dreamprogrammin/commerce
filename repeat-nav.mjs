/**
 * Ускоряется ли переход при ПОВТОРНОМ заходе на ту же страницу.
 *
 * Меряем две вещи разом, их часто путают:
 *   занятость главного потока — от неё и берётся ощущение подвисания;
 *   время до содержимого — сколько ждёт человек.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const ROUNDS = Number(process.argv.find(a => a.startsWith('--rounds='))?.slice(9) || 4)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__lt = []
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)

const nav = async (href, mark) => {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
  await p.evaluate(() => { window.__lt = [] })
  const t0 = Date.now()
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
  await p.waitForFunction(m => location.pathname === m.href && [...document.querySelectorAll('h1,h2')].some(el => el.textContent.includes(m.mark)), { href, mark }, { timeout: 40000 }).catch(() => {})
  const t = Date.now() - t0
  await p.waitForTimeout(6000)
  const lt = (await p.evaluate(() => window.__lt)).filter(d => d > 50)
  return { t, blocked: lt.reduce((a, b) => a + b, 0), worst: lt.length ? Math.max(...lt) : 0 }
}

const home = [], cat = []
for (let i = 0; i < ROUNDS; i++) {
  cat.push(await nav('/catalog', 'Каталог'))
  home.push(await nav('/', 'Подобрали'))
  process.stdout.write('.')
}
console.log('')
console.log(`\n${B} (390px, Slow 4G, CPU ×4) — по заходам подряд:\n`)
console.log('заход   → /catalog                    → / (главная)')
for (let i = 0; i < ROUNDS; i++) {
  const c = cat[i], h = home[i]
  console.log(`  ${i + 1}     ${String(c.t).padStart(5)} мс, поток ${String(c.blocked).padStart(4)} мс   ${String(h.t).padStart(5)} мс, поток ${String(h.blocked).padStart(4)} мс`)
}
const avg = (a, k) => Math.round(a.reduce((s, x) => s + x[k], 0) / a.length)
console.log(`\nпервый заход:  каталог ${cat[0].blocked} мс, главная ${home[0].blocked} мс`)
console.log(`дальше среднее: каталог ${avg(cat.slice(1), 'blocked')} мс, главная ${avg(home.slice(1), 'blocked')} мс`)
await browser.close()

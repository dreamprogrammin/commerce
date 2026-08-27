// Цена перехода нижней навигацией: сколько занят главный поток.
import { chromium } from 'playwright'
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
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)

async function hop(href) {
  // панель прячется при скролле вниз — поднимаемся, чтобы вернуть её
  await p.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
  await p.waitForTimeout(400)
  await p.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }))
  await p.waitForTimeout(800)
  await p.evaluate(() => { window.__lt = [] })
  const t0 = Date.now()
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
  await p.waitForFunction(h => location.pathname === h, href, { timeout: 30000 }).catch(() => {})
  const t = Date.now() - t0
  await p.waitForTimeout(7000)
  const lt = (await p.evaluate(() => window.__lt)).filter(d => d > 50)
  return { href, t, blocked: lt.reduce((a, b) => a + b, 0), worst: lt.length ? Math.max(...lt) : 0, n: lt.length }
}
const rows = []
for (const h of ['/catalog', '/', '/cart', '/', '/catalog', '/'])
  rows.push(await hop(h))
for (const r of rows)
  console.log(`→ ${r.href.padEnd(9)} адрес сменился ${String(r.t).padStart(5)} мс | поток занят ${String(r.blocked).padStart(5)} мс в ${r.n} задачах | худшая ${r.worst} мс`)
const home = rows.filter(r => r.href === '/')
console.log(`\nсредняя блокировка при возврате на главную: ${Math.round(home.reduce((a, b) => a + b.blocked, 0) / home.length)} мс`)
await browser.close()

/**
 * Точное время, сколько на экране остаётся прежняя страница.
 *
 * Опрос через evaluate сам стоит десятки миллисекунд при замедленном
 * процессоре и завышает результат. Поэтому метки ставит сама страница:
 * наблюдатель за DOM записывает момент, когда корень старой страницы исчез
 * и когда появился корень новой, — относительно нажатия.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__marks = []
  window.__t0 = 0
  const root = () => document.querySelector('main')?.firstElementChild
  let prev = null
  // Наблюдателя ставим после появления документа: addInitScript выполняется
  // до его создания, и documentElement там ещё нет — обращение к нему рвало
  // весь скрипт, из-за чего не заводилась и __markPaint.
  const start = () => new MutationObserver(() => {
    if (!window.__t0) return
    const r = root()
    const sig = r ? `${r.tagName}.${(r.className || '').toString().slice(0, 24)}` : 'нет'
    if (sig !== prev) {
      window.__marks.push({ ms: Math.round(performance.now() - window.__t0), sig })
      prev = sig
    }
  }).observe(document.documentElement, { childList: true, subtree: true })
  if (document.documentElement)
    start()
  else
    document.addEventListener('readystatechange', () => document.documentElement && start(), { once: true })
  // первый кадр после нажатия, когда браузер реально перерисовал
  window.__markPaint = () => requestAnimationFrame(() => {
    requestAnimationFrame(() => window.__marks.push({ ms: Math.round(performance.now() - window.__t0), sig: 'первый кадр' }))
  })
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)

for (const [href, имя] of [['/catalog', 'каталог'], ['/', 'главная'], ['/cart', 'корзина'], ['/', 'главная'], ['/catalog', 'каталог'], ['/', 'главная']]) {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
  await p.evaluate(() => { window.__marks = []; window.__t0 = performance.now() })
  await p.evaluate((h) => {
    document.querySelector(`nav[aria-label="Основная навигация"] a.mbn-item[href="${h}"]`).click()
    window.__markPaint()
  }, href)
  await p.waitForTimeout(4000)
  const marks = await p.evaluate(() => window.__marks)
  console.log(`→ ${имя}:  ${marks.slice(0, 6).map(m => `${m.ms}мс ${m.sig}`).join('  |  ') || 'меток нет'}`)
}
await browser.close()

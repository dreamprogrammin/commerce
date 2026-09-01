/**
 * Не висит ли заглушка поверх УЖЕ пришедшей страницы.
 * Сравниваем момент появления содержимого назначения и момент снятия заглушки.
 */
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__t0 = 0; window.__content = null; window.__phGone = null; window.__phWas = false
  window.__watch = () => {
    const step = () => {
      if (window.__t0) {
        // содержимое назначения: ищем по тексту заголовка
        if (window.__content === null && window.__mark) {
          const есть = [...document.querySelectorAll('main h1, main h2')].some(el => el.textContent.includes(window.__mark))
          if (есть) window.__content = Math.round(performance.now() - window.__t0)
        }
        const ph = !!document.querySelector('.shell-placeholder')
        if (ph) window.__phWas = true
        // снятие считаем только после того, как заглушка ПОЯВИЛАСЬ
        if (window.__phWas && !ph && window.__phGone === null) window.__phGone = Math.round(performance.now() - window.__t0)
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.evaluate(() => window.__watch())

for (const [href, имя, mark] of [['/catalog', 'каталог', 'Каталог'], ['/', 'главная', 'Подобрали'], ['/cart', 'корзина', 'Корзина'], ['/', 'главная', 'Подобрали']]) {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
  await p.evaluate((m) => { window.__content = null; window.__phGone = null; window.__phWas = false; window.__mark = m; window.__t0 = performance.now() }, mark)
  await p.evaluate((h) => document.querySelector(`nav[aria-label="Основная навигация"] a.mbn-item[href="${h}"]`).click(), href)
  await p.waitForTimeout(5000)
  const r = await p.evaluate(() => ({ c: window.__content, ph: window.__phGone }))
  const лишнее = r.c !== null && r.ph !== null ? r.ph - r.c : null
  console.log(`→ ${имя.padEnd(9)} содержимое ${String(r.c ?? '—').padStart(5)} мс, заглушка снята ${String(r.ph ?? '—').padStart(5)} мс  ${лишнее !== null && лишнее > 120 ? `← держится лишние ${лишнее} мс` : 'ок'}`)
  await p.evaluate(() => { window.__t0 = 0 })
}
await browser.close()

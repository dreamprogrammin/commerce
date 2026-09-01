/**
 * Сколько прежняя страница остаётся ВИДНОЙ после нажатия.
 *
 * Наличия узла мало: удержанная страница хранится скрытой и находится
 * querySelector'ом даже тогда, когда на экране уже другая. Смотрим на
 * отрисовку — размеры и offsetParent.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const LABEL = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'сборка'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__t0 = 0
  window.__gone = null
  window.__watch = () => {
    const step = () => {
      if (window.__t0 && window.__gone === null) {
        const el = document.querySelector('.home-content')
        const видна = !!el && el.getBoundingClientRect().height > 0 && el.offsetParent !== null
        if (!видна) window.__gone = Math.round(performance.now() - window.__t0)
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
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.evaluate(() => window.__watch())

const times = []
for (let i = 0; i < 3; i++) {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
  await p.evaluate(() => { window.__gone = null; window.__t0 = performance.now() })
  await p.evaluate(() => document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click())
  await p.waitForTimeout(4000)
  times.push(await p.evaluate(() => window.__gone))
  await p.evaluate(() => { window.__t0 = 0 })
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
  await p.waitForTimeout(4000)
}
const ok = times.filter(t => t !== null)
const med = ok.length ? [...ok].sort((a, b) => a - b)[Math.floor(ok.length / 2)] : null
console.log(`${LABEL}: прежняя страница видна ${med === null ? 'не поймали' : `${med} мс`}   (прогоны: ${times.join(', ')})`)
await browser.close()

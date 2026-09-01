/**
 * Заглушка при переходе: когда появляется, сколько живёт, и не мелькает ли
 * на быстрых переходах.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__t0 = 0
  window.__ph = []
  window.__old = null
  window.__watch = () => {
    let было = false
    const step = () => {
      if (window.__t0) {
        const ph = !!document.querySelector('.shell-placeholder')
        if (ph !== было) {
          window.__ph.push({ ms: Math.round(performance.now() - window.__t0), есть: ph })
          было = ph
        }
        if (window.__old === null) {
          const el = document.querySelector('.home-content')
          const видна = !!el && el.getBoundingClientRect().height > 0 && el.offsetParent !== null
          if (!видна) window.__old = Math.round(performance.now() - window.__t0)
        }
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

for (const [href, имя] of [['/catalog', 'каталог'], ['/', 'главная'], ['/cart', 'корзина'], ['/', 'главная']]) {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
  await p.evaluate(() => { window.__ph = []; window.__old = null; window.__t0 = performance.now() })
  await p.evaluate((h) => document.querySelector(`nav[aria-label="Основная навигация"] a.mbn-item[href="${h}"]`).click(), href)
  await p.waitForTimeout(4500)
  const r = await p.evaluate(() => ({ ph: window.__ph, old: window.__old }))
  const появилась = r.ph.find(x => x.есть)
  const ушла = r.ph.find(x => !x.есть && появилась && x.ms > появилась.ms)
  const жила = появилась && ушла ? ушла.ms - появилась.ms : null
  console.log(`→ ${имя.padEnd(9)} старая ушла с экрана ${String(r.old ?? '—').padStart(5)} мс   заглушка ${появилась ? `с ${появилась.ms} на ${жила ?? '?'} мс` : 'не показывалась'}`)
  await p.evaluate(() => { window.__t0 = 0 })
}
await browser.close()

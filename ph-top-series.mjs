import os from 'node:os'
import process from 'node:process'
import { chromium } from 'playwright'

// Куда класть скриншоты и журналы: SC из окружения, иначе системный tmp.
const SCRATCH = process.env.SC || os.tmpdir()

const SC = `${SCRATCH}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
const t0 = Date.now()
await p.evaluate(() => document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click())
for (const ms of [200, 300, 400, 600]) {
  await p.waitForTimeout(ms - (Date.now() - t0) > 0 ? ms - (Date.now() - t0) : 0)
  const s = await p.evaluate(() => {
    const n = document.querySelector('nav[aria-label="Основная навигация"]')
    const r = n?.getBoundingClientRect()
    return { ph: !!document.querySelector('.shell-placeholder'), navTop: r ? Math.round(r.top) : null, путь: location.pathname }
  })
  await p.screenshot({ path: `${SC}/pht-${ms}.png`, clip: { x: 0, y: 0, width: 390, height: 120 } })
  console.log(`${String(ms).padStart(4)}мс  заглушка=${s.ph}  навигация top=${s.navTop}  путь=${s.путь}`)
}
await browser.close()

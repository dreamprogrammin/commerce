// Как выглядит нижняя навигация: в покое и под пальцем.
import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
const полоса = { x: 0, y: 758, width: 390, height: 86 }
await p.screenshot({ path: `${SC}/nav-rest.png`, clip: полоса })
const точки = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Основная навигация"] a.mbn-item')].map((a) => {
  const r = a.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}))
await p.mouse.move(точки[0].x, точки[0].y)
await p.mouse.down()
await p.waitForTimeout(280)
await p.screenshot({ path: `${SC}/nav-press.png`, clip: полоса })
await p.mouse.up()
console.log('снимки сняты')
await browser.close()

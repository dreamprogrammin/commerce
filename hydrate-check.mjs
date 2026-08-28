// Работает ли hydrate-on-visible при переходе внутри сайта:
// сколько узлов существует сразу после возврата на главную и как растёт.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const count = async () => p.evaluate(() => ({
  n: document.querySelectorAll('*').length,
  h: Math.round(document.documentElement.scrollHeight),
  cards: document.querySelectorAll('.pc-card').length,
}))
console.log('первая загрузка, верх страницы: ', JSON.stringify(await count()))

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(3000)
console.log('после возврата, ещё не скроллили:', JSON.stringify(await count()))

for (const y of [1500, 3000, 4500, 6000]) {
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y)
  await p.waitForTimeout(2000)
  console.log(`прокрутили до ${String(y).padStart(4)}:            `, JSON.stringify(await count()))
}
await browser.close()

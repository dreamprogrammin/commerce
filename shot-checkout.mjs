import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7)
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
await p.goto(`${B}/catalog/all`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(7000)
const i = await p.evaluate(() => [...document.querySelectorAll('button.pc-add')].findIndex((el) => {
  const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
}))
if (i >= 0) { await p.locator('button.pc-add').nth(i).click({ timeout: 20000 }); await p.waitForTimeout(2500) }
await p.goto(`${B}/checkout`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(6000)
const h = await p.evaluate(() => [...new Set([...document.querySelectorAll('input')].map(el => Math.round(el.getBoundingClientRect().height)))].sort((a,b)=>a-b))
console.log(`высоты полей: ${h.join(', ')}px`)
await p.screenshot({ path: OUT })
await browser.close()

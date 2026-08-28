import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7)
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
const rows = await p.evaluate(() => [...document.querySelectorAll('input')].map((el) => {
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
  return { cls: (el.className || '').trim().split(/\s+/).slice(0, 2).join('.').slice(0, 34), type: el.type, h: Math.round(r.height), fs: cs.fontSize }
}))
for (const r of rows) console.log(`  ${String(r.h).padStart(3)}px  ${r.fs.padStart(5)}  ${r.type.padEnd(8)} ${r.cls}`)
console.log(`высота документа: ${await p.evaluate(() => Math.round(document.documentElement.scrollHeight))}`)
await browser.close()

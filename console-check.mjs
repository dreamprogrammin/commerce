// Ошибки консоли и сети на главной: первая загрузка + переход + прокрутка.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const errs = [], bad = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 160)))
p.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 90)}`) })

await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(3000)
for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(400) }
await p.waitForTimeout(2000)

console.log(`ошибок консоли: ${errs.length}`)
for (const e of [...new Set(errs)].slice(0, 8)) console.log('  ' + e)
console.log(`ответов 400+: ${bad.length}`)
for (const b of [...new Set(bad)].slice(0, 8)) console.log('  ' + b)
const n = await p.evaluate(() => ({ nodes: document.querySelectorAll('*').length, h: Math.round(document.documentElement.scrollHeight), cards: document.querySelectorAll('.pc-card').length }))
console.log(`итог после прокрутки: ${JSON.stringify(n)}`)
await browser.close()

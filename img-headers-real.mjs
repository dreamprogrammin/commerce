// Какие заголовки кэширования реально получает браузер на проде.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const rows = []
p.on('response', (r) => {
  const u = r.url()
  if (!u.includes('/storage/v1/')) return
  const h = r.headers()
  rows.push({ u, cc: h['cache-control'] || '(нет)', st: r.status(), cf: h['cf-cache-status'] || '' })
})
await p.goto('https://uhti.kz/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
const byCc = new Map()
for (const r of rows) {
  const suf = (r.u.match(/_([a-z]+)\.webp/) || [, 'прочее'])[1]
  const k = `${suf} | ${r.cc}`
  byCc.set(k, (byCc.get(k) || 0) + 1)
}
console.log('вариант | cache-control → сколько ответов')
for (const [k, n] of [...byCc.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}  → ${n}`)
console.log(`\nвсего ответов storage: ${rows.length}`)
await browser.close()

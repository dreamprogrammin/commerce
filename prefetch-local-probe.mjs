import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const reqs = []
p.on('request', r => { if (r.url().includes('_payload.json')) reqs.push(r.url()) })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(20000)
console.log(`запросов _payload.json (по событию request): ${reqs.length}`)
const info = await p.evaluate(() => ({
  links: document.querySelectorAll('a[href^="/catalog"]').length,
  io: typeof IntersectionObserver,
  conn: navigator.connection ? navigator.connection.effectiveType : 'нет',
}))
console.log(JSON.stringify(info))
for (let y = 0; y <= 4000; y += 800) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(1200) }
await p.waitForTimeout(4000)
console.log(`после прокрутки: ${reqs.length}`)
for (const u of [...new Set(reqs)].slice(0, 8)) console.log('  ' + new URL(u).pathname)
await browser.close()

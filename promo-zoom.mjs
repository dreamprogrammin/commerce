import os from 'node:os'
import process from 'node:process'
import { chromium } from 'playwright'

// Куда класть скриншоты и журналы: SC из окружения, иначе системный tmp.
const SCRATCH = process.env.SC || os.tmpdir()

const SC = `${SCRATCH}`
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await c.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await c.newPage()
await p.goto('https://localhost:3111/catalog', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)
const r = await p.evaluate(() => {
  const el = document.querySelector('.cat-mob__promos')
  if (!el) return null
  const b = el.getBoundingClientRect()
  const тинты = [...el.querySelectorAll('[style*="--tile-tint"]')].map(e => `${(e.textContent || '').trim().slice(0, 10)}: ${getComputedStyle(e).getPropertyValue('--tile-tint').trim()}`)
  return { x: Math.round(b.left) - 6, y: Math.round(b.top) - 6, width: Math.round(b.width) + 12, height: Math.round(b.height) + 12, тинты }
})
if (!r) { console.log('промо-плиток нет'); await b.close(); process.exit(0) }
console.log(r.тинты.join('   '))
await p.screenshot({ path: `${SC}/promo-zoom.png`, clip: { x: r.x, y: r.y, width: r.width, height: r.height } })
await b.close()

import os from 'node:os'
import process from 'node:process'
import { chromium } from 'playwright'

// Куда класть скриншоты и журналы: SC из окружения, иначе системный tmp.
const SCRATCH = process.env.SC || os.tmpdir()

const SC = `${SCRATCH}`
const TAG = process.argv.find(a => a.startsWith('--tag='))?.slice(6) || 'zoom'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await c.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await c.newPage()
await p.goto('https://localhost:3111/catalog', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)
const все = await p.evaluate(() => [...document.querySelectorAll('[style*="--ct-tint"]')]
  .filter(e => e.querySelector('img'))
  .slice(0, 4)
  .map((e) => {
    const b = e.getBoundingClientRect()
    return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), имя: (e.textContent || '').trim().slice(0, 16) }
  }))
for (const [i, r] of все.entries()) {
  await p.screenshot({ path: `${SC}/${TAG}-${i}.png`, clip: { x: r.x, y: r.y, width: r.width, height: r.height } })
  console.log(`  ${i}: ${r.имя}`)
}
await b.close()

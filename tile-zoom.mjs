import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
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

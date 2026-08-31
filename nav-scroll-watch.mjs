// Непрерывное наблюдение за положением заголовков во время прокрутки после
// перехода: любое движение между соседними замерами — это и есть рывок.
import { chromium } from 'playwright'
const DESK = process.argv.includes('--desktop')
const [w, h, dpr] = DESK ? [1280, 900, 2] : [390, 844, 3]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: !DESK, hasTouch: !DESK, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
// На десктопе нижней панели нет — переходим ссылками шапки.
const go = async (href) => {
  const sel = DESK ? `a[href="${href}"]` : `nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`
  const i = await p.evaluate((s) => [...document.querySelectorAll(s)].findIndex((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  }), sel)
  await p.locator(sel).nth(Math.max(i, 0)).click({ timeout: 20000 })
  await p.waitForFunction(h => location.pathname === h, href, { timeout: 30000 }).catch(() => {})
}
// --first: без перехода, смотрим прокрутку сразу после первой загрузки.
if (!process.argv.includes('--first')) {
  await go(DESK ? '/catalog/all' : '/catalog')
  await p.waitForTimeout(5000)
  await go('/')
}
await p.waitForTimeout(2500)

const snap = () => p.evaluate(() => {
  const o = {}
  for (const el of document.querySelectorAll('.home-content h2')) o[el.textContent.trim().slice(0, 20)] = Math.round(el.getBoundingClientRect().top + scrollY)
  return o
})

let prev = await snap()
const moves = []
for (let y = 0; y <= 7000; y += 250) {
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y)
  await p.waitForTimeout(300)
  const cur = await snap()
  for (const k of Object.keys(cur)) {
    if (prev[k] !== undefined && Math.abs(prev[k] - cur[k]) > 2) moves.push({ y, k, from: prev[k], to: cur[k] })
  }
  prev = cur
}
console.log(`${DESK ? 'десктоп' : 'мобилка'}: движений заголовков во время прокрутки — ${moves.length}`)
for (const m of moves.slice(0, 12)) console.log(`  на скролле ${String(m.y).padStart(4)}: «${m.k}» ${m.from} → ${m.to} (${m.to - m.from > 0 ? '+' : ''}${m.to - m.from})`)
await browser.close()

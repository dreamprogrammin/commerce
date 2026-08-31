// Сколько миллисекунд секция остаётся пустой после резкого рывка к ней.
import { chromium } from 'playwright'
const DESK = process.argv.includes('--desktop')
const [w, h, dpr] = DESK ? [1280, 900, 2] : [390, 844, 3]
const Y = Number(process.argv.find(a => a.startsWith('--y='))?.slice(4) || 1520)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: !DESK, hasTouch: !DESK, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
// На десктопе нижней панели нет — переходим ссылками страницы.
const go = async (href) => {
  const sel = DESK ? `a[href="${href}"]` : `nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`
  const i = await p.evaluate((s) => [...document.querySelectorAll(s)].findIndex((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  }), sel)
  await p.locator(sel).nth(Math.max(i, 0)).click({ timeout: 20000 })
  await p.waitForFunction(h => location.pathname === h, href, { timeout: 30000 }).catch(() => {})
}
await go(DESK ? '/catalog/all' : '/catalog')
await p.waitForTimeout(5000)
await go('/')
await p.waitForTimeout(2500)

const gaps = () => p.evaluate(() => {
  const vh = innerHeight
  let worst = 0, name = ''
  for (const el of document.querySelectorAll('.home-content > *')) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh) continue
    const inner = el.firstElementChild
    if (inner && inner.children.length > 0) continue
    const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0)
    if (vis > worst) { worst = vis; name = (el.textContent || '').trim().slice(0, 22) || 'без заголовка' }
  }
  return { px: Math.round(worst), name }
})

// резкий рывок к нужному месту и наблюдение каждые 25 мс
await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), Y)
const t0 = Date.now()
let filled = null
const trail = []
for (let i = 0; i < 60; i++) {
  const g = await gaps()
  trail.push({ ms: Date.now() - t0, px: g.px })
  if (g.px === 0) { filled = Date.now() - t0; break }
  await p.waitForTimeout(25)
}
console.log(`${DESK ? 'десктоп' : 'мобилка'} ${w}×${h}, рывок на ${Y}px`)
const first = trail[0]
console.log(`  сразу после рывка пусто: ${first.px}px (${Math.round(first.px / h * 100)}% экрана)`)
console.log(`  заполнилось через: ${filled === null ? '> ' + trail.at(-1).ms + ' мс (не дождались)' : filled + ' мс'}`)
console.log(`  ход: ${trail.slice(0, 8).map(x => `${x.ms}мс:${x.px}px`).join('  ')}`)
await browser.close()

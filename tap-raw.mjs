import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)

// нажимаем через evaluate, чтобы измерять с самого кадра нажатия
const t0 = Date.now()
await p.evaluate(() => {
  const a = document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]')
  a.click()
})
for (let i = 0; i < 12; i++) {
  const s = await p.evaluate(() => {
    const items = [...document.querySelectorAll('nav[aria-label="Основная навигация"] a.mbn-item')]
    const active = items.findIndex(a => a.getAttribute('aria-current') === 'page')
    const lens = document.querySelector('[class*="mbn-lens"], .mbn-lens')
    return {
      активный: active,
      href: items[active]?.getAttribute('href') || '—',
      линза: lens ? getComputedStyle(lens).transform.slice(0, 32) : 'нет',
      путь: location.pathname,
    }
  })
  console.log(`${String(Date.now() - t0).padStart(4)} мс  активен=${s.активный} ${s.href.padEnd(10)} путь=${s.путь}`)
  if (i === 1) await p.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad/tap-early.png' })
  await p.waitForTimeout(30)
}
await browser.close()

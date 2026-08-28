// Проверка догадки: сколько стоит отрисовка теней/блюров при переходе на главную.
// Не правка кода — эксперимент: гасим свойства стилем и меряем тот же переход.
import { chromium } from 'playwright'

const KILL = `*, *::before, *::after {
  box-shadow: none !important;
  backdrop-filter: none !important;
  filter: none !important;
}`

async function run(withKill) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
    window.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  if (withKill) await p.addStyleTag({ content: KILL })
  await p.waitForTimeout(12000)

  const res = []
  for (let i = 0; i < 3; i++) {
    await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
    await p.waitForTimeout(5000)
    if (withKill) await p.addStyleTag({ content: KILL })
    await p.evaluate(() => { window.__lt = [] })
    await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
    await p.waitForTimeout(5000)
    if (withKill) await p.addStyleTag({ content: KILL })
    const lt = (await p.evaluate(() => window.__lt)).filter(d => d > 50)
    res.push(lt.reduce((a, b) => a + b, 0))
  }
  await browser.close()
  return res
}

const base = await run(false)
const kill = await run(true)
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
console.log(`как есть          ${base.join(', ')}   среднее ${avg(base)} мс`)
console.log(`без теней/блюров  ${kill.join(', ')}   среднее ${avg(kill)} мс`)
console.log(`\nразница ${avg(base) - avg(kill)} мс (${Math.round((1 - avg(kill) / avg(base)) * 100)}%)`)

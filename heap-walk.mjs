// Растёт ли память от хождения между страницами при удержании.
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const R = Number(process.argv.find(a => a.startsWith('--rounds='))?.slice(9) || 8)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Performance.enable')
await cdp.send('HeapProfiler.enable')
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map(x => [x.name, x.value]))
  return { мб: Math.round(m.JSHeapUsedSize / 1024 / 1024 * 10) / 10, узлов: m.Nodes, слушателей: m.JSEventListeners }
}
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
console.log('после первой загрузки: ' + JSON.stringify(await heap()))
const tap = async href => {
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(250)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(700)
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
  await p.waitForTimeout(2500)
}
for (let i = 1; i <= R; i++) {
  await tap('/catalog'); await tap('/')
  if (i % 2 === 0 || i === R) console.log(`после ${String(i).padStart(2)} кругов:      ` + JSON.stringify(await heap()))
}
await browser.close()

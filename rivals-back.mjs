// Возврат назад: у обычных сайтов его отдаёт bfcache браузера — это бесплатно.
import { chromium } from 'playwright'
const browser = await chromium.launch()
for (const site of process.argv.slice(2)) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true,
  })
  await ctx.addInitScript(() => {
    window.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  })
  const p = await ctx.newPage()
  const docs = []
  p.on('request', r => { if (r.resourceType() === 'document') docs.push(1) })
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  console.log(`\n════ ${site} ════`)
  try { await p.goto(site, { waitUntil: 'domcontentloaded', timeout: 90000 }); await p.waitForTimeout(11000) }
  catch { console.log('  не открылся'); await ctx.close(); continue }

  const href = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')].find((el) => {
      const h = el.getAttribute('href') || ''
      const r = el.getBoundingClientRect()
      return /\/(catalog|category|c|tovar|product|p)\//.test(h) && r.top >= 0 && r.bottom <= innerHeight && r.width > 30
    })
    return a ? a.getAttribute('href') : null
  })
  if (!href) { console.log('  ссылки нет'); await ctx.close(); continue }
  await p.evaluate(h => document.querySelector(`a[href="${CSS.escape(h)}"]`)?.click(), href).catch(() => {})
  await p.waitForTimeout(9000)

  docs.length = 0
  await p.evaluate(() => { window.__lt = [] })
  const t0 = Date.now()
  await p.goBack({ timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(7000)
  const lt = await p.evaluate(() => window.__lt.filter(d => d > 50).reduce((a, b) => a + b, 0)).catch(() => -1)
  console.log(`  НАЗАД: ${Date.now() - t0} мс всего | документ запрошен ${docs.length} раз ${docs.length === 0 ? '(bfcache — бесплатно)' : '(грузился заново)'} | поток занят ${lt} мс`)
  await ctx.close()
}
await browser.close()

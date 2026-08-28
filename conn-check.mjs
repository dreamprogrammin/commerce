// От чего зависит предзагрузка: Nuxt её отключает при saveData или 2g.
// Проверяем, что видит страница при разных эмуляциях сети.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const cases = [
  { name: 'без эмуляции', net: null },
  { name: 'Slow 4G (1.6 Мбит, 150 мс)', net: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, offline: false } },
  { name: 'Fast 3G (1.6 Мбит, 300 мс)', net: { latency: 300, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, offline: false } },
]
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  if (c.net) await cdp.send('Network.emulateNetworkConditions', c.net)
  let payloads = 0
  p.on('response', r => { if (r.url().includes('_payload.json')) payloads++ })
  await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(12000)
  const conn = await p.evaluate(() => {
    const c = navigator.connection
    return c ? { effectiveType: c.effectiveType, saveData: c.saveData, downlink: c.downlink, rtt: c.rtt } : null
  })
  console.log(`${c.name.padEnd(30)} connection=${JSON.stringify(conn)}  payload-запросов ${payloads}`)
  await ctx.close()
}
await browser.close()

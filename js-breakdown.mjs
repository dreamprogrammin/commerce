import process from 'node:process'
import { chromium, devices } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3 })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: 96000, latency: 150 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await page.goto(process.argv[2] || 'https://uhti.kz/', { waitUntil: 'load', timeout: 180000 })
await page.waitForTimeout(6000)

const data = await page.evaluate(() => {
  const js = performance.getEntriesByType('resource')
    .filter(r => /\.m?js(\?|$)/.test(r.name))
    .map(r => ({ name: r.name, kb: (r.encodedBodySize || 0) / 1024, end: r.responseEnd, third: !r.name.includes(location.host) }))
  const own = js.filter(r => !r.third)
  const third = js.filter(r => r.third)
  return {
    total: js.length,
    ownKb: own.reduce((s, r) => s + r.kb, 0),
    thirdKb: third.reduce((s, r) => s + r.kb, 0),
    top: js.sort((a, b) => b.kb - a.kb).slice(0, 14).map(r => ({ f: r.name.split('/').pop().slice(0, 44), kb: Math.round(r.kb), end: Math.round(r.end), third: r.third })),
    thirdHosts: [...new Set(third.map(r => new URL(r.name).host))],
  }
})
console.log(`файлов JS: ${data.total} | своих ${Math.round(data.ownKb)} КБ | чужих ${Math.round(data.thirdKb)} КБ`)
console.log('чужие хосты:', data.thirdHosts.join(', ') || '—')
console.log('\nсамые тяжёлые:')
for (const r of data.top) console.log(`  ${String(r.kb).padStart(4)} КБ  доехал ${String(r.end).padStart(6)} мс  ${r.third ? 'ЧУЖОЙ ' : ''}${r.f}`)
await browser.close()

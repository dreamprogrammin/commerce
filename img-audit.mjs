/** Что и сколько качается до DOMContentLoaded, по бакетам. DPR через env. */
import { chromium } from 'playwright'
const url = process.argv[2]
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: Number(process.env.DPR || 3), ignoreHTTPSErrors: true })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
const got = []
const t0 = Date.now()
p.on('response', r => { if (r.request().resourceType() === 'image') got.push({ t: Date.now() - t0, url: r.url(), len: Number(r.headers()['content-length'] || 0) }) })
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
const dcl = Date.now() - t0
await p.waitForTimeout(8000)
const before = got.filter(g => g.t <= dcl)
const groups = {}
for (const g of before) {
  const m = g.url.match(/\/public\/([a-z-]+)\//)
  const v = (g.url.match(/_(sm|md|lg)\./) || [, '—'])[1]
  const k = `${m ? m[1] : '?'} ${v}`
  groups[k] = groups[k] || { n: 0, kb: 0 }
  groups[k].n++; groups[k].kb += g.len / 1024
}
console.log(`DPR ${process.env.DPR || 3} | DCL ${dcl} мс | до DCL: ${before.length} картинок, ${Math.round(before.reduce((s, x) => s + x.len, 0) / 1024)} КБ`)
for (const [k, v] of Object.entries(groups).sort((a, c) => c[1].kb - a[1].kb))
  console.log(`   ${k.padEnd(24)} ${String(v.n).padStart(2)} шт  ${String(Math.round(v.kb)).padStart(4)} КБ`)
await b.close()

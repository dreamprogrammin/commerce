/** Сколько процессорного времени съедает каждый скрипт при загрузке. */
import process from 'node:process'
import { chromium, devices } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3 })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: 96000, latency: 150 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')

await page.goto(process.argv[2] || 'https://uhti.kz/', { waitUntil: 'load', timeout: 180000 })
await page.waitForTimeout(6000)

const { profile } = await cdp.send('Profiler.stop')
const byId = new Map(profile.nodes.map(n => [n.id, n]))
const self = new Map()
const total = profile.timeDeltas.reduce((a, b) => a + Math.max(0, b), 0) / 1000
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  const ms = Math.max(0, profile.timeDeltas[i] || 0) / 1000
  const url = n?.callFrame?.url || '(движок)'
  const key = url ? url.split('/').pop() || url : '(движок)'
  self.set(key, (self.get(key) || 0) + ms)
}
console.log(`всего процессорного времени за замер: ${Math.round(total)} мс\n`)
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`  ${String(Math.round(v)).padStart(5)} мс  ${k.slice(0, 60)}`)
await browser.close()

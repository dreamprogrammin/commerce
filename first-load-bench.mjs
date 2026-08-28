// Плата за ПЕРВУЮ загрузку главной: сколько занят поток и когда появляется
// содержимое. N прогонов, холодный контекст на каждый.
import { chromium } from 'playwright'
const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 6)
const LABEL = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'сборка'

const browser = await chromium.launch()
const rows = []
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
    window.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(14000)
  const m = await p.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime || 0
    const nav = performance.getEntriesByType('navigation')[0]
    const blocked = window.__lt.filter(d => d > 50).reduce((a, b) => a + (b - 50), 0)
    return { fcp: Math.round(fcp), lcp: Math.round(lcp), dcl: Math.round(nav?.domContentLoadedEventEnd || 0), tbt: Math.round(blocked), nodes: document.querySelectorAll('*').length }
  })
  rows.push(m)
  process.stdout.write(`.`)
  await ctx.close()
}
console.log('')
const med = k => { const s = rows.map(r => r[k]).sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
console.log(`\n${LABEL} (N=${N}, Slow 4G, CPU ×4):`)
console.log(`  FCP ${med('fcp')} мс | LCP ${med('lcp')} мс | DCL ${med('dcl')} мс | поток заблокирован ${med('tbt')} мс | узлов ${med('nodes')}`)
console.log(`  TBT по прогонам: ${rows.map(r => r.tbt).sort((a, b) => a - b).join(', ')}`)
console.log(`  LCP по прогонам: ${rows.map(r => r.lcp).sort((a, b) => a - b).join(', ')}`)
await browser.close()

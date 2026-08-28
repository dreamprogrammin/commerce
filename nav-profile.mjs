// Из чего складываются те ~600 мс занятого потока при возврате на главную.
import { chromium } from 'playwright'
const BASE = 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)

await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(4000)
const { profile } = await cdp.send('Profiler.stop')

// собственное время по узлам
const byId = new Map(profile.nodes.map(n => [n.id, n]))
const self = new Map()
const total = profile.samples.length
for (const id of profile.samples) self.set(id, (self.get(id) || 0) + 1)

const dur = (profile.endTime - profile.startTime) / 1000
const msPer = dur / total

const rows = [...self.entries()].map(([id, c]) => {
  const n = byId.get(id); const f = n?.callFrame || {}
  return { name: f.functionName || '(аноним)', url: (f.url || '').split('/').pop().split('?')[0], ms: Math.round(c * msPer) }
}).filter(r => r.ms >= 8).sort((a, b) => b.ms - a.ms)

console.log(`профиль ${Math.round(dur)} мс, ${total} проб\n`)
console.log('мс'.padStart(6), '  функция'.padEnd(40), 'файл')
for (const r of rows.slice(0, 22)) console.log(String(r.ms).padStart(6), '  ' + r.name.slice(0, 38).padEnd(38), r.url.slice(0, 34))

// свод по файлам
const byFile = new Map()
for (const r of rows) byFile.set(r.url, (byFile.get(r.url) || 0) + r.ms)
console.log('\nпо файлам:')
for (const [f, ms] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(ms).padStart(6), ' ', f || '(движок)')
await browser.close()

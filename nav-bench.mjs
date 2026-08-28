// Плата за переход на главную, N прогонов. Медиана и разброс — чтобы не
// принимать шум за результат (см. docs/HANDOFF, «разброс стенда»).
import { chromium } from 'playwright'

const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 10)
const LABEL = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'сборка'
const BASE = 'https://localhost:3111'

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
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const nav = async href => {
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
  await p.waitForFunction(h => location.pathname === h, href, { timeout: 30000 }).catch(() => {})
}

const runs = []
for (let i = 0; i < N; i++) {
  await nav('/catalog')
  await p.waitForTimeout(4500)
  await p.evaluate(() => { window.__lt = [] })
  await nav('/')
  await p.waitForTimeout(4500)
  const lt = (await p.evaluate(() => window.__lt)).filter(d => d > 50)
  runs.push(lt.reduce((a, b) => a + b, 0))
  process.stdout.write(`${runs.at(-1)} `)
}
console.log('')

const s = [...runs].sort((a, b) => a - b)
const med = s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
console.log(`\n${LABEL}: медиана ${med} мс, разброс ${s[0]}–${s.at(-1)} мс, N=${N}`)
console.log(`отсортировано: ${s.join(', ')}`)
await browser.close()

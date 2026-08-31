// Задержка перехода как её чувствует человек: от клика до появления
// содержимого страницы назначения. Дополняет nav-bench.mjs, который меряет
// занятость потока и слеп к ожиданию сети.
import { chromium } from 'playwright'
const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 8)
const LABEL = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'сборка'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)

const toCatalog = []
const toHome = []
for (let i = 0; i < N; i++) {
  let t0 = Date.now()
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
  await p.waitForFunction(() => location.pathname === '/catalog' && [...document.querySelectorAll('h1,h2')].some(el => el.textContent.includes('Каталог')), { timeout: 40000 }).catch(() => {})
  toCatalog.push(Date.now() - t0)
  await p.waitForTimeout(3500)

  t0 = Date.now()
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
  await p.waitForFunction(() => location.pathname === '/' && [...document.querySelectorAll('h2')].some(el => el.textContent.includes('Подобрали')), { timeout: 40000 }).catch(() => {})
  toHome.push(Date.now() - t0)
  await p.waitForTimeout(3500)
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
console.log(`\n${LABEL} (N=${N}, Slow 4G, CPU ×4) — от клика до содержимого:`)
console.log(`  → /catalog  медиана ${med(toCatalog)} мс   ${[...toCatalog].sort((a, b) => a - b).join(', ')}`)
console.log(`  → /         медиана ${med(toHome)} мс   ${[...toHome].sort((a, b) => a - b).join(', ')}`)
await browser.close()

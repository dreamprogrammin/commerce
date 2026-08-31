// Мешает ли предзагрузка первой загрузке. Только загрузка, без переходов —
// перехват во время навигации портил прошлый замер.
import { chromium } from 'playwright'
const BLOCK = process.argv.includes('--block')
const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 8)
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const rows = []
let blocked = 0

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  let bytes = 0
  const seen = new Set()
  cdp.on('Network.requestWillBeSent', e => seen.add(e.requestId))
  cdp.on('Network.loadingFinished', (e) => { if (seen.has(e.requestId)) bytes += e.encodedDataLength })

  if (BLOCK) {
    // Блокируем только предзагрузку ЧУЖИХ маршрутов: собственный payload
    // главной ('/_payload.json') нужен странице и пропускается.
    await p.route('**/_payload.json*', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/_payload.json') return route.continue()
      blocked++
      await route.abort()
    })
  }

  const t0 = Date.now()
  await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForFunction(() => [...document.querySelectorAll('h2')].some(el => el.textContent.includes('Подобрали')), { timeout: 60000 }).catch(() => {})
  const toContent = Date.now() - t0
  await p.waitForTimeout(10000)
  // прокрутка запускает предзагрузку по видимости
  for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(500) }
  await p.waitForTimeout(3000)
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)
    return {
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
      lcp: Math.round(lcp?.startTime || 0),
      dcl: Math.round(nav?.domContentLoadedEventEnd || 0),
      load: Math.round(nav?.loadEventEnd || 0),
    }
  })
  rows.push({ toContent, ...m, kb: Math.round(bytes / 1024) })
  process.stdout.write('.')
  await ctx.close()
}
console.log('')
const med = (k) => { const s = rows.map(r => r[k]).sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
const spread = (k) => { const s = rows.map(r => r[k]).sort((a, b) => a - b); return `${s[0]}–${s.at(-1)}` }
console.log(`\n${BLOCK ? 'БЕЗ предзагрузки чужих маршрутов' : 'как сейчас'} (N=${N}, прод, Slow 4G, CPU ×4)`)
for (const k of ['toContent', 'fcp', 'lcp', 'dcl', 'load', 'kb']) {
  const name = { toContent: 'до содержимого', fcp: 'FCP', lcp: 'LCP', dcl: 'DCL', load: 'load', kb: 'трафик КБ' }[k]
  console.log(`  ${name.padEnd(16)} медиана ${String(med(k)).padStart(6)}   разброс ${spread(k)}`)
}
if (BLOCK) console.log(`  отброшено предзагрузок: ${blocked}`)
await browser.close()

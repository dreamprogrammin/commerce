// Что грузится при ПОВТОРНОМ заходе на страницу.
// Считаем запросы отдельно для первого визита и для возврата.
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

let phase = 'первый визит'
const log = []
const urlById = new Map()
cdp.on('Network.requestWillBeSent', e => urlById.set(e.requestId, { url: e.request.url, phase }))
cdp.on('Network.loadingFinished', (e) => {
  const v = urlById.get(e.requestId)
  if (!v) return
  log.push({ ...v, b: e.encodedDataLength })
})

const kind = (u) => u.includes('_payload.json') ? 'payload'
  : u.includes('/rest/v1/') || u.includes('/rpc/') ? 'ДАННЫЕ (Supabase)'
    : /\.(js|mjs)(\?|$)/.test(u) ? 'скрипт'
      : (/\.(webp|jpg|jpeg|png|avif|svg)(\?|$)/.test(u) || u.includes('/storage/')) ? 'картинка'
        : 'прочее'

const report = (name) => {
  const rows = log.filter(r => r.phase === name)
  const agg = new Map()
  for (const r of rows) { const k = kind(r.url); const v = agg.get(k) || { n: 0, b: 0 }; v.n++; v.b += r.b; agg.set(k, v) }
  console.log(`\n── ${name} ──`)
  if (!rows.length) { console.log('  запросов нет'); return }
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1].b - a[1].b))
    console.log(`  ${k.padEnd(18)} ${String(v.n).padStart(3)} запросов  ${String(Math.round(v.b / 1024)).padStart(4)} КБ`)
  const data = rows.filter(r => kind(r.url).startsWith('ДАННЫЕ'))
  for (const d of data.slice(0, 8)) console.log(`      ${new URL(d.url).pathname}${new URL(d.url).search.slice(0, 46)}`)
}

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
report('первый визит')

phase = 'уход на /catalog'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)

phase = 'ВОЗВРАТ на главную'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(8000)
report('ВОЗВРАТ на главную')

phase = 'второй уход на /catalog'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(8000)
report('второй уход на /catalog')
await browser.close()

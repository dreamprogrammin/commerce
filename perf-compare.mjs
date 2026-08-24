/**
 * Сравнение вариантов главной по метрикам первой загрузки.
 *
 * Требует стенд, воспроизводящий бой:
 *   • сборка запущена с прод-данными:
 *       NUXT_PUBLIC_SUPABASE_URL=https://<проект>.supabase.co \
 *       NUXT_PUBLIC_SUPABASE_KEY=<публичный anon> PORT=<порт> node .output/server/index.mjs
 *     иначе картинки идут с пустого локального бакета и конкуренции за канал нет;
 *   • перед браузером стоит gzip-proxy.mjs — локальный сервер не сжимает,
 *     а Vercel сжимает.
 *
 *   LD_LIBRARY_PATH=$HOME/pw-libs/usr/lib/x86_64-linux-gnu \
 *     node perf-compare.mjs <прогонов> "<имя>=<url>" "<имя>=<url>" ...
 */
import { chromium } from 'playwright'

const runs = Number(process.argv[2]) || 3
const targets = process.argv.slice(3).map((a) => {
  const i = a.indexOf('=')
  return { name: a.slice(0, i), url: a.slice(i + 1) }
})

const browser = await chromium.launch()

async function once(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await page.addInitScript(() => {
    window.__m = { cls: 0 }
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = Math.round(e.startTime)
    }).observe({ type: 'paint', buffered: true })
    new PerformanceObserver((l) => { window.__m.lcp = Math.round(l.getEntries().at(-1).startTime) })
      .observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value })
      .observe({ type: 'layout-shift', buffered: true })
  })
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const dcl = Date.now() - t0
  await page.waitForTimeout(14000)
  const m = await page.evaluate(() => ({ ...window.__m, cls: +window.__m.cls.toFixed(4) }))
  // Момент, когда в теле главной впервые есть карточка товара, — по разметке,
  // а не по опросу DOM: опрос стартует после DCL и потолком врёт.
  const ssrCards = await page.evaluate(() => document.querySelectorAll('.home-content a[href^="/catalog/products/"]').length)
  await ctx.close()
  return { dcl, ...m, ssrCards }
}

const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const rows = []
for (const t of targets) {
  const rs = []
  for (let i = 0; i < runs; i++) rs.push(await once(t.url))
  rows.push({
    name: t.name,
    FCP: med(rs.map(r => r.fcp)), LCP: med(rs.map(r => r.lcp)),
    DCL: med(rs.map(r => r.dcl)), CLS: med(rs.map(r => r.cls)),
    карточек: rs[0].ssrCards,
  })
}
const base = rows[0]
console.log(`\nмедианы по ${runs} прогонам, 390px / CPU ×4 / Slow 4G\n`)
console.log(`${'вариант'.padEnd(22)} ${'FCP'.padStart(7)} ${'LCP'.padStart(7)} ${'DCL'.padStart(7)} ${'CLS'.padStart(8)}  карточек`)
for (const r of rows) {
  const d = k => r === base ? '' : ` (${r[k] - base[k] >= 0 ? '+' : ''}${r[k] - base[k]})`
  console.log(`${r.name.padEnd(22)} ${String(r.FCP).padStart(7)}${d('FCP').padEnd(8)} ${String(r.LCP).padStart(7)}${d('LCP').padEnd(8)} ${String(r.DCL).padStart(7)}${d('DCL').padEnd(8)} ${String(r.CLS).padStart(8)}  ${r.карточек}`)
}
await browser.close()

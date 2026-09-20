/**
 * Мерка скорости под телефон: FCP, LCP, долгие задачи, вес по типам.
 *
 * Мерит ЧУЖОЙ адрес как есть — по умолчанию бой. Локальный `node
 * .output/server/index.mjs` для этого не годится (п. 16 CLAUDE.md): он не
 * жмёт, не держит кеш документа и говорит по HTTP/1.1. Здесь же берётся
 * настоящий ответ с настоящего сервера, а телефон изображается торможением
 * процессора и сети в самом Chrome.
 *
 *   node speed-mobile.mjs --url=https://uhti.kz/ --runs=3
 *   node speed-mobile.mjs --url=http://localhost:3000/ --runs=1   # для правок
 */
import os from 'node:os'
import process from 'node:process'
import { chromium, devices } from 'playwright'

const SCRATCH = process.env.SC || os.tmpdir()
const arg = (name, def) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
const URL_ = arg('url', 'https://uhti.kz/')
const RUNS = Number(arg('runs', '3'))
const SHOT = arg('shot', '')

// Moto G Power — эталон мобильного Lighthouse: 4-кратное торможение
// процессора и «медленный 4G». Цифры сопоставимы между заходами, а не с
// абсолютной оценкой PageSpeed.
const CPU_SLOWDOWN = 4
const NET = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 }

const browser = await chromium.launch()
const results = []

for (let run = 1; run <= RUNS; run++) {
  const context = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', NET)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

  await page.addInitScript(() => {
    window.__m = { lcp: 0, long: 0, longCount: 0 }
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__m.lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { window.__m.long += e.duration; window.__m.longCount++ }
    }).observe({ type: 'longtask', buffered: true })
  })

  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 })
  // Долгие задачи гидрации приходят уже после `load` — даём им случиться.
  await page.waitForTimeout(6000)

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] ?? {}
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
    const by = {}
    for (const r of performance.getEntriesByType('resource')) {
      const kind = /\.css(\?|$)/.test(r.name) ? 'css' : /\.js(\?|$)/.test(r.name) ? 'js' : r.initiatorType === 'img' ? 'img' : 'прочее'
      by[kind] = by[kind] || { n: 0, kb: 0, ms: 0 }
      by[kind].n++
      by[kind].kb += (r.encodedBodySize || 0) / 1024
      by[kind].ms = Math.max(by[kind].ms, r.responseEnd)
    }
    return {
      ttfb: nav.responseStart ?? 0,
      docMs: nav.responseEnd ?? 0,
      domReady: nav.domContentLoadedEventEnd ?? 0,
      load: nav.loadEventEnd ?? 0,
      fcp,
      lcp: window.__m.lcp,
      longMs: window.__m.long,
      longCount: window.__m.longCount,
      by,
    }
  })

  if (SHOT && run === 1)
    await page.screenshot({ path: `${SCRATCH}/${SHOT}` })

  results.push(m)
  console.log(`заход ${run}: TTFB ${Math.round(m.ttfb)} | FCP ${Math.round(m.fcp)} | LCP ${Math.round(m.lcp)} | долгих задач ${m.longCount} на ${Math.round(m.longMs)} мс`)
  await context.close()
}

await browser.close()

const med = key => {
  const v = results.map(r => r[key]).sort((a, b) => a - b)
  return Math.round(v[Math.floor(v.length / 2)])
}

console.log(`\n${URL_}  (медиана из ${RUNS}, процессор /${CPU_SLOWDOWN}, сеть 1.6 Мбит + 150 мс)`)
console.log(`  TTFB ............ ${med('ttfb')} мс`)
console.log(`  FCP ............. ${med('fcp')} мс`)
console.log(`  LCP ............. ${med('lcp')} мс`)
console.log(`  DOM готов ....... ${med('domReady')} мс`)
console.log(`  load ............ ${med('load')} мс`)
console.log(`  долгие задачи ... ${med('longMs')} мс в ${med('longCount')} шт`)
const by = results[0].by
for (const [k, v] of Object.entries(by))
  console.log(`  ${k.padEnd(7)} ${v.n} файлов, ${Math.round(v.kb)} КБ по сети, последний доехал к ${Math.round(v.ms)} мс`)

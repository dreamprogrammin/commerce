/**
 * Замер логики загрузки главной: когда уходят запросы к данным и когда
 * секции реально появляются в DOM.
 *
 * Запуск (libnspr4/libnss3/libasound лежат локально, без sudo):
 *   LD_LIBRARY_PATH=$HOME/.local/lib/playwright-deps/usr/lib/x86_64-linux-gnu \
 *     node home-load-audit.mjs [url] [mobile|desktop]
 */
import { chromium } from 'playwright'

const URL = process.argv[2] || 'https://uhti.kz/'
const MODE = process.argv[3] || 'mobile'
const isMobile = MODE === 'mobile'

const SECTIONS = [
  ['лента «Подобрали для вас»', /Подобрали для вас|Ваше избранное/],
  ['Популярные категории', /Популярные категории/],
  ['Популярные бренды', /Популярные бренды/],
  ['Товар дня', /Товар дня/],
  ['Хиты продаж', /Хиты продаж/],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: isMobile ? 3 : 1,
  isMobile,
  hasTouch: isMobile,
})
const page = await ctx.newPage()

const cdp = await ctx.newCDPSession(page)
if (isMobile) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
}

// Счётчики ставим ДО навигации, чтобы поймать самый ранний запрос.
await page.addInitScript(() => {
  window.__t0 = performance.now()
  window.__cls = 0
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
  }).observe({ type: 'layout-shift', buffered: true })
  window.__lcp = 0
  new PerformanceObserver((l) => {
    const es = l.getEntries()
    window.__lcp = es[es.length - 1].startTime
  }).observe({ type: 'largest-contentful-paint', buffered: true })
})

const t0 = Date.now()
const data = []
const chunks = []
page.on('request', (r) => {
  const u = r.url()
  if (/supabase\.co\/(rest|functions)|:54321\/(rest|functions)|\/api\//.test(u))
    data.push({ t: Date.now() - t0, url: decodeURIComponent(u.replace(/^https?:\/\/[^/]+/, '')).slice(0, 95) })
})
page.on('response', (r) => { if (/_nuxt\/.*\.js$/.test(r.url())) chunks.push(Date.now() - t0) })
const errors = []
page.on('console', (m) => {
  // Гидрационные расхождения Vue приходит как warning, а не error.
  if (m.type() === 'error' || m.type() === 'warning')
    errors.push(`[${m.type()}] ` + m.text().slice(0, 150))
})
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 150)))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
const dcl = Date.now() - t0

// Опрашиваем DOM, пока не появятся все секции (или не выйдет таймаут).
const seen = {}
const deadline = Date.now() + 20000
while (Date.now() < deadline && Object.keys(seen).length < SECTIONS.length) {
  const found = await page.evaluate((pats) => {
    // ТОЛЬКО тело главной: в футере есть те же заголовки, и он приезжает с SSR.
    const root = document.querySelector('.home-content')
    if (!root) return pats.map(() => false)
    const txt = [...root.querySelectorAll('h1,h2,h3,span,a')].map(e => e.textContent || '')
    return pats.map(([, src, flags]) => txt.some(t => new RegExp(src, flags).test(t)))
  }, SECTIONS.map(([n, re]) => [n, re.source, re.flags]))
  found.forEach((ok, i) => {
    const name = SECTIONS[i][0]
    if (ok && seen[name] === undefined) seen[name] = Date.now() - t0
  })
  await page.waitForTimeout(40)
}

await page.waitForTimeout(3000)
const vitals = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(4) }))
const skeletons = await page.evaluate(() => {
  const root = document.querySelector('.home-content')
  const els = root ? [...root.querySelectorAll('.animate-pulse')] : []
  const owners = new Set(els.map((e) => {
    let n = e
    for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
      const h = n.querySelector?.('h2')
      if (h) return h.textContent.trim().slice(0, 40)
    }
    return '(без заголовка)'
  }))
  return { count: els.length, where: [...owners] }
})

const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${URL}   [${isMobile ? '390px, CPU ×4, Slow 4G' : '1440px, без троттлинга'}]`)
console.log(`DOMContentLoaded ${dcl} мс   LCP ${vitals.lcp} мс   CLS ${vitals.cls}`)
console.log(`js-чанков ${chunks.length}, первый ${chunks[0] ?? '—'} мс, последний ${chunks.at(-1) ?? '—'} мс`)

console.log('\n=== СЕКЦИЯ ПОЯВИЛАСЬ В DOM ===')
for (const [name] of SECTIONS)
  console.log(`  ${pad(name, 28)} ${seen[name] === undefined ? 'НЕ ПОЯВИЛАСЬ' : seen[name] + ' мс'}`)

console.log('\n=== ЗАПРОСЫ К ДАННЫМ ===')
if (!data.length) console.log('  ни одного')
for (const r of data) console.log(`  ${pad(r.t + ' мс', 9)} ${r.url}`)

console.log(`\nскелетонов в теле главной в конце: ${skeletons.count}`)
skeletons.where.forEach(w => console.log('   └ ' + w))
if (errors.length) { console.log('\n=== КОНСОЛЬ ==='); [...new Set(errors)].forEach(e => console.log('  ' + e)) }
await browser.close()

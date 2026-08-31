/**
 * Цена повторного посещения: сколько картинок качается заново и почему.
 *
 * Считаем два разных случая, их нельзя мешать:
 *   переход внутри сайта — уход на /catalog и обратно
 *   полная перезагрузка  — новый заход по адресу, тут и работает HTTP-кэш
 *
 * И разделяем причины: тот же адрес заново — промах кэша; новый адрес —
 * страница показывает другие товары, кэш ни при чём.
 */
import { chromium } from 'playwright'

const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 3)
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const browser = await chromium.launch()

const isImg = u => /\.(webp|jpg|jpeg|png|avif)(\?|$)/.test(u) || u.includes('/storage/')
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }

const runs = { spaSame: [], spaSameKb: [], spaNew: [], spaNewKb: [], reloadSame: [], reloadSameKb: [], reloadNew: [], reloadNewKb: [], firstKb: [] }

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

  let phase = 'first'
  const byId = new Map()
  const hits = []
  cdp.on('Network.requestWillBeSent', e => byId.set(e.requestId, { url: e.request.url, phase }))
  cdp.on('Network.loadingFinished', (e) => { const v = byId.get(e.requestId); if (v && isImg(v.url)) hits.push({ ...v, b: e.encodedDataLength }) })

  const settle = async () => {
    await p.waitForTimeout(11000)
    for (let y = 0; y <= 3500; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(500) }
    // панель прячется при скролле вниз — поднимаемся
    await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }))
    await p.waitForTimeout(300)
    await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }))
    await p.waitForTimeout(1200)
  }

  await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await settle()
  const firstUrls = new Set(hits.filter(h => h.phase === 'first').map(h => h.url))
  runs.firstKb.push(Math.round(hits.filter(h => h.phase === 'first').reduce((a, h) => a + h.b, 0) / 1024))

  phase = 'away'
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
  await p.waitForTimeout(6000)
  phase = 'spa'
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
  await settle()

  phase = 'reload'
  await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await settle()

  for (const [ph, sameK, sameKb, newK, newKb] of [['spa', 'spaSame', 'spaSameKb', 'spaNew', 'spaNewKb'], ['reload', 'reloadSame', 'reloadSameKb', 'reloadNew', 'reloadNewKb']]) {
    const r = hits.filter(h => h.phase === ph)
    const same = r.filter(h => firstUrls.has(h.url))
    const fresh = r.filter(h => !firstUrls.has(h.url))
    runs[sameK].push(same.length); runs[sameKb].push(Math.round(same.reduce((a, h) => a + h.b, 0) / 1024))
    runs[newK].push(fresh.length); runs[newKb].push(Math.round(fresh.reduce((a, h) => a + h.b, 0) / 1024))
  }
  process.stdout.write('.')
  await ctx.close()
}
console.log('')
console.log(`\n${B}  (N=${N}, 390px, Slow 4G, CPU ×4)`)
console.log(`  первый визит, картинок:            ${med(runs.firstKb)} КБ`)
console.log(`\n  ПЕРЕХОД внутри сайта и обратно:`)
console.log(`    тот же адрес заново (промах кэша) ${med(runs.spaSame)} шт  ${med(runs.spaSameKb)} КБ`)
console.log(`    новый адрес (другие товары)       ${med(runs.spaNew)} шт  ${med(runs.spaNewKb)} КБ`)
console.log(`\n  ПОЛНАЯ ПЕРЕЗАГРУЗКА страницы:`)
console.log(`    тот же адрес заново (промах кэша) ${med(runs.reloadSame)} шт  ${med(runs.reloadSameKb)} КБ`)
console.log(`    новый адрес (другие товары)       ${med(runs.reloadNew)} шт  ${med(runs.reloadNewKb)} КБ`)
await browser.close()

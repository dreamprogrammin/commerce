// Аудит ленивой загрузки: что уходит в сеть до готовности документа и
// сколько из этого человек в этот момент не видит.
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const PAGES = process.argv.filter(a => a.startsWith('--page=')).map(a => a.slice(7))
const pages = PAGES.length ? PAGES : ['/', '/catalog/all']

const browser = await chromium.launch()

for (const path of pages) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
  })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

  const reqs = []
  p.on('response', async (r) => {
    const t = r.request().resourceType()
    let size = 0
    try { size = Number((await r.headerValue('content-length')) || 0) } catch {}
    reqs.push({ url: r.url(), type: t, size, at: Date.now() })
  })

  const t0 = Date.now()
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 180000 })
  const dcl = Date.now() - t0
  const beforeDcl = reqs.length
  await p.waitForTimeout(14000)

  const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map((el) => {
    const r = el.getBoundingClientRect()
    return {
      lazy: el.loading === 'lazy',
      fp: el.getAttribute('fetchpriority') || '',
      top: Math.round(r.top + scrollY),
      w: Math.round(r.width),
      inFirst: r.top < innerHeight && r.bottom > 0,
      src: (el.currentSrc || el.src || '').slice(-60),
      done: el.complete && el.naturalWidth > 0,
    }
  }))

  const byType = {}
  for (const r of reqs) {
    byType[r.type] = byType[r.type] || { n: 0, kb: 0 }
    byType[r.type].n++
    byType[r.type].kb += r.size / 1024
  }
  const imgReqBefore = reqs.slice(0, beforeDcl).filter(r => r.type === 'image')
  const kb = imgReqBefore.reduce((a, r) => a + r.size, 0) / 1024

  console.log(`\n══ ${path} ══  DOMContentLoaded ${dcl} мс`)
  console.log(`  запросов до готовности документа: ${beforeDcl}, из них картинок ${imgReqBefore.length} (${Math.round(kb)} КБ)`)
  console.log(`  всего за 14 с: ` + Object.entries(byType).sort((a, b) => b[1].kb - a[1].kb).map(([t, v]) => `${t} ${v.n}/${Math.round(v.kb)}КБ`).join(', '))
  console.log(`  картинок в разметке: ${imgs.length}`)
  console.log(`      с loading="lazy": ${imgs.filter(i => i.lazy).length}`)
  console.log(`      без него (грузятся сразу): ${imgs.filter(i => !i.lazy).length}`)
  const eagerBelow = imgs.filter(i => !i.lazy && !i.inFirst)
  console.log(`      БЕЗ lazy И ниже первого экрана: ${eagerBelow.length}`)
  for (const i of eagerBelow.slice(0, 12)) console.log(`          y=${String(i.top).padStart(5)} ${String(i.w).padStart(4)}px  ${i.fp ? `fp=${i.fp} ` : ''}${i.src}`)
  const lazyAbove = imgs.filter(i => i.lazy && i.inFirst)
  if (lazyAbove.length) {
    console.log(`      lazy, но В первом экране (задержка видимого): ${lazyAbove.length}`)
    for (const i of lazyAbove.slice(0, 6)) console.log(`          y=${String(i.top).padStart(5)} ${i.src}`)
  }
  await ctx.close()
}
await browser.close()

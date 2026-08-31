// Почему картинки качаются заново при возврате: сравниваем адреса и заголовки.
import { chromium } from 'playwright'
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

let phase = 'first'
const seen = { first: new Set(), back: new Set() }
const headers = new Map()
const urlById = new Map()
cdp.on('Network.requestWillBeSent', e => urlById.set(e.requestId, { url: e.request.url, phase }))
cdp.on('Network.responseReceived', (e) => {
  const v = urlById.get(e.requestId)
  if (!v) return
  const isImg = /\.(webp|jpg|jpeg|png|avif)(\?|$)/.test(v.url) || v.url.includes('/storage/')
  if (!isImg) return
  seen[v.phase]?.add(v.url)
  if (!headers.has(v.url)) {
    const h = e.response.headers
    headers.set(v.url, {
      cc: h['cache-control'] || h['Cache-Control'] || '(нет)',
      age: h.age || '',
      etag: (h.etag || '').slice(0, 12),
      from: e.response.fromDiskCache || e.response.fromPrefetchCache ? 'кэш' : 'сеть',
    })
  }
})

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
phase = 'back'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(9000)

const first = [...seen.first], back = [...seen.back]
const repeat = back.filter(u => seen.first.has(u))
const fresh = back.filter(u => !seen.first.has(u))
console.log(`картинок при первом визите: ${first.length}`)
console.log(`картинок при возврате:      ${back.length}`)
console.log(`  из них ТЕ ЖЕ адреса:      ${repeat.length}`)
console.log(`  из них НОВЫЕ адреса:      ${fresh.length}`)
console.log('\nзаголовки кэширования (первые 4 картинки):')
for (const u of first.slice(0, 4)) {
  const h = headers.get(u)
  console.log(`  ${h.from.padEnd(5)} cache-control: ${h.cc.slice(0, 46)}`)
  console.log(`        ${u.split('/').pop().slice(0, 70)}`)
}
if (fresh.length) {
  console.log('\nновые адреса при возврате (первые 5):')
  for (const u of fresh.slice(0, 5)) console.log(`  ${u.split('/').pop().slice(0, 78)}`)
}
if (repeat.length) {
  console.log('\nповторно запрошенные ТЕ ЖЕ адреса (первые 5):')
  for (const u of repeat.slice(0, 5)) console.log(`  ${u.split('/').pop().slice(0, 78)}`)
}
await browser.close()

/**
 * Естественное сравнение на живом сайте, пока прогон починки не закончен:
 * часть картинок `_card` уже с годовым заголовком, часть ещё с `no-cache`.
 * Смотрим, кто переживает уход на другую страницу и возврат.
 *
 * Две ловушки, на которых этот замер уже врал:
 *   goto на ТОТ ЖЕ адрес Chrome считает перезагрузкой и перепроверяет всё —
 *     поэтому уходим на /cart и возвращаемся;
 *   событие ответа приходит и на попадание в кэш — поэтому считаем
 *     переданные байты (encodedDataLength), а не число событий.
 */
import { chromium } from 'playwright'
const B = 'https://uhti.kz'
const PATH = process.argv.find(a => a.startsWith('--path='))?.slice(7) || '/catalog/all'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')

let phase = 'first'
const byId = new Map()
const cc = new Map()        // url -> заголовок при первом визите
const bytes = new Map()     // `${phase}|${url}` -> переданные байты
cdp.on('Network.requestWillBeSent', e => byId.set(e.requestId, { url: e.request.url, phase }))
cdp.on('Network.responseReceived', (e) => {
  const v = byId.get(e.requestId)
  if (!v || !v.url.includes('/storage/v1/')) return
  if (v.phase === 'first') cc.set(v.url, e.response.headers['cache-control'] || '(нет)')
})
cdp.on('Network.loadingFinished', (e) => {
  const v = byId.get(e.requestId)
  if (!v || !v.url.includes('/storage/v1/')) return
  const k = `${v.phase}|${v.url}`
  bytes.set(k, (bytes.get(k) || 0) + e.encodedDataLength)
})

const settle = async () => {
  await p.waitForTimeout(11000)
  for (let y = 0; y <= 3000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(500) }
  await p.waitForTimeout(2500)
}

await p.goto(B + PATH, { waitUntil: 'domcontentloaded', timeout: 180000 })
await settle()
console.log(`${PATH}: при первом визите ${cc.size} картинок`)

await p.goto(`${B}/cart`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(5000)
phase = 'back'
await p.goto(B + PATH, { waitUntil: 'domcontentloaded', timeout: 180000 })
await settle()

const groups = new Map()
for (const [u, h] of cc) {
  const key = h.includes('31536000') ? 'год (починено)' : h.includes('no-cache') ? 'no-cache (не починено)' : h
  const g = groups.get(key) || { total: 0, again: 0, kb: 0 }
  g.total++
  const b = bytes.get(`back|${u}`) || 0
  if (b > 0) { g.again++; g.kb += b / 1024 }
  groups.set(key, g)
}
console.log('\nзаголовок при первом визите → сколько ТЕХ ЖЕ адресов скачано заново при возврате:')
for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].total - a[1].total))
  console.log(`  ${k.padEnd(26)} ${String(g.again).padStart(3)} из ${String(g.total).padStart(3)}  ${String(Math.round(g.kb)).padStart(4)} КБ`)
await browser.close()

// Из чего складывается дерево главной: узлы по секциям, карточки, видимость.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
})
const p = await ctx.newPage()
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const r = await p.evaluate(() => {
  const all = document.querySelectorAll('*').length
  const cards = [...document.querySelectorAll('.pc-card')]
  const vh = window.innerHeight

  // карточки: сколько всего, сколько попадает в первый экран
  const inFirst = cards.filter(el => el.getBoundingClientRect().top < vh).length

  // узлы внутри одной карточки
  const perCard = cards.length ? Math.round(cards.reduce((a, el) => a + el.querySelectorAll('*').length, 0) / cards.length) : 0

  // разбивка по секциям главной
  const secs = [...document.querySelectorAll('.home-content > *')].map(el => {
    const h2 = el.querySelector('h2')
    const rect = el.getBoundingClientRect()
    return {
      name: (h2?.textContent || el.className || 'без заголовка').trim().slice(0, 30),
      nodes: el.querySelectorAll('*').length,
      cards: el.querySelectorAll('.pc-card').length,
      top: Math.round(rect.top + scrollY),
    }
  }).filter(s => s.nodes > 5)

  return { all, cardsTotal: cards.length, inFirst, perCard, vh, secs, docH: Math.round(document.documentElement.scrollHeight) }
})

console.log(`всего узлов в документе: ${r.all}`)
console.log(`карточек товара: ${r.cardsTotal}, из них в первом экране: ${r.inFirst}`)
console.log(`узлов в одной карточке (среднее): ${r.perCard}`)
console.log(`высота документа: ${r.docH}px, экран: ${r.vh}px\n`)
console.log('секция'.padEnd(32), 'узлы'.padStart(6), 'карточки'.padStart(9), 'начало'.padStart(8))
for (const s of r.secs) console.log(s.name.padEnd(32), String(s.nodes).padStart(6), String(s.cards).padStart(9), String(s.top).padStart(8))
const below = r.secs.filter(s => s.top > r.vh).reduce((a, s) => a + s.nodes, 0)
console.log(`\nузлов ниже первого экрана: ${below} (${Math.round(below / r.all * 100)}% документа)`)
await browser.close()

/**
 * Успевает ли секция нарисоваться при РЕЗКОЙ прокрутке.
 *
 * Показ начинается за 600px до подхода (rootMargin). Ровная прокрутка это
 * скрывает — все прежние замеры шли ею. Здесь смахиваем страницу рывками,
 * как пальцем, и на каждом шаге смотрим: есть ли в кадре секция, у которой
 * место занято заглушкой, а содержимого ещё нет.
 */
import { chromium } from 'playwright'

const DESK = process.argv.includes('--desktop')
const [w, h, dpr] = DESK ? [1280, 900, 2] : [390, 844, 3]
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || ''
const NAV = process.argv.includes('--nav')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: !DESK, hasTouch: !DESK, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)

if (NAV) {
  // При переходе внутри сайта секции строятся заново — это худший случай.
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]`).click({ timeout: 20000 })
  await p.waitForTimeout(5000)
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="/"]`).click({ timeout: 20000 })
  await p.waitForTimeout(2500)
}

/** Пустая ли часть кадра: секция есть, место держит, содержимого нет. */
const probe = () => p.evaluate(() => {
  const vh = innerHeight
  const out = []
  for (const el of document.querySelectorAll('.home-content > *')) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh) continue
    const inner = el.firstElementChild
    const empty = !inner || inner.children.length === 0
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0)
    if (empty && visible > 40) {
      out.push({ h: Math.round(visible), share: Math.round(visible / vh * 100) })
    }
  }
  return { y: Math.round(scrollY), gaps: out }
})

// Рывками по высоте экрана: так листает палец, а не колесо.
const step = Math.round(h * 0.9)
const worst = []
const shots = []
for (let y = 0; y <= 7200; y += step) {
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y)
  // сразу после рывка, без паузы на дорисовку
  const a = await probe()
  await p.waitForTimeout(120)
  const b = await probe()
  const g = [...a.gaps, ...b.gaps]
  if (g.length) {
    const max = Math.max(...g.map(x => x.share))
    worst.push({ y, max })
    if (OUT && shots.length < 4) { const f = `${OUT}-${y}.png`; await p.screenshot({ path: f }); shots.push(f) }
  }
  await p.waitForTimeout(180)
}

console.log(`${DESK ? 'десктоп' : 'мобилка'} ${w}×${h}${NAV ? ', после перехода' : ', первая загрузка'}, шаг ${step}px`)
if (!worst.length) console.log('  пустого места в кадре не появлялось ни разу')
else {
  console.log(`  пустое место замечено на ${worst.length} шагах из ${Math.ceil(7200 / step) + 1}:`)
  for (const x of worst) console.log(`    на скролле ${String(x.y).padStart(5)}: до ${x.max}% высоты экрана пусто`)
}
if (shots.length) console.log(`  кадры: ${shots.join(', ')}`)
await browser.close()

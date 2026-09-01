/**
 * Прокрутили вниз, нажали ссылку — остаётся ли на экране прежняя страница.
 *
 * Именно этот случай описал владелец. Берём ссылку «Все бренды»: /brands
 * живёт на СВОЁМ макете, то есть оболочка при переходе уничтожается целиком.
 * Кадры снимаем часто и без пауз.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'la'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)

// Прокручиваем так, чтобы нужная ссылка оказалась в кадре. Важно: страница
// при этом остаётся прокрученной вниз — именно этот случай описал владелец.
const SEL0 = process.argv.find(a => a.startsWith('--sel='))?.slice(6) || 'a[href="/brands"]'
await p.evaluate((sel) => {
  // Сначала к секции — ссылка появляется только когда секция отрисована.
  const h = [...document.querySelectorAll('h2')].find(el => el.textContent.includes('Популярные бренды'))
  if (h) h.scrollIntoView({ block: 'start' })
  const a = document.querySelector(sel)
  if (a) a.scrollIntoView({ block: 'center' })
}, SEL0)
await p.waitForTimeout(1800)
const before = await p.evaluate(() => ({ y: Math.round(scrollY), путь: location.pathname }))
console.log(`до нажатия: прокрутка ${before.y}, ${before.путь}`)

const SEL = process.argv.find(a => a.startsWith('--sel='))?.slice(6) || 'a[href="/brands"]'
const нашли = await p.evaluate((sel) => {
  const a = [...document.querySelectorAll(sel)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  })
  if (!a) return false
  a.click()
  return true
}, SEL)
if (!нашли) { console.log('видимой ссылки «Все бренды» не нашлось'); await browser.close(); process.exit(0) }

const t0 = Date.now()
for (let i = 0; i < 16; i++) {
  const s = await p.evaluate(() => ({
    путь: location.pathname,
    y: Math.round(scrollY),
    // ВАЖНО: наличия узла мало. Удержанная страница хранится скрытой, и
    // querySelector находит её и тогда, когда на экране уже другая. Смотрим
    // именно на отрисовку: у скрытого поддерева нет ни размеров, ни
    // offsetParent.
    старая: (() => {
      const el = document.querySelector('.home-content')
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.width > 0 && el.offsetParent !== null
    })(),
    текст: document.body.innerText.replace(/\s+/g, ' ').slice(0, 34),
  }))
  const ms = Date.now() - t0
  console.log(`${String(ms).padStart(4)}мс  ${s.путь.padEnd(9)} прокрутка ${String(s.y).padStart(5)}  ${s.старая ? 'СТАРАЯ страница' : 'новая'}  «${s.текст}»`)
  if ([0, 3, 6].includes(i)) await p.screenshot({ path: `${OUT}-${i}.png` })
  if (!s.старая && i > 2) break
  await p.waitForTimeout(50)
}
await browser.close()

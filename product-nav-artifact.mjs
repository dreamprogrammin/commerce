/**
 * Остаётся ли на экране список каталога при переходе в карточку товара.
 * Самый частый переход на витрине.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto(`${B}/catalog/all`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
await p.evaluate(() => scrollTo({ top: 1800, behavior: 'instant' }))
await p.waitForTimeout(1500)

// кликаем только по карточке, уже попавшей в кадр
const ok = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/catalog/products/"]')].find((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  })
  if (!a) return false
  a.click()
  return true
})
if (!ok) { console.log('видимой карточки не нашлось'); await browser.close(); process.exit(0) }

const t0 = Date.now()
for (let i = 0; i < 16; i++) {
  const s = await p.evaluate(() => {
    // старая страница — та, где есть сетка карточек списка; смотрим на
    // ОТРИСОВКУ, наличия узла мало: удержанная страница хранится скрытой
    const grid = document.querySelector('.pc-card')
    const видна = grid ? (() => { const r = grid.getBoundingClientRect(); return r.height > 0 && grid.offsetParent !== null })() : false
    return { путь: location.pathname, y: Math.round(scrollY), список: видна, товар: !!document.querySelector('[class*="product-gallery"], .pdp, [class*="ProductGallery"]') }
  })
  const ms = Date.now() - t0
  console.log(`${String(ms).padStart(4)}мс  ${s.путь.slice(0, 26).padEnd(28)} y=${String(s.y).padStart(5)}  ${s.список ? 'СПИСОК на экране' : 'списка нет'}`)
  if (!s.список && i > 1) break
  await p.waitForTimeout(50)
}
await browser.close()

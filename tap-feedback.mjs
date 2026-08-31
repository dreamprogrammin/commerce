/**
 * Сколько проходит от нажатия до ПЕРВОГО признака, что переход начался.
 *
 * Жалоба: «порой непонятно, есть переход или нет». Смотрим три сигнала:
 *   подсветка пункта в нижней навигации;
 *   полоска загрузки вверху;
 *   собственно новая страница.
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
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)

const probe = href => p.evaluate((h) => {
  const item = document.querySelector(`nav[aria-label="Основная навигация"] a.mbn-item[href="${h}"]`)
  const bar = document.querySelector('[class*="loading-bar" i], [class*="LoadingBar" i], .nprogress, [role="progressbar"]')
  const barVisible = !!bar && getComputedStyle(bar).opacity !== '0' && bar.getBoundingClientRect().width > 4
  return {
    подсвечен: item?.getAttribute('aria-current') === 'page',
    полоска: barVisible,
    старая: !!document.querySelector('.home-content'),
    путь: location.pathname,
  }
})

const href = '/catalog'
await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)

const t0 = Date.now()
await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
const marks = { подсветка: null, полоска: null, новая: null }
for (let i = 0; i < 40; i++) {
  const s = await probe(href)
  const ms = Date.now() - t0
  if (marks.подсветка === null && s.подсвечен) marks.подсветка = ms
  if (marks.полоска === null && s.полоска) marks.полоска = ms
  if (marks.новая === null && !s.старая) marks.новая = ms
  if (marks.подсветка !== null && marks.новая !== null) break
  await p.waitForTimeout(40)
}
console.log('от нажатия до:')
console.log(`  подсветка пункта   ${marks.подсветка === null ? 'не дождались' : marks.подсветка + ' мс'}`)
console.log(`  полоска загрузки   ${marks.полоска === null ? 'не замечена' : marks.полоска + ' мс'}`)
console.log(`  новая страница     ${marks.новая === null ? 'не дождались' : marks.новая + ' мс'}`)
await browser.close()

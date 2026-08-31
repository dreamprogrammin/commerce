// Удерживается ли страница на самом деле: ставим метку на узел главной,
// уходим, возвращаемся и смотрим, пережила ли она переход.
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)

const mark = await p.evaluate(() => {
  const page = document.querySelector('.home-content')
  const layout = document.querySelector('.home-footer-layer') || document.querySelector('main')?.parentElement
  if (page) page.dataset.probe = 'страница'
  if (layout) layout.dataset.probeLayout = 'макет'
  return `страница ${page ? 'да' : 'нет'}, макет ${layout ? layout.className.slice(0, 30) : 'нет'}`
})
console.log(`метка: ${mark}`)

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)

const after = await p.evaluate(() => {
  const el = document.querySelector('.home-content')
  const layout = document.querySelector('.home-footer-layer') || document.querySelector('main')?.parentElement
  return {
    survived: el?.dataset.probe === 'страница',
    layoutSurvived: layout?.dataset.probeLayout === 'макет',
    nodes: document.querySelectorAll('*').length,
    imgsDone: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length,
    imgs: document.querySelectorAll('img').length,
  }
})
console.log(`после возврата:`)
console.log(`  страница: ${after.survived ? 'ПЕРЕЖИЛА — удержана' : 'пересоздана'}`)
console.log(`  макет:    ${after.layoutSurvived ? 'ПЕРЕЖИЛ — не менялся' : 'пересоздан'}`)
console.log(`  узлов ${after.nodes}, картинок готовых ${after.imgsDone} из ${after.imgs}`)
await browser.close()

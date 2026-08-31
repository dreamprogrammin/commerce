// Какие хуки роутера реально срабатывают на разных переходах.
import { chromium } from 'playwright'
const B = 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
let tag = ''
p.on('console', (m) => { const t = m.text(); if (t.startsWith('[nav]')) console.log(`   ${tag}  ${t.slice(6)}`) })

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const showNav = async () => {
  await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
}

console.log('\n=== нижняя навигация: главная → каталог ===')
tag = 'нав'
await showNav()
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)

console.log('\n=== ссылка: каталог → список товаров ===')
tag = 'спис'
await p.goto(B + '/catalog/all', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(9000)
await p.evaluate(() => scrollTo({ top: 1800, behavior: 'instant' }))
await p.waitForTimeout(1200)
console.log('   (перешли по карточке товара, видимой в кадре)')
const i = await p.evaluate(() => [...document.querySelectorAll('a[href*="/catalog/products/"]')].findIndex((el) => {
  const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
}))
if (i >= 0) { await p.locator('a[href*="/catalog/products/"]').nth(i).click({ timeout: 20000 }); await p.waitForTimeout(6000) }
else console.log('   (видимой карточки не нашлось)')
await browser.close()

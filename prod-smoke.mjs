// Гостевой путь на проде после выкатки: товар в корзину, корзина, оформление.
// Заказ НЕ оформляем — доходим до формы и останавливаемся.
import { chromium } from 'playwright'
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 120)))

await p.goto(`${B}/catalog/all`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(7000)
// кликаем только по кнопке, которая уже в кадре
const i = await p.evaluate(() => [...document.querySelectorAll('button.pc-add')].findIndex((el) => {
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
}))
console.log(`кнопка «в корзину» в кадре: ${i >= 0 ? 'да' : 'нет'}`)
if (i >= 0) {
  await p.locator('button.pc-add').nth(i).click({ timeout: 20000 })
  await p.waitForTimeout(2500)
}
await p.goto(`${B}/cart`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(5000)
const cart = await p.evaluate(() => ({ y: Math.round(scrollY), txt: document.body.innerText.slice(0, 60).replace(/\s+/g, ' ') }))
console.log(`корзина: y=${cart.y}  «${cart.txt}»`)
await p.goto(`${B}/checkout`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(5000)
const co = await p.evaluate(() => ({
  y: Math.round(scrollY),
  inputs: document.querySelectorAll('input').length,
  fs: [...document.querySelectorAll('input')].slice(0, 3).map(el => getComputedStyle(el).fontSize),
}))
console.log(`оформление: y=${co.y}, полей ${co.inputs}, размер шрифта ${co.fs.join(', ')}`)
console.log(`ошибок консоли: ${errs.length}`)
for (const e of [...new Set(errs)].slice(0, 5)) console.log('  ' + e)
await browser.close()

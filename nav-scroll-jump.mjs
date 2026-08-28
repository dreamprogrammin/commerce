// Прыгает ли что-нибудь при прокрутке ПОСЛЕ перехода на главную.
// Именно здесь секции появляются по мере подхода, и заглушка обязана
// держать место точно — иначе человек увидит рывок.
import { chromium } from 'playwright'
const DESK = process.argv.includes('--desktop')
const [w, h, dpr] = DESK ? [1280, 900, 2] : [390, 844, 3]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: !DESK, hasTouch: !DESK, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(3000)

const heads = () => p.evaluate(() => {
  const o = {}
  for (const el of document.querySelectorAll('.home-content h2')) {
    o[el.textContent.trim().slice(0, 20)] = Math.round(el.getBoundingClientRect().top + scrollY)
  }
  return { o, doc: Math.round(document.documentElement.scrollHeight) }
})

const before = await heads()
console.log(`${DESK ? 'десктоп' : 'мобилка'} ${w}×${h}, после перехода: документ=${before.doc}`)

// медленно вниз, как человек
for (let y = 0; y <= 7000; y += 500) {
  await p.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y)
  await p.waitForTimeout(500)
}
await p.waitForTimeout(2000)
const after = await heads()
console.log(`после прокрутки:            документ=${after.doc}`)

let moved = 0
for (const k of Object.keys(after.o)) {
  const a = before.o[k], b = after.o[k]
  if (a === undefined) { console.log(`  ПОЯВИЛСЯ  ${k} на ${b}`); continue }
  if (Math.abs(a - b) > 2) { console.log(`  СДВИГ     ${k}: ${a} → ${b} (${b - a > 0 ? '+' : ''}${b - a})`); moved++ }
  else console.log(`  на месте  ${k}`)
}
console.log(`\nсдвинулось: ${moved}, высота ${before.doc} → ${after.doc}`)
await browser.close()

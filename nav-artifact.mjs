// Артефакт предыдущей страницы при переходе нижней навигацией.
// Снимаем кадры сразу после клика и ищем остатки старого экрана.
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'artifact'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
})
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
    sessionStorage.setItem('guest_bonus_modal_seen', 'true')
  } catch {}
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)

// Спускаемся вниз главной — там секции, которые содержат «Хиты продаж» и SEO-блок.
await p.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }))
await p.waitForTimeout(1500)
await p.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }))
await p.waitForTimeout(1200)

const shots = []
const href = '/catalog'
await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })

// Кадры первых полутора секунд после клика.
for (const ms of [0, 120, 250, 400, 700, 1100, 1600, 2400]) {
  await p.waitForTimeout(ms === 0 ? 0 : (ms - shots.at(-1)?.ms || ms))
  const path = `${OUT}-${String(ms).padStart(4, '0')}.png`
  await p.screenshot({ path })
  const info = await p.evaluate(() => ({
    path: location.pathname,
    y: Math.round(scrollY),
    h: Math.round(document.documentElement.scrollHeight),
    // видимый текст в верхней половине экрана
    top: [...document.querySelectorAll('h1,h2')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.top > -40 && r.top < innerHeight && r.width > 0
    }).map(el => el.textContent.trim().slice(0, 34)),
  }))
  shots.push({ ms, ...info })
}

for (const s of shots) console.log(`${String(s.ms).padStart(5)}мс  ${s.path.padEnd(10)} y=${String(s.y).padStart(5)}  высота=${String(s.h).padStart(6)}  ${s.top.join(' | ')}`)

fs.writeFileSync(`${OUT}.json`, JSON.stringify(shots, null, 2))
await browser.close()

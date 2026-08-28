// Артефакт при ВОЗВРАТЕ на главную и при восстановлении позиции скролла.
// Именно здесь content-visibility опасен: пропущенная секция не нарисована.
import { chromium } from 'playwright'
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'back'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(11000)

// Уходим глубоко вниз главной — секции ниже фолда уже отрисованы и прокручены.
await p.evaluate(() => window.scrollTo({ top: 3500, behavior: 'instant' }))
await p.waitForTimeout(2000)
await p.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }))
await p.waitForTimeout(1000)

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(4000)

// И возвращаемся на главную той же панелью.
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })

const marks = [0, 100, 200, 350, 600, 1000, 1800]
let prev = 0
for (const ms of marks) {
  if (ms > prev) await p.waitForTimeout(ms - prev)
  prev = ms
  await p.screenshot({ path: `${OUT}-${String(ms).padStart(4, '0')}.png` })
  const d = await p.evaluate(() => {
    const inView = [...document.querySelectorAll('.home-content h2')].filter(el => {
      const r = el.getBoundingClientRect(); return r.top > -40 && r.top < innerHeight
    }).map(el => el.textContent.trim().slice(0, 26))
    // сколько секций сейчас пропущено отрисовкой
    const skipped = [...document.querySelectorAll('.home-defer')].filter(
      el => !el.checkVisibility({ contentVisibilityAuto: true })
    ).length
    return { path: location.pathname, y: Math.round(scrollY), h: Math.round(document.documentElement.scrollHeight), inView, skipped, defer: document.querySelectorAll('.home-defer').length }
  })
  console.log(`${String(ms).padStart(5)}мс  ${d.path.padEnd(9)} y=${String(d.y).padStart(5)} высота=${String(d.h).padStart(6)} пропущено=${d.skipped}/${d.defer}  ${d.inView.join(' | ')}`)
}
await browser.close()

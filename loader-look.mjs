// Как выглядит заглушка в момент, когда она точно на экране.
import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
await p.evaluate(() => document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click())
// ждём саму заглушку, а не время
await p.waitForFunction(() => !!document.querySelector('.shell-placeholder'), { timeout: 10000 }).catch(() => {})
const s = await p.evaluate(() => {
  const el = document.querySelector('.shell-placeholder')
  if (!el) return { нет: true }
  const cs = getComputedStyle(el)
  return { фон: cs.backgroundColor, прозрачность: cs.opacity, z: cs.zIndex, подложка: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() }
})
console.log(JSON.stringify(s))
// серия кадров сразу после появления: одиночный снимок ловил затухание
for (let i = 0; i < 5; i++) {
  const есть = await p.evaluate(() => {
    const el = document.querySelector('.shell-placeholder')
    return el ? getComputedStyle(el).opacity : 'нет'
  })
  await p.screenshot({ path: `${SC}/lz-${i}.png`, clip: { x: 100, y: 320, width: 190, height: 200 } })
  console.log(`  кадр ${i}: заглушка ${есть}`)
  await p.waitForTimeout(40)
}
await browser.close()

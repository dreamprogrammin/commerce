/**
 * Виден ли рывок прокрутки на СТАРОЙ странице при переходе.
 *
 * Жалоба владельца: прокрутил вниз, нажал переход — страница прыгает наверх,
 * и какое-то время видно именно её, а не ту, куда идёшь.
 *
 * Меряем часто и без пауз: на каком кадре какая страница нарисована и какая
 * у неё прокрутка.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || ''
const FROM = Number(process.argv.find(a => a.startsWith('--y='))?.slice(4) || 2000)
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

// уходим вниз — как человек, дочитавший до середины
await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), FROM)
await p.waitForTimeout(1200)
// панель прячется при скролле вниз, поднимаем чуть вверх чтобы она вернулась
await p.evaluate(t => scrollTo({ top: t - 200, behavior: 'instant' }), FROM)
await p.waitForTimeout(1000)
const before = await p.evaluate(() => ({ y: Math.round(scrollY), path: location.pathname }))
console.log(`до нажатия: ${JSON.stringify(before)}`)

const t0 = Date.now()
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
const trail = []
for (let i = 0; i < 22; i++) {
  const s = await p.evaluate(() => ({
    y: Math.round(scrollY),
    path: location.pathname,
    // Старая страница определяется по её собственному корню: заголовок новой
    // появляется позже скелетона, и по нему момент смены картинки не поймать.
    стараяНаЭкране: !!document.querySelector('.home-content'),
  }))
  trail.push({ ms: Date.now() - t0, ...s })
  if (OUT && [0, 2, 5, 9].includes(i)) await p.screenshot({ path: `${OUT}-${String(i).padStart(2, '0')}.png` })
  if (!s.стараяНаЭкране && trail.filter(x => !x.стараяНаЭкране).length > 3) break
  await p.waitForTimeout(40)
}
console.log('\n мс   адрес      скролл  на экране')
for (const t of trail) console.log(`${String(t.ms).padStart(4)}  ${t.path.padEnd(10)} ${String(t.y).padStart(5)}   ${t.стараяНаЭкране ? 'СТАРАЯ страница' : 'новая'}`)
const jumped = trail.find(t => t.y === 0 && t.стараяНаЭкране)
console.log(jumped
  ? `\nРЫВОК ВИДЕН: на ${jumped.ms} мс прокрутка уже 0, а на экране ещё старая страница`
  : '\nрывка нет: пока видна старая страница, её прокрутка не трогается')
await browser.close()

// Высоты секций главной на обеих ширинах — для заглушек отложенного показа.
import { chromium } from 'playwright'
const browser = await chromium.launch()
for (const [w, h, dpr, name] of [[390, 844, 3, 'мобилка'], [1280, 900, 2, 'десктоп']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 900, hasTouch: w < 900, ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(12000)
  await p.evaluate(() => window.scrollTo({ top: 9000, behavior: 'instant' }))
  await p.waitForTimeout(3000)
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await p.waitForTimeout(1500)
  const r = await p.evaluate(() => {
    const find = t => [...document.querySelectorAll('.home-content h2')].find(el => el.textContent.includes(t))?.closest('.home-content > *')
    const names = { 'Популярные категории': 'категории', 'Популярные бренды': 'бренды', 'Акции и бонусы': 'акции', 'Хиты продаж': 'хиты', 'Интернет-магазин': 'seo' }
    const out = {}
    for (const [t, k] of Object.entries(names)) {
      const el = find(t)
      out[k] = el ? Math.round(el.getBoundingClientRect().height) : null
    }
    return { out, doc: Math.round(document.documentElement.scrollHeight) }
  })
  console.log(`${name} (${w}px): ` + Object.entries(r.out).map(([k, v]) => `${k}=${v}`).join(', ') + `  документ=${r.doc}`)
  await ctx.close()
}
await browser.close()

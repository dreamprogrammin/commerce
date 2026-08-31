// Размер шрифта в полях: меньше 16px на грубом указателе = Safari зумит.
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()

const cases = [
  { w: 390, h: 844, dpr: 3, touch: true, name: 'телефон 390' },
  { w: 1024, h: 768, dpr: 2, touch: true, name: 'планшет альбом 1024 (касание)' },
  { w: 1440, h: 900, dpr: 2, touch: false, name: 'десктоп 1440 (мышь)' },
]

for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, isMobile: c.touch, hasTouch: c.touch, ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  // Форма оформления разворачивается только с товаром в корзине.
  await p.goto(`${B}/catalog/all`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(7000)
  const i = await p.evaluate(() => [...document.querySelectorAll('button.pc-add')].findIndex((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
  }))
  if (i >= 0) {
    await p.locator('button.pc-add').nth(i).click({ timeout: 20000 })
    await p.waitForTimeout(2500)
  }
  await p.goto(`${B}/checkout`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(6000)
  const r = await p.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, textarea, select')]
    const sizes = inputs.map(el => Number.parseFloat(getComputedStyle(el).fontSize))
    const search = document.querySelector('.sh-search__input')
    return {
      n: inputs.length,
      min: sizes.length ? Math.min(...sizes) : null,
      bad: sizes.filter(s => s < 16).length,
      list: [...new Set(sizes)].sort((a, b) => a - b),
      searchFs: search ? Number.parseFloat(getComputedStyle(search).fontSize) : null,
    }
  })
  const verdict = c.touch ? (r.bad === 0 ? 'зума не будет' : `ЗУМ: ${r.bad} полей меньше 16px`) : 'мышь — зум не применим'
  console.log(`${c.name.padEnd(30)} полей ${String(r.n).padStart(2)}  размеры ${r.list.join('/')}  поиск ${r.searchFs}  → ${verdict}`)
  await ctx.close()
}
await browser.close()

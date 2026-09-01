// Снимки страниц для сверки «до/после» при рефакторинге макетов.
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const TAG = process.argv.find(a => a.startsWith('--tag='))?.slice(6) || 'shot'
const DIR = process.argv.find(a => a.startsWith('--dir='))?.slice(6) || '.'
const browser = await chromium.launch()
for (const [w, h, dpr, name] of [[390, 844, 3, 'mob'], [1280, 900, 2, 'desk']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 900, hasTouch: w < 900, ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  const PAGES = process.argv.filter(a => a.startsWith('--page=')).map((a) => {
  const [path, slug] = a.slice(7).split('|')
  return [path, slug || path.replace(/\W+/g, '-')]
})
for (const [path, slug] of (PAGES.length ? PAGES : [['/', 'home'], ['/catalog', 'catalog'], ['/catalog/all', 'listing']])) {
    await p.goto(B + path, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await p.waitForTimeout(11000)
    const m = await p.evaluate(() => ({ h: Math.round(document.documentElement.scrollHeight), main: (() => { const el = document.querySelector('main'); if (!el) return null; const c = getComputedStyle(el); return `pt${c.paddingTop} pb${c.paddingBottom}` })(), footer: !!document.querySelector('footer') }))
    await p.screenshot({ path: `${DIR}/${TAG}-${name}-${slug}.png` })
    console.log(`${name.padEnd(5)} ${path.padEnd(14)} высота ${String(m.h).padStart(5)}  main ${m.main}  подвал ${m.footer ? 'есть' : 'нет'}`)
  }
  await ctx.close()
}
await browser.close()

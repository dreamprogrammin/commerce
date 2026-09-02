// Сверка цвета плиток: главная против каталога, по вычисленному фону.
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()

const оттенки = async (url, подпись) => {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(11000)
  await p.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' }))
  await p.waitForTimeout(1500)
  const r = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('[style*="--ct-tint"]')) {
      const t = getComputedStyle(el).getPropertyValue('--ct-tint').trim()
      const подпись = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)
      if (t) out.push(`${t}  ${подпись}`)
    }
    return [...new Set(out)].slice(0, 6)
  })
  console.log(`${подпись}:`)
  for (const x of r) console.log(`   ${x}`)
}

await оттенки('https://localhost:3111/', 'главная')
await оттенки('https://localhost:3111/catalog', 'каталог')
await browser.close()

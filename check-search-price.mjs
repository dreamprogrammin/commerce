/**
 * Цена в поиске = цена на карточке (`final_price` из базы).
 *
 * Шторка (390) и выпадашка шапки (1440) пересчитывали скидку сами:
 * LEGO 60410 −10% — 8 091 ₸ в поиске, 7 990 ₸ на карточке и в кассе;
 * в шторке ещё и с дробью «16 141,5 ₸» (16 октября 2026).
 *   BASE=http://localhost:3321 SUPABASE_URL=… SUPABASE_KEY=… node check-search-price.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3321'
const { SUPABASE_URL, SUPABASE_KEY } = process.env
const Q = 'лего'

const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_products`, {
  method: 'POST',
  headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_query: Q, p_limit: 20 }),
})).json()
const bySlug = new Map(rows.map(r => [r.slug, r]))
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

async function collect(page, root) {
  return page.evaluate((root) => {
    const box = document.querySelector(root) || document
    return [...box.querySelectorAll('a[href*="/catalog/products/"]')]
      .filter(a => a.offsetParent)
      .map((a) => {
        const spans = [...a.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => t.includes('₸'))
        return { slug: a.getAttribute('href').split('/').pop(), main: spans[0] || '', old: spans[1] || '' }
      })
  }, root)
}

function verify(label, items) {
  check(items.length > 0, `${label}: результаты есть (${items.length})`)
  let discounted = 0
  for (const it of items) {
    const r = bySlug.get(it.slug)
    if (!r) continue
    const want = (r.discount_percentage > 0 ? fmt(r.final_price) : fmt(r.price)) + ' ₸'
    if (r.discount_percentage > 0) discounted++
    if (it.main.replace(/\s/g, ' ') !== want.replace(/\s/g, ' ') || /,/.test(it.main))
      check(false, `${label}: ${it.slug} — показано «${it.main}», ждали «${want}»`)
    if (r.discount_percentage > 0 && it.old.replace(/\s/g, ' ') !== `${fmt(r.price)} ₸`.replace(/\s/g, ' '))
      check(false, `${label}: ${it.slug} — старая цена «${it.old}»`)
  }
  check(discounted > 0, `${label}: среди результатов есть товары со скидкой (${discounted})`)
  check(!failed, `${label}: все цены совпали с final_price`)
}

const browser = await chromium.launch()

// Десктоп — выпадашка шапки
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const input = page.locator('.sh-search__input').first()
  await input.click()
  await input.type(Q, { delay: 60 })
  await page.waitForTimeout(3000)
  verify('1440 шапка', await collect(page, '[role="listbox"]'))
  await page.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/2f5516ca-bba4-4554-bb62-0c530b58475c/scratchpad/search-1440.png' })
}

// Мобильный — шторка
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.locator('.sticky-row__search, button:has-text("Найти товары")').first().click()
  await page.waitForTimeout(800)
  await page.locator('input[type="search"]').filter({ visible: true }).first().type(Q, { delay: 60 })
  await page.waitForTimeout(3000)
  verify('390 шторка', await collect(page, '[role="dialog"]'))
  await page.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/2f5516ca-bba4-4554-bb62-0c530b58475c/scratchpad/search-390.png' })
}

await browser.close()
process.exit(failed ? 1 : 0)

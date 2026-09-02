/**
 * Страница бренда: разметка на месте, текст виден, консоль чистая.
 * Стенд — см. шапку check-landing-robots.mjs.
 *   BASE=http://localhost:3001 node check-brand-page.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3001'
const browser = await chromium.launch()
for (const slug of ['cada', 'lego', 'mokatoys']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 140)))
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 140)}`))
  const resp = await page.goto(`${BASE}/brand/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(4000)
  const h1 = (await page.textContent('h1').catch(() => ''))?.trim()
  const about = await page.locator('.brand-description').count()
  const cards = await page.locator('a[href^="/catalog/products/"]').count()
  await page.screenshot({ path: `/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/brand-${slug}.png`, fullPage: false })
  console.log(`${errors.length ? '❌' : '✅'} /brand/${slug} — код ${resp.status()} | H1 «${h1}» | блоков «О бренде» ${about} | карточек ${cards}`)
  if (errors.length) console.log('   ' + errors.join('\n   '))
  await page.close()
}
await browser.close()

/**
 * Мета-описание категорий: то же после гидратации, что и на сервере.
 * Стенд с прод-данными на чтение — см. шапку check-landing-robots.mjs.
 *   BASE=http://localhost:3001 node check-category-meta.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3001'
const PAGES = [
  '/catalog/girls',
  '/catalog/girls/kukly',
  '/catalog/kiddy/katalki',
  '/catalog/constructors-root/konstruktory-malchikam/brand/lego',
]

const browser = await chromium.launch()
for (const path of PAGES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 140)))
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 140)}`))

  const resp = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const ssr = (await resp.text()).match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  await page.waitForTimeout(4000)
  const hydrated = await page.getAttribute('meta[name="description"]', 'content') ?? ''
  const same = ssr === hydrated
  console.log(`${same && !errors.length ? '✅' : '❌'} ${path}`)
  console.log(`   ${hydrated.length} знаков: ${hydrated}`)
  if (!same) console.log(`   РАСХОЖДЕНИЕ с сервером: ${ssr}`)
  if (errors.length) console.log(`   ошибки: ${errors.join(' | ')}`)
  await page.close()
}
await browser.close()

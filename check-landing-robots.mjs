/**
 * Проверка бренд-лендингов: порог MIN_PRODUCTS_FOR_BRAND_LANDING.
 *
 * Пустой лендинг обязан отдавать `noindex, follow`, живой — `index, follow`,
 * обычная категория — не измениться. Смотрит мету ПОСЛЕ гидратации: сервер и
 * клиент обязаны сойтись, иначе Google при отрисовке получит другое правило.
 *
 * Стенд поднимается с прод-данными на чтение (в локальных бакетах пусто,
 * а без товаров вся проверка теряет смысл):
 *
 *   SUPABASE_URL=https://gvsdevsvzgcivpphcuai.supabase.co \
 *   SUPABASE_KEY=<публичный anon-ключ из разметки uhti.kz> \
 *   pnpm dev --port 3001
 *
 *   BASE=http://localhost:3001 node check-landing-robots.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3001'
const PAGES = [
  ['/catalog/constructors-root/konstruktory-malchikam/brand/lego', 'index'],
  ['/catalog/boys/mashinki/avtotreki/brand/soba', 'noindex'],
  ['/catalog/constructors-root/konstruktory-malchikam', 'index'],
]

const browser = await chromium.launch()
for (const [path, expect] of PAGES) {
  const page = await browser.newPage()
  const errors = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 160)}`))
  const resp = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(4000)
  const robots = await page.getAttribute('meta[name="robots"]', 'content')
  const h1 = await page.textContent('h1').catch(() => null)
  const cards = await page.locator('a[href^="/catalog/products/"]').count()
  const ok = expect === 'index' ? !robots?.includes('noindex') : robots?.includes('noindex')
  console.log(`${ok ? '✅' : '❌'} ${path}`)
  console.log(`   код ${resp.status()} | robots после гидратации: ${robots}`)
  console.log(`   H1: ${h1?.trim()} | карточек: ${cards}`)
  console.log(`   ошибок консоли: ${errors.length}${errors.length ? `\n     ${errors.join('\n     ')}` : ''}`)
  await page.close()
}
await browser.close()

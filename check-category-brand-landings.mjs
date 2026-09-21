/*
 * Связки «раздел + бренд» (/catalog/<раздел>/brand/<бренд>) — страница,
 * карта сайта и ссылки со страниц брендов говорят одно и то же.
 *
 * Что должно быть (21 сентября 2026, просьба владельца: «чтобы на выдаче
 * была лента товаров и цены от до»):
 *  • открыта для индекса ровно та связка, которую открывает decideBrandLanding
 *    (utils/brandLanding.ts): не корень, не меньше трёх товаров, не дубль
 *    более точного подраздела, не раздел, уже названный брендом;
 *  • у открытой: под H1 строка «N моделей · от X до Y ₸», в описании для
 *    выдачи то же число и те же цены, свой текст со списком моделей, если
 *    руками текст не написан; в H1 и title нет дательного падежа
 *    («Конструкторы Мальчикам LEGO») и почерка старого генератора
 *    («— купить в Алматы»); canonical — на саму связку;
 *  • в карте сайта — ровно открытые связки;
 *  • со страницы бренда ссылки ведут ровно на его открытые связки, подписи
 *    читаемые.
 *
 * Ожидания считаются по боевой базе (чтение публичным ключом со страницы)
 * ТЕМИ ЖЕ функциями, что у сайта, — через jiti. Страж ловит не правило, а
 * расхождение: страницу, карту или ссылки, которые живут по другому.
 *
 *   node check-category-brand-landings.mjs --base=http://localhost:3127   # сборка на прод-данных
 *   node check-category-brand-landings.mjs --base=https://uhti.kz
 *
 * Только чтение.
 */
import process from 'node:process'
import { createJiti } from 'jiti'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const SQL_HINT = 'данные: строка в category_brand_seo, снимается docs/SEO_BRAND_LANDINGS_2026_09_21.sql'

const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } })
const L = await jiti.import('./utils/brandLanding.ts')
const T = await jiti.import('./utils/brandLandingText.ts')
const { parseHTMLToBlocks } = await jiti.import('./utils/parseSEOContent.ts')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

// ─── Данные: адрес базы и публичный ключ — со страницы, как у посетителя ───
const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || home.match(/"(https?:\/\/[^"]+supabase\.co)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
if (!supaUrl || !anon) {
  console.log(' ПРОВАЛ  не нашёл на странице адрес базы или публичный ключ')
  process.exit(1)
}
async function rest(path) {
  const res = await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })
  if (!res.ok)
    throw new Error(`${path}: ${res.status}`)
  return res.json()
}

const [categories, brands, products, stored] = await Promise.all([
  rest('categories?select=id,slug,href,name,seo_h1,parent_id'),
  rest('brands?select=id,slug,name'),
  rest('products?select=name,slug,price,final_price,stock_quantity,min_age_years,max_age_years,category_id,brand_id&is_active=eq.true'),
  rest('category_brand_seo?select=category_id,brand_id,seo_h1,seo_title,seo_description,seo_text'),
])
const byId = new Map(categories.map(c => [c.id, c]))
const brandById = new Map(brands.map(b => [b.id, b]))
const storedByKey = new Map(stored.map(s => [L.brandLandingPairKey(s.category_id, s.brand_id), s]))
const counts = L.countProductsByCategoryBrand(products, categories)

function branchOf(id) {
  const set = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const c of categories) {
      if (c.parent_id && set.has(c.parent_id) && !set.has(c.id)) {
        set.add(c.id)
        grew = true
      }
    }
  }
  return set
}

const pairs = []
for (const key of counts.keys()) {
  const [categoryId, brandId] = key.split('|')
  const category = byId.get(categoryId)
  const brand = brandById.get(brandId)
  if (!category?.slug || !brand?.slug)
    continue
  const verdict = L.decideBrandLanding(categoryId, brandId, counts, categories, brand.name)
  const branch = branchOf(categoryId)
  const items = products.filter(p => p.brand_id === brandId && branch.has(p.category_id))
  pairs.push({
    key,
    category,
    brand,
    verdict,
    items,
    facts: T.brandLandingFacts(items),
    stored: storedByKey.get(key) ?? null,
    path: L.buildBrandLandingPath(category.href || `/catalog/${category.slug}`, brand.slug),
  })
}
const open = pairs.filter(p => p.verdict.indexable)
const closed = pairs.filter(p => !p.verdict.indexable)
console.log(`база ${supaUrl.replace(/^https?:\/\//, '').slice(0, 24)}…, сайт ${BASE}`)
console.log(`связок с товарами ${pairs.length}: открыть ${open.length}, закрыть ${closed.length}\n`)

// ─── Разметка ───
function norm(s) {
  return (s ?? '')
    .replace(/&nbsp;|&#160;|\xA0|\u202F/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
function strip(s) {
  return norm((s ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
}
function head(html) {
  const meta = name => (html.match(new RegExp(`<meta[^>]+name="${name}"[^>]*content="([^"]*)"`)) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*name="${name}"`)) || [])[1]
  return {
    title: norm((html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1]),
    robots: meta('robots') ?? '',
    description: norm(meta('description')),
    canonical: (html.match(/<link[^>]+rel="canonical"[^>]*href="([^"]*)"/) || html.match(/<link[^>]+href="([^"]*)"[^>]*rel="canonical"/) || [])[1] ?? '',
    h1: strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]),
    // Без <script>: в них payload и JSON-LD, где текст лежит, даже когда на
    // странице его нет. На этом страж однажды соврал — текст связки был
    // только в разметке данных, а на странице не рисовался вовсе.
    text: strip(html.replace(/<script[\s\S]*?<\/script>/g, ' ')),
  }
}
async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'text/html' } })
  return { status: res.status, html: await res.text() }
}
/*
 * Страницы грузятся заранее, по четыре разом: стенд без кеша отдаёт связку за
 * 3–4 с, и по одной страж шёл больше десяти минут. Разбор — по порядку.
 */
async function prefetch(paths) {
  const out = new Map()
  const queue = [...new Set(paths)]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const path = queue.shift()
      out.set(path, await get(path))
    }
  }))
  return out
}

const DATIVE = /(?:^|[\s«])(?:мальчикам|девочкам|малышам)(?=[\s»,.]|$)/i
const GENERATOR = /— купить в Алматы(?: с доставкой)?(?: \| Ухтышка)?$/
// «9 моделей · от 7 490 до 18 890 ₸» → «9 моделей» и «от 7 490 до 18 890 ₸».
function summaryParts(f) {
  return norm(T.composeBrandLandingSummary(f)).split(' · ')
}

// ─── Закрытые: по три на каждую причину ───
const perReason = new Map()
for (const p of closed) {
  const list = perReason.get(p.verdict.reason) ?? []
  if (list.length < 3)
    list.push(p)
  perReason.set(p.verdict.reason, list)
}
const pages = await prefetch([
  ...open.map(p => p.path),
  ...[...perReason.values()].flat().map(p => p.path),
  ...open.map(p => `/brand/${p.brand.slug}`),
  '/sitemap.xml',
])

// ─── 1. Открытые связки ───
console.log('1) открытые связки')
for (const p of open) {
  const { status, html } = pages.get(p.path)
  const h = head(html)
  const label = `${p.category.slug} + ${p.brand.name}`
  const fromData = (field, value) => p.stored?.[field] && norm(p.stored[field]) === value ? ` (${SQL_HINT})` : ''
  console.log(`\n  ${p.path}`)
  check(status === 200, `${label}: ответ ${status}`)
  check(/\bindex\b/.test(h.robots) && !h.robots.includes('noindex'), `${label}: robots «${h.robots}» — ждём index`)
  check(h.canonical.endsWith(p.path), `${label}: canonical на саму связку (${h.canonical.replace(/^https?:\/\/[^/]+/, '') || 'нет'})`)
  check(!DATIVE.test(h.h1), `${label}: H1 без дательного падежа — «${h.h1}»${fromData('seo_h1', h.h1)}`)
  check(!GENERATOR.test(h.h1), `${label}: H1 не шаблон старого генератора${fromData('seo_h1', h.h1)}`)
  check(!DATIVE.test(h.title) && !GENERATOR.test(h.title.replace(/ \| Ухтышка$/, '')), `${label}: title «${h.title}»${fromData('seo_title', h.title)}`)
  const summary = norm(T.composeBrandLandingSummary(p.facts))
  const [modelsText, rangeText = ''] = summaryParts(p.facts)
  check(h.text.includes(summary), `${label}: под H1 «${summary}»`)
  const describes = h.description.includes(modelsText) && h.description.includes(rangeText)
  check(describes, `${label}: описание с «${modelsText}» и «${rangeText}» — «${h.description.slice(0, 90)}…»`)
  // Написанный текст берётся, только если он рисуется (см. seoText на странице).
  const ownRenders = !!p.stored?.seo_text && parseHTMLToBlocks(p.stored.seo_text).length > 0
  if (!ownRenders) {
    const phrase = T.brandCategoryPhrase(p.category.seo_h1?.trim() || p.category.name, p.brand.name)
    const cheapest = [...p.items].sort((a, b) => (a.final_price || a.price) - (b.final_price || b.price))[0]
    const ownText = h.text.includes(`${phrase} в Ухтышке`) && h.text.includes(norm(cheapest.name.split(' — ')[0]))
    check(ownText, `${label}: на странице текст связки — «${phrase} в Ухтышке» и список моделей`)
  }
  else {
    const start = strip(p.stored.seo_text).slice(0, 40)
    check(h.text.includes(start), `${label}: на странице написанный руками текст — «${start}…»`)
  }
}

// ─── 2. Закрытые ───
console.log('\n2) закрытые связки — noindex')
for (const [reason, list] of perReason) {
  for (const p of list) {
    const { status, html } = pages.get(p.path)
    const h = head(html)
    check(status === 200 && h.robots.includes('noindex'), `${p.category.slug} + ${p.brand.name} (${reason}): ответ ${status}, robots «${h.robots}»`)
    // «noindex + canonical на раздел» — Google может перенести запрет на раздел.
    check(h.canonical.endsWith(p.path), `${p.category.slug} + ${p.brand.name}: canonical на себя (${h.canonical.replace(/^https?:\/\/[^/]+/, '') || 'нет'})`)
  }
}

// ─── 3. Карта сайта ───
console.log('\n3) карта сайта')
const xml = pages.get('/sitemap.xml').html
const inMap = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].replace(/^https?:\/\/[^/]+/, ''))
  .filter(u => u.startsWith('/catalog/') && u.includes('/brand/')))
const want = new Set(open.map(p => p.path))
const missing = [...want].filter(u => !inMap.has(u))
const extra = [...inMap].filter(u => !want.has(u))
check(!missing.length, `все открытые связки в карте${missing.length ? ` — нет ${missing.length}: ${missing.join(', ')}` : ` (${want.size})`}`)
check(!extra.length, `в карте нет закрытых связок${extra.length ? ` — лишние ${extra.length}: ${extra.join(', ')}` : ''}`)

// ─── 4. Страницы брендов ───
console.log('\n4) ссылки со страниц брендов')
const brandsWithOpen = new Map()
for (const p of open)
  brandsWithOpen.set(p.brand.slug, [...(brandsWithOpen.get(p.brand.slug) ?? []), p])
for (const [slug, list] of brandsWithOpen) {
  const { html } = pages.get(`/brand/${slug}`)
  const name = list[0].brand.name
  const nav = (html.match(new RegExp(`<nav[^>]+aria-label="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} в категориях"[^>]*>([\\s\\S]*?)</nav>`)) || [])[1] ?? ''
  const links = [...nav.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ href: m[1], text: strip(m[2]) }))
  const got = new Set(links.map(l => l.href))
  const expected = new Set(list.map(p => p.path))
  const same = got.size === expected.size && [...expected].every(u => got.has(u))
  check(same, `/brand/${slug}: ссылки ровно на открытые связки — ${links.map(l => `«${l.text}»`).join(', ') || 'нет ссылок'}`)
  check(links.every(l => !DATIVE.test(l.text)), `/brand/${slug}: подписи без дательного падежа`)
}

// ─── 5. После гидратации правило то же, что в серверной разметке ───
console.log('\n5) после гидратации')
const browser = await chromium.launch()
for (const p of [open.find(x => !x.stored), open.find(x => x.stored)].filter(Boolean)) {
  const page = await browser.newPage()
  const hydration = []
  page.on('console', m => /hydration/i.test(m.text()) && hydration.push(m.text().slice(0, 120)))
  // Не networkidle: у страницы есть постоянные соединения, и он ждал бы до таймаута.
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'load', timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(4000)
  const after = await page.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    entities: (() => {
      const body = document.body.cloneNode(true)
      body.querySelectorAll('script, style, noscript').forEach(el => el.remove())
      return (body.textContent.match(/&(?:nbsp|amp|quot|lt|gt|#\d+);/g) ?? []).slice(0, 3)
    })(),
  }))
  // DOMPurify в браузере отдаёт неразрывный пробел сущностью; без раскрытия в
  // parseHTMLToBlocks на странице было «7&nbsp;490 ₸» и расхождение гидратации.
  check(!hydration.length, `${p.category.slug} + ${p.brand.name}: гидратация без расхождений${hydration.length ? ` — ${hydration[0]}` : ''}`)
  check(!after.entities.length, `${p.category.slug} + ${p.brand.name}: на странице нет сырых сущностей${after.entities.length ? ` — ${after.entities.join(', ')}` : ''}`)
  const before = head((await get(p.path)).html)
  const same = after.robots === before.robots && norm(after.title) === before.title && norm(after.description) === before.description
  const diff = same ? '' : ` — было «${before.robots}» / «${before.title}», стало «${after.robots}» / «${norm(after.title)}»`
  check(same, `${p.category.slug} + ${p.brand.name}: robots, title и описание после гидратации те же${diff}`)
  await page.close()
}
await browser.close()

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

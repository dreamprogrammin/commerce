/**
 * Страница, отрендеренная дважды без изменений в данных, побайтно та же.
 *
 * Зачем. Vercel списывает запись ISR, только когда пересобранная страница
 * отличается от прежней (docs: «ISR usage and pricing» — «When revalidation
 * runs and the content hasn't changed … no ISR write units are incurred»).
 * 10 октября 2026 записей было 767 тыс. при бесплатных 200 тыс., и два
 * рендера главной, раздела, бренда и серии подряд расходились всегда:
 * TanStack Query кладёт в HTML время запроса (`dataUpdatedAt`) с
 * миллисекундами — то есть каждая пересборка платная, даже если в базе
 * ничего не поменялось. Плюс `priceValidUntil` в разметке был «сегодня +
 * N дней» и менялся каждые сутки.
 *
 * Стенд — сборка БЕЗ кеша страниц, иначе оба ответа придут из одной копии
 * и совпадут по определению. То есть локально:
 *   pnpm build && node .output/server/index.mjs
 *   BASE=http://localhost:3000 node check-isr-stable-html.mjs
 * Адреса раздела и карточки берутся из sitemap.xml стенда — нужна база
 * с товарами.
 */
import process from 'node:process'

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Linux; Android 11) Chrome/140 Mobile'

let failed = false
function check(ok, label) {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: { 'user-agent': UA } })
  return { status: res.status, cache: res.headers.get('x-vercel-cache'), body: await res.text() }
}

/** Окно вокруг первого расхождения — чтобы сразу видеть, что именно меняется. */
function firstDifference(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i])
    i++
  const at = s => s.slice(Math.max(0, i - 50), i + 70).replace(/\s+/g, ' ')
  return `\n     A: …${at(a)}…\n     B: …${at(b)}…`
}

const sitemap = (await get('/sitemap.xml')).body
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
const product = locs.find(p => p.startsWith('/catalog/products/'))
const category = locs.find(p => /^\/catalog\/[^/]+\/[^/]+$/.test(p) && !p.startsWith('/catalog/products/'))
const series = locs.find(p => /^\/brand\/[^/]+\/[^/]+$/.test(p))

const pages = ['/', '/_payload.json', category, product, product && `${product}/_payload.json`, '/brand/lego', series].filter(Boolean)
if (pages.length < 7)
  console.log(`⚠️  в sitemap.xml не нашлось части адресов (раздел: ${category}, карточка: ${product}, серия: ${series})`)

console.log(`Стенд: ${BASE}\n`)
for (const path of pages) {
  const a = await get(path)
  if (a.cache) {
    console.log(`❌ ${path}: ответ из кеша Vercel (${a.cache}) — на таком стенде проверка не имеет смысла`)
    process.exit(1)
  }
  const b = await get(path)
  const same = a.body === b.body
  check(a.status === 200 && same, `${path}: ${a.status}, ${same ? 'два рендера совпадают' : `РАЗНЫЕ${firstDifference(a.body, b.body)}`}`)
}

process.exit(failed ? 1 : 0)

/*
 * Обзор SEO по живому сайту: то, что не покрывают точечные стражи.
 *
 * Смотрит выборку адресов из карты сайта и по каждому проверяет заголовок,
 * описание, H1, канонический адрес, правило для роботов, разметку и alt у
 * картинок; отдельно — уникальность заголовков и описаний по всей выборке.
 *
 *   node seo-audit.mjs --base=https://uhti.kz [--limit=40]
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.slice(8) || 40)

const text = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; uhti-audit)' } })
  return { status: response.status, html: await response.text(), headers: response.headers }
}

const pick = (html, re) => (html.match(re)?.[1] ?? '').trim()
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const sitemap = await text(`${BASE}/sitemap.xml`)
const urls = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
console.log(`Адресов в карте сайта: ${urls.length}`)

/* Выборка: по несколько штук каждого типа, а не первые N подряд. */
const byType = {
  'главная и разделы': urls.filter(u => /uhti\.kz\/(catalog(\/(all|new|promotions))?|brands|about|terms|returns)?$/.test(u)),
  'категории': urls.filter(u => /\/catalog\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(u) && !/\/(all|new|promotions)$/.test(u)),
  'бренды': urls.filter(u => /\/brand\/[a-z0-9-]+$/.test(u)),
  'серии': urls.filter(u => /\/brand\/[a-z0-9-]+\/[a-z0-9-]+$/.test(u)),
  // Бренд-лендинг живёт внутри категории: /catalog/<раздел>/brand/<бренд>.
  'бренд-лендинги': urls.filter(u => /\/catalog\/.+\/brand\/[a-z0-9-]+$/.test(u)),
  'товары': urls.filter(u => /\/catalog\/products\//.test(u)),
}

const sample = []
for (const [type, list] of Object.entries(byType)) {
  const take = type === 'товары' ? 8 : type === 'категории' ? 8 : 6
  sample.push(...list.slice(0, take).map(u => ({ type, url: u })))
}

const rows = []
for (const { type, url } of sample.slice(0, LIMIT)) {
  const { status, html, headers } = await text(url)
  const title = pick(html, /<title[^>]*>(.*?)<\/title>/s)
  const description = pick(html, /name="description" content="([^"]*)"/)
  const h1 = strip(pick(html, /<h1[^>]*>(.*?)<\/h1>/s))
  const canonical = pick(html, /rel="canonical" href="([^"]*)"/)
  const robots = pick(html, /name="robots" content="([^"]*)"/) || headers.get('x-robots-tag') || ''
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0])
  /*
   * Считаем картинки, у которых атрибута alt НЕТ ВООБЩЕ. Пустой `alt` (и
   * голый, без значения) — законная пометка: у плиток каталога подпись рядом
   * служит именем ссылки, и дублировать её в alt нельзя, иначе скринридер
   * прочитает название дважды. Прежняя проверка считала такие картинки
   * ошибкой и дала 28 ложных срабатываний на /catalog.
   */
  const noAlt = images.filter(img => !/\balt(=|\s|\/?>)/.test(img)).length
  const schema = [...html.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)].map(m => m[1])
  rows.push({
    type,
    path: url.replace(BASE, '') || '/',
    status,
    title,
    titleLen: title.length,
    description,
    descLen: description.length,
    h1,
    // Канонический адрес сверяем без хвостового слэша: `/` и пустой путь — одно и то же.
    canonicalOk: canonical.replace(/\/$/, '') === url.replace(/\/$/, ''),
    robots,
    images: images.length,
    noAlt,
    schema: [...new Set(schema)],
  })
}

const problems = []

console.log(`\nПроверено адресов: ${rows.length}\n`)
for (const r of rows) {
  const flags = []
  if (r.status !== 200) flags.push(`код ${r.status}`)
  if (!r.title) flags.push('нет title')
  else if (r.titleLen > 65) flags.push(`title ${r.titleLen} знаков`)
  if (!r.description) flags.push('нет description')
  else if (r.descLen > 165) flags.push(`description ${r.descLen} знаков`)
  if (!r.h1) flags.push('нет H1')
  if (!r.canonicalOk) flags.push('канонический адрес не свой')
  if (/noindex/.test(r.robots)) flags.push('noindex')
  if (r.noAlt > 0) flags.push(`картинок без alt: ${r.noAlt} из ${r.images}`)
  if (flags.length)
    problems.push(`${r.path} — ${flags.join('; ')}`)
}

const dup = (field) => {
  const seen = new Map()
  for (const r of rows) {
    const key = r[field]
    if (!key) continue
    seen.set(key, [...(seen.get(key) ?? []), r.path])
  }
  return [...seen.entries()].filter(([, paths]) => paths.length > 1)
}

console.log('— Заголовки и описания —')
console.log(`средняя длина title: ${Math.round(rows.reduce((a, r) => a + r.titleLen, 0) / rows.length)} знаков`)
console.log(`средняя длина description: ${Math.round(rows.reduce((a, r) => a + r.descLen, 0) / rows.length)} знаков`)
for (const [title, paths] of dup('title'))
  console.log(`  ПОВТОР title «${title.slice(0, 50)}…» на ${paths.length}: ${paths.slice(0, 3).join(', ')}`)
for (const [, paths] of dup('description'))
  console.log(`  ПОВТОР description на ${paths.length}: ${paths.slice(0, 3).join(', ')}`)

console.log('\n— Разметка по типам страниц —')
const types = [...new Set(rows.map(r => r.type))]
for (const type of types) {
  const list = rows.filter(r => r.type === type)
  const common = list[0]?.schema ?? []
  console.log(`  ${type} (${list.length}): ${common.slice(0, 8).join(', ')}`)
}

console.log('\n— Замечания —')
if (problems.length === 0)
  console.log('  чисто')
else problems.forEach(p => console.log(`  • ${p}`))

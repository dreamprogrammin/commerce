/*
 * Фид Google Merchant Center (/api/google-merchant-feed) — по спецификации.
 *
 * Разбор 22 сентября 2026 по 178 товарам: у 8 название начиналось с пробела,
 * во всех описаниях был сырой HTML с data-icon, у 92 товаров без бренда
 * брендом стояло «Ухтышка», identifier_exists = false (разрешены yes/no),
 * у 12 товаров со скидкой 0 % фид отдавал sale_price — от одного округления
 * цены. Правила — utils/merchantFeed.ts.
 *
 * Скидка сверяется с базой: sale_price только у товаров с
 * discount_percentage > 0, и тогда price выше sale_price. Данные читаются
 * публичным ключом со страницы сайта.
 *
 *   node check-merchant-feed.mjs --base=http://localhost:3127   # сборка на прод-данных
 *   node check-merchant-feed.mjs --base=https://uhti.kz
 *
 * Только чтение.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || home.match(/"(https?:\/\/[^"]+supabase\.co)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
if (!supaUrl || !anon) {
  console.log(' ПРОВАЛ  не нашёл на странице адрес базы или публичный ключ')
  process.exit(1)
}
const db = await (await fetch(`${supaUrl}/rest/v1/products?select=id,discount_percentage&is_active=eq.true`, {
  headers: { apikey: anon, authorization: `Bearer ${anon}` },
})).json()
const discount = new Map(db.map(p => [p.id, Number(p.discount_percentage) || 0]))

const res = await fetch(`${BASE}/api/google-merchant-feed`)
const xml = await res.text()
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
function field(item, name) {
  const m = item.match(new RegExp(`<g:${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</g:${name}>`))
  return m ? m[1] : null
}

console.log(`фид ${BASE}/api/google-merchant-feed: ответ ${res.status}, товаров ${items.length}, в базе активных ${db.length}\n`)
check(res.status === 200 && items.length > 0, 'фид отдаётся и не пуст')

function count(pred) {
  return items.filter(pred).length
}
function badTitle(item) {
  const t = field(item, 'title') ?? ''
  return t !== t.trim() || /\s{2,}/.test(t) || t.length > 150
}
const titles = count(badTitle)
check(!titles, `заголовки без пробелов по краям и не длиннее 150 знаков${titles ? ` — нарушено у ${titles}` : ''}`)
const html = count(i => /<[a-z/][^>]*>/i.test(field(i, 'description') ?? ''))
check(!html, `описания простым текстом, без HTML${html ? ` — HTML у ${html}` : ''}`)
const long = count(i => (field(i, 'description') ?? '').length > 5000)
check(!long, `описания не длиннее 5000 знаков${long ? ` — длиннее у ${long}` : ''}`)
const shopBrand = count(i => (field(i, 'brand') ?? '').trim() === 'Ухтышка')
check(!shopBrand, `магазин не выдаётся за производителя (brand «Ухтышка»)${shopBrand ? ` — у ${shopBrand}` : ''}`)
const idBad = count(i => !field(i, 'gtin') && !['yes', 'no'].includes(field(i, 'identifier_exists') ?? ''))
check(!idBad, `identifier_exists — yes/no или есть gtin${idBad ? ` — нарушено у ${idBad} (значение «${field(items[0], 'identifier_exists')}»)` : ''}`)

let fakeSale = 0
let wrongOrder = 0
let missingSale = 0
for (const i of items) {
  const id = field(i, 'id')
  const sale = field(i, 'sale_price')
  const price = Number((field(i, 'price') ?? '').split(' ')[0])
  const pct = discount.get(id) ?? 0
  if (sale && !(pct > 0))
    fakeSale++
  if (sale && !(price > Number(sale.split(' ')[0])))
    wrongOrder++
  if (!sale && pct > 0)
    missingSale++
}
check(!fakeSale, `sale_price только при настоящей скидке${fakeSale ? ` — у ${fakeSale} товаров скидки 0 %, а sale_price есть` : ''}`)
check(!wrongOrder, `price выше sale_price${wrongOrder ? ` — нарушено у ${wrongOrder}` : ''}`)
console.log(`        (со скидкой в фиде: ${count(i => field(i, 'sale_price'))}; скидка в базе без sale_price в фиде: ${missingSale} — там «старая» цена не выше текущей)`)

/*
 * Характеристики в фиде (23 сентября 2026). До этого у каждого товара было
 * одно фото из ~6 и ни возраста, ни пола, ни цвета, ни параметров, хотя всё
 * это есть в базе и видно на карточке.
 */
console.log('\nхарактеристики')
const withImages = count(i => /<g:additional_image_link>/.test(i))
check(withImages >= items.length * 0.8, `дополнительные фото у ${withImages} из ${items.length}`)
const tooMany = count(i => (i.match(/<g:additional_image_link>/g) ?? []).length > 10)
check(!tooMany, `не больше 10 дополнительных фото${tooMany ? ` — больше у ${tooMany}` : ''}`)
const ageOk = new Set(['newborn', 'infant', 'toddler', 'kids', 'adult'])
const withAge = count(i => ageOk.has(field(i, 'age_group') ?? ''))
const badAge = count(i => field(i, 'age_group') !== null && !ageOk.has(field(i, 'age_group')))
check(withAge >= items.length * 0.9 && !badAge, `age_group у ${withAge} из ${items.length}${badAge ? `, недопустимых ${badAge}` : ''}`)
const badGender = count(i => field(i, 'gender') !== null && !['male', 'female', 'unisex'].includes(field(i, 'gender')))
check(count(i => field(i, 'gender')) > 0 && !badGender, `gender — male/female/unisex${badGender ? ` — нарушено у ${badGender}` : ''}`)
const details = count(i => /<g:product_detail>/.test(i))
check(details > 0, `product_detail — у ${details} товаров`)
// item_group_id: у каждого товара группы — цвет, цвета внутри группы разные
const groups = new Map()
for (const i of items) {
  const g = field(i, 'item_group_id')
  if (g)
    groups.set(g, [...(groups.get(g) ?? []), field(i, 'color')])
}
const badGroups = [...groups.values()].filter(colors => colors.some(c => !c) || new Set(colors).size !== colors.length).length
check(!badGroups, `связки вариантов: ${groups.size}, у всех вариантов свой цвет${badGroups ? ` — нарушено в ${badGroups}` : ''}`)

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

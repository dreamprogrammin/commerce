/*
 * Раздел ссылается на свои подразделы ОБЫЧНЫМИ ссылками в серверной разметке.
 *
 * Почему это проверяется. Чипы подразделов на странице раздела — кнопки
 * фильтра, ссылок в них нет. 22 сентября 2026 по серверной разметке боя:
 * «Куклы» — 0 ссылок из 4 подразделов, «Машинки» — 0 из 5, «Мальчикам» — 1 из
 * 5. «Куклы L.O.L» (413 показов за 90 дней, место 18) не получали ни одной
 * ссылки ни с главной, ни с «Кукол». Теперь ссылки даёт блок «Подразделы»
 * (components/category/CategorySubnav.vue).
 *
 * Для каждого раздела с подразделами: в разметке (без <script>) есть ссылка
 * на каждый подраздел, где в ветке есть активный товар, и нет ссылок на
 * пустые. Данные — боевая база, публичным ключом со страницы.
 *
 *   node check-category-subnav.mjs --base=http://localhost:3127
 *   node check-category-subnav.mjs --base=https://uhti.kz
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
async function rest(path) {
  const res = await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })
  return res.json()
}
const [categories, products] = await Promise.all([
  rest('categories?select=id,slug,href,parent_id'),
  rest('products?select=category_id&is_active=eq.true'),
])
const parentOf = new Map(categories.map(c => [c.id, c.parent_id]))
const count = new Map()
for (const p of products) {
  const seen = new Set()
  for (let id = p.category_id; id && !seen.has(id); id = parentOf.get(id)) {
    seen.add(id)
    count.set(id, (count.get(id) ?? 0) + 1)
  }
}
const path = c => c.href || `/catalog/${c.slug}`

const parents = categories.filter(c => c.slug && categories.some(k => k.parent_id === c.id) && (count.get(c.id) ?? 0) > 0)
console.log(`сайт ${BASE}: разделов с подразделами и товаром — ${parents.length}\n`)
let linkedTotal = 0
let wantedTotal = 0
for (const parent of parents) {
  const kids = categories.filter(k => k.parent_id === parent.id && k.slug)
  const full = kids.filter(k => (count.get(k.id) ?? 0) > 0)
  const empty = kids.filter(k => !(count.get(k.id) ?? 0))
  const html = (await (await fetch(`${BASE}${path(parent)}`)).text()).replace(/<script[\s\S]*?<\/script>/g, '')
  const has = k => html.includes(`href="${path(k)}"`)
  const missing = full.filter(k => !has(k))
  const toEmpty = empty.filter(has)
  linkedTotal += full.length - missing.length
  wantedTotal += full.length
  check(!missing.length, `${path(parent)}: ссылки на подразделы с товаром — ${full.length - missing.length} из ${full.length}${missing.length ? ` (нет: ${missing.map(k => k.slug).join(', ')})` : ''}`)
  if (toEmpty.length)
    console.log(`        (к сведению: ссылки на пустые подразделы — ${toEmpty.map(k => k.slug).join(', ')}; это могут быть меню или текст раздела)`)
}
console.log(`\nвсего ссылок на подразделы с товаром: ${linkedTotal} из ${wantedTotal}`)
console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

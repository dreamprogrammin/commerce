/*
 * Описание раздела в выдаче: число моделей, цена «от» и бренды — по базе.
 *
 * Почему это проверяется (23 сентября 2026). «Бренды: …» шли первые три по
 * алфавиту — сортировка стояла по полю, которого RPC брендов не отдаёт: у
 * хаба «Конструкторы» «CaDA · Feelo · Gudi», хотя LEGO там 14 наборов, а у
 * этих трёх по два. Цена «от» бралась с первой страницы выдачи: «от 6 190 ₸»
 * при самом дешёвом наборе раздела за 5 890 ₸. См. utils/categoryFacts.ts.
 *
 * Ожидание считается здесь же, по REST с публичным ключом со страницы, по
 * всем активным товарам ветки — независимо от кода сайта.
 *
 *   node check-category-meta-facts.mjs --base=http://localhost:3127
 *
 * Только чтение. Скрипт — из корня репозитория.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const PAGES = [
  '/catalog/constructors-root',
  '/catalog/constructors-root/konstruktory-malchikam',
  '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
  '/catalog/girls/kukly',
  '/catalog/boys',
  '/catalog/kiddy',
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const norm = s => s.replace(/[\u00A0\u202F]/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')

const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
const rest = async path => (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
const categories = await rest('categories?select=id,slug,parent_id')

console.log(`сайт ${BASE}, база ${supaUrl}`)
for (const path of PAGES) {
  const slug = path.split('/').at(-1)
  const root = categories.find(c => c.slug === slug)
  const ids = []
  const queue = [root.id]
  while (queue.length) {
    const id = queue.shift()
    ids.push(id)
    queue.push(...categories.filter(c => c.parent_id === id).map(c => c.id))
  }
  const products = await rest(`products?select=price,final_price,brand_id,brands(name)&is_active=eq.true&category_id=in.(${ids.join(',')})`)
  const prices = products.map(p => Number(p.final_price || p.price)).filter(p => p > 0)
  const min = Math.min(...prices)
  const byBrand = {}
  for (const p of products) {
    if (p.brands?.name)
      byBrand[p.brands.name] = (byBrand[p.brands.name] ?? 0) + 1
  }

  const html = await (await fetch(`${BASE}${path}`)).text()
  const desc = norm(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
  console.log(`\n== ${path}\n   ${desc}`)

  const count = desc.match(/(\d+) (?:модел(?:ь|и|ей))/)?.[1]
  check(Number(count) === products.length, `моделей в описании ${count}, в базе ${products.length}`)
  const from = desc.match(/от ([\d ]+) ₸/)?.[1]?.replace(/ /g, '')
  check(Number(from) === min, `цена «от» ${from}, самый дешёвый товар ветки ${min}`)

  const listed = desc.match(/Бренды: (.+)\.$/)?.[1]?.split(' · ') ?? null
  if (!listed) {
    console.log('   (брендов в описании нет — не влезли в длину)')
    continue
  }
  const counts = listed.map(b => byBrand[b] ?? 0)
  const lowest = Math.min(...counts)
  const outranked = Object.entries(byBrand).filter(([name, n]) => !listed.includes(name) && n > lowest)
  const ordered = counts.every((n, i) => i === 0 || counts[i - 1] >= n)
  check(counts.every(n => n > 0) && ordered && !outranked.length, `бренды «${listed.join(' · ')}» (${counts.join(', ')}) — старшие по числу товаров${outranked.length ? `; пропущены: ${outranked.map(([n, c]) => `${n} ${c}`).join(', ')}` : ''}`)
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

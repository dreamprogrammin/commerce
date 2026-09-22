/*
 * Описание в выдаче у брендов и разделов — с фактами и без дательного падежа.
 *
 * Почему это проверяется (22 сентября 2026):
 *  • у брендов описание брало кусок текста о бренде: у ZURU — серии X-Shot,
 *    5 Surprise, Pets Alive, которых в магазине нет, и ни одной цены; у Feelo —
 *    «города, горки, виллы» при двух товарах. Теперь описание собирается из
 *    товаров бренда: число моделей и цены «от … до …» (utils/brandMeta.ts);
 *  • у четырёх разделов имя в дательном падеже уходило в описание:
 *    «Конструкторы девочкам в Алматы: 2 модели…». Теперь — читаемое seo_h1.
 *
 * Данные — боевая база публичным ключом со страницы сайта.
 *
 *   node check-snippet-facts.mjs --base=http://localhost:3127
 *   node check-snippet-facts.mjs --base=https://uhti.kz
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
  return (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
}
function norm(s) {
  return (s ?? '').replace(/&nbsp;|&#160;|\xA0|\u202F/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}
async function description(path) {
  const html = await (await fetch(`${BASE}${path}`)).text()
  const m = html.match(/<meta name="description" content="([^"]*)"/)
  return norm(m ? m[1] : '')
}
function models(n) {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'модель' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'модели' : 'моделей'}`
}
function price(n) {
  return String(n).replace(/\B(?=(?:\d{3})+(?!\d))/g, ' ')
}

const [brands, products, categories] = await Promise.all([
  rest('brands?select=id,slug,name'),
  rest('products?select=brand_id,price,final_price&is_active=eq.true'),
  rest('categories?select=slug,href,name,seo_h1'),
])

console.log(`сайт ${BASE}\n\n1) бренды с товаром`)
for (const b of brands) {
  const own = products.filter(p => p.brand_id === b.id)
  if (!own.length || !b.slug)
    continue
  const prices = own.map(p => Math.round(Number(p.final_price || p.price))).filter(n => n > 0)
  const min = Math.min(...prices)
  const d = await description(`/brand/${b.slug}`)
  const ok = d.includes(models(own.length)) && d.includes(price(min))
  check(ok, `/brand/${b.slug}: «${models(own.length)}» и «${price(min)} ₸» в описании${ok ? '' : ` — «${d.slice(0, 90)}…»`}`)
}

console.log('\n2) разделы с дательным падежом в имени')
for (const c of categories.filter(c => /мальчикам|девочкам|малышам/i.test(c.name ?? ''))) {
  const d = await description(c.href || `/catalog/${c.slug}`)
  const ok = !d.toLowerCase().includes((c.name ?? '').toLowerCase())
  check(ok, `${c.slug}: в описании нет «${c.name}»${ok ? '' : ` — «${d.slice(0, 80)}…»`}`)
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

/*
 * Карточки, потерявшие свой адрес: старый URL обязан вести 301-м на живую
 * страницу, а не отдавать 404.
 *
 * Почему это проверяется. Search Console за 90 дней (замер 17 сентября 2026):
 * пять адресов карточек продолжают получать показы, и все пять отдают 404.
 * Крупнейший из них — 165 показов на средней позиции 4.8 по запросу «xx2028»,
 * это вообще самый показываемый запрос сайта. При этом товар есть в наличии
 * (42 шт): в июле карточку пересоздали под новым артикулом HiH02, slug
 * сменился, а старый адрес просто умер. То же с LEGO 76287 и батарейками.
 *
 * Механика поломки: `ProductForm.vue` перегенерирует slug из названия
 * (watch на `formData.name`), удаление товара в `adminProductsStore` — жёсткий
 * DELETE. История адресов нигде не хранится, так что каждая правка названия
 * или замена карточки тихо уносит накопленные позиции.
 *
 * Стенд — сборка, потому что редирект делается на сервере:
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-gone-products.mjs --base=http://localhost:3127
 * Против боя: node check-gone-products.mjs --base=https://uhti.kz
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Показы за 90 дней — чтобы было видно, чем платим за каждую строку. */
const CASES = [
  { from: '/catalog/products/akkordeon-detskiy-xx2028-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let', to: '/catalog/products/akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let', impressions: 165 },
  { from: '/catalog/products/batteries-aaa-2pcs', to: '/catalog/accessories/batteries', impressions: 8 },
  { from: '/catalog/products/batteries-aa-4pcs', to: '/catalog/products/batareyki-soni-palchikovye-solevye-tip-aa-15v-4-sht-v-upakovke-dlya-rc-igrushek', impressions: 2 },
  { from: '/catalog/products/radioupravlyaemaya-mashina-vnedorozhnik-2172-masshtab-1-16-so-zvukom-i-svetom-off-road-s-usb-zaryadkoy', to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki', impressions: 2 },
  { from: '/catalog/products/lego-marvel-76287-zheleznyy-chelovek-s-motociklom-i-halk-pervyy-konstruktor-dlya-detey-ot-4-let', to: '/catalog/products/konstruktor-lego-marvel-76287-zheleznyy-chelovek-na-motocikle-protiv-halka-s-razrushaemym-domom', impressions: 3 },
]

console.log('\n1) старые адреса отвечают 301 на нужную страницу')
for (const c of CASES) {
  const r = await fetch(`${BASE}${c.from}`, { redirect: 'manual' })
  const loc = r.headers.get('location')
  check(r.status === 301, `${c.impressions} показов: ${r.status} (ждём 301) ${c.from.replace('/catalog/products/', '…/')}`)
  check(loc === c.to, `    ведёт на ${loc ?? '—'}`)
}

console.log('\n2) цели редиректов живы')
for (const c of [...new Set(CASES.map(x => x.to))]) {
  const r = await fetch(`${BASE}${c}`)
  check(r.ok, `${r.status} ${c}`)
}

console.log('\n3) обычная несуществующая карточка по-прежнему 404, а не редирект')
{
  const r = await fetch(`${BASE}/catalog/products/takogo-tovara-net-i-ne-bylo-12345`, { redirect: 'manual' })
  check(r.status === 404, `${r.status} для выдуманного slug (ждём 404)`)
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

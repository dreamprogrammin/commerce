/*
 * Разметка Product на карточке товара — одна и та же при каждом рендере и без
 * выдуманных штрихкодов.
 *
 * Почему это проверяется. 22 сентября 2026 на стенде без кеша разметка
 * карточки аккордеона HiH02 от рендера к рендеру отличалась: ссылки на
 * аксессуары (`isAccessoryOrSparePartFor`) попадали в неё в 1 рендере из 8,
 * похожие товары (`isSimilarTo`) — ни в одном. Оба поля строились из
 * запросов, которых сервер не ждёт; на бою ISR кешировал ту версию, что
 * попалась. Плюс `gtin: "8497"` у куклы DEFA Lucy FCJ0840265 — четыре цифры,
 * это не штрихкод.
 *
 * Смотреть на стенде БЕЗ кеша документа (сборка на прод-данных): на бою ISR
 * отдаёт одну закешированную версию, и нестабильность не видна.
 *
 *   node check-product-schema-stable.mjs --base=http://localhost:3127
 *
 * Только чтение.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const RENDERS = 5
const PAGES = [
  ['аккордеон HiH02 (есть аксессуары)', 'akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let'],
  ['кукла DEFA Lucy FCJ0840265 (штрихкод «8497»)', 'kukla-sharnirnaya-defa-lucy-fcj0840265-fashion-beauty-29-sm-s-pitomcem-i-aksessuarami-ot-3-let'],
  ['LEGO City 60401', 'konstruktor-lego-city-60401-stroitelnyy-parovoy-katok-s-voditelem'],
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

function productNode(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data
    try {
      data = JSON.parse(m[1])
    }
    catch {
      continue
    }
    for (const node of data['@graph'] ?? [data]) {
      if (node['@type'] === 'Product')
        return node
    }
  }
  return null
}

function gtinOk(code) {
  const d = String(code)
  if (!/^(?:\d{8}|\d{12,14})$/.test(d))
    return false
  let sum = 0
  for (let i = 0; i < d.length - 1; i++)
    sum += Number(d[d.length - 2 - i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(d.at(-1))
}

console.log(`сайт ${BASE}, рендеров на страницу: ${RENDERS}\n`)
for (const [label, slug] of PAGES) {
  const nodes = []
  for (let i = 0; i < RENDERS; i++)
    nodes.push(productNode(await (await fetch(`${BASE}/catalog/products/${slug}`)).text()))
  const first = JSON.stringify(nodes[0])
  const same = nodes.every(n => JSON.stringify(n) === first)
  const keys = [...new Set(nodes.flatMap(n => Object.keys(n ?? {})))]
  const unstable = keys.filter(k => new Set(nodes.map(n => JSON.stringify(n?.[k]))).size > 1)
  check(!!nodes[0] && same, `${label}: разметка одинакова во всех ${RENDERS} рендерах${same ? '' : ` — плавают поля: ${unstable.join(', ')}`}`)
  const gtins = [...new Set(nodes.map(n => n?.gtin).filter(Boolean))]
  check(gtins.every(gtinOk), `${label}: gtin ${gtins.length ? `«${gtins.join('», «')}»` : 'не указан'} — только настоящий штрихкод`)
  check(!keys.includes('isAccessoryOrSparePartFor'), `${label}: нет isAccessoryOrSparePartFor (аксессуары этого товара — не «он аксессуар для них»)`)
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

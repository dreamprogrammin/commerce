/*
 * Разметка Offer на ВСЕХ страницах со списками товаров обещает то же, что
 * магазин реально даёт, — и то же, что карточка товара.
 *
 * Почему это проверяется. 17 сентября 2026 ложные обещания в разметке
 * исправили на карточке товара (страж check-pdp-schema-facts.mjs), а 21-го
 * нашлись три копии со старыми: в разделах, на страницах брендов и линеек.
 * Там стояли доставка 0 ₸ на весь Казахстан, срок 1–3 дня, возврат почтой и
 * бесплатный возврат, а у брендов и линеек ещё и текущая цена с пометкой
 * SalePrice. Google читает это как данные продавца: URL Inspection
 * /catalog/girls/kukly — «Данные о товарах продавца — 10 шт.».
 *
 * Каждый Offer на каждой странице из списка обязан:
 *  • возврат — ReturnInStore и ReturnFeesCustomerResponsibility, 14 дней;
 *  • доставка — не ноль (курьер 1000 ₸), срок до 7 дней;
 *  • текущая цена без priceType; старая, если есть, — StrikethroughPrice и
 *    выше текущей.
 *
 *   node check-offer-claims.mjs --base=http://localhost:3127   # сборка на прод-данных
 *   node check-offer-claims.mjs --base=https://uhti.kz
 *
 * Только чтение.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'

/** Курьер по Алматы — COURIER_DELIVERY_COST в constants/index.ts. */
const COURIER_COST = 1000

const PAGES = [
  ['карточка товара', '/catalog/products/konstruktor-lego-city-60401-stroitelnyy-parovoy-katok-s-voditelem'],
  ['раздел', '/catalog/girls/kukly'],
  ['раздел', '/catalog/constructors-root/konstruktory-malchikam'],
  ['связка раздел + бренд', '/catalog/constructors-root/konstruktory-malchikam/brand/lego'],
  ['бренд', '/brand/zuru'],
  ['бренд (своя страница)', '/brand/lego'],
  ['линейка', '/brand/lego/lego-city'],
  ['линейка', '/brand/zuru/robo-alive'],
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Все Offer из JSON-LD страницы — где бы они ни лежали. */
function offersOf(html) {
  const found = []
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data
    try {
      data = JSON.parse(m[1])
    }
    catch {
      continue
    }
    const stack = [data]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) {
        stack.push(...node)
        continue
      }
      if (!node || typeof node !== 'object')
        continue
      if (node['@type'] === 'Offer')
        found.push(node)
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object')
          stack.push(value)
      }
    }
  }
  return found
}

function problemsOf(offer) {
  const out = []
  const ret = offer.hasMerchantReturnPolicy ?? {}
  if (ret.returnMethod !== 'https://schema.org/ReturnInStore')
    out.push(`возврат ${String(ret.returnMethod).replace('https://schema.org/', '')}`)
  if (ret.returnFees !== 'https://schema.org/ReturnFeesCustomerResponsibility')
    out.push(`оплата возврата ${String(ret.returnFees).replace('https://schema.org/', '')}`)
  if (ret.merchantReturnDays !== 14)
    out.push(`срок возврата ${ret.merchantReturnDays}`)
  const ship = offer.shippingDetails ?? {}
  if (Number(ship.shippingRate?.value) !== COURIER_COST)
    out.push(`доставка ${ship.shippingRate?.value} ₸`)
  if (Number(ship.deliveryTime?.transitTime?.maxValue) !== 7)
    out.push(`срок доставки до ${ship.deliveryTime?.transitTime?.maxValue} дн.`)
  const spec = offer.priceSpecification
  if (spec) {
    if (spec.priceType !== 'https://schema.org/StrikethroughPrice')
      out.push(`priceType ${String(spec.priceType).replace('https://schema.org/', '')} на цене ${spec.price}`)
    else if (!(Number(spec.price) > Number(offer.price)))
      out.push(`зачёркнутая ${spec.price} не выше текущей ${offer.price}`)
  }
  return out
}

console.log(`сайт ${BASE}\n`)
for (const [label, path] of PAGES) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'text/html' } })
  const offers = offersOf(await res.text())
  const bad = offers.map(problemsOf).filter(list => list.length)
  const kinds = [...new Set(bad.flat())]
  check(res.status === 200 && offers.length > 0, `${label} ${path}: ответ ${res.status}, офферов в разметке ${offers.length}`)
  check(!bad.length, `${label}: условия как на /returns и в кассе${bad.length ? ` — неверно у ${bad.length} из ${offers.length}: ${kinds.join('; ')}` : ''}`)
  const struck = offers.filter(o => o.priceSpecification).length
  console.log(`        (со старой ценой StrikethroughPrice: ${struck} из ${offers.length})`)
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

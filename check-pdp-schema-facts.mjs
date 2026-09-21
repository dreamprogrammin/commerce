/*
 * Разметка Product на карточке обязана совпадать с тем, что магазин реально
 * обещает.
 *
 * Почему это проверяется. Сверка разметки боя с правилами магазина 17 сентября
 * 2026 дала три расхождения, и все три — обещания в пользу покупателя, которых
 * магазин не даёт:
 *
 *  1. shippingRate = 0 на весь Казахстан. На деле курьер стоит 1000 ₸ и
 *     бесплатен только от 15 000 ₸ (cartStore.deliveryCost, константы
 *     COURIER_DELIVERY_COST и FREE_SHIPPING_THRESHOLD). Google по этому полю
 *     рисует «бесплатная доставка» в товарных карточках выдачи.
 *  2. returnFees = FreeReturn. Страница /returns говорит обратное прямым
 *     текстом: «Транспортные расходы при возврате или обмене товара
 *     надлежащего качества оплачивает покупатель». Бесплатен только возврат
 *     брака.
 *  3. returnMethod = ReturnByMail. Почтой магазин возвраты не принимает:
 *     «Согласуйте с менеджером способ передачи товара (через курьера или в
 *     пункте самовывоза)».
 *
 * Плюс бренд: у 92 товаров из 178 бренда в базе нет, и на них подставлялось
 * «Ухтышка». Для Google brand — это производитель, а не продавец, и на
 * половине каталога разметка называла производителем магазин.
 *
 * Стенд — сборка с прод-данными:
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-pdp-schema-facts.mjs --base=http://localhost:3127
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Курьер по Алматы, из constants/index.ts. */
const COURIER_COST = 1000

const PAGES = [
  { slug: 'akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let', brand: null, label: 'аккордеон HiH02 (бренда в базе нет)' },
  { slug: 'robot-sobaka-s-cyber-dog-bg1544-subotech-24-5-sm-bluetooth-golosovye-komandy-na-russkom-ik-pult-li-ion-akkumulyator', brand: null, label: 'робот-собака SuboTech (бренда в базе нет)' },
  { slug: 'govoryashchiy-kazahskiy-alfavit-soyleytin-alippe-7064-interaktivnyy-plakat-4-rezhima-obucheniya-professionalnaya-ozvuchka', brand: 'Joy Toy', label: 'казахский алфавит (бренд Joy Toy)' },
]

async function productNode(slug) {
  const html = await (await fetch(`${BASE}/catalog/products/${slug}`)).text()
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed
    try { parsed = JSON.parse(m[1]) }
    catch { continue }
    const nodes = parsed['@graph'] ?? [parsed]
    const found = nodes.find(n => n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product')))
    if (found)
      return found
  }
  return null
}

for (const page of PAGES) {
  console.log(`\n— ${page.label}`)
  const node = await productNode(page.slug)
  if (!node) {
    check(false, 'разметка Product нашлась на странице')
    continue
  }

  const offer = node.offers ?? {}
  const ship = offer.shippingDetails ?? {}
  const ret = offer.hasMerchantReturnPolicy ?? {}

  check(ship.shippingRate?.value === COURIER_COST, `стоимость доставки в разметке ${ship.shippingRate?.value} = ${COURIER_COST} ₸`)
  check(ret.returnFees === 'https://schema.org/ReturnFeesCustomerResponsibility', `возврат за счёт покупателя: ${ret.returnFees ?? '—'}`)
  check(ret.returnMethod === 'https://schema.org/ReturnInStore', `способ возврата — не почта: ${ret.returnMethod ?? '—'}`)
  check(ret.merchantReturnDays === 14, `срок возврата 14 дней: ${ret.merchantReturnDays ?? '—'}`)

  if (page.brand === null)
    check(node.brand === undefined, `бренд не выдуман: ${node.brand ? JSON.stringify(node.brand.name) : 'поля нет'}`)
  else
    check(node.brand?.name === page.brand, `бренд «${page.brand}»: ${node.brand?.name ?? '—'}`)

  check(typeof offer.price === 'number' && offer.price > 0, `цена ${offer.price}`)

  /*
   * Скидка — по правилам Google для товарных карточек (merchant listing):
   * «Don't mark the active price with a priceType property», а старую цену
   * помечать StrikethroughPrice — только этот тип и поддерживается. До 21
   * сентября 2026 было наоборот: текущая цена стояла в priceSpecification с
   * SalePrice, старой не было вовсе. Search Console выдавал на каждой такой
   * карточке «Отсутствует поле validFrom», а зачёркнутую цену в выдаче Google
   * показать не мог — её не из чего было взять.
   *
   * Все три карточки выше на 21 сентября со скидкой. Кончится скидка у
   * какой-то из них — страж скажет об этом второй строкой, это ожидаемо.
   */
  const specs = [].concat(offer.priceSpecification ?? [])
  const types = specs.map(x => String(x.priceType ?? '').split('/').pop())
  check(!types.includes('SalePrice'), `текущая цена не помечена SalePrice: ${types.join(', ') || 'спецификаций нет'}`)
  const strike = specs.find(x => String(x.priceType ?? '').endsWith('StrikethroughPrice'))
  check(!!strike && strike.price > offer.price, `старая цена размечена StrikethroughPrice: ${strike ? `${strike.price} > ${offer.price}` : 'нет'}`)
  check(typeof offer.availability === 'string' && offer.availability.includes('schema.org/'), `наличие ${offer.availability}`)
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

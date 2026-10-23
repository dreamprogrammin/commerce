/**
 * Условия продавца в разметке Offer — одни на весь сайт.
 *
 * Зачем отдельный файл. Разметку товара сайт отдаёт в четырёх местах: на
 * карточке товара и в списках — разделе, странице бренда, странице линейки.
 * 17 сентября 2026 ложные обещания исправили на карточке, а три копии в
 * списках так и остались со старыми: «доставка 0 ₸», «возврат почтой»,
 * «возврат бесплатно». Google читает их как данные продавца — URL
 * Inspection 21 сентября на /catalog/girls/kukly: «Данные о товарах
 * продавца — 10 шт.». Теперь условия живут здесь, и разойтись копиям не
 * из чего.
 *
 * Каждая функция возвращает НОВЫЙ объект: узлы разметки собирает
 * nuxt-schema-org, и общий объект на несколько товаров — лишний риск.
 */

import { COURIER_DELIVERY_COST } from '@/constants'

/**
 * Условия возврата — с /returns, слово в слово:
 *  • «в течение 14 календарных дней» → merchantReturnDays 14;
 *  • «Транспортные расходы при возврате или обмене товара надлежащего
 *    качества оплачивает покупатель» → ReturnFeesCustomerResponsibility.
 *    Стоял FreeReturn, то есть разметка обещала бесплатный возврат, которого
 *    магазин не даёт (бесплатен только возврат брака);
 *  • «через курьера или в пункте самовывоза» → ReturnInStore. Стояло
 *    ReturnByMail — почтой возвраты не принимаются вовсе.
 */
export function merchantReturnPolicy() {
  return {
    '@type': 'MerchantReturnPolicy' as const,
    'applicableCountry': 'KZ',
    'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
    'merchantReturnDays': 14,
    'returnMethod': 'https://schema.org/ReturnInStore',
    'returnFees': 'https://schema.org/ReturnFeesCustomerResponsibility',
  }
}

/**
 * Доставка — то, что реально считает касса и обещает блок на карточке.
 *
 * Стоимость. Стоял ноль на весь Казахстан, и Google по этому полю рисует
 * «бесплатная доставка». Касса же берёт COURIER_DELIVERY_COST
 * (cartStore.deliveryCost), а ноль получается только у самовывоза и от
 * порога FREE_SHIPPING_THRESHOLD. Ставим обычную цену курьера: занизить своё
 * же обещание безопасно, завысить — нет.
 *
 * Срок. Стояло 1–3 дня на всю страну, хотя блок доставки на карточке говорит
 * «Курьером по Алматы 1–2 дня» и «По Казахстану 3–7 дней, Kazpost или CDEK».
 * Берём объединение: 1–7. Разнести по регионам двумя записями можно, но
 * addressRegion для Алматы Google разбирает ненадёжно, а неразобранная
 * запись хуже широкой честной.
 */
export function offerShippingDetails() {
  return {
    '@type': 'OfferShippingDetails' as const,
    'shippingRate': {
      '@type': 'MonetaryAmount' as const,
      'value': COURIER_DELIVERY_COST,
      'currency': 'KZT',
    },
    'shippingDestination': {
      '@type': 'DefinedRegion' as const,
      'addressCountry': 'KZ',
    },
    'deliveryTime': {
      '@type': 'ShippingDeliveryTime' as const,
      'handlingTime': {
        '@type': 'QuantitativeValue' as const,
        'minValue': 0,
        'maxValue': 1,
        'unitCode': 'DAY',
      },
      'transitTime': {
        '@type': 'QuantitativeValue' as const,
        'minValue': 1,
        'maxValue': 7,
        'unitCode': 'DAY',
      },
    },
  }
}

/** Текущая цена: final_price из базы, иначе цена как есть — целым числом. */
export function offerPrice(product: { price: number | string | null, final_price?: number | null }): number {
  return product.final_price || Math.round(Number(product.price))
}

/**
 * Скидка — так, как её понимает Google в товарных карточках выдачи.
 *
 * Правило из документации merchant listing: «Don't mark the active price
 * with a priceType property» — текущая цена идёт в `price` без пометок, а
 * старая, зачёркнутая, — в priceSpecification с StrikethroughPrice. Только
 * этот тип и поддерживается.
 *
 * До 21 сентября 2026 было наоборот: в priceSpecification стояла ТЕКУЩАЯ
 * цена с пометкой SalePrice, старой не было вовсе. Search Console отмечал на
 * каждой такой карточке «Отсутствует поле validFrom», а показать в выдаче
 * «было/стало» Google не мог — старую цену было неоткуда взять.
 *
 * Старая цена — `product.price`: ровно её сайт показывает зачёркнутой.
 * Разметка обязана совпадать с тем, что видит покупатель. Без скидки или
 * если «старая» не выше текущей — ничего.
 *
 * `priceValidUntil` (`stablePriceValidUntil`) страница передаёт сюда, а не
 * ставит в Offer сама: срок цены выводится только вместе с её началом. Search
 * Console отмечает «Отсутствует поле validFrom» на ЛЮБОМ Offer, где срок есть,
 * а начала нет, — и у товара без скидки. 22 октября 2026 так стояли все 16
 * товаров без скидки, в том числе пройденные Google 15, 20 и 21 октября — уже
 * после правки 14-го, а в разделе «Развивающие игрушки» из десяти товаров
 * замечание было ровно у одного, без скидки. На страницах брендов и серий
 * срока нет совсем — и ни замечания про validFrom, ни просьбы о сроке у их
 * 39 товаров.
 */
export function strikethroughPrice(product: {
  price: number | string | null
  final_price?: number | null
  discount_percentage?: number | null
  discount_started_at?: string | null
}, priceValidUntil?: string) {
  const original = Math.round(Number(product.price))
  if (!(Number(product.discount_percentage) > 0) || !(original > offerPrice(product)))
    return {}
  return {
    /*
     * Начало цены со скидкой — `validFrom` на Offer (merchant listing), с ним
     * и срок. Дату ведёт триггер в базе (`products.discount_started_at`,
     * миграция 20261014120000); нет даты — нет ни начала, ни срока,
     * выдумывать её нельзя.
     */
    ...(product.discount_started_at && {
      validFrom: product.discount_started_at,
      ...(priceValidUntil && { priceValidUntil }),
    }),
    priceSpecification: {
      '@type': 'UnitPriceSpecification' as const,
      'priceType': 'https://schema.org/StrikethroughPrice',
      'price': original,
      'priceCurrency': 'KZT',
    },
  }
}

/**
 * `priceValidUntil` в разметке Offer — последний день месяца через
 * `monthsAhead` месяцев (по UTC).
 *
 * Было «сегодня + 30 дней» на карточке и «сегодня + год» в разделе: дата
 * менялась каждые сутки, а с ней — HTML страницы. Vercel списывает запись
 * ISR, только когда пересобранная страница отличается от прежней (docs:
 * «ISR usage and pricing»), так что при суточном кеше каждая пересборка была
 * платной, даже если товар не менялся. Конец месяца меняется раз в месяц и
 * всегда впереди: при `monthsAhead = 1` — не меньше чем на 27 суток, то есть
 * и страница, пролежавшая в кеше сутки, не покажет Google прошедшую дату.
 */
export function stablePriceValidUntil(monthsAhead: number, now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead + 1, 0))
    .toISOString()
    .slice(0, 10)
}

/**
 * Готовый JSON-LD без срока цены там, где нет её начала: у каждого Offer с
 * `priceValidUntil`, но без `validFrom`, срок снимается. Правило — у
 * `strikethroughPrice` выше.
 *
 * Зачем отдельно. Разметку разделов, брендов и серий сайт собирает сам, и
 * срока без начала там нет. А граф `nuxt-schema-org` на карточке товара
 * достраивает `@unhead/schema-org` (2.1.13): резолвер Offer ставит
 * `priceValidUntil` любому Offer без него — конец следующего года
 * (`setIfEmpty`), — и у товара без скидки получался ровно «срок без начала».
 * Прогоняет граф через эту функцию `plugins/schema-org-offer-validity.ts`.
 *
 * Без срока в строке, с битым JSON или без таких Offer — строка та же.
 */
export function dropPriceValidUntilWithoutStart(json: string): string {
  if (!json.includes('"priceValidUntil"'))
    return json
  let data: unknown
  try {
    data = JSON.parse(json)
  }
  catch {
    return json
  }
  let changed = false
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!node || typeof node !== 'object')
      return
    const obj = node as Record<string, unknown>
    const type = obj['@type']
    const isOffer = type === 'Offer' || (Array.isArray(type) && type.includes('Offer'))
    if (isOffer && 'priceValidUntil' in obj && !obj.validFrom) {
      delete obj.priceValidUntil
      changed = true
    }
    Object.values(obj).forEach(walk)
  }
  walk(data)
  return changed ? JSON.stringify(data) : json
}

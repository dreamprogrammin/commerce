import { describe, expect, it } from 'vitest'
import { COURIER_DELIVERY_COST } from '@/constants'
import { dropPriceValidUntilWithoutStart, merchantReturnPolicy, offerPrice, offerShippingDetails, stablePriceValidUntil, strikethroughPrice } from '@/utils/offerSchema'

/*
 * Условия продавца в разметке — одни на весь сайт. 21 сентября 2026 в
 * разделах, на страницах брендов и линеек нашлись копии со старыми
 * обещаниями (доставка 0 ₸, возврат почтой и бесплатно), хотя на карточке
 * товара их исправили ещё 17-го.
 */
describe('merchantReturnPolicy', () => {
  it('как на /returns: 14 дней, в магазин или курьеру, доставку оплачивает покупатель', () => {
    expect(merchantReturnPolicy()).toMatchObject({
      merchantReturnDays: 14,
      returnMethod: 'https://schema.org/ReturnInStore',
      returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
    })
  })

  it('каждый вызов — новый объект', () => {
    expect(merchantReturnPolicy()).not.toBe(merchantReturnPolicy())
  })
})

describe('offerShippingDetails', () => {
  it('курьер по цене кассы, а не бесплатно; срок 1–7 дней', () => {
    const d = offerShippingDetails()
    expect(d.shippingRate.value).toBe(COURIER_DELIVERY_COST)
    expect(d.shippingRate.value).toBeGreaterThan(0)
    expect(d.deliveryTime.transitTime).toMatchObject({ minValue: 1, maxValue: 7 })
  })
})

describe('offerPrice', () => {
  it('берёт final_price, без него — цену целым числом', () => {
    expect(offerPrice({ price: 8490, final_price: 7990 })).toBe(7990)
    expect(offerPrice({ price: '8490.4', final_price: null })).toBe(8490)
  })
})

describe('strikethroughPrice', () => {
  it('старая цена — StrikethroughPrice, текущая остаётся без пометки', () => {
    expect(strikethroughPrice({ price: 8490, final_price: 7990, discount_percentage: 5 })).toEqual({
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        'priceType': 'https://schema.org/StrikethroughPrice',
        'price': 8490,
        'priceCurrency': 'KZT',
      },
    })
  })

  it('без скидки — ничего', () => {
    expect(strikethroughPrice({ price: 8490, final_price: 8490, discount_percentage: 0 })).toEqual({})
    expect(strikethroughPrice({ price: 8490, final_price: 8490, discount_percentage: null })).toEqual({})
  })

  it('скидка есть, но «старая» не выше текущей — ничего', () => {
    expect(strikethroughPrice({ price: 7990, final_price: 7990, discount_percentage: 5 })).toEqual({})
  })

  /*
   * `validFrom` — начало цены со скидкой, на Offer рядом с priceValidUntil
   * (Google merchant listing). До 14 октября 2026 его не было, и Search Console
   * держал «Отсутствует поле validFrom» на 168 карточках и 42 разделах.
   */
  it('дата начала скидки — validFrom на Offer', () => {
    expect(strikethroughPrice({ price: 8490, final_price: 7990, discount_percentage: 5, discount_started_at: '2026-10-14T10:21:00.811388+00:00' }))
      .toMatchObject({ validFrom: '2026-10-14T10:21:00.811388+00:00', priceSpecification: { price: 8490 } })
  })

  it('без даты — validFrom нет (не выдумываем); без скидки — дата не выводится', () => {
    expect(strikethroughPrice({ price: 8490, final_price: 7990, discount_percentage: 5 })).not.toHaveProperty('validFrom')
    expect(strikethroughPrice({ price: 8490, final_price: 8490, discount_percentage: 0, discount_started_at: '2026-10-14T10:21:00+00:00' })).toEqual({})
  })

  /*
   * Срок цены — только рядом с началом. Search Console отмечает «Отсутствует
   * поле validFrom» на любом Offer со сроком без начала: 22 октября 2026 — у
   * всех 16 товаров без скидки, и у пройденных уже после правки 14 октября.
   */
  it('срок цены — только вместе с началом скидки', () => {
    const until = '2026-11-30'
    expect(strikethroughPrice({ price: 8490, final_price: 7990, discount_percentage: 5, discount_started_at: '2026-10-14T10:21:00+00:00' }, until))
      .toMatchObject({ validFrom: '2026-10-14T10:21:00+00:00', priceValidUntil: until })
    expect(strikethroughPrice({ price: 8490, final_price: 8490, discount_percentage: 0 }, until)).toEqual({})
    expect(strikethroughPrice({ price: 8490, final_price: 7990, discount_percentage: 5 }, until)).not.toHaveProperty('priceValidUntil')
  })
})

/*
 * `priceValidUntil` стоял «сегодня + 30 дней» на карточке и «сегодня + год» в
 * разделе — и менялся каждые сутки, а с ним HTML страницы. Vercel списывает
 * запись ISR, только когда пересобранная страница отличается от прежней, так
 * что при суточном кеше каждая пересборка была платной, даже без изменений
 * в товаре (10 октября 2026: 767 тыс. записей при бесплатных 200 тыс.).
 */
describe('stablePriceValidUntil', () => {
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))

  it('весь месяц — одна и та же дата', () => {
    const dates = [1, 9, 10, 17, 31].map(d => stablePriceValidUntil(1, at(2026, 10, d)))
    expect(new Set(dates)).toEqual(new Set(['2026-11-30']))
  })

  it('дата всегда впереди не меньше чем на 27 суток — и у пролежавшей в кеше страницы', () => {
    for (let d = 1; d <= 31; d++) {
      const now = new Date(Date.UTC(2027, 0, d, 23, 59))
      const until = new Date(`${stablePriceValidUntil(1, now)}T00:00:00Z`)
      expect(until.getTime() - now.getTime()).toBeGreaterThan(27 * 24 * 60 * 60 * 1000)
    }
  })

  it('переход года и високосный февраль', () => {
    expect(stablePriceValidUntil(1, at(2026, 12, 15))).toBe('2027-01-31')
    expect(stablePriceValidUntil(1, at(2028, 1, 31))).toBe('2028-02-29')
  })

  it('горизонт в год (списки в разделах) — тоже конец месяца', () => {
    expect(stablePriceValidUntil(12, at(2026, 10, 1))).toBe('2027-10-31')
    expect(stablePriceValidUntil(12, at(2026, 10, 31))).toBe('2027-10-31')
  })
})

/*
 * Граф карточки товара достраивает @unhead/schema-org: Offer без срока
 * получает «конец следующего года». У товара без скидки это срок без начала —
 * 22 октября 2026 так стояли все 16 таких карточек.
 */
describe('dropPriceValidUntilWithoutStart', () => {
  const graph = (offer: Record<string, unknown>) => JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'WebPage', 'name': 'Книга' }, { '@type': 'Product', 'name': 'Книга', 'offers': offer }],
  })
  const offerOf = (json: string) => JSON.parse(json)['@graph'][1].offers

  it('срок без начала снимается, остальное на месте', () => {
    const out = offerOf(dropPriceValidUntilWithoutStart(graph({ '@type': 'Offer', 'price': 3990, 'priceValidUntil': '2027-12-30T00:00:00.000Z' })))
    expect(out).toEqual({ '@type': 'Offer', 'price': 3990 })
  })

  it('срок с началом остаётся', () => {
    const offer = { '@type': 'Offer', 'price': 11890, 'priceValidUntil': '2026-11-30', 'validFrom': '2026-09-21T06:23:27+00:00' }
    expect(offerOf(dropPriceValidUntilWithoutStart(graph(offer)))).toEqual(offer)
  })

  it('без таких Offer и с битым JSON — та же строка', () => {
    const plain = graph({ '@type': 'Offer', 'price': 3990 })
    expect(dropPriceValidUntilWithoutStart(plain)).toBe(plain)
    expect(dropPriceValidUntilWithoutStart('{"priceValidUntil":')).toBe('{"priceValidUntil":')
  })

  it('не Offer — не трогает', () => {
    const event = JSON.stringify({ '@type': 'Event', 'priceValidUntil': '2027-01-01' })
    expect(dropPriceValidUntilWithoutStart(event)).toBe(event)
  })
})

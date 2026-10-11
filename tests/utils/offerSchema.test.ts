import { describe, expect, it } from 'vitest'
import { COURIER_DELIVERY_COST } from '@/constants'
import { merchantReturnPolicy, offerPrice, offerShippingDetails, stablePriceValidUntil, strikethroughPrice } from '@/utils/offerSchema'

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

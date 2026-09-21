import { describe, expect, it } from 'vitest'
import { COURIER_DELIVERY_COST } from '@/constants'
import { merchantReturnPolicy, offerPrice, offerShippingDetails, strikethroughPrice } from '@/utils/offerSchema'

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

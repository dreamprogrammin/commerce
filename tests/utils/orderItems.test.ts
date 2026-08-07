import { describe, expect, it } from 'vitest'
import { isHistoricalPrice, orderItemUnitPrice } from '@/utils/orderItems'

/**
 * Цена позиции заказа должна быть той, по которой покупали, а не текущей ценой
 * товара. Раньше страницы заказа считали по product.price, и после любого
 * изменения цены список позиций переставал сходиться с «Итого».
 */
describe('orderItemUnitPrice', () => {
  it('берёт price_at_purchase — так колонка называется в проде', () => {
    expect(orderItemUnitPrice({
      price_at_purchase: 7490,
      product: { price: 9990, final_price: 8990 },
    })).toBe(7490)
  })

  it('берёт price_per_item — так она называется в схеме из миграций', () => {
    expect(orderItemUnitPrice({
      price_per_item: 7490,
      product: { price: 9990, final_price: 8990 },
    })).toBe(7490)
  })

  it('цена покупки важнее текущей, даже если товар подешевел', () => {
    expect(orderItemUnitPrice({
      price_at_purchase: 12000,
      product: { price: 5000, final_price: 4500 },
    })).toBe(12000)
  })

  it('строку из numeric-колонки приводит к числу', () => {
    // PostgREST отдаёт numeric строкой — без приведения умножение дало бы NaN.
    expect(orderItemUnitPrice({ price_at_purchase: '7490.00' })).toBe(7490)
  })

  it('падает на цену товара, только когда истории нет', () => {
    expect(orderItemUnitPrice({
      product: { price: 9990, final_price: 8990 },
    })).toBe(8990)
    expect(orderItemUnitPrice({ product: { price: 9990, final_price: null } }))
      .toBe(9990)
  })

  it('не возвращает NaN на мусоре', () => {
    expect(orderItemUnitPrice({})).toBe(0)
    expect(orderItemUnitPrice({ price_at_purchase: null, price_per_item: null }))
      .toBe(0)
    expect(orderItemUnitPrice({ price_at_purchase: 0, product: { price: 100 } }))
      .toBe(100)
  })

  it('отличает историческую цену от подставленной', () => {
    expect(isHistoricalPrice({ price_at_purchase: 7490 })).toBe(true)
    expect(isHistoricalPrice({ price_per_item: 7490 })).toBe(true)
    expect(isHistoricalPrice({ product: { price: 7490 } })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { aggregateSales } from '../../server/utils/adminRestock'

const now = new Date('2026-10-30T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('aggregateSales', () => {
  it('30 дней входят в 90; старше 90 и из будущего — не считаются', () => {
    const sales = aggregateSales([
      { productId: 'a', quantity: 2, orderedAt: daysAgo(1) },
      { productId: 'a', quantity: 3, orderedAt: daysAgo(30) },
      { productId: 'a', quantity: 4, orderedAt: daysAgo(31) },
      { productId: 'a', quantity: 5, orderedAt: daysAgo(90) },
      { productId: 'a', quantity: 100, orderedAt: daysAgo(91) },
      { productId: 'a', quantity: 100, orderedAt: daysAgo(-1) },
      { productId: 'b', quantity: 1, orderedAt: daysAgo(60) },
    ], [], now)
    expect(sales.get('a')).toEqual({ sold30: 5, sold90: 14 })
    expect(sales.get('b')).toEqual({ sold30: 0, sold90: 1 })
  })

  it('возврат вычитается в окне своего заказа и не уводит в минус', () => {
    const sales = aggregateSales([
      { productId: 'a', quantity: 3, orderedAt: daysAgo(5) },
      { productId: 'a', quantity: 2, orderedAt: daysAgo(45) },
    ], [
      { productId: 'a', quantity: 1, orderedAt: daysAgo(5) },
      { productId: 'a', quantity: 9, orderedAt: daysAgo(45) },
    ], now)
    expect(sales.get('a')).toEqual({ sold30: 2, sold90: 0 })
  })
})

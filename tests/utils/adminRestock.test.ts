import { describe, expect, it } from 'vitest'
import { aggregateSales, formingByProduct, pendingByProduct } from '../../server/utils/adminRestock'

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

describe('pendingByProduct', () => {
  it('заказано и не пришло — только по открытым заказам, удалённые товары не в счёт', () => {
    const line = (productId: string | null, quantity: number, received: number) => ({ productId, name: 'x', sku: null, quantity, received, costPrice: null })
    const pending = pendingByProduct([
      { status: 'ordered', lines: [line('a', 5, 0), line('b', 3, 1)] },
      { status: 'in_transit', lines: [line('a', 2, 2), line('b', 1, 0), line(null, 4, 0)] },
      { status: 'received', lines: [line('a', 9, 1)] },
      { status: 'cancelled', lines: [line('b', 9, 0)] },
      { status: 'ordered', lines: [line('c', 2, 5)] },
    ])
    expect(Object.fromEntries(pending)).toEqual({ a: 5, b: 3 })
  })

  it('формирующийся заказ — не «заказано»: поставщику он ещё не отправлен', () => {
    const line = (productId: string, quantity: number) => ({ productId, name: 'x', sku: null, quantity, received: 0, costPrice: null })
    expect(pendingByProduct([{ status: 'draft', lines: [line('a', 5)] }]).size).toBe(0)
  })
})

describe('formingByProduct', () => {
  it('лежит в формирующихся заказах — только по ним, удалённые товары не в счёт', () => {
    const line = (productId: string | null, quantity: number) => ({ productId, name: 'x', sku: null, quantity, received: 0, costPrice: null })
    const forming = formingByProduct([
      { status: 'draft', lines: [line('a', 3), line('b', 2), line(null, 4)] },
      { status: 'draft', lines: [line('a', 1)] },
      { status: 'ordered', lines: [line('a', 9), line('c', 2)] },
      { status: 'in_transit', lines: [line('b', 7)] },
      { status: 'received', lines: [line('c', 5)] },
    ])
    expect(Object.fromEntries(forming)).toEqual({ a: 4, b: 2 })
  })
})

import type { SupplierOrder } from '../../utils/supplierOrders'
import { describe, expect, it } from 'vitest'
import { isOpenOrder, ORDER_STATUS_LABEL, orderSummary, receiveDefaults, receivePlan, remaining, supplierOrderText } from '../../utils/supplierOrders'

/**
 * Заказы поставщикам — шаг 2 «К закупке» (31.10.2026).
 */
function order(over: Partial<SupplierOrder> = {}): SupplierOrder {
  return {
    id: 'o1',
    number: 12,
    supplierId: 's1',
    status: 'ordered',
    note: null,
    createdAt: '2026-10-31T05:00:00Z',
    shippedAt: null,
    closedAt: null,
    lines: [
      { productId: 'a', name: 'Кукла', sku: 'K-1', quantity: 5, received: 2, costPrice: 1500 },
      { productId: 'b', name: 'Мяч', sku: null, quantity: 3, received: 0, costPrice: null },
      { productId: null, name: 'Удалённый', sku: 'D-9', quantity: 1, received: 0, costPrice: 100 },
    ],
    ...over,
  }
}

describe('заказ поставщику', () => {
  it('открыт, пока заказан или в пути', () => {
    expect(isOpenOrder({ status: 'ordered' })).toBe(true)
    expect(isOpenOrder({ status: 'in_transit' })).toBe(true)
    expect(isOpenOrder({ status: 'received' })).toBe(false)
    expect(isOpenOrder({ status: 'cancelled' })).toBe(false)
    expect(ORDER_STATUS_LABEL.in_transit).toBe('В пути')
  })

  it('осталось прийти — не меньше нуля (поставщик мог доложить)', () => {
    expect(remaining({ quantity: 5, received: 2 })).toBe(3)
    expect(remaining({ quantity: 2, received: 4 })).toBe(0)
  })

  it('сводка: позиции, штуки, принято, сумма только по известной закупке', () => {
    expect(orderSummary(order())).toEqual({ positions: 3, units: 9, receivedUnits: 2, cost: 5 * 1500 + 100, withoutCost: 1 })
  })

  it('приёмка по умолчанию — остаток к приходу; удалённый товар не принимается', () => {
    expect(receiveDefaults(order())).toEqual({ a: 3, b: 3 })
  })

  it('план приёмки: штуки, кому придёт «снова в наличии», останется ли заказ открытым', () => {
    const products = new Map([['a', { stock: 0, alerts: 2 }], ['b', { stock: 4, alerts: 7 }]])
    expect(receivePlan(order(), { a: 3, b: 3 }, products)).toEqual({ units: 6, notified: 2, short: false })
    // B не пришёл — заказ останется открытым; ждущие B не уведомляются: его и так 4
    expect(receivePlan(order(), { a: 1, b: 0 }, products)).toEqual({ units: 1, notified: 2, short: true })
    // A не принимается — ждущие A уведомления не получат
    expect(receivePlan(order(), { a: 0, b: 3 }, products).notified).toBe(0)
  })

  it('текст сохранённого заказа — с номером и всеми строками, как уходил поставщику', () => {
    const text = supplierOrderText(order())
    expect(text).toContain('Заказ №12 от магазина «Ухтышка», 31.10.2026:')
    expect(text).toContain('1. K-1 — Кукла — 5 шт.')
    expect(text).toContain('2. Мяч — 3 шт.')
    expect(text).toContain('3. D-9 — Удалённый — 1 шт.')
    expect(text).toContain('Всего: 3 позиции, 9 шт.')
  })
})

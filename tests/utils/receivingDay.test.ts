import type { DeliveryReceipt, SupplierOrder } from '../../utils/supplierOrders'
import { describe, expect, it } from 'vitest'
import { dayMarks, dayReceipts, daySuppliers, parseDay } from '../../utils/receivingDay'

/**
 * «Приёмка товаров» — поставщики дня (28.11.2026).
 */
const TODAY = '2026-11-28'
const NAMES: Record<string, string> = { s1: 'Игрушки Алматы', s2: 'Арман', s3: 'Байтерек' }
const nameOf = (id: string) => NAMES[id] ?? 'Поставщик'

function order(over: Partial<SupplierOrder>): SupplierOrder {
  return {
    id: 'o1',
    number: 12,
    supplierId: 's1',
    status: 'ordered',
    note: null,
    createdAt: '2026-11-20T05:00:00Z',
    expectedAt: TODAY,
    shippedAt: null,
    closedAt: null,
    lines: [
      { productId: 'a', name: 'Кукла', sku: 'K-1', quantity: 5, received: 2, costPrice: 1500 },
      { productId: 'b', name: 'Мяч', sku: null, quantity: 3, received: 0, costPrice: null },
    ],
    ...over,
  }
}

describe('parseDay', () => {
  it('только настоящая дата ГГГГ-ММ-ДД', () => {
    expect(parseDay('2026-11-28')).toBe('2026-11-28')
    expect(parseDay('2028-02-29')).toBe('2028-02-29')
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('2026-13-01')).toBeNull()
    expect(parseDay('28.11.2026')).toBeNull()
    expect(parseDay('count')).toBeNull()
    expect(parseDay(['2026-11-28'])).toBeNull()
    expect(parseDay(undefined)).toBeNull()
  })
})

describe('daySuppliers', () => {
  it('поставщики дня — по одному, с их заказами; по алфавиту', () => {
    const list = daySuppliers([
      order({ id: 'o1', number: 14, supplierId: 's1' }),
      order({ id: 'o2', number: 12, supplierId: 's1', lines: [{ productId: 'c', name: 'Пазл', sku: null, quantity: 4, received: 0, costPrice: 900 }] }),
      order({ id: 'o3', number: 13, supplierId: 's2' }),
    ], TODAY, TODAY, nameOf)
    expect(list.map(s => s.name)).toEqual(['Арман', 'Игрушки Алматы'])
    const s1 = list[1]!
    expect(s1.orders.map(o => o.number)).toEqual([12, 14])
    expect(s1.positions).toBe(3)
    expect(s1.units).toBe(12)
    // Кукла: 5 заказано, 2 уже пришло
    expect(s1.waiting).toBe(10)
  })

  it('в день попадают только открытые заказы этого дня; опоздавший — сегодня', () => {
    const orders = [
      order({ id: 'today', supplierId: 's1' }),
      order({ id: 'late', supplierId: 's2', expectedAt: '2026-11-26' }),
      order({ id: 'later', supplierId: 's3', expectedAt: '2026-11-30' }),
      order({ id: 'nodate', supplierId: 's3', expectedAt: null }),
      order({ id: 'got', supplierId: 's3', status: 'received' }),
      order({ id: 'draft', supplierId: 's3', status: 'draft' }),
    ]
    expect(daySuppliers(orders, TODAY, TODAY, nameOf).map(s => [s.supplierId, s.late])).toEqual([['s2', true], ['s1', false]])
    expect(daySuppliers(orders, '2026-11-30', TODAY, nameOf).map(s => s.supplierId)).toEqual(['s3'])
    // Прошедший день: опоздавших там уже нет — они сегодня
    expect(daySuppliers(orders, '2026-11-26', TODAY, nameOf)).toEqual([])
  })

  it('перенесённая поставка помечена', () => {
    const [s] = daySuppliers([order({ postponed: 2 })], TODAY, TODAY, nameOf)
    expect(s!.late).toBe(true)
  })

  it('удалённый товар не ждём', () => {
    const [s] = daySuppliers([order({ lines: [
      { productId: null, name: 'Удалённый', sku: null, quantity: 3, received: 0, costPrice: null },
      { productId: 'b', name: 'Мяч', sku: null, quantity: 2, received: 0, costPrice: null },
    ] })], TODAY, TODAY, nameOf)
    expect(s!.units).toBe(5)
    expect(s!.waiting).toBe(2)
  })
})

describe('dayMarks', () => {
  it('у дня — сколько поставщиков и кто', () => {
    const marks = dayMarks([
      order({ id: 'o1', supplierId: 's1' }),
      order({ id: 'o2', supplierId: 's1' }),
      order({ id: 'o3', supplierId: 's2', expectedAt: '2026-11-27' }),
      order({ id: 'o4', supplierId: 's3', expectedAt: '2026-12-02' }),
      order({ id: 'o5', supplierId: 's3', expectedAt: '2026-12-03', status: 'cancelled' }),
    ], TODAY, nameOf)
    expect(marks.get(TODAY)).toEqual({ count: 2, labels: ['Арман', 'Игрушки Алматы'], late: true })
    expect(marks.get('2026-12-02')).toEqual({ count: 1, labels: ['Байтерек'], late: false })
    expect(marks.has('2026-11-27')).toBe(false)
    expect(marks.has('2026-12-03')).toBe(false)
  })
})

describe('dayReceipts', () => {
  it('принятое за день по Алматы — по поставщикам, свежие первыми', () => {
    const orders = [
      order({ id: 'o1', number: 12, supplierId: 's1', status: 'received' }),
      order({ id: 'o2', number: 15, supplierId: 's1' }),
      order({ id: 'o3', number: 13, supplierId: 's2' }),
    ]
    const receipts: DeliveryReceipt[] = [
      { orderId: 'o1', productId: 'a', quantity: 3, receivedAt: '2026-11-28T04:00:00Z' },
      { orderId: 'o2', productId: 'a', quantity: 1, receivedAt: '2026-11-28T06:00:00Z' },
      { orderId: 'o2', productId: 'b', quantity: 2, receivedAt: '2026-11-28T06:00:00Z' },
      { orderId: 'o3', productId: 'b', quantity: 5, receivedAt: '2026-11-28T09:30:00Z' },
      // 23:30 по Алматы 27-го — ещё вчера; 19:30 UTC 28-го — уже 29-е
      { orderId: 'o3', productId: 'a', quantity: 7, receivedAt: '2026-11-27T18:30:00Z' },
      { orderId: 'o3', productId: 'a', quantity: 9, receivedAt: '2026-11-28T19:30:00Z' },
      { orderId: 'unknown', productId: 'a', quantity: 1, receivedAt: '2026-11-28T06:00:00Z' },
    ]
    expect(dayReceipts(receipts, orders, TODAY, nameOf)).toEqual([
      { supplierId: 's2', name: 'Арман', numbers: [13], positions: 1, units: 5, lastAt: '2026-11-28T09:30:00Z' },
      { supplierId: 's1', name: 'Игрушки Алматы', numbers: [12, 15], positions: 2, units: 6, lastAt: '2026-11-28T06:00:00Z' },
    ])
    expect(dayReceipts(receipts, orders, '2026-11-29', nameOf).map(r => r.units)).toEqual([9])
  })
})

import type { SupplierOrder } from '../../utils/supplierOrders'
import { describe, expect, it } from 'vitest'
import { addDays, almatyDay, calendarDay, daysBetween, deliveryDay, expectedState, isOpenOrder, lineCheck, longDay, monthGrid, monthTitle, ORDER_STATUS_LABEL, orderCheck, orderMoney, ordersByDay, orderSheetLines, orderSummary, postponedText, receiveDefaults, receiveMoney, receivePlan, remaining, savedOrderMoney, shiftMonth, supplierDeliveries, supplierOrderText } from '../../utils/supplierOrders'

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

describe('деньги заказа', () => {
  it('закупка, продажа и наценка; наценка — только где обе цены; нулевые строки не в счёт', () => {
    expect(orderMoney([
      { quantity: 2, costPrice: 1000, salePrice: 2500 },
      { quantity: 3, costPrice: 500, salePrice: null },
      { quantity: 1, costPrice: null, salePrice: 4000 },
      { quantity: 0, costPrice: 99999, salePrice: 99999 },
    ])).toEqual({ units: 6, cost: 3500, sale: 9000, margin: 3000, withoutCost: 1, withoutSale: 1 })
    expect(orderMoney([{ quantity: 1, costPrice: null, salePrice: 100 }]).margin).toBeNull()
  })
  const o = order({
    lines: [
      { productId: 'p1', name: 'Кукла', sku: 'A1', quantity: 4, received: 1, costPrice: 1000 },
      { productId: 'p2', name: 'Машинка', sku: null, quantity: 2, received: 0, costPrice: null },
      { productId: null, name: 'Удалён', sku: null, quantity: 5, received: 0, costPrice: 300 },
    ],
  })
  const products = new Map([['p1', { price: 2500 }], ['p2', { price: 0 }]])
  it('сохранённый заказ: продажа — с сайта, без цены (0) и удалённый — без продажи', () => {
    expect(savedOrderMoney(o, products)).toEqual({ units: 11, cost: 5500, sale: 10000, margin: 6000, withoutCost: 1, withoutSale: 2 })
    expect(savedOrderMoney(o, products, 'received')).toEqual({ units: 1, cost: 1000, sale: 2500, margin: 1500, withoutCost: 0, withoutSale: 0 })
  })
  it('приёмка — то, что принимается сейчас; удалённые не принимаются', () => {
    expect(receiveMoney(o, { p1: 3, p2: 2 }, products)).toEqual({ units: 5, cost: 3000, sale: 7500, margin: 4500, withoutCost: 1, withoutSale: 1 })
  })
  it('строки таблицы поставщику: его цена, без нулевых', () => {
    expect(orderSheetLines('Опт', [
      { name: 'Кукла', sku: 'A1', costPrice: 1000, quantity: 3, photoUrl: 'https://x/p.webp' },
      { name: 'Пусто', sku: null, costPrice: null, quantity: 0, photoUrl: null },
    ])).toEqual([{ supplier: 'Опт', name: 'Кукла', article: 'A1', price: 1000, quantity: 3, photoUrl: 'https://x/p.webp', link: null }])
  })
})

describe('поставки (26.11.2026)', () => {
  it('формирующийся заказ не открыт: принять по нему нельзя, в «К закупке» он не ждёт', () => {
    expect(isOpenOrder({ status: 'draft' })).toBe(false)
    expect(ORDER_STATUS_LABEL.draft).toBe('Формируется')
  })

  it('день по Алматы — UTC+5: 19:30 UTC уже завтра', () => {
    expect(almatyDay(new Date('2026-11-26T18:59:00Z'))).toBe('2026-11-26')
    expect(almatyDay(new Date('2026-11-26T19:30:00Z'))).toBe('2026-11-27')
  })

  it('дни по календарю — через конец месяца и года', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-11-26', '2026-12-01')).toBe(5)
    expect(daysBetween('2026-11-26', '2026-11-24')).toBe(-2)
    expect(deliveryDay('2026-12-01')).toBe('01.12')
  })

  it('когда ждать: впереди, сегодня, опаздывает, без даты; формирующийся и закрытый — нет', () => {
    const today = '2026-11-26'
    expect(expectedState({ status: 'ordered', expectedAt: '2026-11-29' }, today)).toEqual({ kind: 'ahead', days: 3, label: 'ждём 29.11 — через 3 дня' })
    expect(expectedState({ status: 'in_transit', expectedAt: '2026-11-26' }, today)).toEqual({ kind: 'today', days: 0, label: 'ждём сегодня, 26.11' })
    expect(expectedState({ status: 'ordered', expectedAt: '2026-11-21' }, today)).toEqual({ kind: 'late', days: 5, label: 'ждали 21.11 — опаздывает на 5 дней' })
    expect(expectedState({ status: 'ordered', expectedAt: null }, today)?.kind).toBe('none')
    expect(expectedState({ status: 'ordered' }, today)?.kind).toBe('none')
    expect(expectedState({ status: 'draft', expectedAt: '2026-11-21' }, today)).toBeNull()
    expect(expectedState({ status: 'received', expectedAt: '2026-11-21' }, today)).toBeNull()
  })

  it('сверка строки: заказано, пришло, не пришло, лишнее', () => {
    expect(lineCheck({ quantity: 5, received: 3 })).toEqual({ ordered: 5, received: 3, missing: 2, extra: 0 })
    expect(lineCheck({ quantity: 2, received: 4 })).toEqual({ ordered: 2, received: 4, missing: 0, extra: 2 })
  })

  it('сверка заказа: штуки и строки по исходу', () => {
    const o = order({
      lines: [
        { productId: 'a', name: 'А', sku: null, quantity: 5, received: 5, costPrice: null },
        { productId: 'b', name: 'Б', sku: null, quantity: 5, received: 2, costPrice: null },
        { productId: 'c', name: 'В', sku: null, quantity: 3, received: 0, costPrice: null },
        { productId: 'd', name: 'Г', sku: null, quantity: 1, received: 3, costPrice: null },
      ],
    })
    expect(orderCheck(o)).toEqual({ positions: 4, ordered: 14, received: 10, missing: 6, extra: 2, full: 1, short: 1, over: 1, none: 1 })
  })

  it('текст формирующегося — с сегодняшней датой, отправленного — с датой «Заказано»', () => {
    const now = new Date('2026-11-28T06:00:00Z')
    expect(supplierOrderText(order({ orderedAt: null }), now)).toContain('28.11.2026')
    expect(supplierOrderText(order({ createdAt: '2026-11-20T06:00:00Z', orderedAt: '2026-11-26T06:00:00Z' }), now)).toContain('26.11.2026')
    expect(supplierOrderText(order({ createdAt: '2026-11-20T06:00:00Z' }), now)).toContain('20.11.2026')
  })
})

describe('календарь и поставщики (27.11.2026)', () => {
  const today = '2026-11-27'
  const order = (over: Partial<SupplierOrder>): SupplierOrder => ({
    id: over.id ?? 'o',
    number: 1,
    supplierId: 's1',
    status: 'ordered',
    note: null,
    createdAt: '2026-11-20T00:00:00Z',
    shippedAt: null,
    closedAt: null,
    lines: [{ productId: 'p', name: 'Кукла', sku: null, quantity: 2, received: 0, costPrice: null }],
    ...over,
  })

  it('postponedText: сколько раз и когда ждали сначала; не переносилась — null', () => {
    expect(postponedText({ postponed: 2, plannedAt: '2026-11-24' })).toBe('перенесена 2 раза · сначала ждали 24.11')
    expect(postponedText({ postponed: 5, plannedAt: null })).toBe('перенесена 5 раз')
    expect(postponedText({ postponed: 1, plannedAt: '2026-11-26' })).toBe('перенесена 1 раз · сначала ждали 26.11')
    expect(postponedText({ postponed: 0, plannedAt: '2026-11-24' })).toBeNull()
    expect(postponedText({})).toBeNull()
  })

  it('calendarDay: прошедший день ещё не перенесён ночью — уже сегодня; без даты и закрытый — null', () => {
    expect(calendarDay(order({ expectedAt: '2026-11-30' }), today)).toBe('2026-11-30')
    expect(calendarDay(order({ expectedAt: '2026-11-25' }), today)).toBe(today)
    expect(calendarDay(order({ expectedAt: null }), today)).toBeNull()
    expect(calendarDay(order({ status: 'received', expectedAt: '2026-11-30' }), today)).toBeNull()
    expect(calendarDay(order({ status: 'draft', expectedAt: '2026-11-30' }), today)).toBeNull()
  })

  it('monthGrid: недели с понедельника, края — соседние месяцы', () => {
    const weeks = monthGrid('2026-11')
    // 1 ноября 2026 — воскресенье: первая неделя с 26 октября
    expect(weeks[0]![0]).toEqual({ day: '2026-10-26', date: 26, inMonth: false })
    expect(weeks[0]![6]).toEqual({ day: '2026-11-01', date: 1, inMonth: true })
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks.at(-1)!.at(-1)!.day).toBe('2026-12-06')
    expect(weeks.flat().filter(c => c.inMonth)).toHaveLength(30)
    // Февраль невисокосного года с понедельника — ровно 4 недели
    expect(monthGrid('2027-02')).toHaveLength(4)
  })

  it('shiftMonth и подписи', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthTitle('2026-11')).toBe('Ноябрь 2026')
    expect(longDay('2026-11-27')).toBe('27 ноября, пятница')
  })

  it('supplierDeliveries: сегодня → скоро → без даты → только формируется; закрытые мимо', () => {
    const names: Record<string, string> = { a: 'Альфа', b: 'Бета', c: 'Вега', d: 'Гамма', e: 'Дельта' }
    const list = supplierDeliveries([
      order({ id: '1', number: 1, supplierId: 'b', expectedAt: '2026-12-01' }),
      order({ id: '2', number: 2, supplierId: 'a', expectedAt: '2026-11-29' }),
      order({ id: '3', number: 3, supplierId: 'c', expectedAt: today, postponed: 2, plannedAt: '2026-11-25' }),
      order({ id: '4', number: 4, supplierId: 'c', expectedAt: '2026-12-03' }),
      order({ id: '5', number: 5, supplierId: 'd', expectedAt: null }),
      order({ id: '6', number: 6, supplierId: 'e', status: 'draft' }),
      order({ id: '7', number: 7, supplierId: 'e', status: 'received', expectedAt: today }),
      // Ночью ещё не перенесён — всё равно сегодня, опоздание 1 день
      order({ id: '8', number: 8, supplierId: 'a', expectedAt: '2026-11-26' }),
    ], today, id => names[id]!)
    expect(list.map(e => [e.supplierId, e.group])).toEqual([['a', 'today'], ['c', 'today'], ['b', 'ahead'], ['d', 'nodate'], ['e', 'forming']])
    const c = list.find(e => e.supplierId === 'c')!
    expect(c).toMatchObject({ nextDay: today, today: 1, postponed: 2 })
    expect(c.waiting.map(o => o.number)).toEqual([3, 4])
    expect(list[0]).toMatchObject({ supplierId: 'a', today: 1, postponed: 1 })
    expect(list.find(e => e.supplierId === 'e')!.forming?.number).toBe(6)
    expect(list.find(e => e.supplierId === 'e')!.waiting).toEqual([])
  })

  it('ordersByDay — открытые по дням календаря', () => {
    const map = ordersByDay([order({ id: '1', expectedAt: '2026-11-20' }), order({ id: '2', expectedAt: today }), order({ id: '3', expectedAt: '2026-12-01' }), order({ id: '4', expectedAt: null })], today)
    expect([...map].map(([d, l]) => [d, l.map(o => o.id)])).toEqual([[today, ['1', '2']], ['2026-12-01', ['3']]])
  })
})

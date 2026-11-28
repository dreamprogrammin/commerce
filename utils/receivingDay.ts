/**
 * «Приёмка товаров» — день и поставщики дня (28 ноября 2026). Владелец 28.11:
 * «я захожу в раздел „Приёмка товаров“, далее выбираю дату по календарю — на
 * сегодня календарь ставит по умолчанию сегодня, или можно выбрать любую дату,
 * чтобы посмотреть, какие поставки ожидаются; когда выбираю дату, открывается
 * следующая страница, где уже лежит список поставщиков, которые запланированы
 * на этот день».
 *
 * День поставки — как в календаре «Поставок» (`calendarDay`): опоздавшая и
 * ещё не перенесённая ночью поставка — уже сегодня.
 */
import type { DeliveryReceipt, SupplierOrder } from './supplierOrders'
import { almatyDay, calendarDay, isOpenOrder, orderSummary, remaining } from './supplierOrders'

/** День из адреса — ГГГГ-ММ-ДД, настоящая дата; иначе null */
export function parseDay(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
    return null
  const date = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null
}

/** Поставщик, которого ждём в этот день */
export interface DaySupplier {
  supplierId: string
  name: string
  /** Его открытые заказы этого дня — старые первыми */
  orders: SupplierOrder[]
  positions: number
  /** Заказано штук */
  units: number
  /** Ещё не пришло штук — часть могли принять раньше */
  waiting: number
  /** Хоть одна поставка переносилась или опаздывает */
  late: boolean
}

export function daySuppliers(orders: SupplierOrder[], day: string, today: string, nameOf: (id: string) => string): DaySupplier[] {
  const by = new Map<string, DaySupplier>()
  for (const order of orders) {
    if (!isOpenOrder(order) || calendarDay(order, today) !== day)
      continue
    let entry = by.get(order.supplierId)
    if (!entry) {
      entry = { supplierId: order.supplierId, name: nameOf(order.supplierId), orders: [], positions: 0, units: 0, waiting: 0, late: false }
      by.set(order.supplierId, entry)
    }
    const sum = orderSummary(order)
    entry.orders.push(order)
    entry.positions += sum.positions
    entry.units += sum.units
    entry.waiting += order.lines.filter(l => l.productId).reduce((n, l) => n + remaining(l), 0)
    entry.late ||= (order.postponed ?? 0) > 0 || Boolean(order.expectedAt && order.expectedAt < today)
  }
  for (const entry of by.values())
    entry.orders.sort((a, b) => a.number - b.number)
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/** Сколько поставщиков ждём по дням — метки календаря */
export function dayMarks(orders: SupplierOrder[], today: string, nameOf: (id: string) => string): Map<string, { count: number, labels: string[], late?: boolean }> {
  const days = new Set(orders.map(o => isOpenOrder(o) ? calendarDay(o, today) : null).filter((d): d is string => Boolean(d)))
  const marks = new Map<string, { count: number, labels: string[], late?: boolean }>()
  for (const day of days) {
    const list = daySuppliers(orders, day, today, nameOf)
    marks.set(day, { count: list.length, labels: list.map(s => s.name), late: list.some(s => s.late) })
  }
  return marks
}

/** Что принято в этот день — по поставщикам */
export interface DayReceipt {
  supplierId: string
  name: string
  /** Номера заказов, по которым принимали */
  numbers: number[]
  positions: number
  units: number
  /** Последняя приёмка дня, ISO */
  lastAt: string
}

export function dayReceipts(receipts: DeliveryReceipt[], orders: SupplierOrder[], day: string, nameOf: (id: string) => string): DayReceipt[] {
  const orderById = new Map(orders.map(o => [o.id, o]))
  const by = new Map<string, DayReceipt & { products: Set<string> }>()
  for (const r of receipts) {
    const order = orderById.get(r.orderId)
    if (!order || almatyDay(new Date(r.receivedAt)) !== day)
      continue
    let entry = by.get(order.supplierId)
    if (!entry) {
      entry = { supplierId: order.supplierId, name: nameOf(order.supplierId), numbers: [], positions: 0, units: 0, lastAt: r.receivedAt, products: new Set() }
      by.set(order.supplierId, entry)
    }
    if (!entry.numbers.includes(order.number))
      entry.numbers.push(order.number)
    entry.products.add(r.productId)
    entry.units += r.quantity
    if (r.receivedAt > entry.lastAt)
      entry.lastAt = r.receivedAt
  }
  return [...by.values()]
    .map(({ products, ...e }) => ({ ...e, positions: products.size, numbers: e.numbers.sort((a, b) => a - b) }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

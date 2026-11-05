/**
 * Заказы поставщикам — «К закупке», шаг 2 (31.10.2026): статусы, сводка,
 * приёмка. Данные — `/api/admin/restock` (`orders`), действия — маршруты
 * `/api/admin/restock/orders*` и функции базы `admin_*_supplier_order*`.
 */
import type { OrderSheetLine } from './orderSheet'
import type { DraftRow, RestockItem } from './restockOrder'
import { orderText } from './restockOrder'

export type SupplierOrderStatus = 'ordered' | 'in_transit' | 'received' | 'cancelled'

export interface SupplierOrderLine {
  /** null — товар потом удалили; название и артикул — снимок на момент заказа */
  productId: string | null
  name: string
  sku: string | null
  quantity: number
  received: number
  costPrice: number | null
}

export interface SupplierOrder {
  id: string
  number: number
  supplierId: string
  status: SupplierOrderStatus
  note: string | null
  createdAt: string
  shippedAt: string | null
  closedAt: string | null
  lines: SupplierOrderLine[]
}

export const ORDER_STATUS_LABEL: Record<SupplierOrderStatus, string> = {
  ordered: 'Заказан',
  in_transit: 'В пути',
  received: 'Принят',
  cancelled: 'Отменён',
}

export function isOpenOrder(order: Pick<SupplierOrder, 'status'>): boolean {
  return order.status === 'ordered' || order.status === 'in_transit'
}

/** Сколько ещё должно прийти по строке. */
export function remaining(line: Pick<SupplierOrderLine, 'quantity' | 'received'>): number {
  return Math.max(line.quantity - line.received, 0)
}

export interface OrderSummary {
  positions: number
  units: number
  receivedUnits: number
  /** По закупочной цене — только у строк, где она известна */
  cost: number
  withoutCost: number
}

export function orderSummary(order: Pick<SupplierOrder, 'lines'>): OrderSummary {
  return {
    positions: order.lines.length,
    units: order.lines.reduce((sum, l) => sum + l.quantity, 0),
    receivedUnits: order.lines.reduce((sum, l) => sum + l.received, 0),
    cost: order.lines.reduce((sum, l) => sum + (l.costPrice ?? 0) * l.quantity, 0),
    withoutCost: order.lines.filter(l => l.costPrice == null).length,
  }
}

/** Приёмка по умолчанию — всё, что ещё не пришло. Удалённые товары не принимаются. */
export function receiveDefaults(order: Pick<SupplierOrder, 'lines'>): Record<string, number> {
  const quantities: Record<string, number> = {}
  for (const line of order.lines) {
    if (line.productId)
      quantities[line.productId] = remaining(line)
  }
  return quantities
}

export interface ReceivePlan {
  units: number
  /** Ждут «Сообщить о поступлении» товаров, которых сейчас 0, — им придёт уведомление */
  notified: number
  /** Принимается меньше, чем ещё должно прийти, — заказ останется открытым */
  short: boolean
}

export function receivePlan(
  order: Pick<SupplierOrder, 'lines'>,
  quantities: Record<string, number>,
  products: Map<string, { stock: number, alerts: number }>,
): ReceivePlan {
  let units = 0
  let notified = 0
  let short = false
  for (const line of order.lines) {
    if (!line.productId)
      continue
    const quantity = quantities[line.productId] ?? 0
    units += quantity
    const product = products.get(line.productId)
    if (quantity > 0 && product?.stock === 0)
      notified += product.alerts
    if (quantity < remaining(line))
      short = true
  }
  return { units, notified, short }
}

/** Текст сохранённого заказа — тот же, что уходил поставщику, с номером. */
export function supplierOrderText(order: Pick<SupplierOrder, 'number' | 'createdAt' | 'lines'>): string {
  const rows: DraftRow<RestockItem>[] = order.lines.map((line, i) => ({
    item: { id: line.productId ?? `deleted-${i}`, name: line.name, sku: line.sku, stock: 0, minStock: 0, restockQty: 0, costPrice: line.costPrice },
    quantity: line.quantity,
    manual: false,
  }))
  return orderText(rows, new Date(order.createdAt), order.number)
}

/**
 * Деньги заказа (6 ноября 2026). Владелец: «чтобы писалась общ кол, общ цена
 * и цена за каждый товар и цена за отпуск товара». Закупка — цена
 * поставщика за штуку (снимок в заказе или карточка товара), отпуск — цена,
 * по которой товар продаётся на сайте сейчас (со скидкой). Наценка — только
 * по строкам, где известны обе цены, иначе цифра врала бы.
 */
export interface MoneyLine {
  quantity: number
  costPrice: number | null
  salePrice: number | null
}

export interface OrderMoney {
  units: number
  /** По закупке — строки с ценой закупки */
  cost: number
  /** В продаже — строки с ценой на сайте */
  sale: number
  /** Продажа минус закупка по строкам с обеими ценами; null — таких строк нет */
  margin: number | null
  withoutCost: number
  withoutSale: number
}

export function orderMoney(lines: MoneyLine[]): OrderMoney {
  const live = lines.filter(l => l.quantity > 0)
  const both = live.filter(l => l.costPrice != null && l.salePrice != null)
  return {
    units: live.reduce((n, l) => n + l.quantity, 0),
    cost: live.reduce((n, l) => n + (l.costPrice ?? 0) * l.quantity, 0),
    sale: live.reduce((n, l) => n + (l.salePrice ?? 0) * l.quantity, 0),
    margin: both.length ? both.reduce((n, l) => n + (l.salePrice! - l.costPrice!) * l.quantity, 0) : null,
    withoutCost: live.filter(l => l.costPrice == null).length,
    withoutSale: live.filter(l => l.salePrice == null).length,
  }
}

/** Цена на сайте у товара строки; товар удалён или цены нет — null */
export function salePriceOf(line: Pick<SupplierOrderLine, 'productId'>, products: Map<string, { price: number }>): number | null {
  const price = line.productId ? products.get(line.productId)?.price : undefined
  return price != null && price > 0 ? price : null
}

/** Деньги сохранённого заказа: заказано или уже принято */
export function savedOrderMoney(order: Pick<SupplierOrder, 'lines'>, products: Map<string, { price: number }>, what: 'ordered' | 'received' = 'ordered'): OrderMoney {
  return orderMoney(order.lines.map(l => ({ quantity: what === 'ordered' ? l.quantity : l.received, costPrice: l.costPrice, salePrice: salePriceOf(l, products) })))
}

/** Деньги того, что принимается сейчас */
export function receiveMoney(order: Pick<SupplierOrder, 'lines'>, quantities: Record<string, number>, products: Map<string, { price: number }>): OrderMoney {
  return orderMoney(order.lines.filter(l => l.productId).map(l => ({ quantity: quantities[l.productId!] ?? 0, costPrice: l.costPrice, salePrice: salePriceOf(l, products) })))
}

/**
 * Строки таблицы для поставщика: фото, название, артикул, его цена и
 * количество. Цены продажи и наценки в файле нет — он уходит поставщику.
 */
export function orderSheetLines(
  supplier: string,
  lines: { name: string, sku: string | null, costPrice: number | null, quantity: number, photoUrl: string | null }[],
): OrderSheetLine[] {
  return lines.filter(l => l.quantity > 0).map(l => ({ supplier, name: l.name, article: l.sku, price: l.costPrice, quantity: l.quantity, photoUrl: l.photoUrl, link: null }))
}

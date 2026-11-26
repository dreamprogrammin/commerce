/**
 * Заказы поставщикам — «К закупке», шаг 2 (31.10.2026): статусы, сводка,
 * приёмка. Данные — `/api/admin/restock` (`orders`), действия — маршруты
 * `/api/admin/restock/orders*` и функции базы `admin_*_supplier_order*`.
 */
import type { OrderSheetLine } from './orderSheet'
import type { DraftRow, RestockItem } from './restockOrder'
import { orderText, plural } from './restockOrder'

/** draft — «Формируется» (26.11.2026): копится, поставщику ещё не отправлен */
export type SupplierOrderStatus = 'draft' | 'ordered' | 'in_transit' | 'received' | 'cancelled'

export interface SupplierOrderLine {
  /** Строка заказа — ею правится формирующийся; нет — ответ «К закупке», там правок нет */
  id?: string
  /** null — товар потом удалили; название и артикул — снимок на момент заказа */
  productId: string | null
  name: string
  sku: string | null
  quantity: number
  received: number
  costPrice: number | null
  /** Новый товар скрыт с сайта до первой приёмки (26.11.2026) */
  showOnReceipt?: boolean
}

export interface SupplierOrder {
  id: string
  number: number
  supplierId: string
  status: SupplierOrderStatus
  note: string | null
  createdAt: string
  /** Когда ушёл поставщику; null — формируется. Нет поля — ответ «К закупке» (26.11.2026) */
  orderedAt?: string | null
  /** Примерная дата поставки, ГГГГ-ММ-ДД по Алматы; null — не указана */
  expectedAt?: string | null
  /** День, поставленный руками, — «сначала ждали»; переносы его не трогают (27.11.2026) */
  plannedAt?: string | null
  /** Сколько дней поставка переезжала сама — не пришла в свой день (27.11.2026) */
  postponed?: number
  shippedAt: string | null
  closedAt: string | null
  lines: SupplierOrderLine[]
}

export const ORDER_STATUS_LABEL: Record<SupplierOrderStatus, string> = {
  draft: 'Формируется',
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

/** Ответ «Принять» (`/api/admin/restock/orders/{id}/receive`) */
export interface ReceiveResult {
  status: 'in_transit' | 'received'
  units: number
  notified: number
  received: { product_id: string, quantity: number }[]
  /** Скрытые до приёмки товары, которые она показала (26.11.2026); нет — база до миграции */
  shown?: { product_id: string, slug: string }[]
}

/** Что окну приёмки нужно знать о товаре строки */
export interface ReceiveProduct {
  stock: number
  alerts: number
  price: number
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

/**
 * Текст сохранённого заказа — тот же, что уходил поставщику, с номером.
 * Дата — когда заказ ушёл; формирующийся (`orderedAt: null`) уходит сейчас.
 */
export function supplierOrderText(order: Pick<SupplierOrder, 'number' | 'createdAt' | 'lines' | 'orderedAt'>, now = new Date()): string {
  const rows: DraftRow<RestockItem>[] = order.lines.map((line, i) => ({
    item: { id: line.productId ?? `deleted-${i}`, name: line.name, sku: line.sku, stock: 0, minStock: 0, restockQty: 0, costPrice: line.costPrice },
    quantity: line.quantity,
    manual: false,
  }))
  const date = order.orderedAt ? new Date(order.orderedAt) : order.orderedAt === null ? now : new Date(order.createdAt)
  return orderText(rows, date, order.number)
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

// ---------- Поставки (26.11.2026) ----------

/**
 * «Поставки» — заказы поставщикам от «Формируется» до «Принят» и сверка, как
 * в SAP-портале. Владелец 26.11: «там должна происходить сверка товаров —
 * сколько пришло и сколько нет». Даты — дни по Алматы, ГГГГ-ММ-ДД.
 */

/** Сегодня по Алматы */
export function almatyDay(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(now)
}

/** День через N дней — по календарю, без часовых поясов */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Сколько дней от `from` до `to`; отрицательное — `to` уже прошёл */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** «28.11» */
export function deliveryDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`
}

/** Через сколько дней по умолчанию ждать поставку после «Заказано» */
export const DEFAULT_LEAD_DAYS = 3

const daysWord = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`

export interface ExpectedState {
  /** none — даты нет; ahead — впереди; today — сегодня; late — прошла */
  kind: 'none' | 'ahead' | 'today' | 'late'
  /** Сколько дней до даты или сколько опаздывает */
  days: number
  label: string
}

/** Когда ждать открытый заказ; формирующийся и закрытый — null */
export function expectedState(order: Pick<SupplierOrder, 'status' | 'expectedAt'>, today: string): ExpectedState | null {
  if (!isOpenOrder(order))
    return null
  if (!order.expectedAt)
    return { kind: 'none', days: 0, label: 'дата поставки не указана' }
  const days = daysBetween(today, order.expectedAt)
  const date = deliveryDay(order.expectedAt)
  if (days > 0)
    return { kind: 'ahead', days, label: `ждём ${date} — через ${daysWord(days)}` }
  if (days === 0)
    return { kind: 'today', days: 0, label: `ждём сегодня, ${date}` }
  return { kind: 'late', days: -days, label: `ждали ${date} — опаздывает на ${daysWord(-days)}` }
}

/**
 * Сверка строки: заказано, пришло, не пришло и лишнее. У открытого заказа
 * «не пришло» — ещё ждём, у закрытого — недостача.
 */
export interface LineCheck {
  ordered: number
  received: number
  missing: number
  extra: number
}

export function lineCheck(line: Pick<SupplierOrderLine, 'quantity' | 'received'>): LineCheck {
  return {
    ordered: line.quantity,
    received: line.received,
    missing: Math.max(line.quantity - line.received, 0),
    extra: Math.max(line.received - line.quantity, 0),
  }
}

export interface OrderCheck extends LineCheck {
  positions: number
  /** Строк: пришло ровно, пришло не всё, пришло больше, не пришло ничего */
  full: number
  short: number
  over: number
  none: number
}

/** Сверка заказа — по строкам и в штуках */
export function orderCheck(order: Pick<SupplierOrder, 'lines'>): OrderCheck {
  const sum: OrderCheck = { positions: order.lines.length, ordered: 0, received: 0, missing: 0, extra: 0, full: 0, short: 0, over: 0, none: 0 }
  for (const line of order.lines) {
    const c = lineCheck(line)
    sum.ordered += c.ordered
    sum.received += c.received
    sum.missing += c.missing
    sum.extra += c.extra
    if (!c.received && c.ordered)
      sum.none++
    else if (c.missing)
      sum.short++
    else if (c.extra)
      sum.over++
    else
      sum.full++
  }
  return sum
}

/** Товар строки поставки — сегодняшний, не снимок в заказе */
export interface DeliveryProduct {
  name: string
  slug: string | null
  imageUrl: string | null
  /** Цена на сайте со скидкой */
  price: number
  stock: number
  /** Подписаны на «Сообщить о поступлении» */
  alerts: number
  /** Виден на сайте */
  active: boolean
}

/** Строка журнала приёмки (`stock_receipts`) */
export interface DeliveryReceipt {
  orderId: string
  productId: string
  quantity: number
  receivedAt: string
}

/** Ответ `/api/admin/deliveries` */
export interface DeliveriesData {
  /** false — миграция 20261126140000 не применена: дат и формирующихся нет, принимать можно */
  ready: boolean
  /** false — миграции 20261127120000 нет: поставки сами не переносятся */
  rollover?: boolean
  /** false — нет и самих заказов (до 20261031160000) */
  ordersReady: boolean
  /** Сегодня по Алматы, ГГГГ-ММ-ДД — по часам сервера */
  today: string
  suppliers: { id: string, name: string, phone: string | null }[]
  orders: SupplierOrder[]
  products: Record<string, DeliveryProduct>
  receipts: DeliveryReceipt[]
}

/*
 * Календарь поставок и переход к поставщику (27 ноября 2026). Владелец 26.11:
 * «если товаров от разных поставщиков много, мы должны перейти к поставщику,
 * который доставляет нам товар; мы планируем время ожидания поставки, у нас
 * там должен быть календарь; если поставка сегодня не пришла, она переносится
 * на следующий день». Переносит база ночью (миграция 20261127120000).
 */

/** «перенесена 2 раза · сначала ждали 24.11»; не переносилась — null */
export function postponedText(order: Pick<SupplierOrder, 'postponed' | 'plannedAt'>): string | null {
  const n = order.postponed ?? 0
  if (n <= 0)
    return null
  const times = `перенесена ${n} ${plural(n, 'раз', 'раза', 'раз')}`
  return order.plannedAt ? `${times} · сначала ждали ${deliveryDay(order.plannedAt)}` : times
}

/**
 * День в календаре: открытый заказ — в свой день; прошедший (ночью ещё не
 * перенесён) — уже сегодня: туда его и перенесут. Без даты — null.
 */
export function calendarDay(order: Pick<SupplierOrder, 'status' | 'expectedAt'>, today: string): string | null {
  if (!isOpenOrder(order) || !order.expectedAt)
    return null
  return order.expectedAt < today ? today : order.expectedAt
}

/** Открытые заказы по дням календаря */
export function ordersByDay<T extends Pick<SupplierOrder, 'status' | 'expectedAt'>>(orders: T[], today: string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const order of orders) {
    const day = calendarDay(order, today)
    if (!day)
      continue
    const list = map.get(day) ?? []
    list.push(order)
    map.set(day, list)
  }
  return map
}

export interface CalendarCell {
  /** ГГГГ-ММ-ДД */
  day: string
  /** Число месяца */
  date: number
  /** День этого месяца, а не соседнего */
  inMonth: boolean
}

/** Сетка месяца `ГГГГ-ММ` — недели с понедельника, дни соседних месяцев добивают края */
export function monthGrid(month: string): CalendarCell[][] {
  const first = `${month}-01`
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const nextMonth = addDays(first, 32).slice(0, 7)
  const last = addDays(`${nextMonth}-01`, -1)
  const lastWeekday = (new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7
  const start = addDays(first, -weekday)
  const end = addDays(last, 6 - lastWeekday)
  const weeks: CalendarCell[][] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (!weeks.length || weeks.at(-1)!.length === 7)
      weeks.push([])
    weeks.at(-1)!.push({ day, date: Number(day.slice(8, 10)), inMonth: day.slice(0, 7) === month })
  }
  return weeks
}

/** Соседний месяц `ГГГГ-ММ` */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
/** «Ноябрь 2026» */
export function monthTitle(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

const WEEKDAYS_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
/** «27 ноября, пятница» */
export function longDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}, ${WEEKDAYS_LONG[d.getUTCDay()]}`
}

/** Поставщик в списке «Поставок» */
export interface SupplierDeliveries {
  supplierId: string
  /** Открытые заказы — по дню календаря */
  waiting: SupplierOrder[]
  /** Формирующийся заказ, если есть */
  forming: SupplierOrder | null
  /** Ближайший день поставки (прошедшие — сегодня); null — дат нет */
  nextDay: string | null
  /** Заказов, которые ждём сегодня (с перенесёнными) */
  today: number
  /** Переносились — самый большой счёт среди открытых */
  postponed: number
  /** Где поставщик в списке */
  group: 'today' | 'ahead' | 'nodate' | 'forming'
}

/**
 * Поставщики с поставками — для списка «Поставок»: сначала те, кого ждём
 * сегодня, потом по ближайшей дате, потом без даты, в конце — у кого только
 * формируется заказ. Закрытые заказы в список не попадают.
 */
export function supplierDeliveries(orders: SupplierOrder[], today: string, nameOf: (id: string) => string): SupplierDeliveries[] {
  const by = new Map<string, SupplierDeliveries>()
  const entry = (id: string) => {
    let e = by.get(id)
    if (!e) {
      e = { supplierId: id, waiting: [], forming: null, nextDay: null, today: 0, postponed: 0, group: 'forming' }
      by.set(id, e)
    }
    return e
  }
  for (const order of orders) {
    if (order.status === 'draft')
      entry(order.supplierId).forming = order
    else if (isOpenOrder(order))
      entry(order.supplierId).waiting.push(order)
  }
  const rank = { today: 0, ahead: 1, nodate: 2, forming: 3 } as const
  const list = [...by.values()]
  for (const e of list) {
    const days = e.waiting.map(o => calendarDay(o, today)).filter((d): d is string => Boolean(d)).sort()
    e.nextDay = days[0] ?? null
    e.today = days.filter(d => d === today).length
    e.postponed = Math.max(0, ...e.waiting.map(o => o.postponed ?? 0), ...e.waiting.map(o => o.expectedAt && o.expectedAt < today ? daysBetween(o.expectedAt, today) : 0))
    e.waiting.sort((a, b) => (calendarDay(a, today) ?? '9999-12-31').localeCompare(calendarDay(b, today) ?? '9999-12-31') || a.number - b.number)
    e.group = e.today ? 'today' : e.nextDay ? 'ahead' : e.waiting.length ? 'nodate' : 'forming'
  }
  return list.sort((a, b) => rank[a.group] - rank[b.group]
    || (a.nextDay ?? '').localeCompare(b.nextDay ?? '')
    || nameOf(a.supplierId).localeCompare(nameOf(b.supplierId), 'ru'))
}

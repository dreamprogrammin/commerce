import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchasingStatus } from '~/utils/smartPurchasing'
import type { DeliveriesData, DeliveryProduct, DeliveryReceipt, SupplierOrder, SupplierOrderStatus } from '~/utils/supplierOrders'
import { almatyDay } from '~/utils/supplierOrders'

/**
 * «Поставки» (26 ноября 2026) — заказы поставщикам от «Формируется» до
 * «Принят» и сверка по строкам. Владелец 26.11: «ещё один раздел — поставки
 * от поставщиков, в которых будут сформированы заказы при добавлении, с
 * примерной датой ожидания, и там должна происходить сверка товаров: сколько
 * пришло и сколько нет, как в SAP-портале».
 *
 * Формирующиеся и открытые — все, закрытые — за 60 дней. Товары строк — и
 * скрытые с сайта: новый товар из «На сайт» скрыт до первой приёмки.
 *
 * До миграции 20261126140000 колонок поставок нет (превью `dev` смотрит в
 * боевую базу): тогда `ready: false`, заказы — без дат и формирующихся, как в
 * «К закупке», и принимать по ним можно. Таблиц заказов нет совсем
 * (до 20261031160000) — заказов нет.
 *
 * Только с клиентом сервиса после `requireAdmin`.
 */

const CLOSED_DAYS = 60
const DAY = 86_400_000
/** id в одном `in(...)`: сотня UUID — около 4 КБ адреса */
const CHUNK = 100
const PAGE = 1000

const ORDER_COLUMNS = 'id, number, supplier_id, status, note, created_at, shipped_at, closed_at'
const ITEM_COLUMNS = 'product_id, product_name, sku, quantity, received_quantity, cost_price'

interface ItemRow {
  id?: string
  product_id: string | null
  product_name: string
  sku: string | null
  quantity: number
  received_quantity: number
  cost_price: number | string | null
  show_on_receipt?: boolean
}

interface OrderRow {
  id: string
  number: number
  supplier_id: string
  status: SupplierOrderStatus
  note: string | null
  created_at: string
  ordered_at?: string | null
  expected_at?: string | null
  shipped_at: string | null
  closed_at: string | null
  supplier_order_items: ItemRow[]
}

/** Таблиц нет: вложенный запрос — PGRST200, простой — 42P01 (PostgREST 12) или PGRST205 (13) */
const NO_TABLES = new Set(['PGRST200', 'PGRST205', '42P01'])

function toOrder(o: OrderRow, ready: boolean): SupplierOrder {
  return {
    id: o.id,
    number: o.number,
    supplierId: o.supplier_id,
    status: o.status,
    note: o.note,
    createdAt: o.created_at,
    // До миграции заказ уходил поставщику, когда его сохранили
    orderedAt: ready ? o.ordered_at ?? null : o.created_at,
    expectedAt: ready ? o.expected_at ?? null : null,
    shippedAt: o.shipped_at,
    closedAt: o.closed_at,
    lines: o.supplier_order_items
      .map(i => ({
        ...(i.id ? { id: i.id } : {}),
        productId: i.product_id,
        name: i.product_name,
        sku: i.sku,
        quantity: i.quantity,
        received: i.received_quantity,
        costPrice: i.cost_price == null ? null : Number(i.cost_price),
        showOnReceipt: i.show_on_receipt === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}

async function loadOrders(db: SupabaseClient, now: Date): Promise<{ ready: boolean, orders: SupplierOrder[] | null }> {
  const since = new Date(now.getTime() - CLOSED_DAYS * DAY).toISOString()
  const query = (orderColumns: string, itemColumns: string) => db.from('supplier_orders')
    .select(`${orderColumns}, supplier_order_items(${itemColumns})`)
    .or(`status.in.(draft,ordered,in_transit),closed_at.gte.${since}`)
    .order('number', { ascending: false })
    .limit(500)

  const full = await query(`${ORDER_COLUMNS}, ordered_at, expected_at`, `id, ${ITEM_COLUMNS}, show_on_receipt`)
  if (!full.error)
    return { ready: true, orders: (full.data as unknown as OrderRow[] ?? []).map(o => toOrder(o, true)) }
  if (NO_TABLES.has(full.error.code)) {
    console.warn('[deliveries] заказов поставщикам нет — миграция 20261031160000 не применена?', full.error.code)
    return { ready: false, orders: null }
  }
  if (full.error.code !== '42703')
    throw createError({ statusCode: 500, message: full.error.message })

  // Колонок поставок нет — миграция 20261126140000 не применена. Статуса
  // draft тогда тоже нет: в фильтре он просто ничего не найдёт
  console.warn('[deliveries] колонок поставок нет — миграция 20261126140000 не применена?', full.error.message)
  const old = await query(ORDER_COLUMNS, ITEM_COLUMNS)
  if (old.error)
    throw createError({ statusCode: 500, message: old.error.message })
  return { ready: false, orders: (old.data as unknown as OrderRow[] ?? []).map(o => toOrder(o, false)) }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK)
    out.push(items.slice(i, i + CHUNK))
  return out
}

/** Все строки по кускам id: PostgREST отдаёт не больше 1000 за раз */
async function byIds<T>(ids: string[], page: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (const part of chunks(ids)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(part, from, from + PAGE - 1)
      if (error)
        throw createError({ statusCode: 500, message: error.message })
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE)
        break
    }
  }
  return rows
}

export async function loadDeliveries(db: SupabaseClient, now = new Date()): Promise<DeliveriesData> {
  const [suppliersRes, { ready, orders }] = await Promise.all([
    db.from('suppliers').select('id, name, phone').order('name'),
    loadOrders(db, now),
  ])
  if (suppliersRes.error)
    throw createError({ statusCode: 500, message: suppliersRes.error.message })

  const list = orders ?? []
  const productIds = [...new Set(list.flatMap(o => o.lines.map(l => l.productId)).filter((id): id is string => Boolean(id)))]
  const orderIds = list.map(o => o.id)

  const [productRows, alertRows, receiptRows] = await Promise.all([
    byIds<{
      id: string
      name: string
      slug: string | null
      price: number
      final_price: number | null
      stock_quantity: number | null
      is_active: boolean
      product_images: { image_url: string }[]
    }>(productIds, (ids, from, to) => db.from('products')
      .select('id, name, slug, price, final_price, stock_quantity, is_active, product_images(image_url)')
      .in('id', ids)
      .order('id')
      .order('display_order', { referencedTable: 'product_images' })
      .limit(1, { referencedTable: 'product_images' })
      .range(from, to)),
    byIds<{ product_id: string }>(productIds, (ids, from, to) => db.from('stock_alerts')
      .select('product_id')
      .in('product_id', ids)
      .order('product_id')
      .order('user_id')
      .range(from, to)),
    byIds<{ order_id: string, product_id: string, quantity: number, received_at: string }>(orderIds, (ids, from, to) => db.from('stock_receipts')
      .select('order_id, product_id, quantity, received_at')
      .in('order_id', ids)
      .order('received_at')
      .order('id')
      .range(from, to)),
  ])

  const alerts = new Map<string, number>()
  for (const row of alertRows)
    alerts.set(row.product_id, (alerts.get(row.product_id) ?? 0) + 1)

  const products: Record<string, DeliveryProduct> = {}
  for (const p of productRows) {
    products[p.id] = {
      name: p.name.trim(),
      slug: p.slug,
      imageUrl: p.product_images[0]?.image_url ?? null,
      price: Number(p.final_price || p.price || 0),
      stock: p.stock_quantity ?? 0,
      alerts: alerts.get(p.id) ?? 0,
      active: p.is_active,
    }
  }

  const receipts: DeliveryReceipt[] = receiptRows.map(r => ({
    orderId: r.order_id,
    productId: r.product_id,
    quantity: r.quantity,
    receivedAt: r.received_at,
  }))

  return {
    ready,
    ordersReady: orders !== null,
    today: almatyDay(now),
    suppliers: (suppliersRes.data ?? []).map(s => ({ id: s.id, name: s.name?.trim() || 'Без названия', phone: s.phone || null })),
    orders: list,
    products,
    receipts,
  }
}

/** Счётчики «Поставок» для дашборда «Умный закуп»; null — миграции 20261126140000 нет */
export async function deliveriesSummary(db: SupabaseClient, now = new Date()): Promise<PurchasingStatus['deliveries']> {
  const { data, error } = await db.from('supplier_orders')
    .select('status, expected_at, supplier_order_items(id)')
    .in('status', ['draft', 'ordered', 'in_transit'])
  if (error) {
    if (error.code === '42703' || NO_TABLES.has(error.code))
      return null
    throw createError({ statusCode: 500, message: error.message })
  }
  const today = almatyDay(now)
  const rows = (data ?? []) as unknown as { status: SupplierOrderStatus, expected_at: string | null, supplier_order_items: { id: string }[] }[]
  const drafts = rows.filter(r => r.status === 'draft')
  const open = rows.filter(r => r.status !== 'draft')
  return {
    forming: drafts.length,
    formingPositions: drafts.reduce((n, r) => n + r.supplier_order_items.length, 0),
    waiting: open.length,
    late: open.filter(r => r.expected_at && r.expected_at < today).length,
  }
}

/** Дата поставки из тела: ГГГГ-ММ-ДД или пусто (null). Прошлое и дальше года отвергает база. */
export function parseExpectedDay(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '')
    return null
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
    || new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) {
    throw createError({ statusCode: 400, message: 'Дата поставки — ГГГГ-ММ-ДД' })
  }
  return raw
}

/**
 * Отказ функции поставок. Функции нет (PGRST202) — миграция 20261126140000
 * не применена: 409 с понятным текстом, а не 500.
 */
export function throwDeliveryRpcError(error: { code?: string, message: string }): never {
  if (error.code === 'PGRST202')
    throw createError({ statusCode: 409, message: 'Поставки на базе ещё не включены — нужна миграция 20261126140000' })
  throwRpcError(error)
}

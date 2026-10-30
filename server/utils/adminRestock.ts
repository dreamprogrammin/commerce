import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Данные «К закупке» (30 октября 2026): поставщики, активные товары и спрос
 * по каждому. Владелец: заказ — по поставщику, спрос — не только из корзин.
 *
 * Продажи считаются по самим заказам, а не по `products.sales_count`: счётчик
 * на бою сломан (в сумме 1 при 12 проданных штуках — docs/HANDOFF.md).
 * Продажа — заказ сайта или кассы в любом статусе, кроме отменённого, за
 * вычетом возвратов. «Только выполненные» не годятся: касса без покупателя
 * пишет гостевой заказ со статусом `new`, с покупателем — `completed`.
 *
 * Только с клиентом сервиса после `requireAdmin`: заказы, корзины и избранное
 * чужих покупателей RLS не отдаёт.
 */

export interface RestockSupplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  address: string | null
}

export interface RestockProduct {
  id: string
  name: string
  sku: string | null
  slug: string | null
  imageUrl: string | null
  /** Цена продажи со скидкой */
  price: number
  costPrice: number | null
  stock: number
  minStock: number
  restockQty: number
  supplierId: string | null
  sold30: number
  sold90: number
  /** Сколько покупателей держат товар в корзине и сколько там штук */
  cartCustomers: number
  cartUnits: number
  /** Подписаны на «Сообщить о поступлении» */
  alerts: number
  wishlist: number
}

export interface SaleRow {
  productId: string
  quantity: number
  /** Дата заказа; у возврата — дата заказа, из которого вернули */
  orderedAt: string
}

const DAY = 86_400_000

/** Продано по товарам за 30 и 90 дней от `now`: строки заказов минус возвраты. */
export function aggregateSales(sold: SaleRow[], returned: SaleRow[], now: Date): Map<string, { sold30: number, sold90: number }> {
  const result = new Map<string, { sold30: number, sold90: number }>()
  const add = (row: SaleRow, sign: 1 | -1) => {
    const age = now.getTime() - new Date(row.orderedAt).getTime()
    if (age < 0 || age > 90 * DAY)
      return
    const entry = result.get(row.productId) ?? { sold30: 0, sold90: 0 }
    entry.sold90 += sign * row.quantity
    if (age <= 30 * DAY)
      entry.sold30 += sign * row.quantity
    result.set(row.productId, entry)
  }
  sold.forEach(row => add(row, 1))
  returned.forEach(row => add(row, -1))
  for (const entry of result.values()) {
    entry.sold30 = Math.max(entry.sold30, 0)
    entry.sold90 = Math.max(entry.sold90, 0)
  }
  return result
}

const PAGE = 1000

/** Все строки запроса страницами: PostgREST отдаёт не больше 1000 за раз. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error)
      throw createError({ statusCode: 500, message: error.message })
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE)
      return rows
  }
}

function countBy(rows: { product_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows)
    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1)
  return counts
}

interface ItemRow { product_id: string, quantity: number }

async function loadSales(db: SupabaseClient, now: Date) {
  const since = new Date(now.getTime() - 90 * DAY).toISOString()
  const [orders, checkouts] = await Promise.all([
    fetchAll<{ id: string, created_at: string, order_items: ItemRow[] }>((from, to) => db.from('orders')
      .select('id, created_at, order_items(product_id, quantity)')
      .neq('status', 'cancelled')
      .gte('created_at', since)
      .order('id')
      .range(from, to)),
    fetchAll<{ id: string, created_at: string, guest_checkout_items: ItemRow[] }>((from, to) => db.from('guest_checkouts')
      .select('id, created_at, guest_checkout_items(product_id, quantity)')
      .neq('status', 'cancelled')
      .gte('created_at', since)
      .order('id')
      .range(from, to)),
  ])
  const sold: SaleRow[] = [
    ...orders.flatMap(o => o.order_items.map(i => ({ productId: i.product_id, quantity: i.quantity, orderedAt: o.created_at }))),
    ...checkouts.flatMap(c => c.guest_checkout_items.map(i => ({ productId: i.product_id, quantity: i.quantity, orderedAt: c.created_at }))),
  ]

  // Возврат пишется позже продажи: всё, что вернули из заказов окна, создано после его начала
  const orderedAt = new Map([...orders, ...checkouts].map(o => [o.id, o.created_at]))
  const returns = await fetchAll<{ id: string, order_id: string | null, guest_checkout_id: string | null }>((from, to) => db.from('order_returns')
    .select('id, order_id, guest_checkout_id')
    .gte('created_at', since)
    .order('id')
    .range(from, to))
  const returnDate = new Map(returns
    .map(r => [r.id, orderedAt.get(r.order_id ?? r.guest_checkout_id ?? '')] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1])))
  const returnItems = returnDate.size
    ? await fetchAll<{ return_id: string, product_id: string, quantity: number }>((from, to) => db.from('order_return_items')
        .select('return_id, product_id, quantity')
        .in('return_id', [...returnDate.keys()])
        .order('id')
        .range(from, to))
    : []
  const returned = returnItems.map(i => ({ productId: i.product_id, quantity: i.quantity, orderedAt: returnDate.get(i.return_id)! }))

  return aggregateSales(sold, returned, now)
}

export async function loadRestock(db: SupabaseClient, now = new Date()): Promise<{ suppliers: RestockSupplier[], products: RestockProduct[] }> {
  const [suppliersRes, products, sales, carts, alerts, wishlist] = await Promise.all([
    db.from('suppliers').select('id, name, contact_person, phone, address').order('name'),
    fetchAll<{
      id: string
      name: string
      sku: string | null
      slug: string | null
      price: number
      final_price: number | null
      cost_price: number | null
      stock_quantity: number | null
      min_stock_level: number
      restock_quantity: number
      supplier_id: string | null
      product_images: { image_url: string }[]
    }>((from, to) => db.from('products')
      .select('id, name, sku, slug, price, final_price, cost_price, stock_quantity, min_stock_level, restock_quantity, supplier_id, product_images(image_url)')
      .eq('is_active', true)
      .order('id')
      .order('display_order', { referencedTable: 'product_images' })
      .limit(1, { referencedTable: 'product_images' })
      .range(from, to)),
    loadSales(db, now),
    loadCarts(db, { guests: true }),
    fetchAll<{ product_id: string }>((from, to) => db.from('stock_alerts').select('product_id').order('product_id').order('user_id').range(from, to)),
    fetchAll<{ product_id: string }>((from, to) => db.from('wishlist').select('product_id').order('product_id').order('user_id').range(from, to)),
  ])
  if (suppliersRes.error)
    throw createError({ statusCode: 500, message: suppliersRes.error.message })

  const inCarts = new Map<string, { customers: number, units: number }>()
  for (const cart of carts) {
    for (const item of cart.items) {
      const entry = inCarts.get(item.productId) ?? { customers: 0, units: 0 }
      entry.customers += 1
      entry.units += item.quantity
      inCarts.set(item.productId, entry)
    }
  }
  const alertCount = countBy(alerts)
  const wishlistCount = countBy(wishlist)

  return {
    suppliers: (suppliersRes.data ?? []).map(s => ({
      id: s.id,
      name: s.name?.trim() || 'Без названия',
      contact: s.contact_person || null,
      phone: s.phone || null,
      address: s.address || null,
    })),
    products: products.map(p => ({
      id: p.id,
      name: p.name.trim(),
      sku: p.sku?.trim() || null,
      slug: p.slug,
      imageUrl: p.product_images[0]?.image_url ?? null,
      price: Number(p.final_price || p.price || 0),
      // 0 — не заполнено, а не бесплатно (на бою 30.10.2026 таких двое): в сумму
      // заказа не идёт, в итогах считается «без цены закупки»
      costPrice: Number(p.cost_price) > 0 ? Number(p.cost_price) : null,
      stock: p.stock_quantity ?? 0,
      minStock: p.min_stock_level,
      restockQty: p.restock_quantity,
      supplierId: p.supplier_id,
      sold30: sales.get(p.id)?.sold30 ?? 0,
      sold90: sales.get(p.id)?.sold90 ?? 0,
      cartCustomers: inCarts.get(p.id)?.customers ?? 0,
      cartUnits: inCarts.get(p.id)?.units ?? 0,
      alerts: alertCount.get(p.id) ?? 0,
      wishlist: wishlistCount.get(p.id) ?? 0,
    })),
  }
}

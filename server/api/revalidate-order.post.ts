/**
 * Сброс кеша карточек товаров из только что оформленного заказа (9 октября 2026).
 *
 * Кеш страниц суточный, а заказ уменьшает остаток («осталось 2 шт.», «в
 * наличии»). Продать лишнего касса не даст — `create_guest_checkout` и
 * `create_user_order` сверяют остаток, — но показывать проданное как
 * доступное до суток незачем. Корзина зовёт этот адрес сразу после заказа.
 *
 * Публичный, поэтому принимает только заказ не старше 15 минут и сбрасывает
 * только страницы его товаров; повтор по тому же заказу на этом экземпляре
 * сервера пропускается. Ничего, кроме числа сброшенных страниц, не отдаёт.
 */
const RECENT_MS = 15 * 60 * 1000
const seen = new Map<string, number>()

export default defineEventHandler(async (event) => {
  const body = await readBody<{ orderId?: unknown }>(event)
  const [orderId] = uuidList(body?.orderId ? [body.orderId] : [])
  if (!orderId)
    throw createError({ statusCode: 400, message: 'Не указан заказ' })

  const now = Date.now()
  for (const [id, at] of seen) {
    if (at < now - RECENT_MS)
      seen.delete(id)
  }
  if (seen.has(orderId))
    return { revalidated: 0, skipped: 'уже сброшено' }

  const db = serviceSupabase()
  let createdAt: string | null = null
  let items: { product_id: string }[] = []
  const { data: guest } = await db.from('guest_checkouts').select('created_at').eq('id', orderId).maybeSingle()
  if (guest) {
    createdAt = guest.created_at
    items = (await db.from('guest_checkout_items').select('product_id').eq('checkout_id', orderId)).data ?? []
  }
  else {
    const { data: order } = await db.from('orders').select('created_at').eq('id', orderId).maybeSingle()
    if (order) {
      createdAt = order.created_at
      items = (await db.from('order_items').select('product_id').eq('order_id', orderId)).data ?? []
    }
  }
  if (!createdAt)
    throw createError({ statusCode: 404, message: 'Заказ не найден' })
  if (new Date(createdAt).getTime() < now - RECENT_MS)
    return { revalidated: 0, skipped: 'заказ старше 15 минут' }

  seen.set(orderId, now)
  const productIds = [...new Set(items.map(i => i.product_id))].slice(0, 30)
  return runRevalidation(event, db, { productIds })
})

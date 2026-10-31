/**
 * «Принять» — пришедший товар прибавляется к остатку (шаг 2, 31.10.2026).
 * Тело: `{ items: [{ productId, quantity }], close? }`; `close` — «остального
 * не будет», закрыть заказ, даже если принято не всё.
 *
 * Остаток 0 → N будит `trigger_back_in_stock`: ждавшие товар получают «Товар
 * снова в наличии» — в ответе `notified`, сколько их. Кеш страниц товара
 * после приёмки сбрасывает страница (`adminRevalidateStore.flushNow`).
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const orderId = orderIdParam(getRouterParam(event, 'id'))
  const body = await readBody<{ items?: unknown, close?: unknown }>(event)
  const items = parseOrderItems(body?.items, 0)

  const { data, error } = await db.rpc('admin_receive_supplier_order', {
    p_order_id: orderId,
    p_items: items,
    p_admin_id: event.context.adminId,
    p_close: body?.close === true,
  })
  if (error)
    throwRpcError(error)
  return data as {
    id: string
    number: number
    status: 'in_transit' | 'received'
    units: number
    notified: number
    received: { product_id: string, quantity: number, stock_before: number, stock_after: number, notified: number }[]
  }
})

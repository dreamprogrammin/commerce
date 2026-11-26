/** Примерная дата поставки открытого заказа: `{ expectedAt }` — ГГГГ-ММ-ДД или пусто. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const orderId = orderIdParam(getRouterParam(event, 'id'))
  const body = await readBody<{ expectedAt?: unknown }>(event)
  const expectedAt = parseExpectedDay(body?.expectedAt)

  const { data, error } = await db.rpc('admin_set_supplier_order_expected', {
    p_order_id: orderId,
    p_expected_at: expectedAt,
    p_admin_id: event.context.adminId,
  })
  if (error)
    throwDeliveryRpcError(error)
  return data as { id: string, number: number, expected_at: string | null }
})

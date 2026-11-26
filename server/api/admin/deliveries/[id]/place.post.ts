/**
 * «Заказано»: формирующийся заказ ушёл поставщику. Тело: `{ expectedAt }` —
 * примерная дата поставки, ГГГГ-ММ-ДД по Алматы, или пусто. Следующий товар
 * этого поставщика из «На сайт» ляжет уже в новый заказ.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const orderId = orderIdParam(getRouterParam(event, 'id'))
  const body = await readBody<{ expectedAt?: unknown }>(event)
  const expectedAt = parseExpectedDay(body?.expectedAt)

  const { data, error } = await db.rpc('admin_place_supplier_order', {
    p_order_id: orderId,
    p_expected_at: expectedAt,
    p_admin_id: event.context.adminId,
  })
  if (error)
    throwDeliveryRpcError(error)
  return data as { id: string, number: number, status: 'ordered', expected_at: string | null }
})

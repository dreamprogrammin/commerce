/**
 * Статус заказа поставщику: «В пути» (`in_transit`), назад в «Заказан»
 * (`ordered`), «Отменить» (`cancelled`), «Закрыть» частично принятый
 * (`received`). Какие переходы можно — решает `admin_set_supplier_order_status`.
 */
const STATUSES = new Set(['ordered', 'in_transit', 'cancelled', 'received'])

export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const orderId = orderIdParam(getRouterParam(event, 'id'))
  const body = await readBody<{ status?: unknown }>(event)
  const status = typeof body?.status === 'string' ? body.status : ''
  if (!STATUSES.has(status))
    throw createError({ statusCode: 400, message: 'Неизвестный статус' })

  const { data, error } = await db.rpc('admin_set_supplier_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_admin_id: event.context.adminId,
  })
  if (error)
    throwRpcError(error)
  return data as { id: string, status: string }
})

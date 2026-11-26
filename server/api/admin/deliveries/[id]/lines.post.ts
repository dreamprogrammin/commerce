/**
 * Состав формирующегося заказа: `{ items: [{ lineId, quantity }] }`;
 * 0 — убрать строку. Строк не осталось — заказа нет (`deleted: true`).
 * Отправленный поставщику заказ не меняется — `admin_edit_supplier_draft`.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const orderId = orderIdParam(getRouterParam(event, 'id'))
  const body = await readBody<{ items?: unknown }>(event)
  const raw = body?.items
  if (!Array.isArray(raw) || !raw.length || raw.length > 300)
    throw createError({ statusCode: 400, message: 'Не переданы строки заказа' })
  const items = raw.map((row) => {
    const lineId = row?.lineId
    const quantity = Number(row?.quantity)
    if (!isUuid(lineId))
      throw createError({ statusCode: 400, message: 'Не указана строка заказа' })
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 9999)
      throw createError({ statusCode: 400, message: 'Количество — целое число от 0 до 9999' })
    return { line_id: lineId, quantity }
  })

  const { data, error } = await db.rpc('admin_edit_supplier_draft', {
    p_order_id: orderId,
    p_items: items,
    p_admin_id: event.context.adminId,
  })
  if (error)
    throwDeliveryRpcError(error)
  return data as { id: string, number: number, positions: number, deleted: boolean }
})

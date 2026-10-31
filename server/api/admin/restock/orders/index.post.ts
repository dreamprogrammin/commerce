/**
 * «Заказал» — заказ поставщику из черновика «К закупке» сохраняется в базу
 * (шаг 2, 31.10.2026). Тело: `{ supplierId, items: [{ productId, quantity }], note? }`.
 * Всё делает `admin_create_supplier_order` одной транзакцией — она открыта
 * только ключу сервиса, кто заказал, передаём сами: id из `requireAdmin`.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ supplierId?: unknown, items?: unknown, note?: unknown }>(event)
  const supplierId = body?.supplierId
  if (!isUuid(supplierId))
    throw createError({ statusCode: 400, message: 'Не указан поставщик' })
  const items = parseOrderItems(body?.items, 1)
  if (!items.length)
    throw createError({ statusCode: 400, message: 'Заказ пуст' })
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  const { data, error } = await db.rpc('admin_create_supplier_order', {
    p_supplier_id: supplierId,
    p_items: items,
    p_admin_id: event.context.adminId,
    p_note: note,
  })
  if (error)
    throwRpcError(error)
  return data as { id: string, number: number, positions: number }
})

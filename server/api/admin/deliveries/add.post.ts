/**
 * «На сайт» → заказ поставщику (26.11.2026). Владелец: «товар, который
 * добавляется на сайт, автоматически должен добавляться в заказ к
 * поставщику». Тело: `{ productId, quantity, showOnReceipt }`. Товар ложится
 * в формирующийся заказ своего поставщика (нет — заводится); тот же товар —
 * количество прибавляется. `showOnReceipt` — товар скрыт с сайта до первой
 * приёмки. Всё решает `admin_add_to_supplier_draft`.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ productId?: unknown, quantity?: unknown, showOnReceipt?: unknown }>(event)
  const productId = body?.productId
  const quantity = Number(body?.quantity)
  if (!isUuid(productId))
    throw createError({ statusCode: 400, message: 'Не указан товар' })
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999)
    throw createError({ statusCode: 400, message: 'Количество — целое число от 1 до 9999' })

  const { data, error } = await db.rpc('admin_add_to_supplier_draft', {
    p_product_id: productId,
    p_quantity: quantity,
    p_admin_id: event.context.adminId,
    p_show_on_receipt: body?.showOnReceipt === true,
  })
  if (error)
    throwDeliveryRpcError(error)
  return data as { id: string, number: number, positions: number, created: boolean }
})

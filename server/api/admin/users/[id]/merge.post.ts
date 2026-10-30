/**
 * Объединить карточку магазина с аккаунтом сайта: покупки и бонусы карточки
 * переходят в аккаунт `<id>`.
 *
 * Зачем (30 октября 2026). Покупатель, заведённый кассой по телефону, потом
 * входит на сайт через Google. Телефон в профиле он вписывает сам и никто его
 * не подтверждает — поэтому слияние не автоматическое, а кнопкой (решение
 * владельца): администратор жмёт, убедившись, что это тот же человек. Всё
 * делает `admin_merge_offline_customer` одной транзакцией.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ offlineCustomerId?: unknown }>(event)
  const cardId = typeof body?.offlineCustomerId === 'string' ? body.offlineCustomerId : ''
  const uuid = /^[0-9a-f-]{36}$/i
  if (!id || !uuid.test(id) || !uuid.test(cardId))
    throw createError({ statusCode: 400, message: 'Неверный id' })

  const { data, error } = await db.rpc('admin_merge_offline_customer', {
    p_customer_id: cardId,
    p_profile_id: id,
    p_admin_id: event.context.adminId,
  })
  if (error)
    throw createError({ statusCode: 400, message: error.message })
  return data as { orders: number, active_moved: number, pending_moved: number }
})

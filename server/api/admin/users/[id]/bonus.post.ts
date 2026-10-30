/**
 * Ручное начисление бонусов покупателю из его карточки в админке.
 *
 * Зачем (30 октября 2026). Владелец: «отправить бонусы, если вдруг они не
 * были зачислены». Начисленное доступно сразу (решение владельца). Всё
 * делает `admin_add_bonus` одной транзакцией — функция открыта только ключу
 * сервиса, поэтому кто начислил, передаём сами: id из `requireAdmin`.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 400, message: 'Неверный id' })

  const body = await readBody<{ amount?: unknown, reason?: unknown, orderId?: unknown }>(event)
  const amount = Number(body?.amount)
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const orderId = typeof body?.orderId === 'string' && body.orderId ? body.orderId : null
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000)
    throw createError({ statusCode: 400, message: 'Сумма бонусов — целое число от 1 до 100 000' })
  if (reason.length < 3)
    throw createError({ statusCode: 400, message: 'Укажите причину начисления' })

  const { data, error } = await db.rpc('admin_add_bonus', {
    p_profile_id: id,
    p_amount: amount,
    p_reason: reason,
    p_admin_id: event.context.adminId,
    p_order_id: orderId ?? undefined,
  })
  if (error)
    throw createError({ statusCode: 400, message: error.message })
  return data as { transaction_id: string, amount: number, active_balance: number }
})

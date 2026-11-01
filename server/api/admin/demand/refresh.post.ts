/**
 * Обновить спрос сейчас: база ставит два запроса в DataForSEO (≈ $0,18) и
 * отвечает сразу; ответы забирает `collect`. Отказы базы — «уже идёт», «не
 * больше 5 в сутки», «ключ не задан» — уходят странице как есть.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.rpc('market_demand_request', { p_admin: event.context.adminId, p_scheduled: false })
  if (error)
    throw createError({ statusCode: error.code === 'P0001' ? 400 : 500, message: error.message })
  return data
})

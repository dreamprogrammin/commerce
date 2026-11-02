/**
 * Обновить Вордстат сейчас: база ставит в очередь фразы тем без прошлого
 * месяца (0,1 ₸ за фразу) и отвечает сразу; запросы уходят понемногу, тиком из
 * расписания. Отказы базы — «уже идёт», «ключ не задан», «уже свежие» — уходят
 * странице как есть.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.rpc('market_demand_yandex_request', { p_admin: event.context.adminId, p_scheduled: false })
  if (error)
    throw createError({ statusCode: error.code === 'P0001' ? 400 : 500, message: error.message })
  return data
})

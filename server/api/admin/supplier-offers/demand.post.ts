/**
 * «Узнать спрос» (18 ноября 2026): непроверенные запросы новых товаров —
 * одной задачей в DataForSEO (≈ $0,09 до 1000 фраз). База отвечает сразу;
 * ответ забирает /api/admin/demand/collect. Отказы базы — «уже идёт», «не
 * больше 5 в сутки», «ключ не задан», «проверять нечего» — странице как есть.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.rpc('market_demand_request_offers', { p_admin: event.context.adminId })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code ?? ''))
      throw createError({ statusCode: 409, message: 'Точного спроса ещё нет в базе: нужна миграция 20261118120000_supplier_offer_queries' })
    throw createError({ statusCode: error.code === 'P0001' ? 400 : 500, message: error.message })
  }
  return data as { run: number, phrases: number }
})

/** Ход обновления Вордстата — страница спрашивает, пока оно идёт. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.rpc('market_demand_yandex_progress')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return data
})

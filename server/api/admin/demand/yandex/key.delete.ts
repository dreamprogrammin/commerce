/** Удалить ключ Вордстата: плановое обновление после этого молча пропускается, идущее останавливается. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { error } = await db.rpc('market_demand_yandex_key_delete')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { ok: true }
})

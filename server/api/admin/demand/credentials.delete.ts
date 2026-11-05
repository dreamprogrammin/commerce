/** Удалить ключ DataForSEO: плановое обновление спроса после этого молча пропускается. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { error } = await db.rpc('market_demand_credentials_delete')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { ok: true }
})

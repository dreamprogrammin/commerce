/** Забрать пришедшие ответы DataForSEO; страница зовёт, пока обновление идёт. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.rpc('market_demand_collect')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  const { count, error: countError } = await db.from('market_demand_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (countError)
    throw createError({ statusCode: 500, message: countError.message })
  return { finished: data as number, pending: count ?? 0 }
})

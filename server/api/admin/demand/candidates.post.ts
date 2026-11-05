/** «Скрыть» новый запрос: больше не показывать, свежие цифры по нему пишутся и дальше. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ keyword?: unknown }>(event)
  const keyword = typeof body?.keyword === 'string' ? body.keyword.trim().toLowerCase() : ''
  if (!keyword || keyword.length > 80)
    throw createError({ statusCode: 400, message: 'Нет запроса' })
  const { data, error } = await db.from('market_demand_candidates').update({ status: 'dismissed' }).eq('keyword', keyword).select('keyword')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!data?.length)
    throw createError({ statusCode: 404, message: 'Запрос не найден' })
  return { ok: true }
})

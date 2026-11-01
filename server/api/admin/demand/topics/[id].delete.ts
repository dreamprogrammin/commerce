/** Удалить тему спроса. Цифры её фраз остаются в базе — вернуть тему можно без доплаты. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isUuid(id))
    throw createError({ statusCode: 400, message: 'Неверный номер темы' })
  const { data, error } = await db.from('market_demand_topics').delete().eq('id', id).select('id')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!data?.length)
    throw createError({ statusCode: 404, message: 'Тема не найдена' })
  return { ok: true }
})

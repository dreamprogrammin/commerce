/** Правка темы спроса: название, вид, фразы, признаки своего товара, отслеживать ли. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isUuid(id))
    throw createError({ statusCode: 400, message: 'Неверный номер темы' })
  const topic = parseDemandTopic(await readBody(event))

  const { data, error } = await db.from('market_demand_topics').update(topic).eq('id', id).select('id')
  if (error)
    throwDemandTopicError(error)
  if (!data?.length)
    throw createError({ statusCode: 404, message: 'Тема не найдена' })
  return { id }
})

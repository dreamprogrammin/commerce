/**
 * Новая тема спроса. `fromCandidate` — тема заведена из «новых запросов на
 * рынке»: этот запрос помечается `added` и из списка уходит.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<Record<string, unknown>>(event)
  const topic = parseDemandTopic(body)

  const { data, error } = await db.from('market_demand_topics')
    .insert({ ...topic, created_by: event.context.adminId })
    .select('id')
    .single()
  if (error)
    throwDemandTopicError(error)

  if (typeof body?.fromCandidate === 'string' && body.fromCandidate.trim()) {
    const { error: candidateError } = await db.from('market_demand_candidates')
      .update({ status: 'added' })
      .eq('keyword', body.fromCandidate.trim().toLowerCase())
    if (candidateError)
      throw createError({ statusCode: 500, message: candidateError.message })
  }
  return { id: data.id }
})

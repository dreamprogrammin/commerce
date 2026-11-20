import process from 'node:process'

/**
 * Страница «Kaspi» в админке (20.11.2026): темы спроса для выбора, товар
 * поставщика (если пришли с его карточки), замеры выбранной цели и чем читать
 * скриншоты. На kaspi.kz не ходит — только база.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { topic, offer } = getQuery(event)
  const topicId = isUuid(topic) ? topic as string : undefined
  const offerId = !topicId && isUuid(offer) ? offer as string : undefined

  const [topics, model, aiKeys] = await Promise.all([
    db.from('market_demand_topics').select('id, name, is_active').order('name'),
    visionModel(db),
    db.rpc('ai_keys_status'),
  ])
  if (topics.error && !['42P01', 'PGRST205'].includes(topics.error.code ?? ''))
    throw createError({ statusCode: 500, message: topics.error.message })

  let offerInfo: { id: string, postUrl: string, photoUrl: string | null, items: string[] } | null = null
  if (offerId) {
    let res = await db.from('supplier_offers').select('id, post_url, photo_url, caption, read_items').eq('id', offerId).maybeSingle()
    if (res.error?.code === '42703')
      res = await db.from('supplier_offers').select('id, post_url, photo_url, caption').eq('id', offerId).maybeSingle() as typeof res
    if (res.error)
      throw createError({ statusCode: 500, message: res.error.message })
    if (res.data) {
      const read = Array.isArray(res.data.read_items) ? res.data.read_items as { name?: unknown }[] : []
      const names = read.map(it => (typeof it?.name === 'string' ? it.name : '')).filter(Boolean)
      offerInfo = {
        id: res.data.id,
        postUrl: res.data.post_url,
        photoUrl: res.data.photo_url,
        // Не прочитан ИИ — первая строка подписи
        items: names.length ? names : [String(res.data.caption ?? '').split('\n')[0]!.slice(0, 120) || 'Товар поставщика'],
      }
    }
  }

  const snapshots = topicId || offerInfo
    ? await listKaspiSnapshots(db, topicId ? { topicId } : { offerId: offerInfo!.id })
    : await kaspiInstalled(db) ? [] : null
  const keyed = new Set(aiKeys.error ? [] : ((aiKeys.data ?? []) as { provider: string }[]).map(k => k.provider))
  return {
    installed: snapshots !== null,
    topics: (topics.data ?? []).map(t => ({ id: t.id as string, name: t.name as string, active: t.is_active as boolean })),
    offer: offerInfo,
    snapshots: snapshots ?? [],
    reading: { model, key: keyed.has(model.slice(0, model.indexOf('/'))) },
    // Страж check-admin-kaspi.mjs не задаёт ключ ИИ, пока не увидит заглушку
    ...(process.env.TELEGRAM_FAKE === '1' ? { aiStub: aiStubBase() } : {}),
  }
})

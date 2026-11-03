import type { PurchasingStatus } from '~/utils/smartPurchasing'
import { needsRestock } from '~/utils/restockOrder'
import { isOpenOrder } from '~/utils/supplierOrders'

/**
 * «Умный закуп» (3 ноября 2026): сводка по шагам — поставщики и каналы, спрос,
 * ключ ИИ, заказы поставщикам. Шаги из неё собирает `utils/smartPurchasing.ts`.
 *
 * Только чтение: ни сбора ответов DataForSEO, ни запросов к провайдерам — это
 * делают страницы шагов. Ключи отсюда не уходят даже последними знаками —
 * только «задан или нет». Шаг без своей миграции приходит null, остальное —
 * как есть: превью с `dev` смотрит в боевую базу.
 */
export default defineEventHandler(async (event): Promise<PurchasingStatus> => {
  const db = await requireAdmin(event)

  const [suppliers, channels, topics, runs, demandKey, aiKeys, aiModel, restock] = await Promise.all([
    db.from('suppliers').select('id', { count: 'exact', head: true }),
    db.from('supplier_channels').select('supplier_id, web_preview'),
    db.from('market_demand_topics').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('market_demand_runs').select('kind, status, requested_at, finished_at').order('id', { ascending: false }).limit(20),
    db.rpc('market_demand_credentials_status'),
    db.rpc('ai_keys_status'),
    db.from('ai_settings').select('value').eq('key', 'supplier_vision_model').maybeSingle(),
    loadRestock(db),
  ])
  if (suppliers.error)
    throw createError({ statusCode: 500, message: suppliers.error.message })
  // Таблицы или функции шага нет — миграция не применена; любая другая ошибка — 500
  const missing = (r: { error: { code?: string, message: string } | null }, notInstalled: (e: { code?: string }) => boolean) => {
    if (r.error && !notInstalled(r.error))
      throw createError({ statusCode: 500, message: r.error.message })
    return !!r.error
  }

  const channelRows = missing(channels, channelsNotInstalled) ? null : channels.data ?? []

  const demandMissing = [topics, runs, demandKey].map(r => missing(r, demandNotInstalled)).some(Boolean)
  const runRows = runs.data ?? []
  // Как на «Спрос на рынке»: обновлено — по последнему удачному сбору объёмов,
  // не удалось — если отказал запуск последнего обновления (их пара с одним временем)
  const lastDone = runRows.find(r => r.kind === 'volumes' && r.status === 'done')
  const last = runRows[0]

  const aiMissing = [aiKeys, aiModel].map(r => missing(r, demandNotInstalled)).some(Boolean)
  const keyRows = (aiKeys.data ?? []) as { provider: string }[]
  const model = aiModel.data?.value

  const atThreshold = restock.products.filter(needsRestock)

  return {
    suppliers: suppliers.count ?? 0,
    channels: channelRows && {
      total: channelRows.length,
      open: channelRows.filter(c => c.web_preview).length,
      suppliers: new Set(channelRows.map(c => c.supplier_id)).size,
    },
    demand: demandMissing
      ? null
      : {
          topics: topics.count ?? 0,
          hasKey: ((demandKey.data ?? []) as unknown[]).length > 0,
          running: runRows.some(r => r.status === 'pending'),
          lastDoneAt: lastDone?.finished_at ?? null,
          lastFailed: !!last && runRows.some(r => r.requested_at === last.requested_at && r.status === 'failed'),
        },
    ai: aiMissing
      ? null
      : {
          providers: keyRows.flatMap(k => isAiProvider(k.provider) ? [{ id: k.provider, label: AI_PROVIDERS[k.provider].label }] : []),
          model: typeof model === 'string' ? model : AI_TASKS.supplier_vision_model.default,
        },
    restock: {
      atThreshold: atThreshold.length,
      noSupplier: atThreshold.filter(p => !p.supplierId).length,
      suppliers: new Set(atThreshold.flatMap(p => p.supplierId ? [p.supplierId] : [])).size,
      openOrders: restock.orders ? restock.orders.filter(isOpenOrder).length : null,
    },
  }
})

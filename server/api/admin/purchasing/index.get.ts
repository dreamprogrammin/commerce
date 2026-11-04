import type { DemandTopic } from '~/utils/marketDemand'
import type { PurchasingStatus, SupplierLoad } from '~/utils/smartPurchasing'
import { needsRestock } from '~/utils/restockOrder'
import { demandOverview } from '~/utils/smartPurchasing'
import { isOpenOrder } from '~/utils/supplierOrders'

/**
 * «Умный закуп» (3 ноября 2026): сводка для дашборда — спрос по темам, остаток
 * DataForSEO, поставщики с товарами и каналами, аккаунт Telegram для закрытых
 * каналов, ключ ИИ, заказы поставщикам.
 * Показатели и шаги из неё собирает `utils/smartPurchasing.ts`.
 *
 * Наружу ходит только за балансом — бесплатный `/v3/appendix/user_data`, как
 * «Спрос на рынке»; ответов DataForSEO не собирает, провайдеров ИИ не
 * спрашивает. Ключи отсюда не уходят даже последними знаками — только «задан
 * или нет». Шаг без своей миграции приходит null, остальное — как есть:
 * превью с `dev` смотрит в боевую базу.
 */
export default defineEventHandler(async (event): Promise<PurchasingStatus> => {
  const db = await requireAdmin(event)

  const [channels, telegramSecrets, summary, candidates, runs, demandKey, aiKeys, aiModel, restock] = await Promise.all([
    db.from('supplier_channels').select('supplier_id, web_preview'),
    db.rpc('telegram_secrets_status'),
    db.rpc('market_demand_summary'),
    db.from('market_demand_candidates').select('keyword', { count: 'exact', head: true }).eq('status', 'new'),
    db.from('market_demand_runs').select('kind, status, cost, requested_at, finished_at').order('id', { ascending: false }).limit(20),
    db.rpc('market_demand_credentials_status'),
    db.rpc('ai_keys_status'),
    db.from('ai_settings').select('value').eq('key', 'supplier_vision_model').maybeSingle(),
    loadRestock(db),
  ])
  // Таблицы или функции шага нет — миграция не применена; любая другая ошибка — 500
  const missing = (r: { error: { code?: string, message: string } | null }, notInstalled: (e: { code?: string }) => boolean) => {
    if (r.error && !notInstalled(r.error))
      throw createError({ statusCode: 500, message: r.error.message })
    return !!r.error
  }

  const channelRows = missing(channels, channelsNotInstalled) ? null : channels.data ?? []
  // Подключён — есть сессия в Vault (как на странице «Аккаунт Telegram»); самих секретов функция не отдаёт
  const telegram = missing(telegramSecrets, telegramNotInstalled)
    ? null
    : { connected: ((telegramSecrets.data ?? []) as { name: string }[]).some(r => r.name === 'session') }

  const demandMissing = [summary, candidates, runs, demandKey].map(r => missing(r, demandNotInstalled)).some(Boolean)
  const runRows = runs.data ?? []
  // Как на «Спрос на рынке»: обновлено — по последнему удачному сбору объёмов,
  // не удалось — если отказал запуск последнего обновления (их пара с одним временем)
  const lastDone = runRows.find(r => r.kind === 'volumes' && r.status === 'done')
  const last = runRows[0]
  const hasKey = ((demandKey.data ?? []) as unknown[]).length > 0

  // Остаток — как на «Спросе на рынке»: сбой ключа или DataForSEO дашборд не роняет
  let balance: number | null = null
  let balanceError: string | null = null
  if (!demandMissing && hasKey) {
    const { data: secret, error } = await db.rpc('market_demand_credentials_get')
    const creds = (secret as Array<{ login: string, password: string }> | null)?.[0]
    try {
      if (error || !creds)
        throw new Error(error?.message ?? 'ключ не прочитан')
      balance = (await dataforseoAccount(creds.login, creds.password)).balance
    }
    catch (e: any) {
      balanceError = e?.message ?? 'Не удалось узнать баланс'
    }
  }

  const aiMissing = [aiKeys, aiModel].map(r => missing(r, demandNotInstalled)).some(Boolean)
  const keyRows = (aiKeys.data ?? []) as { provider: string }[]
  const model = aiModel.data?.value

  const atThreshold = restock.products.filter(needsRestock)
  const channelsBySupplier = new Map<string, { total: number, open: number }>()
  for (const c of channelRows ?? []) {
    const n = channelsBySupplier.get(c.supplier_id) ?? { total: 0, open: 0 }
    channelsBySupplier.set(c.supplier_id, { total: n.total + 1, open: n.open + (c.web_preview ? 1 : 0) })
  }
  const supplierLoad: SupplierLoad[] = restock.suppliers
    .map((s) => {
      const items = restock.products.filter(p => p.supplierId === s.id)
      const ch = channelsBySupplier.get(s.id)
      return {
        id: s.id,
        name: s.name,
        products: items.length,
        toRestock: items.filter(needsRestock).length,
        channels: channelRows ? ch?.total ?? 0 : null,
        openChannels: channelRows ? ch?.open ?? 0 : null,
      }
    })
    .sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'ru'))
  const unassigned = restock.products.filter(p => !p.supplierId)

  return {
    suppliers: restock.suppliers.length,
    channels: channelRows && {
      total: channelRows.length,
      open: channelRows.filter(c => c.web_preview).length,
      suppliers: channelsBySupplier.size,
    },
    telegram,
    demand: demandMissing
      ? null
      : {
          hasKey,
          running: runRows.some(r => r.status === 'pending'),
          lastDoneAt: lastDone?.finished_at ?? null,
          lastFailed: !!last && runRows.some(r => r.requested_at === last.requested_at && r.status === 'failed'),
          lastCost: lastDone
            ? runRows.filter(r => r.requested_at === lastDone.requested_at).reduce((sum, r) => sum + Number(r.cost ?? 0), 0)
            : null,
          balance,
          balanceError,
          overview: demandOverview((summary.data ?? []) as DemandTopic[], candidates.count ?? 0),
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
    supplierLoad,
    unassigned: { products: unassigned.length, toRestock: unassigned.filter(needsRestock).length },
  }
})

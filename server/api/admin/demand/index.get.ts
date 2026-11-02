/**
 * «Спрос на рынке» (1 ноября 2026): темы со спросом, новые запросы, последние
 * обновления и ключ DataForSEO с балансом. Если обновление идёт — пришедшие
 * ответы DataForSEO забираются здесь же.
 *
 * Вордстат (2 ноября 2026) — ключ и ход обновления. Без его миграции
 * `yandex: null`, остальная страница работает как раньше: превью с `dev`
 * смотрит в боевую базу ещё до того, как миграцию применят.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)

  const pending = await db.from('market_demand_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (demandNotInstalled(pending.error))
    return { installed: false as const }
  if (pending.error)
    throw createError({ statusCode: 500, message: pending.error.message })
  // Сбой сбора не должен ронять страницу: показать его строкой, остальное — как есть
  let collectError: string | null = null
  if (pending.count) {
    const { error } = await db.rpc('market_demand_collect')
    collectError = error?.message ?? null
  }

  const [summary, candidates, runs, status, yandexKey, yandexProgress] = await Promise.all([
    db.rpc('market_demand_summary'),
    db.rpc('market_demand_candidates_list', { p_limit: 40 }),
    db.from('market_demand_runs')
      .select('id, kind, status, scheduled, keywords_sent, items, cost, error, requested_at, finished_at')
      .order('id', { ascending: false })
      .limit(6),
    db.rpc('market_demand_credentials_status'),
    db.rpc('market_demand_yandex_key_status'),
    db.rpc('market_demand_yandex_progress'),
  ])
  for (const r of [summary, candidates, runs, status]) {
    if (r.error)
      throw createError({ statusCode: 500, message: r.error.message })
  }
  const yandexInstalled = !demandNotInstalled(yandexKey.error) && !demandNotInstalled(yandexProgress.error)
  for (const r of yandexInstalled ? [yandexKey, yandexProgress] : []) {
    if (r.error)
      throw createError({ statusCode: 500, message: r.error.message })
  }
  const yKey = yandexInstalled
    ? (yandexKey.data as Array<{ folder_id: string, key_last4: string, region_name: string, updated_at: string }>)[0] ?? null
    : null

  const key = (status.data as Array<{ login: string, password_last4: string, updated_at: string }>)[0] ?? null
  let balance: number | null = null
  let balanceError: string | null = null
  if (key) {
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

  const runRows = runs.data ?? []
  return {
    installed: true as const,
    topics: summary.data ?? [],
    candidates: candidates.data ?? [],
    runs: runRows,
    pending: runRows.some(r => r.status === 'pending'),
    collectError,
    credentials: key
      ? { login: key.login, last4: key.password_last4, updatedAt: key.updated_at, balance, balanceError }
      : null,
    yandex: yandexInstalled
      ? {
          key: yKey ? { folderId: yKey.folder_id, last4: yKey.key_last4, region: yKey.region_name, updatedAt: yKey.updated_at } : null,
          progress: yandexProgress.data,
        }
      : null,
  }
})

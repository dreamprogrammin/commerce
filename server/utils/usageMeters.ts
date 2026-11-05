import type { SupabaseClient } from '@supabase/supabase-js'
import type { VisionModelSpend } from '~/utils/supplierOfferList'
import type { AiBudget, AiLimitsReading, UsageMeters } from '~/utils/usageBatteries'
import { budgetPeriod } from '~/utils/usageBatteries'

/**
 * Показания «батареек» дашборда «Умный закуп» (6 ноября 2026); подписи и
 * уровни — utils/usageBatteries.ts. Таблицы — миграция 20261106120000.
 */

/** Миграции «батареек» нет: таблицы или функции нет в базе */
export function meterNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code ?? '')
}

export function isAiBudget(v: unknown): v is AiBudget {
  const b = v as AiBudget | null
  return !!b && typeof b.usd === 'number' && b.usd > 0 && typeof b.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.since)
    && (b.resetDay === null || (Number.isInteger(b.resetDay) && b.resetDay >= 1 && b.resetDay <= 28))
}

/** Telegram ответил FLOOD_WAIT — до какого времени ждать; запись не обязательна */
export async function recordTelegramFlood(db: SupabaseClient, seconds: number, channel: string | null) {
  const { error } = await db.from('service_meters').upsert({
    key: 'telegram_flood',
    value: { until: new Date(Date.now() + seconds * 1000).toISOString(), channel },
    updated_at: new Date().toISOString(),
  })
  if (error && !meterNotInstalled(error))
    console.error('[usage] ограничение Telegram не записалось:', error.message)
}

type Dataforseo = UsageMeters['dataforseo']

/** Всё для «батареек»; DataForSEO — уже спрошенный дашбордом (null — ключа нет) */
export async function readUsageMeters(db: SupabaseClient, dataforseo: Dataforseo, now = new Date()): Promise<UsageMeters> {
  const almatyToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(now)
  const [budgetRow, meters, channels] = await Promise.all([
    db.from('ai_settings').select('value').eq('key', 'ai_budget').maybeSingle(),
    db.from('service_meters').select('key, value, updated_at'),
    db.from('supplier_channels').select('title, collected_at'),
  ])
  if (budgetRow.error && !meterNotInstalled(budgetRow.error))
    throw createError({ statusCode: 500, message: budgetRow.error.message })
  const aiBudget = isAiBudget(budgetRow.data?.value) ? budgetRow.data.value : null

  const installed = !meters.error
  if (meters.error && !meterNotInstalled(meters.error))
    throw createError({ statusCode: 500, message: meters.error.message })

  // Расход — с начала периода бюджета; без бюджета — за 30 дней
  let aiSpend: VisionModelSpend[] = []
  if (installed) {
    const from = aiBudget
      ? budgetPeriod(aiBudget, now).start
      : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date(now.getTime() - 29 * 86_400_000))
    const { data, error } = await db.from('ai_usage_daily').select('model, input_tokens, output_tokens, posts').gte('day', from)
    if (error)
      throw createError({ statusCode: 500, message: error.message })
    const byModel = new Map<string, VisionModelSpend>()
    for (const r of data ?? []) {
      const m = byModel.get(r.model) ?? { model: r.model, posts: 0, inputTokens: 0, outputTokens: 0 }
      m.posts += r.posts
      m.inputTokens += Number(r.input_tokens)
      m.outputTokens += Number(r.output_tokens)
      byModel.set(r.model, m)
    }
    aiSpend = [...byModel.values()]
  }

  // Лимиты — провайдера выбранной модели, свежие
  const rows = (meters.data ?? []) as { key: string, value: any, updated_at: string }[]
  const limitRow = rows.filter(r => r.key.startsWith('ai_limits:')).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  const aiLimits: AiLimitsReading | null = limitRow
    ? {
        provider: limitRow.key.slice('ai_limits:'.length),
        model: String(limitRow.value?.model ?? ''),
        seenAt: limitRow.updated_at,
        requests: limitRow.value?.requests ?? null,
        inputTokens: limitRow.value?.inputTokens ?? null,
        outputTokens: limitRow.value?.outputTokens ?? null,
        tokens: limitRow.value?.tokens ?? null,
      }
    : null
  const flood = rows.find(r => r.key === 'telegram_flood')?.value

  const channelRows = channels.error ? null : (channels.data ?? []) as { title: string, collected_at: string | null }[]
  const day = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date(iso))
  const telegram = channelRows && {
    channels: channelRows.length,
    collectedToday: channelRows.filter(c => c.collected_at && day(c.collected_at) === almatyToday).length,
    lastCollectedAt: channelRows.map(c => c.collected_at).filter((a): a is string => !!a).sort().at(-1) ?? null,
    floodUntil: typeof flood?.until === 'string' ? flood.until : null,
    floodChannel: typeof flood?.channel === 'string' ? flood.channel : null,
  }

  return { installed, aiBudget, aiSpend, aiLimits, dataforseo, telegram }
}

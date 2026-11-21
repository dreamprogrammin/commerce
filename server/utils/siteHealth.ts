import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gauge, PaidService, SiteHealthPage, SiteStatus } from '~/utils/siteHealth'
import { supabaseBattery } from '~/utils/siteHealth'
import { usageBatteries } from '~/utils/usageBatteries'

/**
 * «Состояние сайта» и платные сервисы (21 ноября 2026): проверки сторожа,
 * сбои, список сервисов и показания к ним. Таблицы — миграция
 * 20261121120000_site_health; без неё installed: false, дашборд работает.
 */

export function siteHealthNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code ?? '')
}

export function toPaidService(r: any): PaidService {
  return { id: r.id, name: r.name, plan: r.plan, cost: r.cost == null ? null : Number(r.cost), currency: r.currency, period: r.period, renewsOn: r.renews_on, url: r.url, note: r.note, meter: r.meter, sort: r.sort }
}

const DAY = 86_400_000

async function siteStatus(db: SupabaseClient, now: Date): Promise<SiteStatus> {
  const [checks, incidents] = await Promise.all([
    db.from('site_health_checks').select('checked_at, ok, ms, error').gte('checked_at', new Date(now.getTime() - 7 * DAY).toISOString()).order('checked_at', { ascending: false }).limit(5000),
    db.from('site_health_incidents').select('started_at, ended_at, reason, alerted_at').order('started_at', { ascending: false }).limit(6),
  ])
  for (const r of [checks, incidents]) {
    if (r.error)
      throw createError({ statusCode: 500, message: r.error.message })
  }
  const rows = (checks.data ?? []) as { checked_at: string, ok: boolean, ms: number | null, error: string | null }[]
  const share = (list: typeof rows) => list.length ? list.filter(r => r.ok).length / list.length : null
  const day = rows.filter(r => now.getTime() - Date.parse(r.checked_at) <= DAY)
  const okDay = day.filter(r => r.ok && r.ms != null)
  const inc = (incidents.data ?? []) as { started_at: string, ended_at: string | null, reason: string, alerted_at: string | null }[]
  // Открытый сбой показываем после второй неудачи, как и пишет бот: одна — бывает случайной
  const open = inc.find(i => !i.ended_at && i.alerted_at)
  const last = rows[0]
  return {
    last: last ? { at: last.checked_at, ok: last.ok, ms: last.ms, error: last.error } : null,
    uptime24: share(day),
    uptime7: share(rows),
    avgMs24: okDay.length ? Math.round(okDay.reduce((n, r) => n + r.ms!, 0) / okDay.length) : null,
    down: open ? { since: open.started_at, reason: open.reason } : null,
    // Короткие, о которых не писали, в истории не нужны
    incidents: inc.filter(i => i.alerted_at).slice(0, 5).map(i => ({ startedAt: i.started_at, endedAt: i.ended_at, reason: i.reason })),
  }
}

/** DataForSEO: баланс тем же бесплатным запросом, что «Спрос на рынке»; сбой — строкой */
async function dataforseoReading(db: SupabaseClient) {
  const { data: status, error: statusError } = await db.rpc('market_demand_credentials_status')
  if (statusError || !((status ?? []) as unknown[]).length)
    return null
  const { data: secret, error } = await db.rpc('market_demand_credentials_get')
  const creds = (secret as Array<{ login: string, password: string }> | null)?.[0]
  try {
    if (error || !creds)
      throw new Error(error?.message ?? 'ключ не прочитан')
    const a = await dataforseoAccount(creds.login, creds.password)
    return { balance: a.balance, total: a.total ?? null, dayLimit: a.dayLimit ?? null, daySpent: a.daySpent ?? null, error: null }
  }
  catch (e: any) {
    return { balance: null, total: null, dayLimit: null, daySpent: null, error: e?.message ?? 'Не удалось узнать баланс' }
  }
}

export async function siteHealthPage(db: SupabaseClient, now = new Date()): Promise<SiteHealthPage> {
  const services = await db.from('paid_services').select('*').order('sort').order('created_at')
  if (siteHealthNotInstalled(services.error))
    return { installed: false, site: null, services: [], readings: {} }
  if (services.error)
    throw createError({ statusCode: 500, message: services.error.message })
  const list = (services.data ?? []).map(toPaidService)
  const meters = new Set(list.map(s => s.meter).filter(Boolean))

  const [site, storage, dfs] = await Promise.all([
    siteStatus(db, now),
    meters.has('supabase') ? db.rpc('site_health_storage') : Promise.resolve(null),
    meters.has('dataforseo') || meters.has('ai') ? dataforseoReading(db) : Promise.resolve(null),
  ])

  const readings: SiteHealthPage['readings'] = {}
  const supa = list.find(s => s.meter === 'supabase')
  if (supa && storage && !storage.error) {
    const v = storage.data as { db_bytes: number, files_bytes: number }
    readings.supabase = supabaseBattery(supa.plan, Number(v.db_bytes), Number(v.files_bytes))
  }
  // Бюджет ИИ и DataForSEO — те же батарейки, что на «Умном закупе»
  if (meters.has('ai') || meters.has('dataforseo')) {
    const batteries = usageBatteries(await readUsageMeters(db, dfs, now), now)
    const pick = (id: string): Gauge | undefined => batteries.find(b => b.id === id)
    if (meters.has('ai'))
      readings.ai = pick('ai_budget')
    if (meters.has('dataforseo'))
      readings.dataforseo = pick('dataforseo')
  }
  return { installed: true, site, services: list, readings }
}

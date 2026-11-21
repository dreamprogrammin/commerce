import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gauge, PaidService, SiteHealthPage, SiteStatus, VercelPanel } from '~/utils/siteHealth'
import type { UsageMeters } from '~/utils/usageBatteries'
import { supabaseBattery, vercelGauge } from '~/utils/siteHealth'
import { usageBatteries } from '~/utils/usageBatteries'
import { vercelHints } from '~/utils/vercelUsage'

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

/** null — таблиц сторожа нет (миграция не применена) */
async function siteStatus(db: SupabaseClient, now: Date): Promise<SiteStatus | null> {
  const [checks, incidents] = await Promise.all([
    db.from('site_health_checks').select('checked_at, ok, ms, error').gte('checked_at', new Date(now.getTime() - 7 * DAY).toISOString()).order('checked_at', { ascending: false }).limit(5000),
    db.from('site_health_incidents').select('started_at, ended_at, reason, alerted_at').order('started_at', { ascending: false }).limit(6),
  ])
  for (const r of [checks, incidents]) {
    if (siteHealthNotInstalled(r.error))
      return null
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

type DataforseoReading = NonNullable<UsageMeters['dataforseo']>

/*
 * Баланс DataForSEO на дашборде держим 10 минут: он меняется только от
 * обновлений спроса, а дашборд открывают часто. «Умный закуп» и «Спрос на
 * рынке» спрашивают сами и свежим — там баланс смотрят сразу после обновления.
 */
const DFS_TTL = 10 * 60_000
let dfsCache: { at: number, login: string, value: DataforseoReading } | null = null

/** DataForSEO: баланс тем же бесплатным запросом, что «Спрос на рынке»; сбой — строкой; null — ключа нет */
async function dataforseoReading(db: SupabaseClient, now: Date): Promise<DataforseoReading | null> {
  // Есть ли ключ и сам ключ — одним кругом: каждый круг до базы с сервера стоит 0,2–0,6 с
  const [status, secret] = await Promise.all([db.rpc('market_demand_credentials_status'), db.rpc('market_demand_credentials_get')])
  if (status.error || !((status.data ?? []) as unknown[]).length)
    return null
  const creds = (secret.data as Array<{ login: string, password: string }> | null)?.[0]
  if (creds && dfsCache && dfsCache.login === creds.login && now.getTime() - dfsCache.at < DFS_TTL)
    return dfsCache.value
  try {
    if (secret.error || !creds)
      throw new Error(secret.error?.message ?? 'ключ не прочитан')
    const a = await dataforseoAccount(creds.login, creds.password)
    const value = { balance: a.balance, total: a.total ?? null, dayLimit: a.dayLimit ?? null, daySpent: a.daySpent ?? null, error: null }
    dfsCache = { at: now.getTime(), login: creds.login, value }
    return value
  }
  catch (e: any) {
    return { balance: null, total: null, dayLimit: null, daySpent: null, error: e?.message ?? 'Не удалось узнать баланс' }
  }
}

/**
 * Сводка дашборда. Всё, что можно, — одним кругом (21.11.2026, владелец:
 * «дашборд какой-то неудобный, я жду когда он прогрузится»): функции Vercel
 * в Вашингтоне, база в Сеуле, и каждый круг до базы стоил 0,2–0,6 с, а их
 * было восемь подряд — 2,9 с тёплым и 5,1 с холодным (журнал Supabase).
 * Показания считаются для всех счётчиков сразу, ненужные отбрасываются.
 */
export async function siteHealthPage(db: SupabaseClient, now = new Date()): Promise<SiteHealthPage> {
  const [services, site, storage, dfs, vercel, usage] = await Promise.all([
    db.from('paid_services').select('*').order('sort').order('created_at'),
    siteStatus(db, now),
    db.rpc('site_health_storage'),
    dataforseoReading(db, now),
    vercelPanel(db, now),
    readUsageMeters(db, null, now),
  ])
  if (siteHealthNotInstalled(services.error) || !site)
    return { installed: false, site: null, services: [], readings: {}, vercel: { installed: false, key: null, usage: null, hints: [], error: null } }
  if (services.error)
    throw createError({ statusCode: 500, message: services.error.message })
  const list = (services.data ?? []).map(toPaidService)
  const meters = new Set(list.map(s => s.meter).filter(Boolean))

  const readings: SiteHealthPage['readings'] = {}
  const supa = list.find(s => s.meter === 'supabase')
  if (supa && !storage.error) {
    const v = storage.data as { db_bytes: number, files_bytes: number }
    readings.supabase = supabaseBattery(supa.plan, Number(v.db_bytes), Number(v.files_bytes))
  }
  // Бюджет ИИ и DataForSEO — те же батарейки, что на «Умном закупе»
  if (meters.has('ai') || meters.has('dataforseo')) {
    const batteries = usageBatteries({ ...usage, dataforseo: dfs }, now)
    const pick = (id: string): Gauge | undefined => batteries.find(b => b.id === id)
    if (meters.has('ai'))
      readings.ai = pick('ai_budget')
    if (meters.has('dataforseo'))
      readings.dataforseo = pick('dataforseo')
  }
  if (meters.has('vercel')) {
    const g = vercelGauge(vercel)
    if (g)
      readings.vercel = g
  }
  return { installed: true, site, services: list, readings, vercel }
}

/** Vercel: ключ, расход и подсказки; сбой Vercel — строкой, дашборд не роняет */
async function vercelPanel(db: SupabaseClient, now: Date): Promise<VercelPanel> {
  const empty = { installed: true, key: null, usage: null, hints: [], error: null }
  // Что задано и сам ключ — одним кругом
  const [status, key] = await Promise.all([db.rpc('vercel_key_status'), vercelKey(db).catch((e: any) => e as Error)])
  if (vercelNotInstalled(status.error))
    return { ...empty, installed: false }
  if (status.error)
    throw createError({ statusCode: 500, message: status.error.message })
  const row = ((status.data ?? []) as { last4: string, team_name: string, updated_at: string }[])[0]
  if (!row)
    return empty
  const keyInfo = { last4: row.last4, teamName: row.team_name, updatedAt: row.updated_at }
  try {
    if (key instanceof Error)
      throw key
    if (!key || key === 'not-installed')
      return { ...empty, key: keyInfo, error: 'ключ не прочитан' }
    const usage = await vercelUsage(key, now)
    return { installed: true, key: keyInfo, usage, hints: vercelHints(usage), error: null }
  }
  catch (e: any) {
    return { ...empty, key: keyInfo, error: e?.message ?? 'Vercel не ответил' }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { VercelDeploy, VercelUsage } from '~/utils/vercelUsage'
import process from 'node:process'
import { aggregateCharges, billingMonthStart, forecastMonth, isPlanService } from '~/utils/vercelUsage'

/**
 * Vercel для админки (21 ноября 2026): проверка ключа, расход за месяц
 * (/v1/billing/charges, только на Pro) и последние сборки проекта. Ключ — в
 * Vault (миграция 20261121140000_vercel_key), наружу не уходит. Ответ держим
 * 10 минут: расход у Vercel обновляется не чаще, а дашборд открывают часто.
 */
const API = 'https://api.vercel.com'
const PROJECT = 'commerce'

/* Заглушка для стражей — только localhost, иначе ключ ушёл бы на чужой сервер */
function apiBase(): string {
  const stub = process.env.VERCEL_API_STUB_URL
  if (!stub)
    return API
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(stub))
    throw createError({ statusCode: 500, message: 'VERCEL_API_STUB_URL — только локальная заглушка' })
  return stub
}

export interface VercelKey { token: string, teamId: string, teamName: string }

export function vercelNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', '42883'].includes(error?.code ?? '')
}

async function call(token: string, path: string): Promise<Response> {
  try {
    return await fetch(`${apiBase()}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  }
  catch {
    throw new Error('Vercel не ответил')
  }
}

async function json<T>(token: string, path: string): Promise<T> {
  const res = await call(token, path)
  if (res.status === 401 || res.status === 403)
    throw new Error('Vercel не принял ключ — проверьте, что он не удалён и у него есть доступ к команде')
  if (!res.ok)
    throw new Error(`Vercel ответил ${res.status}`)
  return res.json() as Promise<T>
}

/** Ключ годится: видит команду с проектом commerce. Возвращает команду */
export async function vercelCheckKey(token: string): Promise<{ teamId: string, teamName: string }> {
  const { teams } = await json<{ teams: { id: string, name: string, slug: string }[] }>(token, '/v2/teams?limit=20')
  for (const t of teams ?? []) {
    const res = await call(token, `/v9/projects/${PROJECT}?teamId=${encodeURIComponent(t.id)}`)
    if (res.ok)
      return { teamId: t.id, teamName: t.name || t.slug }
  }
  throw new Error('Ключ не видит проект commerce — при создании выберите команду, где лежит сайт')
}

export async function vercelKey(db: SupabaseClient): Promise<VercelKey | null | 'not-installed'> {
  const { data, error } = await db.rpc('vercel_key_get')
  if (vercelNotInstalled(error))
    return 'not-installed'
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  const k = data as Partial<VercelKey> | null
  return k?.token && k.teamId ? { token: k.token, teamId: k.teamId, teamName: k.teamName ?? '' } : null
}

let cache: { at: number, teamId: string, usage: VercelUsage } | null = null
const TTL = 10 * 60_000

export function forgetVercelUsage() {
  cache = null
}

export async function vercelUsage(key: VercelKey, now = new Date()): Promise<VercelUsage> {
  if (cache && cache.teamId === key.teamId && now.getTime() - cache.at < TTL)
    return cache.usage
  const start = billingMonthStart(now)
  const team = `teamId=${encodeURIComponent(key.teamId)}`
  const [charges, deploys] = await Promise.all([
    call(key.token, `/v1/billing/charges?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(now.toISOString())}&${team}`),
    json<{ deployments: any[] }>(key.token, `/v6/deployments?app=${PROJECT}&limit=20&${team}`),
  ])
  if (charges.status === 401 || charges.status === 403)
    throw new Error('Vercel не дал расход: ключ без доступа к оплате команды')
  // 404 «Costs not found» — за период расхода ещё нет
  const services = charges.status === 404 ? [] : charges.ok ? aggregateCharges(await charges.text()) : null
  if (!services)
    throw new Error(`Vercel ответил ${charges.status} на расход`)
  const effective = services.reduce((n, s) => n + s.effective, 0)
  const list: VercelDeploy[] = (deploys.deployments ?? []).map(d => ({
    target: d.target === 'production' ? 'production' as const : 'preview' as const,
    state: String(d.state ?? d.readyState ?? ''),
    createdAt: new Date(Number(d.createdAt ?? d.created)).toISOString(),
    branch: d.meta?.githubCommitRef ?? null,
    message: typeof d.meta?.githubCommitMessage === 'string' ? d.meta.githubCommitMessage.split('\n')[0].slice(0, 120) : null,
  }))
  // Последняя боевая и последние превью
  const prod = list.find(d => d.target === 'production')
  const deploysOut = [...(prod ? [prod] : []), ...list.filter(d => d.target === 'preview').slice(0, 3)]
  const usage: VercelUsage = {
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    services,
    effective: Math.round(effective * 10000) / 10000,
    billed: Math.round(services.reduce((n, s) => n + s.billed, 0) * 10000) / 10000,
    // Подписка начисляется сама по себе — прогнозируем только услуги
    forecast: forecastMonth(services.filter(s => !isPlanService(s.name)).reduce((n, s) => n + s.effective, 0), start, now),
    deploys: deploysOut,
  }
  cache = { at: now.getTime(), teamId: key.teamId, usage }
  return usage
}

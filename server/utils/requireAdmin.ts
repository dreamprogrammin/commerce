import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { serverSupabaseUser } from '#supabase/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Клиент базы с правами сервиса — в обход RLS. Только для серверных
 * маршрутов админки и только после `requireAdmin`.
 */
export function serviceSupabase() {
  const config = useRuntimeConfig()
  const url = config.public.supabase?.url
  const key = config.supabaseServiceRoleKey
  if (!url || !key)
    throw createError({ statusCode: 500, message: 'Нет ключа сервиса Supabase' })
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Пускает дальше только администратора, роль берёт из `profiles`. Возвращает
 * клиент сервиса.
 *
 * Кто пришёл — по токену из `Authorization: Bearer` (его шлёт
 * `utils/adminFetch.ts`), токен сверяется с Supabase (`auth.getUser`), так
 * что подделать его нельзя. Кука — запасной путь: сейчас сервер её не видит
 * (имена у браузера и сервера разные, и выравнивать их нельзя — см.
 * utils/adminFetch.ts), из-за этого с 19 июня до 14 октября 2026 все
 * маршруты админки отвечали 401.
 */
export async function requireAdmin(event: H3Event) {
  const db = serviceSupabase()
  const bearer = getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const roleOf = async (id: string) => (await db.from('profiles').select('role').eq('id', id).maybeSingle()).data?.role
  let user: { id: string } | null
  let role: string | undefined
  if (bearer) {
    // Токен и роль — одним кругом (21.11.2026): функции в Вашингтоне, база в
    // Сеуле, круг — 0,2–0,6 с, и так в каждом запросе админки. Роль берётся
    // по id из токена ещё до проверки, но в дело идёт, только если Supabase
    // подтвердил токен и id совпал; иначе — отдельным запросом, как раньше.
    const claimed = tokenSubject(bearer)
    const [auth, claimedRole] = await Promise.all([db.auth.getUser(bearer), claimed ? roleOf(claimed) : undefined])
    user = auth.data.user
    role = user ? (user.id === claimed ? claimedRole : await roleOf(user.id)) : undefined
  }
  else {
    user = await serverSupabaseUser(event).catch(() => null)
    role = user ? await roleOf(user.id) : undefined
  }
  if (!user)
    throw createError({ statusCode: 401, message: 'Нужен вход' })
  if (role !== 'admin')
    throw createError({ statusCode: 403, message: 'Только для администратора' })
  // Кто именно — для записей «кто сделал» (ручные бонусы)
  event.context.adminId = user.id
  return db
}

/** `sub` из JWT без проверки подписи — только чтобы начать запрос роли пораньше; null — не JWT */
export function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload)
      return null
    const sub = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.sub
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null
  }
  catch {
    return null
  }
}

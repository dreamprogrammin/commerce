import type { H3Event } from 'h3'
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
  const user = bearer
    ? (await db.auth.getUser(bearer)).data.user
    : await serverSupabaseUser(event).catch(() => null)
  if (!user)
    throw createError({ statusCode: 401, message: 'Нужен вход' })
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Только для администратора' })
  return db
}

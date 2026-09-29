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
 * Пускает дальше только администратора: сессию из cookie сверяет с Supabase
 * (`auth.getUser`), роль берёт из `profiles`. Возвращает клиент сервиса.
 */
export async function requireAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user)
    throw createError({ statusCode: 401, message: 'Нужен вход' })
  const db = serviceSupabase()
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Только для администратора' })
  return db
}

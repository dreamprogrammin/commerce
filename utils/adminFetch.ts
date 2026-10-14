import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'

/**
 * Запрос к серверным маршрутам админки (`/api/admin/*`) с токеном входа в
 * заголовке `Authorization: Bearer`.
 *
 * Зачем. С 19 июня 2026 сервер не видел ни одного входа: браузер пишет сессию
 * в куку `sb-<проект>-auth-token`, а серверный клиент `@supabase/ssr` из-за
 * `auth.storageKey` в nuxt.config.ts ищет `supabase-auth-token`, которую не
 * пишет никто. Все маршруты с `requireAdmin` отвечали 401: «Корзины» не
 * грузились, сброс кеша после правки товара не срабатывал ни разу (разбор
 * 14 октября 2026 — docs/HANDOFF.md).
 *
 * Имена кук НАРОЧНО не выравниваются: увидев сессию, серверный плагин
 * `@nuxtjs/supabase` кладёт `access_token` и `refresh_token` в payload каждой
 * SSR-страницы, а страницы витрины кешируются ISR и отдаются всем. Поэтому
 * SSR остаётся слепым ко входу, а админка показывает себя серверу явно —
 * токеном из браузерной сессии; `requireAdmin` проверяет его в Supabase.
 *
 * Только для браузера: на сервере сессии нет, и заголовка не будет.
 */
export async function adminFetch<T = unknown>(
  url: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {},
): Promise<T> {
  const client = useNuxtApp().$supabase.client
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(options.headers as HeadersInit | undefined)
  if (token)
    headers.set('Authorization', `Bearer ${token}`)
  return $fetch(url, { ...options, headers }) as Promise<T>
}

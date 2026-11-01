import { Buffer } from 'node:buffer'
import process from 'node:process'

/**
 * DataForSEO для страницы «Спрос на рынке» (1 ноября 2026): проверка ключа и
 * баланс — бесплатный `/v3/appendix/user_data`. Сами объёмы поиска
 * запрашивает база (`market_demand_request` через pg_net), сервер их не
 * трогает.
 */
const API = 'https://api.dataforseo.com'

/*
 * Заглушка для проверки страницы без настоящего ключа. Только localhost —
 * иначе переменная окружения увела бы ключ на чужой сервер.
 */
function apiBase(): string {
  const stub = process.env.DATAFORSEO_STUB_URL
  if (!stub)
    return API
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(stub))
    throw createError({ statusCode: 500, message: 'DATAFORSEO_STUB_URL — только локальная заглушка' })
  return stub
}

export interface DataforseoAccount {
  /** Остаток на счёте, $; null — DataForSEO его не сообщил */
  balance: number | null
}

/** Проверить логин и пароль API у DataForSEO; отказ — понятной ошибкой. */
export async function dataforseoAccount(login: string, password: string): Promise<DataforseoAccount> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/v3/appendix/user_data`, {
      headers: { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000),
    })
  }
  catch {
    throw createError({ statusCode: 502, message: 'DataForSEO не ответил — попробуйте позже' })
  }
  const body = await res.json().catch(() => null) as {
    status_code?: number
    status_message?: string
    tasks?: Array<{ result?: Array<{ money?: { balance?: unknown } }> }>
  } | null
  if (res.status === 401 || body?.status_code === 40100)
    throw createError({ statusCode: 400, message: 'DataForSEO не принял логин и пароль API' })
  if (!res.ok || body?.status_code !== 20000)
    throw createError({ statusCode: 502, message: `DataForSEO ответил ошибкой: ${body?.status_message ?? res.status}` })
  const balance = body.tasks?.[0]?.result?.[0]?.money?.balance
  return { balance: typeof balance === 'number' ? balance : null }
}

/*
 * Миграция спроса ещё не применена: таблицы или функции нет. PostgREST
 * отвечает PGRST202 (функция) / PGRST205 (таблица), Postgres — 42P01/42883.
 * Страница тогда говорит это прямо, а не падает.
 */
export function demandNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code ?? '')
}

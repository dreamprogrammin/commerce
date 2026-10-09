import type { H3Event } from 'h3'
import type { RevalidateRequest } from './isrRevalidate'
import process from 'node:process'
import { loadRevalidateData, pathsForRequest, revalidateOnVercel } from './isrRevalidate'

/**
 * Общий запуск сброса кеша ISR: адреса по запросу (+ готовые адреса), токен,
 * запросы к Vercel. Без токена (`ISR_BYPASS_TOKEN`) и вне Vercel ничего не
 * делает и говорит об этом в ответе — на стенде и в dev кеша ISR нет.
 */
export async function runRevalidation(event: H3Event, db: any, req: RevalidateRequest, extraPaths: string[] = []) {
  const token = useRuntimeConfig(event).isrBypassToken
  if (!token || !process.env.VERCEL)
    return { revalidated: 0, skipped: !token ? 'нет ISR_BYPASS_TOKEN' : 'не Vercel — кеша ISR нет' }

  const data = await loadRevalidateData(db, req)
  const paths = [...new Set([...pathsForRequest(req, data), ...extraPaths])]
  if (!paths.length)
    return { revalidated: 0, skipped: 'нечего сбрасывать' }

  const results = await revalidateOnVercel(getRequestURL(event).origin, token, paths)
  const failed = results.filter(r => r.status === 0 || r.status >= 500)
  return { revalidated: results.length - failed.length, failed }
}

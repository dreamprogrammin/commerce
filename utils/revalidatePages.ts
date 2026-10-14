import { useAdminRevalidateStore } from '@/stores/adminStore/adminRevalidateStore'

/**
 * Сброс кеша страниц сайта после правки в админке — в фоне, ошибки только в
 * консоль: сохранение от сброса не зависит (9 октября 2026).
 *
 * Кеш страниц суточный (ради лимита трафика Supabase), поэтому правка должна
 * доезжать до сайта сразу. Что сбросить, решает сервер по тому, что
 * изменилось, — см. server/api/admin/revalidate.post.ts.
 *
 * С 14 октября 2026 правки не уходят сразу, а копятся в очереди
 * (stores/adminStore/adminRevalidateStore.ts) и отправляются одним пакетом
 * через минуту после последней — общие страницы пересобираются один раз.
 */
export interface RevalidatePagesBody {
  productIds?: string[]
  categoryIds?: string[]
  brandIds?: string[]
  lineIds?: string[]
  campaignIds?: string[]
  paths?: string[]
  scope?: 'catalog'
}

export function revalidatePages(body: RevalidatePagesBody): void {
  useAdminRevalidateStore().enqueue(body)
}

/** Сервер берёт не больше 50 явных адресов за запрос (revalidate.post.ts). */
const PATHS_PER_REQUEST = 50

/** Удалённый товар: его страниц в базе уже нет, адреса считаются по слагу. */
export interface DeletedProductTarget {
  slug: string
  categoryId: string | null
  brandId: string | null
}

type IdKey = 'productIds' | 'categoryIds' | 'brandIds' | 'lineIds' | 'campaignIds'
const ID_KEYS: IdKey[] = ['productIds', 'categoryIds', 'brandIds', 'lineIds', 'campaignIds']

/** Собрать накопленное в тела запросов: одно общее (адреса — частями) и по одному на удалённый товар. */
export function buildRevalidateRequests(
  body: RevalidatePagesBody,
  deleted: readonly DeletedProductTarget[],
): { url: string, body: object }[] {
  const requests: { url: string, body: object }[] = []
  const ids = Object.fromEntries(ID_KEYS.filter(k => body[k]?.length).map(k => [k, body[k]]))
  const paths = body.paths ?? []
  const pathChunks: string[][] = []
  for (let i = 0; i < paths.length; i += PATHS_PER_REQUEST)
    pathChunks.push(paths.slice(i, i + PATHS_PER_REQUEST))
  const hasIds = Object.keys(ids).length > 0 || body.scope
  if (hasIds || pathChunks.length) {
    requests.push({
      url: '/api/admin/revalidate',
      body: { ...ids, ...(body.scope ? { scope: body.scope } : {}), ...(pathChunks[0] ? { paths: pathChunks[0] } : {}) },
    })
    for (const chunk of pathChunks.slice(1))
      requests.push({ url: '/api/admin/revalidate', body: { paths: chunk } })
  }
  for (const target of deleted)
    requests.push({ url: '/api/admin/revalidate-product', body: target })
  return requests
}

/** Слить правку в накопленное: множества id и адресов без повторов. */
export function mergeRevalidateBody(into: RevalidatePagesBody, add: RevalidatePagesBody): RevalidatePagesBody {
  const out: RevalidatePagesBody = { ...into }
  for (const key of [...ID_KEYS, 'paths'] as const) {
    if (add[key]?.length)
      out[key] = [...new Set([...(into[key] ?? []), ...add[key]!])]
  }
  if (add.scope)
    out.scope = add.scope
  return out
}

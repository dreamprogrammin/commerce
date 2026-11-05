import process from 'node:process'

/**
 * Вордстат для страницы «Спрос на рынке» (2 ноября 2026): проверка ключа
 * Yandex Cloud и номер региона «Казахстан» — бесплатным GetRegionsTree. Числа
 * по темам запрашивает база (`market_demand_yandex_tick` через pg_net), сервер
 * их не трогает.
 *
 * Бесплатный API Вордстата по заявке Яндекс закрыл; теперь это Wordstat API в
 * Yandex Cloud Search API: API-ключ сервисного аккаунта с ролью
 * search-api.webSearch.user и ID каталога в теле запроса.
 */
const API = 'https://searchapi.api.cloud.yandex.net'

/*
 * Заглушка для проверки страницы без настоящего ключа. Только localhost —
 * иначе переменная окружения увела бы ключ на чужой сервер.
 */
function apiBase(): string {
  const stub = process.env.WORDSTAT_STUB_URL
  if (!stub)
    return API
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(stub))
    throw createError({ statusCode: 500, message: 'WORDSTAT_STUB_URL — только локальная заглушка' })
  return stub
}

export interface WordstatRegion {
  id: string
  name: string
}

interface RegionNode {
  id?: unknown
  label?: unknown
  children?: unknown
}

/** Узел дерева регионов, подходящий под условие, — в любой глубине. */
function findRegion(nodes: unknown, match: (id: string, name: string) => boolean): WordstatRegion | null {
  if (!Array.isArray(nodes))
    return null
  for (const node of nodes as RegionNode[]) {
    const id = typeof node?.id === 'string' || typeof node?.id === 'number' ? String(node.id) : ''
    const name = typeof node?.label === 'string' ? node.label.trim() : ''
    if (id && match(id, name))
      return { id, name: name || 'Казахстан' }
    const inner = findRegion(node?.children, match)
    if (inner)
      return inner
  }
  return null
}

/**
 * Проверить ключ у Вордстата и найти в его дереве Казахстан (в геобазе Яндекса
 * он 159 — запасной путь, если название другое). Отказ — понятной ошибкой.
 */
export async function wordstatKazakhstan(apiKey: string, folderId: string): Promise<WordstatRegion> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/v2/wordstat/getRegionsTree`, {
      method: 'POST',
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
      signal: AbortSignal.timeout(10000),
    })
  }
  catch {
    throw createError({ statusCode: 502, message: 'Вордстат не ответил — попробуйте позже' })
  }
  const body = await res.json().catch(() => null) as { regions?: unknown, message?: unknown } | null
  const detail = typeof body?.message === 'string' && body.message ? ` (${body.message})` : ''
  if (res.status === 401)
    throw createError({ statusCode: 400, message: `Yandex Cloud не принял API-ключ${detail}` })
  if (res.status === 403) {
    throw createError({
      statusCode: 400,
      message: `Нет доступа к Вордстату: у сервисного аккаунта нет роли search-api.webSearch.user в этом каталоге или не активен платёжный аккаунт${detail}`,
    })
  }
  if (res.status === 400 || res.status === 404)
    throw createError({ statusCode: 400, message: `Вордстат не принял запрос — проверьте ID каталога${detail}` })
  if (!res.ok)
    throw createError({ statusCode: 502, message: `Вордстат ответил ошибкой ${res.status}${detail}` })

  const region = findRegion(body?.regions, (_, name) => /^(?:республика\s+)?казахстан$|^kazakhstan$/i.test(name))
    ?? findRegion(body?.regions, id => id === '159')
  if (!region)
    throw createError({ statusCode: 400, message: 'В регионах Вордстата нет Казахстана — числа по Казахстану так не получить' })
  return region
}

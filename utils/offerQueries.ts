import type { DemandLevel } from './offerDemand'

/**
 * Точный спрос у товаров поставщиков (18 ноября 2026). Владелец 18.11:
 * «умный поиск товаров работает слишком широко, типа по запросу «куклы» —
 * нужно, чтобы он ещё узко работал и на основе этого собирал мне товары».
 * ИИ подбирает товару 2–3 запроса покупателя (server/utils/supplierQueries.ts),
 * DataForSEO отвечает, сколько их ищут (миграция 20261118120000). Здесь —
 * разбор фраз и уровень спроса по ним.
 */

/** Точный спрос для страницы — supplier_offer_demand(), миграция 20261118120000 */
export interface OfferNarrowSummary {
  /** Фраза → поисков в месяц; null — DataForSEO ответил «данных нет» */
  volumes: Record<string, number | null>
  /** Фраз ждут проверки */
  unchecked: number
  /** Прочитанных новых товаров без подобранных запросов */
  withoutQueries: number
  /** Проверка идёт */
  pending: boolean
  last: { status: 'pending' | 'done' | 'failed', error: string | null, items: number | null, sent: number, finishedAt: string | null } | null
}

/** Фраз на один товар, не больше */
export const QUERIES_PER_ITEM = 3

/**
 * Фраза — как её примет Google Ads и как её сверит база: строчными, только
 * буквы, цифры и одиночные пробелы, 2–6 слов, до 60 знаков. Дефис и прочие
 * знаки — пробелом («человек-паук» → «человек паук»): со знаками DataForSEO
 * отклоняет всю задачу. Одно слово — не точный запрос («кукла»), мимо.
 */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string')
    return null
  const q = raw.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const words = q.split(' ')
  if (words.length < 2 || words.length > 6 || q.length > 60)
    return null
  // Только кириллица (с казахскими буквами), латиница и цифры — как проверка в базе
  // eslint-disable-next-line regexp/no-obscure-range -- а-я — ровно русский алфавит, как в базе
  if (!/^[0-9a-zа-яәғқңөұүһі ]+$/.test(q))
    return null
  return q
}

/** Фразы одного товара: годные, без повторов, не больше QUERIES_PER_ITEM */
export function normalizeQueries(list: unknown): string[] {
  if (!Array.isArray(list))
    return []
  const out: string[] = []
  for (const raw of list) {
    const q = normalizeQuery(raw)
    if (q && !out.includes(q))
      out.push(q)
    if (out.length === QUERIES_PER_ITEM)
      break
  }
  return out
}

/**
 * Ответ модели — `{ items: [{ id, queries }] }` → фразы по номерам товаров.
 * Чужие и повторные номера — мимо; JSON в ```json … ``` — тоже разбирается.
 */
export function parseQueriesReply(raw: string, ids: string[]): Map<string, string[]> {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const body = JSON.parse(text) as { items?: unknown }
  if (!Array.isArray(body?.items))
    throw new Error('В ответе модели нет списка items')
  const wanted = new Set(ids)
  const out = new Map<string, string[]>()
  for (const entry of body.items as { id?: unknown, queries?: unknown }[]) {
    const id = typeof entry?.id === 'string' ? entry.id : String(entry?.id ?? '')
    if (wanted.has(id) && !out.has(id))
      out.set(id, normalizeQueries(entry.queries))
  }
  return out
}

/** Точный спрос товара — по самой частой из его проверенных фраз */
export interface OfferNarrow {
  /** Самая частая фраза; null — ни у одной цифр нет */
  phrase: string | null
  /** Поисков в месяц по ней; 0 — проверены, но ищут слишком редко */
  volume: number
  /** Все фразы товара, по убыванию спроса; непроверенные — в конце */
  phrases: { phrase: string, volume: number | null, checked: boolean }[]
  /** DataForSEO ответил хотя бы на одну фразу */
  checked: boolean
}

/**
 * Точный спрос по фразам товаров поста (`search_queries`) и ответам
 * DataForSEO (`volumes`: фраза → поисков в месяц, null — «данных нет»).
 * Фраз нет — null. `item` — только этот товар поста.
 */
export function offerNarrow(queries: string[][] | null | undefined, volumes: Record<string, number | null>, item?: number): OfferNarrow | null {
  const lists = item == null ? (queries ?? []) : [queries?.[item] ?? []]
  const all = [...new Set(lists.flat())]
  if (!all.length)
    return null
  const phrases = all
    .map(phrase => ({ phrase, checked: Object.hasOwn(volumes, phrase), volume: volumes[phrase] ?? null }))
    .sort((a, b) => Number(b.checked) - Number(a.checked) || (b.volume ?? -1) - (a.volume ?? -1))
  const best = phrases.find(p => (p.volume ?? 0) > 0) ?? null
  return {
    phrase: best?.phrase ?? null,
    volume: best?.volume ?? 0,
    phrases,
    checked: phrases.some(p => p.checked),
  }
}

/**
 * Границы уровней точного спроса — трети фраз с цифрами, как у тем
 * (demandLevelBounds): верхняя треть — высокий. Относительно своих фраз:
 * порог для Казахстана заранее не известен. Фраз с цифрами меньше трёх — null.
 */
export function narrowLevelBounds(volumes: Record<string, number | null>): { mid: number, high: number } | null {
  const v = Object.values(volumes).filter((n): n is number => (n ?? 0) > 0).sort((a, b) => a - b)
  if (v.length < 3)
    return null
  return { mid: v[Math.floor(v.length / 3)]!, high: v[Math.floor((2 * v.length) / 3)]! }
}

/** Уровень по точному спросу: не проверен — «нет данных», ищут редко — «спроса нет» */
export function narrowLevel(n: OfferNarrow | null, bounds: { mid: number, high: number } | null): DemandLevel {
  if (!n?.checked)
    return 'unknown'
  if (n.volume <= 0)
    return 'none'
  if (!bounds)
    return 'mid'
  return n.volume >= bounds.high ? 'high' : n.volume >= bounds.mid ? 'mid' : 'low'
}

import { normalizeQuery } from './offerQueries'

/**
 * Примерный спрос у товаров поставщиков (22 ноября 2026). Владелец 22.11:
 * «для товаров ии должен еще делать примерный поиск а не обязательно по
 * названию товара то есть какой либо анализ». Точные фразы (18.11) ищут
 * товар по названию, а безымянные игрушки по названию почти не ищут: на бою
 * у 104 из 300 товаров не было ни темы, ни цифр.
 *
 * ИИ по прочитанному названию разбирает, что это за вещь
 * (server/utils/supplierGuess.ts): как её ищут, не зная марки, — запрос
 * проверяет DataForSEO вместе с точными, — и к какой теме «Спроса на рынке»
 * она ближе по смыслу. Миграция 20261122120000.
 */

/** Разбор одного товара поста */
export interface OfferGuess {
  /** Как такую вещь ищут, не зная марки: «игрушечный пылесос»; null — модель не поняла, что это */
  query: string | null
  /** Тема «Спроса на рынке» по смыслу (topic_id); null — ни одна не подходит */
  topic: string | null
}

/**
 * Ответ модели — `{ items: [{ id, query, topic }] }`: topic — номер темы по
 * списку в запросе, с 1; 0 — ни одна не подходит. Номер вне списка — тоже
 * «не подходит»; запрос — по правилам точных фраз (normalizeQuery). Чужие и
 * повторные id — мимо; JSON в ```json … ``` — тоже разбирается.
 */
export function parseGuessReply(raw: string, ids: string[], topicIds: string[]): Map<string, OfferGuess> {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const body = JSON.parse(text) as { items?: unknown }
  if (!Array.isArray(body?.items))
    throw new Error('В ответе модели нет списка items')
  const wanted = new Set(ids)
  const out = new Map<string, OfferGuess>()
  for (const entry of body.items as { id?: unknown, query?: unknown, topic?: unknown }[]) {
    const id = typeof entry?.id === 'string' ? entry.id : String(entry?.id ?? '')
    if (!wanted.has(id) || out.has(id))
      continue
    const n = typeof entry.topic === 'number' ? entry.topic : typeof entry.topic === 'string' ? Number(entry.topic) : 0
    out.set(id, {
      query: normalizeQuery(entry.query),
      topic: Number.isInteger(n) && n >= 1 && n <= topicIds.length ? topicIds[n - 1]! : null,
    })
  }
  return out
}

/** Разбор из базы: по товарам поста; не объект — null у товара, не массив — null у поста */
export function guessesOf(raw: unknown): (OfferGuess | null)[] | null {
  if (!Array.isArray(raw))
    return null
  return raw.map((g) => {
    if (!g || typeof g !== 'object' || Array.isArray(g))
      return null
    const { query, topic } = g as { query?: unknown, topic?: unknown }
    return {
      query: typeof query === 'string' && query ? query : null,
      topic: typeof topic === 'string' && topic ? topic : null,
    }
  })
}

/** Запросы разбора по товарам поста — в форме точных фраз (`string[][]`), для offerNarrow */
export function guessQueries(guess: (OfferGuess | null)[] | null | undefined): string[][] | null {
  return guess ? guess.map(g => (g?.query ? [g.query] : [])) : null
}

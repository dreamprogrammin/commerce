/**
 * Тема спроса из тела запроса админки («Спрос на рынке», 1.11.2026). Строгую
 * проверку и нормализацию фраз делает база (триггер
 * `market_demand_topics_normalize`, для фразы Вордстата —
 * `market_demand_topics_yandex`) — здесь только форма: строки, списки строк,
 * разумные длины.
 */
export interface DemandTopicInput {
  name: string
  kind: 'type' | 'franchise'
  keywords: string[]
  match_terms: string[]
  is_active: boolean
  /**
   * Своя фраза для Вордстата (2.11.2026); пустая — по первой фразе. Нет в
   * теле — поле не трогается: страница шлёт его, только когда миграция
   * Вордстата применена, иначе запись темы упала бы на незнакомом столбце.
   */
  yandex_phrase?: string | null
}

function stringList(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string'))
    throw createError({ statusCode: 400, message: `${what} — список строк` })
  const list = value.map(v => v.trim()).filter(Boolean)
  if (list.length > 10)
    throw createError({ statusCode: 400, message: `${what} — не больше 10` })
  return list
}

export function parseDemandTopic(body: unknown): DemandTopicInput {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 80)
    throw createError({ statusCode: 400, message: 'Название темы — от 1 до 80 знаков' })
  if (b.kind !== undefined && b.kind !== 'type' && b.kind !== 'franchise')
    throw createError({ statusCode: 400, message: 'Вид темы — тип товара или персонаж/бренд' })
  const keywords = stringList(b.keywords, 'Поисковые фразы')
  if (!keywords.length)
    throw createError({ statusCode: 400, message: 'Нужна хотя бы одна поисковая фраза' })
  const topic: DemandTopicInput = {
    name,
    kind: b.kind === 'franchise' ? 'franchise' : 'type',
    keywords,
    match_terms: b.match_terms === undefined ? [] : stringList(b.match_terms, 'Признаки своего товара'),
    is_active: b.is_active === undefined ? true : b.is_active === true,
  }
  if (b.yandex_phrase !== undefined) {
    if (b.yandex_phrase !== null && typeof b.yandex_phrase !== 'string')
      throw createError({ statusCode: 400, message: 'Фраза для Вордстата — строка' })
    const phrase = typeof b.yandex_phrase === 'string' ? b.yandex_phrase.trim() : ''
    if (phrase.length > 120)
      throw createError({ statusCode: 400, message: 'Фраза для Вордстата — до 120 знаков' })
    topic.yandex_phrase = phrase || null
  }
  return topic
}

/** Ошибка базы при записи темы → понятный ответ. */
export function throwDemandTopicError(error: { code?: string, message: string }): never {
  if (error.code === '23505')
    throw createError({ statusCode: 400, message: 'Тема с таким названием уже есть' })
  // Отказ триггера (RAISE EXCEPTION) — уже по-русски и по делу
  if (error.code === 'P0001')
    throw createError({ statusCode: 400, message: error.message })
  throw createError({ statusCode: 500, message: error.message })
}

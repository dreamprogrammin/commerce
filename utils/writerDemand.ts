import type { OfferDemandTopic } from './offerDemand'
import { topicMatches } from './offerDemand'

/**
 * Спрос — в тексты ИИ для товара (27.11.2026). Владелец: «описание должно
 * генерироваться по спросу». Модель получает то, что покупатели в Казахстане
 * на самом деле ищут: фразы этого товара (supplier_offers.search_queries и
 * запрос разбора demand_guess) и самые частые фразы его темы «Спроса на
 * рынке» и персонажа из названия — с числом запросов в месяц из
 * market_demand_keywords. Фразы без поисков и без цифр не идут: подсказывать
 * модели нечего.
 */

export interface DemandPhrase {
  phrase: string
  /** Запросов в месяц, Google, Казахстан */
  volume: number
}

export interface WriterDemand {
  /** Фразы этого товара — от частых к редким */
  own: DemandPhrase[]
  /**
   * Темы спроса и их частые фразы, кроме уже названных выше: тема товара и
   * персонаж из его названия (27.11.2026), если это другая тема. Тема без
   * фраз с поисками не идёт.
   */
  topics: { name: string, phrases: DemandPhrase[] }[]
}

export const OWN_PHRASES = 5
export const TOPIC_PHRASES = 6

export const normPhrase = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

type Topic = Pick<OfferDemandTopic, 'topic_id' | 'name' | 'kind' | 'keywords' | 'match_terms' | 'is_active'>

const topicVolume = (t: Topic, volumes: Map<string, number | null>) => t.keywords.reduce((s, k) => s + (volumes.get(normPhrase(k)) ?? 0), 0)

function bestTopic<T extends Topic>(topics: T[], fits: (t: T) => boolean, volumes: Map<string, number | null>): T | null {
  let best: T | null = null
  for (const t of topics) {
    if (t.is_active && fits(t) && (!best || topicVolume(t, volumes) > topicVolume(best, volumes)))
      best = t
  }
  return best
}

/**
 * Тема товара: выбранная разбором ИИ по смыслу (demand_guess.topic), иначе —
 * по признакам в тексте товара, как на «Товарах поставщиков». Подошло
 * несколько — с бо́льшим спросом по её фразам.
 */
export function writerTopic<T extends Topic>(topics: T[], guessTopic: string | null | undefined, text: string, volumes: Map<string, number | null>): T | null {
  const byGuess = guessTopic ? topics.find(t => t.is_active && t.topic_id === guessTopic) : undefined
  return byGuess ?? bestTopic(topics, t => topicMatches(t, text), volumes)
}

/**
 * Темы для текста (27.11.2026): тема товара и персонаж. Разбор ИИ относит
 * «Куклу Alisa Barbie» к «Кукле», «Микрофон Spider-Man» — к «Микрофону
 * караоке», и запросы «барби» и «человек паук» модель не видела — а по ним
 * такие товары и ищут. Персонаж — тема-франшиза по признакам в названии и
 * бренде самого товара (itemText): подпись поста общая на все его товары, и
 * персонаж соседнего товара прилип бы не к тому.
 */
export function writerTopics<T extends Topic>(topics: T[], guessTopic: string | null | undefined, text: string, itemText: string, volumes: Map<string, number | null>): T[] {
  const main = writerTopic(topics, guessTopic, text, volumes)
  const franchise = bestTopic(topics, t => t.kind === 'franchise' && t.topic_id !== main?.topic_id && topicMatches(t, itemText), volumes)
  return [main, franchise].filter((t): t is T => Boolean(t))
}

/** Фразы с поисками — от частых к редким, без повторов и без уже названных (skip) */
function withVolume(phrases: string[], volumes: Map<string, number | null>, skip: Set<string>, limit: number): DemandPhrase[] {
  const seen = new Set(skip)
  const out: DemandPhrase[] = []
  for (const raw of phrases) {
    const phrase = normPhrase(raw)
    const volume = volumes.get(phrase)
    if (!phrase || seen.has(phrase) || volume == null || volume <= 0)
      continue
    seen.add(phrase)
    out.push({ phrase, volume })
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, limit)
}

export function writerDemand(own: string[], topics: Pick<OfferDemandTopic, 'name' | 'keywords'>[], volumes: Map<string, number | null>): WriterDemand | null {
  // Одна фраза — один раз: у товара, иначе у первой темы, где она есть. Занятыми
  // считаются только показанные — отрезанная лимитом фраза может уйти в тему
  const used = new Set<string>()
  const ownPhrases = withVolume(own, volumes, used, OWN_PHRASES)
  ownPhrases.forEach(p => used.add(p.phrase))
  const blocks: WriterDemand['topics'] = []
  for (const t of topics) {
    const phrases = withVolume(t.keywords, volumes, used, TOPIC_PHRASES)
    phrases.forEach(p => used.add(p.phrase))
    if (phrases.length)
      blocks.push({ name: t.name, phrases })
  }
  if (!ownPhrases.length && !blocks.length)
    return null
  return { own: ownPhrases, topics: blocks }
}

const line = (p: DemandPhrase) => `- ${p.phrase} — ${p.volume.toLocaleString('ru-RU').replace(/\s/g, ' ')}`

/** Блок СПРОС для сообщения модели; спроса нет — пустая строка */
export function demandBlock(d: WriterDemand | null): string {
  if (!d)
    return ''
  return [
    'СПРОС (что покупатели ищут в Google по Казахстану, запросов в месяц):',
    ...(d.own.length ? ['Запросы про этот товар:', ...d.own.map(line)] : []),
    ...d.topics.flatMap(t => [`Частые запросы темы «${t.name}»:`, ...t.phrases.map(line)]),
  ].join('\n')
}

/** Всё, что ушло модели, — одним списком для карточки «Тексты от ИИ» */
export const demandPhrases = (d: WriterDemand | null): DemandPhrase[] => d ? [...d.own, ...d.topics.flatMap(t => t.phrases)] : []

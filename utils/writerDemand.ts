import type { OfferDemandTopic } from './offerDemand'
import { topicMatches } from './offerDemand'

/**
 * Спрос — в тексты ИИ для товара (27.11.2026). Владелец: «описание должно
 * генерироваться по спросу». Модель получает то, что покупатели в Казахстане
 * на самом деле ищут: фразы этого товара (supplier_offers.search_queries и
 * запрос разбора demand_guess) и самые частые фразы его темы «Спроса на
 * рынке» — с числом запросов в месяц из market_demand_keywords. Фразы без
 * поисков и без цифр не идут: подсказывать модели нечего.
 */

export interface DemandPhrase {
  phrase: string
  /** Запросов в месяц, Google, Казахстан */
  volume: number
}

export interface WriterDemand {
  /** Фразы этого товара — от частых к редким */
  own: DemandPhrase[]
  /** Тема спроса и её частые фразы, кроме уже названных у товара */
  topic: { name: string, phrases: DemandPhrase[] } | null
}

export const OWN_PHRASES = 5
export const TOPIC_PHRASES = 6

export const normPhrase = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Тема товара: выбранная разбором ИИ по смыслу (demand_guess.topic), иначе —
 * по признакам в тексте товара, как на «Товарах поставщиков». Подошло
 * несколько — с бо́льшим спросом по её фразам.
 */
export function writerTopic(
  topics: Pick<OfferDemandTopic, 'topic_id' | 'name' | 'keywords' | 'match_terms' | 'is_active'>[],
  guessTopic: string | null | undefined,
  text: string,
  volumes: Map<string, number | null>,
): (typeof topics)[number] | null {
  const active = topics.filter(t => t.is_active)
  const byGuess = guessTopic ? active.find(t => t.topic_id === guessTopic) : undefined
  if (byGuess)
    return byGuess
  const sum = (t: (typeof topics)[number]) => t.keywords.reduce((s, k) => s + (volumes.get(normPhrase(k)) ?? 0), 0)
  let best: (typeof topics)[number] | null = null
  for (const t of active) {
    if (topicMatches(t, text) && (!best || sum(t) > sum(best)))
      best = t
  }
  return best
}

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

export function writerDemand(
  own: string[],
  topic: Pick<OfferDemandTopic, 'name' | 'keywords'> | null,
  volumes: Map<string, number | null>,
): WriterDemand | null {
  const ownPhrases = withVolume(own, volumes, new Set(), OWN_PHRASES)
  const topicPhrases = topic ? withVolume(topic.keywords, volumes, new Set(ownPhrases.map(p => p.phrase)), TOPIC_PHRASES) : []
  if (!ownPhrases.length && !topicPhrases.length)
    return null
  return { own: ownPhrases, topic: topic && topicPhrases.length ? { name: topic.name, phrases: topicPhrases } : null }
}

const line = (p: DemandPhrase) => `- ${p.phrase} — ${p.volume.toLocaleString('ru-RU').replace(/\s/g, ' ')}`

/** Блок СПРОС для сообщения модели; спроса нет — пустая строка */
export function demandBlock(d: WriterDemand | null): string {
  if (!d)
    return ''
  return [
    'СПРОС (что покупатели ищут в Google по Казахстану, запросов в месяц):',
    ...(d.own.length ? ['Запросы про этот товар:', ...d.own.map(line)] : []),
    ...(d.topic ? [`Частые запросы темы «${d.topic.name}»:`, ...d.topic.phrases.map(line)] : []),
  ].join('\n')
}

/** Всё, что ушло модели, — одним списком для карточки «Тексты от ИИ» */
export const demandPhrases = (d: WriterDemand | null): DemandPhrase[] => d ? [...d.own, ...(d.topic?.phrases ?? [])] : []

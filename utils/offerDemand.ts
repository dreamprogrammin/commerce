import type { DemandTopic } from './marketDemand'
import type { Offer } from './supplierOfferList'

/**
 * Спрос у товаров поставщиков (6 ноября 2026). Владелец 4.11: «нейронка
 * смотрит, какие товары сейчас в спросе, и по ним формирует заказ». Тема
 * спроса («Спрос на рынке», DataForSEO) находит товар поставщика так же,
 * как свой товар на сайте в market_demand_summary(): признак темы
 * (match_terms, без них — поисковые фразы) — начало слова в названии и
 * бренде, прочитанных ИИ, или в подписи поста. «*» — что угодно между
 * частями. Совпало несколько тем — берём с бо́льшим спросом.
 */

/** Тема спроса — то, что нужно странице «Товары поставщиков» */
export type OfferDemandTopic = Pick<DemandTopic, 'topic_id' | 'name' | 'kind' | 'keywords' | 'match_terms' | 'is_active' | 'volume_avg3' | 'trend_pct' | 'season_soon' | 'our_total' | 'our_in_stock'>

export interface OfferDemand {
  topicId: string
  name: string
  /** Запросов в месяц, среднее за 3 месяца; null — цифр ещё нет */
  volume: number | null
  trendPct: number | null
  seasonSoon: boolean
  /** Своих товаров темы на сайте и в наличии */
  ourTotal: number
  ourInStock: number
}

/**
 * Регулярка признака — как market_demand_term_regex: `\y` + признак, где
 * `.` и `+` — сами знаки, `*` — что угодно. `\y` Postgres — граница слова;
 * в JS `\b` кириллицы не знает, поэтому «перед признаком не буква и не цифра».
 */
export function termRegex(term: string): RegExp {
  const body = term.toLowerCase().replace(/[.+]/g, m => `\\${m}`).replace(/\*/g, '.*')
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}`, 'u')
}

/** Текст товара поставщика для сверки с темами */
export function offerText(offer: Pick<Offer, 'caption' | 'items'>): string {
  const read = (offer.items ?? []).flatMap(it => [it.name, it.brand ?? ''])
  return [...read, offer.caption].join(' ').toLowerCase().replace(/\s+/g, ' ')
}

export function topicMatches(topic: Pick<OfferDemandTopic, 'keywords' | 'match_terms'>, text: string): boolean {
  const terms = topic.match_terms.length ? topic.match_terms : topic.keywords
  return terms.some((t) => {
    try {
      return termRegex(t).test(text)
    }
    catch {
      return false
    }
  })
}

export function offerDemand(offer: Pick<Offer, 'caption' | 'items'>, topics: OfferDemandTopic[]): OfferDemand | null {
  const text = offerText(offer)
  let best: OfferDemandTopic | null = null
  for (const t of topics) {
    if (!t.is_active || !topicMatches(t, text))
      continue
    if (!best || (t.volume_avg3 ?? -1) > (best.volume_avg3 ?? -1))
      best = t
  }
  return best && {
    topicId: best.topic_id,
    name: best.name,
    volume: best.volume_avg3,
    trendPct: best.trend_pct,
    seasonSoon: best.season_soon,
    ourTotal: best.our_total,
    ourInStock: best.our_in_stock,
  }
}

export type OfferDemandFilter = 'all' | 'demand' | 'none'

export const OFFER_DEMAND_FILTERS: { id: OfferDemandFilter, label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'demand', label: 'Есть спрос' },
  { id: 'none', label: 'Темы нет' },
]

/**
 * Отбор и порядок по спросу: «Есть спрос» — тема с цифрами больше нуля,
 * сверху самый большой спрос; «Темы нет» — ни одна тема не нашла товар.
 * «Все» — порядок не меняется (по времени поста).
 */
export function filterByDemand<T extends Pick<Offer, 'caption' | 'items'>>(offers: T[], topics: OfferDemandTopic[], filter: OfferDemandFilter): T[] {
  if (filter === 'all')
    return offers
  const withDemand = offers.map(o => ({ o, d: offerDemand(o, topics) }))
  if (filter === 'none')
    return withDemand.filter(x => !x.d).map(x => x.o)
  return withDemand
    .filter(x => (x.d?.volume ?? 0) > 0)
    .sort((a, b) => (b.d!.volume ?? 0) - (a.d!.volume ?? 0))
    .map(x => x.o)
}

/**
 * Заготовка новой темы для товара без темы: бренд, прочитанный ИИ, иначе
 * первые два слова названия. Поисковая фраза — то же строчными.
 */
export function topicDraft(offer: Pick<Offer, 'caption' | 'items'>): { name: string, keyword: string } | null {
  const it = offer.items?.[0]
  const source = it?.brand?.trim() || it?.name?.trim().split(/\s+/).slice(0, 2).join(' ') || ''
  const name = source.replace(/[^\p{L}\p{N} .'&+-]/gu, '').trim().slice(0, 80)
  return name ? { name, keyword: name.toLowerCase() } : null
}

export type DemandLevel = 'high' | 'mid' | 'low' | 'none' | 'unknown'

export const DEMAND_LEVEL_TEXT: Record<DemandLevel, string> = {
  high: 'Спрос высокий',
  mid: 'Спрос средний',
  low: 'Спрос низкий',
  none: 'Спроса нет',
  unknown: 'Спрос: нет данных',
}

/**
 * Границы уровней (6.11.2026, владелец: «рядом с каждой карточкой поставить
 * уровень спроса»): по темам с цифрами — верхняя треть по запросам в месяц —
 * высокий, средняя — средний, нижняя — низкий. Относительно своих тем, а не
 * порогом: какой спрос «высокий» для Казахстана, заранее не известно.
 * null — тем с цифрами меньше трёх, делить не на что.
 */
export function demandLevelBounds(topics: Pick<OfferDemandTopic, 'is_active' | 'volume_avg3'>[]): { mid: number, high: number } | null {
  const v = topics.filter(t => t.is_active && (t.volume_avg3 ?? 0) > 0).map(t => t.volume_avg3!).sort((a, b) => a - b)
  if (v.length < 3)
    return null
  return { mid: v[Math.floor(v.length / 3)]!, high: v[Math.floor((2 * v.length) / 3)]! }
}

/** Уровень спроса товара: тема не нашлась или цифр нет — «нет данных», ноль — «нет спроса» */
export function demandLevel(demand: Pick<OfferDemand, 'volume'> | null, bounds: { mid: number, high: number } | null): DemandLevel {
  if (!demand || demand.volume == null)
    return 'unknown'
  if (demand.volume <= 0)
    return 'none'
  if (!bounds)
    return 'mid'
  return demand.volume >= bounds.high ? 'high' : demand.volume >= bounds.mid ? 'mid' : 'low'
}

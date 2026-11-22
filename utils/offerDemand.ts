import type { DemandTopic } from './marketDemand'
import type { OfferGuess } from './offerGuess'
import type { OfferNarrow } from './offerQueries'
import type { Offer } from './supplierOfferList'
import { guessQueries } from './offerGuess'
import { narrowLevel, narrowLevelBounds, offerNarrow } from './offerQueries'

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

/** Из тем, подходящих товару, — с бо́льшим спросом */
function bestTopic(topics: OfferDemandTopic[], fits: (t: OfferDemandTopic) => boolean): OfferDemand | null {
  let best: OfferDemandTopic | null = null
  for (const t of topics) {
    if (!t.is_active || !fits(t))
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

export function offerDemand(offer: Pick<Offer, 'caption' | 'items'>, topics: OfferDemandTopic[]): OfferDemand | null {
  const text = offerText(offer)
  return bestTopic(topics, t => topicMatches(t, text))
}

/**
 * Тема по смыслу (22.11.2026) — её выбрал ИИ, разбирая товары поста
 * (utils/offerGuess.ts): признаки темы в названии не нашлись, а вещь та же —
 * «полицейская машина» у темы «Машинки» с признаком «машинк». У поста из
 * нескольких товаров — как у тем по признакам: с бо́льшим спросом.
 */
export function offerMeaning(guess: (OfferGuess | null)[] | null | undefined, topics: OfferDemandTopic[]): OfferDemand | null {
  const ids = new Set((guess ?? []).map(g => g?.topic).filter(Boolean))
  return ids.size ? bestTopic(topics, t => ids.has(t.topic_id)) : null
}

export type OfferDemandFilter = 'all' | 'high' | 'none'

export const OFFER_DEMAND_FILTERS: { id: OfferDemandFilter, label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'high', label: 'Высокий спрос' },
  { id: 'none', label: 'Темы нет' },
]

/** Товар поставщика — то, по чему считается его спрос */
export type DemandOffer = Pick<Offer, 'caption' | 'items'> & { queries?: string[][] | null, guess?: (OfferGuess | null)[] | null }

/**
 * Всё, что известно о спросе товара:
 *   • narrow — точные фразы, по названию (18.11.2026);
 *   • demand — тема по признакам в названии и подписи (6.11.2026);
 *   • type — запрос разбора ИИ: как такую вещь ищут, не зная марки (22.11.2026);
 *   • meaning — тема, которую ИИ выбрал по смыслу (22.11.2026).
 */
export interface DemandEvidence {
  narrow: OfferNarrow | null
  demand: Pick<OfferDemand, 'volume'> | null
  type?: OfferNarrow | null
  meaning?: Pick<OfferDemand, 'volume'> | null
}

/**
 * `volumes` — ответы DataForSEO на точные фразы, `guessVolumes` — на запросы
 * разбора ИИ; null — их ещё нет (до первого ответа уровень — по темам).
 */
export function offerEvidence(offer: DemandOffer, topics: OfferDemandTopic[], volumes?: Record<string, number | null> | null, guessVolumes?: Record<string, number | null> | null) {
  return {
    narrow: volumes ? offerNarrow(offer.queries, volumes) : null,
    demand: offerDemand(offer, topics),
    type: guessVolumes ? offerNarrow(guessQueries(offer.guess), guessVolumes) : null,
    meaning: offerMeaning(offer.guess, topics),
  }
}

type LevelBounds = { mid: number, high: number } | null

/** Границы уровней у каждого источника — свои трети: цифры фразы и темы разного размаха */
export interface DemandBounds {
  narrow: LevelBounds
  topic: LevelBounds
  type?: LevelBounds
}

export function demandBounds(topics: Pick<OfferDemandTopic, 'is_active' | 'volume_avg3'>[], volumes?: Record<string, number | null> | null, guessVolumes?: Record<string, number | null> | null): DemandBounds {
  return {
    narrow: volumes ? narrowLevelBounds(volumes) : null,
    topic: demandLevelBounds(topics),
    type: guessVolumes ? narrowLevelBounds(guessVolumes) : null,
  }
}

/** Откуда уровень спроса товара */
export type OfferDemandSource = 'narrow' | 'type' | 'topic' | 'meaning'

export interface DemandEstimate {
  level: DemandLevel
  /** null — данных нет */
  source: OfferDemandSource | null
  /** Поисков в месяц по этому источнику — для «сверху больший» */
  volume: number
}

/**
 * Уровень спроса товара. По порядку — что ближе к самому товару:
 *   1. точная фраза, у которой есть цифра, — товар ищут по названию;
 *   2. запрос разбора ИИ с цифрой — такую вещь ищут, хоть и не по названию;
 *   3. тема по признакам, иначе тема по смыслу (ИИ) — с её цифрами;
 *   4. фразы проверены, а цифр нет — «спроса нет»;
 *   5. иначе — «нет данных».
 *
 * 21.11.2026: точная фраза без ответа DataForSEO уровня не задаёт — было, что
 * одна случайно проверенная фраза давала «нет данных» 917 товарам из 918.
 * 22.11.2026 (владелец: «не обязательно по названию товара»): фразы
 * проверены, но по названию не ищут — уровень по примерному запросу или теме,
 * а не «спроса нет», как было с 18.11: безымянную игрушку ищут по виду.
 */
export function offerEstimate(e: DemandEvidence, b: DemandBounds): DemandEstimate {
  if (e.narrow?.checked && e.narrow.volume > 0)
    return { level: narrowLevel(e.narrow, b.narrow), source: 'narrow', volume: e.narrow.volume }
  if (e.type?.checked && e.type.volume > 0)
    return { level: narrowLevel(e.type, b.type ?? null), source: 'type', volume: e.type.volume }
  const topic = e.demand ?? e.meaning ?? null
  if (topic?.volume != null)
    return { level: demandLevel(topic, b.topic), source: e.demand ? 'topic' : 'meaning', volume: topic.volume }
  if (e.narrow?.checked || e.type?.checked)
    return { level: 'none', source: e.narrow?.checked ? 'narrow' : 'type', volume: 0 }
  return { level: 'unknown', source: null, volume: 0 }
}

/** Уровень по точным фразам и теме — без разбора ИИ (страница до миграции 20261122120000) */
export function offerLevel(narrow: OfferNarrow | null, demand: Pick<OfferDemand, 'volume'> | null, narrowBounds: LevelBounds, topicBounds: LevelBounds): DemandLevel {
  return offerEstimate({ narrow, demand }, { narrow: narrowBounds, topic: topicBounds }).level
}

const SOURCE_RANK: Record<OfferDemandSource, number> = { narrow: 0, type: 1, topic: 2, meaning: 3 }

/**
 * Порядок по спросу: сначала то, что ближе к самому товару (точные фразы,
 * потом запрос разбора ИИ, тема, тема по смыслу), внутри — больший спрос.
 * Цифра фразы и цифра темы — разного размаха (тема складывает несколько
 * фраз), поэтому вперемешку их не сравниваем.
 */
export function compareByDemand(a: DemandEstimate, b: DemandEstimate): number {
  const rank = (e: DemandEstimate) => (e.source ? SOURCE_RANK[e.source] : 9)
  return rank(a) - rank(b) || b.volume - a.volume
}

/**
 * Отбор и порядок по спросу: «Высокий спрос» (владелец 18.11.2026, по
 * макету) — уровень «высокий», как метка на фото, сверху самый большой
 * спрос; «Темы нет» — ни тема по признакам, ни тема по смыслу (ИИ) не нашли
 * товар. «Все» — порядок не меняется (по времени поста).
 */
export function filterByDemand<T extends DemandOffer>(offers: T[], topics: OfferDemandTopic[], filter: OfferDemandFilter, volumes?: Record<string, number | null> | null, guessVolumes?: Record<string, number | null> | null): T[] {
  if (filter === 'all')
    return offers
  const withDemand = offers.map(o => ({ o, e: offerEvidence(o, topics, volumes, guessVolumes) }))
  if (filter === 'none')
    return withDemand.filter(x => !x.e.demand && !x.e.meaning).map(x => x.o)
  const bounds = demandBounds(topics, volumes, guessVolumes)
  return withDemand
    .map(x => ({ o: x.o, est: offerEstimate(x.e, bounds) }))
    .filter(x => x.est.level === 'high')
    .sort((a, b) => compareByDemand(a.est, b.est))
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

import type { KaspiCandidate, KaspiSummary } from './kaspiSnapshot'

/**
 * Сверка товаров поставщиков с выдачей Kaspi и топ спроса (20 ноября 2026).
 * Владелец 20.11: «он сканирует товары которые есть у поставщиков отбирает их
 * по артикулам и картинкам смотрит каспи магазин где есть какие либо отзывы
 * продажи оценки выдвигает в топ спрос товара»; вес Kaspi — «на каспи больше».
 *
 * Выдачу приносит закладка владельца; здесь — по артикулу и названию, по
 * фото решает модель ИИ (server/utils/kaspiSnapshots.ts), когда название
 * неоднозначно.
 */

export type MatchBy = 'article' | 'name' | 'photo'

export interface MatchItem {
  name: string
  article: string | null
  brand: string | null
}

export interface MatchResult {
  /** Номер товара в выдаче; null — уверенно не нашлось */
  pick: number | null
  by: MatchBy | null
  /** Похожие по названию — первыми; их и сверяют по фото */
  ranked: { index: number, score: number }[]
}

/** «Арт. F603-EG» → «F603EG»: только буквы и цифры, заглавными */
export function articleKey(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^0-9A-Z\u0410-\u042F\u0401]/g, '')
}

// Слова, которые есть в названии почти любого товара: по ним не сверяем
const STOP = new Set(['для', 'и', 'в', 'с', 'на', 'игрушка', 'игрушки', 'детская', 'детский', 'детское', 'набор', 'шт', 'см', 'новый', 'оригинал'])

/** Слова без регистра, ё → е, без окончаний — «куклы» и «кукла» совпадут */
function stems(s: string): Set<string> {
  const words = s.toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-z\u0430-\u044F]+/).filter(w => w.length >= 2)
  // Окончание (гласные на конце) — долой, потом 5 букв: «куклы», «кукла», «куклой» → «кукл»
  return new Set(words.filter(w => !STOP.has(w)).map(w => (/^\d+$/.test(w) || w.length <= 3 ? w : w.replace(/[аяыиеоуюйь]+$/, '').slice(0, 5))))
}

/** Доля слов названия поставщика, которые есть в названии Kaspi: 0…1 */
export function nameScore(item: MatchItem, title: string): number {
  const a = stems(`${item.brand ?? ''} ${item.name}`)
  if (!a.size)
    return 0
  const b = stems(title)
  let hit = 0
  for (const w of a) {
    if (b.has(w))
      hit++
  }
  return hit / a.size
}

/** Название считается совпавшим уверенно: столько слов и отрыв от второго */
export const NAME_SURE = 0.6
const NAME_GAP = 0.2
/** Артикул короче — совпадёт с чем угодно («12», «A1») */
const ARTICLE_MIN = 4

/**
 * Какой товар выдачи — товар поставщика. Артикул (с цифрой, от 4 знаков) в
 * названии или тексте карточки — сразу он. Иначе название: уверенно — если
 * совпало ≥60% слов и второй отстаёт на 20%. Остальное — ranked для фото.
 */
export function matchCandidate(item: MatchItem, candidates: KaspiCandidate[]): MatchResult {
  const ranked = candidates
    .map((c, index) => ({ index, score: nameScore(item, c.title) }))
    .sort((x, y) => y.score - x.score || x.index - y.index)
  const art = articleKey(item.article)
  if (art.length >= ARTICLE_MIN && /\d/.test(art)) {
    const hit = candidates.findIndex(c => articleKey(`${c.title} ${c.text}`).includes(art))
    if (hit >= 0)
      return { pick: hit, by: 'article', ranked }
  }
  const [first, second] = ranked
  if (first && first.score >= NAME_SURE && first.score - (second?.score ?? 0) >= NAME_GAP)
    return { pick: first.index, by: 'name', ranked }
  return { pick: null, by: null, ranked }
}

// ---------- топ спроса ----------

export interface TopRow {
  key: string
  /** Поисков в месяц по самой частой фразе товара (Google); null — не проверяли */
  google: number | null
  kaspi: KaspiSummary | null
}

export interface TopScore {
  key: string
  score: number
  /** Хит Kaspi: от HIT_REVIEWS отзывов и в верхней трети по Kaspi */
  hit: boolean
  /** На Kaspi такого нет (замер: 0 продавцов, без цены) */
  absent: boolean
}

/** Вес Kaspi в топе — больше Google (владелец 20.11: «на каспи больше») */
export const KASPI_WEIGHT = 0.7
export const HIT_REVIEWS = 50

/** Нет на Kaspi: владелец отметил — замер «0 продавцов» без цены и отзывов */
export function kaspiAbsent(s: KaspiSummary | null | undefined): boolean {
  return !!s && s.last.sellers === 0 && s.last.price == null && !s.last.reviews
}

/**
 * Сила Kaspi: отзывы (их число — следы покупок) плюс прирост отзывов за 30
 * дней, если замеров два; в логарифме — чтобы 10 000 отзывов не задавили всё.
 */
export function kaspiStrength(s: KaspiSummary | null | undefined): number {
  if (!s || kaspiAbsent(s))
    return 0
  const reviews = Math.max(0, s.last.reviews ?? 0)
  let v = Math.log10(1 + reviews)
  if (s.reviewsGrowth != null && s.growthDays) {
    const perMonth = Math.max(0, s.reviewsGrowth) * 30 / s.growthDays
    v += Math.log10(1 + perMonth)
  }
  return v
}

/**
 * Топ: 0,7 × Kaspi + 0,3 × Google, обе доли — от лучшего в списке. Без замера
 * Kaspi товар держится одним Google, то есть ниже равного по Google с Kaspi.
 */
export function rankTop(rows: TopRow[]): TopScore[] {
  const k = rows.map(r => kaspiStrength(r.kaspi))
  const g = rows.map(r => Math.log10(1 + Math.max(0, r.google ?? 0)))
  const kMax = Math.max(0, ...k) || 1
  const gMax = Math.max(0, ...g) || 1
  const withKaspi = k.filter(v => v > 0).sort((a, b) => b - a)
  const third = withKaspi.length ? withKaspi[Math.max(0, Math.ceil(withKaspi.length / 3) - 1)]! : Infinity
  return rows
    .map((r, i) => ({
      key: r.key,
      score: KASPI_WEIGHT * (k[i]! / kMax) + (1 - KASPI_WEIGHT) * (g[i]! / gMax),
      hit: (r.kaspi?.last.reviews ?? 0) >= HIT_REVIEWS && k[i]! >= third,
      absent: kaspiAbsent(r.kaspi),
    }))
    .sort((a, b) => b.score - a.score)
}

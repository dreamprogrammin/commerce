/**
 * «Спрос на рынке» в админке (1 ноября 2026) — подписи, фильтры и мини-график.
 * Цифры считает база (`market_demand_summary`, миграция 20261101120000);
 * здесь только как их показать.
 */

export interface DemandTopic {
  topic_id: string
  name: string
  kind: 'type' | 'franchise'
  keywords: string[]
  match_terms: string[]
  is_active: boolean
  /** 24 месяца, от старого к новому; null — данных ещё нет */
  series: number[] | null
  volume_last: number | null
  volume_avg3: number | null
  volume_prev3: number | null
  /** Последние 3 месяца к тем же месяцам год назад, % */
  trend_pct: number | null
  peak_month: number | null
  peak_ratio: number | null
  season_soon: boolean
  our_total: number
  our_in_stock: number
  data_until: string | null
  updated_at: string | null
}

export interface DemandCandidate {
  keyword: string
  search_volume: number
  /** Последние 3 месяца к 9 перед ними, % */
  trend_pct: number | null
  /** 12 месяцев, от старого к новому */
  series: number[] | null
  first_seen: string
  last_seen: string
}

/** Обновление — две задачи DataForSEO Live по $0,09 (цена ноября 2026) */
export const DEMAND_REFRESH_COST = 0.18

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

/** «пик в декабре» */
export function peakLabel(month: number | null): string | null {
  return month && month >= 1 && month <= 12 ? `пик в ${MONTHS_IN[month - 1]}` : null
}

/** «последний месяц — октябрь 2026» */
export function dataUntilLabel(date: string | null): string | null {
  const m = date?.match(/^(\d{4})-(\d{2})/)
  return m ? `последний месяц — ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null
}

/** 1600 → «1 600» (неразрывный пробел — число не рвётся) */
export function formatVolume(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('ru-RU')
}

/** 0.6412 → «$0,64» */
export function formatUsd(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toFixed(2).replace('.', ',')}`
}

/** Тренд: «+35%», «−60%» (настоящий минус), «0%»; null — сравнивать не с чем */
export function trendLabel(pct: number | null): string | null {
  if (pct == null)
    return null
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : '0%'
}

export type TrendKind = 'up' | 'down' | 'flat'

/** Растёт / падает — от 15% в ту или другую сторону; меньше — «ровно» */
export function trendKind(pct: number | null): TrendKind | null {
  if (pct == null)
    return null
  return pct >= 15 ? 'up' : pct <= -15 ? 'down' : 'flat'
}

export type DemandFilter = 'all' | 'missing' | 'growing' | 'falling' | 'season'

export const DEMAND_FILTERS: Array<{ id: DemandFilter, label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'missing', label: 'Ищут, а у нас нет' },
  { id: 'growing', label: 'Растёт' },
  { id: 'falling', label: 'Падает' },
  { id: 'season', label: 'Скоро сезон' },
]

export function matchesDemandFilter(t: DemandTopic, filter: DemandFilter): boolean {
  switch (filter) {
    case 'missing': return t.is_active && t.our_total === 0 && (t.volume_avg3 ?? 0) > 0
    case 'growing': return t.is_active && trendKind(t.trend_pct) === 'up'
    case 'falling': return t.is_active && trendKind(t.trend_pct) === 'down'
    case 'season': return t.is_active && t.season_soon
    default: return true
  }
}

/**
 * Порядок тем: отслеживаемые с цифрами — по спросу за 3 месяца, потом без
 * цифр по алфавиту, отключённые — в самом конце.
 */
export function sortDemandTopics(list: DemandTopic[]): DemandTopic[] {
  const rank = (t: DemandTopic) => (!t.is_active ? 2 : t.volume_avg3 == null ? 1 : 0)
  return [...list].sort((a, b) =>
    rank(a) - rank(b)
    || (b.volume_avg3 ?? -1) - (a.volume_avg3 ?? -1)
    || a.name.localeCompare(b.name, 'ru'))
}

/** Точки мини-графика: ряд → «x,y x,y …» в рамке w×h (отступ 1px сверху и снизу) */
export function sparkPoints(series: number[] | null | undefined, w: number, h: number): string {
  if (!series?.length)
    return ''
  const max = Math.max(...series, 1)
  const step = series.length > 1 ? w / (series.length - 1) : 0
  const round = (n: number) => Math.round(n * 10) / 10
  return series.map((v, i) => `${round(i * step)},${round(h - 1 - (Math.max(v, 0) / max) * (h - 2))}`).join(' ')
}

/** Список из поля ввода: по строкам, запятым и «;», без пустых и повторов (регистр не важен) */
export function parseDemandList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,;]+/)) {
    const item = raw.trim().replace(/\s+/g, ' ')
    const key = item.toLocaleLowerCase('ru-RU')
    if (item && !seen.has(key)) {
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

/** Название темы из запроса: «кукла монстер» → «Кукла монстер» */
export function topicNameFromKeyword(keyword: string): string {
  const k = keyword.trim()
  return k ? k[0]!.toLocaleUpperCase('ru-RU') + k.slice(1) : k
}

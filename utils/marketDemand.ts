/**
 * «Спрос на рынке» в админке (1 ноября 2026) — подписи, фильтры и мини-график.
 * Цифры считает база (`market_demand_summary`, миграция 20261101120000);
 * здесь только как их показать.
 *
 * С 2 ноября 2026 у тем два источника: Google (DataForSEO) и Яндекс (Вордстат,
 * миграция 20261102120000). Фильтры, порядок и график идут по выбранному.
 */
import { formatTenge } from './formatPrice'

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
  /*
   * Вордстат — те же числа по Яндексу. Поля необязательные: до миграции
   * Вордстата сводка их не отдаёт.
   */
  /** Своя фраза темы для Вордстата; null — считается по первой */
  yandex_phrase?: string | null
  /** Фраза, по которой Вордстат считает тему */
  y_phrase?: string | null
  y_series?: number[] | null
  y_volume_last?: number | null
  y_volume_avg3?: number | null
  y_volume_prev3?: number | null
  y_trend_pct?: number | null
  y_peak_month?: number | null
  y_peak_ratio?: number | null
  y_season_soon?: boolean
  y_data_until?: string | null
}

export type DemandSource = 'google' | 'yandex'

/** Числа темы по одному источнику — то, по чему строится строка, фильтр и порядок */
export interface DemandStats {
  series: number[] | null
  volume_avg3: number | null
  trend_pct: number | null
  peak_month: number | null
  peak_ratio: number | null
  season_soon: boolean
  data_until: string | null
}

export function demandStats(t: DemandTopic, source: DemandSource): DemandStats {
  return source === 'yandex'
    ? {
        series: t.y_series ?? null,
        volume_avg3: t.y_volume_avg3 ?? null,
        trend_pct: t.y_trend_pct ?? null,
        peak_month: t.y_peak_month ?? null,
        peak_ratio: t.y_peak_ratio ?? null,
        season_soon: t.y_season_soon ?? false,
        data_until: t.y_data_until ?? null,
      }
    : {
        series: t.series,
        volume_avg3: t.volume_avg3,
        trend_pct: t.trend_pct,
        peak_month: t.peak_month,
        peak_ratio: t.peak_ratio,
        season_soon: t.season_soon,
        data_until: t.data_until,
      }
}

/** Ход обновления Вордстата — `market_demand_yandex_progress()` */
export interface YandexProgress {
  /** Месяц, который ждём, — прошлый, «YYYY-MM-01» */
  month: string
  /** Фраз у активных тем */
  phrases: number
  /** Из них без чисел за этот месяц — их и спросит «Обновить» */
  stale: number
  last_done_at: string | null
  run: {
    id: number
    status: 'pending' | 'done' | 'failed'
    scheduled: boolean
    phrases: number
    done: number
    failed: number
    paused_until: string | null
    error: string | null
    requested_at: string
    finished_at: string | null
    failures: Array<{ phrase: string, error: string | null }>
  } | null
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

/** Вордстат: динамика — 100 ₸ за 1000 запросов (Yandex Cloud, ноябрь 2026, с НДС), запрос — фраза темы */
export const YANDEX_PHRASE_COST_KZT = 0.1

/** Цена в тенге, и копеечная тоже: 0.1 → «0,1 ₸», 9.2 → «9 ₸» (знак не отрывается) */
export function formatKztCost(n: number): string {
  return n >= 1 ? formatTenge(n) : `${String(Math.round(n * 10) / 10).replace('.', ',')}\u00A0₸`
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

/** «пик в декабре» */
export function peakLabel(month: number | null): string | null {
  return month && month >= 1 && month <= 12 ? `пик в ${MONTHS_IN[month - 1]}` : null
}

/** «октябрь 2026» */
export function monthLabel(date: string | null | undefined): string | null {
  const m = date?.match(/^(\d{4})-(\d{2})/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null
}

/** «последний месяц — октябрь 2026» */
export function dataUntilLabel(date: string | null): string | null {
  const month = monthLabel(date)
  return month ? `последний месяц — ${month}` : null
}

/** Для «по … из N»: «1 фразе», «21 фразе», «4 фразам», «11 фразам» */
export function phrasesDative(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'фразе' : 'фразам'}`
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

export function matchesDemandFilter(t: DemandTopic, filter: DemandFilter, source: DemandSource = 'google'): boolean {
  const s = demandStats(t, source)
  switch (filter) {
    case 'missing': return t.is_active && t.our_total === 0 && (s.volume_avg3 ?? 0) > 0
    case 'growing': return t.is_active && trendKind(s.trend_pct) === 'up'
    case 'falling': return t.is_active && trendKind(s.trend_pct) === 'down'
    case 'season': return t.is_active && s.season_soon
    default: return true
  }
}

/**
 * Порядок тем: отслеживаемые с цифрами — по спросу за 3 месяца, потом без
 * цифр по алфавиту, отключённые — в самом конце.
 */
export function sortDemandTopics(list: DemandTopic[], source: DemandSource = 'google'): DemandTopic[] {
  const volume = (t: DemandTopic) => demandStats(t, source).volume_avg3
  const rank = (t: DemandTopic) => (!t.is_active ? 2 : volume(t) == null ? 1 : 0)
  return [...list].sort((a, b) =>
    rank(a) - rank(b)
    || (volume(b) ?? -1) - (volume(a) ?? -1)
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

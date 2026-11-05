import type { DemandTopic } from '../../utils/marketDemand'
import { describe, expect, it } from 'vitest'
import {
  dataUntilLabel,
  demandStats,
  formatKztCost,
  formatUsd,
  formatVolume,
  matchesDemandFilter,
  monthLabel,
  parseDemandList,
  peakLabel,
  phrasesDative,
  sortDemandTopics,
  sparkPoints,
  topicNameFromKeyword,
  trendKind,
  trendLabel,
} from '../../utils/marketDemand'

/** «Спрос на рынке» (1.11.2026): что показывает страница по цифрам базы. */
function topic(over: Partial<DemandTopic>): DemandTopic {
  return {
    topic_id: over.name ?? 't',
    name: 'Тема',
    kind: 'type',
    keywords: ['тема'],
    match_terms: [],
    is_active: true,
    series: null,
    volume_last: null,
    volume_avg3: null,
    volume_prev3: null,
    trend_pct: null,
    peak_month: null,
    peak_ratio: null,
    season_soon: false,
    our_total: 0,
    our_in_stock: 0,
    data_until: null,
    updated_at: null,
    ...over,
  }
}

describe('подписи', () => {
  it('тренд: плюс, настоящий минус, ноль, без данных', () => {
    expect(trendLabel(35)).toBe('+35%')
    expect(trendLabel(-60)).toBe('−60%')
    expect(trendLabel(0)).toBe('0%')
    expect(trendLabel(null)).toBeNull()
  })

  it('растёт и падает — от 15%', () => {
    expect(trendKind(15)).toBe('up')
    expect(trendKind(14)).toBe('flat')
    expect(trendKind(-15)).toBe('down')
    expect(trendKind(null)).toBeNull()
  })

  it('пик и последний месяц — по-русски', () => {
    expect(peakLabel(12)).toBe('пик в декабре')
    expect(peakLabel(5)).toBe('пик в мае')
    expect(peakLabel(null)).toBeNull()
    expect(peakLabel(13)).toBeNull()
    expect(dataUntilLabel('2026-10-01')).toBe('последний месяц — октябрь 2026')
    expect(dataUntilLabel(null)).toBeNull()
  })

  it('числа: разряды неразрывным пробелом, доллары с запятой', () => {
    expect(formatVolume(1600)).toBe('1 600')
    expect(formatVolume(null)).toBe('—')
    expect(formatUsd(0.6412)).toBe('$0,64')
    expect(formatUsd(null)).toBe('—')
  })
})

describe('фильтры и порядок', () => {
  const lego = topic({ name: 'LEGO', volume_avg3: 12000, trend_pct: 100, our_total: 5, our_in_stock: 3 })
  const puzzles = topic({ name: 'Пазлы', volume_avg3: 5400, trend_pct: -40, season_soon: true })
  const noData = topic({ name: 'Беговел' })
  const off = topic({ name: 'Тамагочи', is_active: false, volume_avg3: 90000, trend_pct: 300, season_soon: true })

  it('«ищут, а у нас нет» — спрос есть, своих товаров ноль', () => {
    expect(matchesDemandFilter(puzzles, 'missing')).toBe(true)
    expect(matchesDemandFilter(lego, 'missing')).toBe(false)
    expect(matchesDemandFilter(noData, 'missing')).toBe(false)
  })

  it('растёт / падает / сезон; отключённая тема — только во «Все»', () => {
    expect(matchesDemandFilter(lego, 'growing')).toBe(true)
    expect(matchesDemandFilter(puzzles, 'falling')).toBe(true)
    expect(matchesDemandFilter(puzzles, 'season')).toBe(true)
    expect(['missing', 'growing', 'falling', 'season'].some(f => matchesDemandFilter(off, f as any))).toBe(false)
    expect(matchesDemandFilter(off, 'all')).toBe(true)
  })

  it('по спросу, без цифр — после, отключённые — в конце', () => {
    expect(sortDemandTopics([off, noData, puzzles, lego]).map(t => t.name)).toEqual(['LEGO', 'Пазлы', 'Беговел', 'Тамагочи'])
  })
})

describe('вордстат рядом с Google (2.11.2026)', () => {
  const both = topic({
    name: 'Пазлы',
    series: [1, 2, 3],
    volume_avg3: 5400,
    trend_pct: -40,
    peak_month: 12,
    peak_ratio: 1.6,
    season_soon: true,
    data_until: '2026-10-01',
    y_series: [7, 8, 9],
    y_volume_avg3: 900,
    y_trend_pct: 25,
    y_peak_month: 9,
    y_peak_ratio: 1.4,
    y_season_soon: false,
    y_data_until: '2026-10-01',
  })
  const yandexOnly = topic({ name: 'Машинки', y_series: [1, 1, 1], y_volume_avg3: 3000, y_trend_pct: -20 })
  const googleOnly = topic({ name: 'Куклы', series: [1, 1, 1], volume_avg3: 8000 })

  it('числа темы — по выбранному источнику; без миграции Вордстата у Яндекса пусто', () => {
    expect(demandStats(both, 'google')).toEqual({
      series: [1, 2, 3],
      volume_avg3: 5400,
      trend_pct: -40,
      peak_month: 12,
      peak_ratio: 1.6,
      season_soon: true,
      data_until: '2026-10-01',
    })
    expect(demandStats(both, 'yandex')).toEqual({
      series: [7, 8, 9],
      volume_avg3: 900,
      trend_pct: 25,
      peak_month: 9,
      peak_ratio: 1.4,
      season_soon: false,
      data_until: '2026-10-01',
    })
    expect(demandStats(googleOnly, 'yandex')).toEqual({
      series: null,
      volume_avg3: null,
      trend_pct: null,
      peak_month: null,
      peak_ratio: null,
      season_soon: false,
      data_until: null,
    })
  })

  it('фильтры — по числам выбранного источника, по умолчанию Google', () => {
    expect(matchesDemandFilter(both, 'falling')).toBe(true)
    expect(matchesDemandFilter(both, 'falling', 'yandex')).toBe(false)
    expect(matchesDemandFilter(both, 'growing', 'yandex')).toBe(true)
    expect(matchesDemandFilter(both, 'season', 'yandex')).toBe(false)
    expect(matchesDemandFilter(yandexOnly, 'missing')).toBe(false)
    expect(matchesDemandFilter(yandexOnly, 'missing', 'yandex')).toBe(true)
  })

  it('порядок — по спросу выбранного источника', () => {
    expect(sortDemandTopics([both, yandexOnly, googleOnly]).map(t => t.name)).toEqual(['Куклы', 'Пазлы', 'Машинки'])
    expect(sortDemandTopics([both, yandexOnly, googleOnly], 'yandex').map(t => t.name)).toEqual(['Машинки', 'Пазлы', 'Куклы'])
  })

  it('цена в тенге — и копеечная: знак не отрывается от числа', () => {
    expect(formatKztCost(0.1)).toBe('0,1\u00A0₸')
    expect(formatKztCost(0.5)).toBe('0,5\u00A0₸')
    expect(formatKztCost(9.2)).toBe('9\u00A0₸')
    expect(formatKztCost(1500)).toBe('1\u00A0500\u00A0₸')
  })

  it('месяц и «по … фразам»', () => {
    expect(monthLabel('2026-10-01')).toBe('октябрь 2026')
    expect(monthLabel(null)).toBeNull()
    expect(monthLabel(undefined)).toBeNull()
    expect(phrasesDative(1)).toBe('1 фразе')
    expect(phrasesDative(21)).toBe('21 фразе')
    expect(phrasesDative(11)).toBe('11 фразам')
    expect(phrasesDative(4)).toBe('4 фразам')
    expect(phrasesDative(92)).toBe('92 фразам')
  })
})

describe('мини-график и ввод', () => {
  it('точки в рамке: максимум сверху, ноль снизу, шаг по ширине', () => {
    expect(sparkPoints([0, 50, 100], 100, 22)).toBe('0,21 50,11 100,1')
    expect(sparkPoints([], 100, 22)).toBe('')
    expect(sparkPoints(null, 100, 22)).toBe('')
    expect(sparkPoints([0, 0], 10, 10)).toBe('0,9 10,9')
  })

  it('список фраз: строки, запятые, «;», без пустых и повторов', () => {
    expect(parseDemandList(' кукла  лол \nКукла лол, lol;;  \n')).toEqual(['кукла лол', 'lol'])
  })

  it('название темы из запроса — с заглавной', () => {
    expect(topicNameFromKeyword(' кукла монстер')).toBe('Кукла монстер')
    expect(topicNameFromKeyword('')).toBe('')
  })
})

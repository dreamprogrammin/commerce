import type { DemandTopic } from '../../utils/marketDemand'
import { describe, expect, it } from 'vitest'
import {
  dataUntilLabel,
  formatUsd,
  formatVolume,
  matchesDemandFilter,
  parseDemandList,
  peakLabel,
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

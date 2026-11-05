import type { OfferDemandTopic } from '@/utils/offerDemand'
import { describe, expect, it } from 'vitest'
import { filterByDemand, offerDemand, termRegex, topicDraft, topicMatches } from '@/utils/offerDemand'

function topic(over: Partial<OfferDemandTopic>): OfferDemandTopic {
  return {
    topic_id: 't',
    name: 'Тема',
    kind: 'type',
    keywords: [],
    match_terms: [],
    is_active: true,
    volume_avg3: 1000,
    trend_pct: null,
    season_soon: false,
    our_total: 0,
    our_in_stock: 0,
    ...over,
  }
}
const item = (name: string, brand: string | null = null) => ({ name, article: null, brand, price: null, priceFrom: null, imagePrice: null, priceNote: null, age: null, confidence: 'high' as const, doubt: null })
const offer = (caption: string, items: ReturnType<typeof item>[] | null = null) => ({ caption, items })

describe('termRegex — как market_demand_term_regex', () => {
  it('начало слова, кириллица: «стич» находит «Стич», но не «пластичный»', () => {
    expect(termRegex('стич').test('игрушка стич 30 см')).toBe(true)
    expect(termRegex('стич').test('пластичный')).toBe(false)
    expect(termRegex('стич').test('стичи и ко')).toBe(true)
  })
  it('«*» — что угодно между частями; точка и плюс — сами знаки', () => {
    expect(termRegex('кукольн*дом').test('кукольный большой дом')).toBe(true)
    expect(termRegex('3+').test('возраст 3+')).toBe(true)
    expect(termRegex('3+').test('возраст 33')).toBe(false)
    expect(termRegex('ж.д').test('жxд')).toBe(false)
  })
})

describe('topicMatches', () => {
  it('признаки главнее фраз; без признаков — фразы', () => {
    expect(topicMatches({ keywords: ['лабубу купить'], match_terms: ['лабубу', 'labubu'] }, 'labubu macaron')).toBe(true)
    expect(topicMatches({ keywords: ['толокар'], match_terms: [] }, 'толокар машинка')).toBe(true)
    expect(topicMatches({ keywords: ['толокар'], match_terms: ['каталка'] }, 'толокар машинка')).toBe(false)
  })
})

describe('offerDemand', () => {
  const topics = [
    topic({ topic_id: 'lab', name: 'Лабубу', kind: 'franchise', match_terms: ['лабубу', 'labubu'], volume_avg3: 2400, trend_pct: 35, our_total: 0 }),
    topic({ topic_id: 'doll', name: 'Куклы', match_terms: ['кукл'], volume_avg3: 900, our_total: 12, our_in_stock: 7 }),
    topic({ topic_id: 'off', name: 'Отключена', match_terms: ['кукл'], volume_avg3: 99999, is_active: false }),
  ]
  it('по прочитанному ИИ названию и бренду; несколько тем — с бо́льшим спросом; отключённые — мимо', () => {
    expect(offerDemand(offer('', [item('Кукла', 'Labubu')]), topics)).toEqual({ topicId: 'lab', name: 'Лабубу', volume: 2400, trendPct: 35, seasonSoon: false, ourTotal: 0, ourInStock: 0 })
    expect(offerDemand(offer('', [item('Кукла Барби')]), topics)?.topicId).toBe('doll')
  })
  it('непрочитанный пост — по подписи; ничего не нашлось — null', () => {
    expect(offerDemand(offer('Новинка! ЛАБУБУ в наличии'), topics)?.topicId).toBe('lab')
    expect(offerDemand(offer('Машинка на пульте', [item('Машинка')]), topics)).toBeNull()
  })
})

describe('filterByDemand', () => {
  const topics = [topic({ topic_id: 'a', match_terms: ['лабубу'], volume_avg3: 2400 }), topic({ topic_id: 'b', match_terms: ['кукл'], volume_avg3: 900 }), topic({ topic_id: 'c', match_terms: ['пазл'], volume_avg3: null })]
  const list = [offer('кукла'), offer('машинка'), offer('лабубу'), offer('пазл')]
  it('«Все» — как было', () => {
    expect(filterByDemand(list, topics, 'all')).toEqual(list)
  })
  it('«Есть спрос» — с цифрами больше нуля, сверху больший', () => {
    expect(filterByDemand(list, topics, 'demand').map(o => o.caption)).toEqual(['лабубу', 'кукла'])
  })
  it('«Темы нет» — ни одна тема не нашла', () => {
    expect(filterByDemand(list, topics, 'none').map(o => o.caption)).toEqual(['машинка'])
  })
})

describe('topicDraft', () => {
  it('бренд, иначе два слова названия; не прочитан — null', () => {
    expect(topicDraft(offer('', [item('Кукла с аксессуарами', 'Barbie')]))).toEqual({ name: 'Barbie', keyword: 'barbie' })
    expect(topicDraft(offer('', [item('Конструктор «Город» 500 деталей')]))).toEqual({ name: 'Конструктор Город', keyword: 'конструктор город' })
    expect(topicDraft(offer('Подпись'))).toBeNull()
  })
})

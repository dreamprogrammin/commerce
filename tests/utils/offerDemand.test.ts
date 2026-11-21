import type { OfferDemandTopic } from '@/utils/offerDemand'
import { describe, expect, it } from 'vitest'
import { compareByDemand, demandLevel, demandLevelBounds, filterByDemand, offerDemand, offerLevel, termRegex, topicDraft, topicMatches } from '@/utils/offerDemand'
import { narrowLevelBounds, offerNarrow } from '@/utils/offerQueries'

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
  const topics = [
    topic({ topic_id: 'a', match_terms: ['лабубу'], volume_avg3: 2400 }),
    topic({ topic_id: 'b', match_terms: ['кукл'], volume_avg3: 900 }),
    topic({ topic_id: 'c', match_terms: ['пазл'], volume_avg3: null }),
    topic({ topic_id: 'd', match_terms: ['мяч'], volume_avg3: 300 }),
    topic({ topic_id: 'e', match_terms: ['робот'], volume_avg3: 5000 }),
  ]
  const list = [offer('кукла'), offer('машинка'), offer('лабубу'), offer('пазл'), offer('мяч'), offer('робот')]
  it('«Все» — как было', () => {
    expect(filterByDemand(list, topics, 'all')).toEqual(list)
  })
  it('«Высокий спрос» — уровень «высокий», как метка на фото; сверху больший', () => {
    // Темы с цифрами 300, 900, 2400, 5000 — верхняя треть от 2400
    expect(filterByDemand(list, topics, 'high').map(o => o.caption)).toEqual(['робот', 'лабубу'])
  })
  it('«Высокий спрос» — тем с цифрами меньше трёх: высокого нет ни у кого', () => {
    expect(filterByDemand(list, topics.slice(0, 3), 'high')).toEqual([])
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

describe('уровень спроса', () => {
  const t = (v: number | null, active = true) => ({ is_active: active, volume_avg3: v })
  it('границы — трети тем с цифрами; без цифр, нули и отключённые не в счёт; меньше трёх — null', () => {
    expect(demandLevelBounds([t(100), t(200), t(300), t(400), t(500), t(600), t(null), t(0), t(99999, false)])).toEqual({ mid: 300, high: 500 })
    expect(demandLevelBounds([t(100), t(200)])).toBeNull()
  })
  it('уровни', () => {
    const b = { mid: 300, high: 500 }
    expect(demandLevel({ volume: 2400 }, b)).toBe('high')
    expect(demandLevel({ volume: 500 }, b)).toBe('high')
    expect(demandLevel({ volume: 300 }, b)).toBe('mid')
    expect(demandLevel({ volume: 120 }, b)).toBe('low')
    expect(demandLevel({ volume: 0 }, b)).toBe('none')
    expect(demandLevel({ volume: null }, b)).toBe('unknown')
    expect(demandLevel(null, b)).toBe('unknown')
    expect(demandLevel({ volume: 50 }, null)).toBe('mid')
  })
})

/*
 * 21.11.2026, владелец: «что-то везде нет данных о спросе». На бою DataForSEO
 * ответил на одну фразу товара из 884 («кукла с коляской», пришла с «Новыми
 * запросами» 20.11), и страница перешла на точный спрос у всех: 917 из 918
 * товаров — «Спрос: нет данных», «Высокий спрос» пуст, хотя темы с цифрами
 * у товаров есть. Непроверенные фразы — уровень по теме.
 */
describe('точный спрос проверен не у всех — остальные по теме', () => {
  const topics = [
    topic({ topic_id: 'labubu', name: 'Лабубу', match_terms: ['лабубу'], volume_avg3: 9000 }),
    topic({ topic_id: 'cars', name: 'Машинки', match_terms: ['машинк'], volume_avg3: 3000 }),
    topic({ topic_id: 'puzzle', name: 'Пазлы', match_terms: ['пазл'], volume_avg3: 100 }),
  ]
  const volumes = { 'кукла с коляской': 140 }
  const o = (caption: string, queries: string[][] | null) => ({ caption, items: null, queries })
  const list = [o('Кукла с коляской', [['кукла с коляской']]), o('Лабубу macaron', [['лабубу macaron купить']]), o('Пазл 1000', null), o('Слайм', [['слайм купить']])]
  const level = (x: (typeof list)[number]) => offerLevel(offerNarrow(x.queries, volumes), offerDemand(x, topics), narrowLevelBounds(volumes), demandLevelBounds(topics))

  it('метка: проверенная фраза — по ней, непроверенная или нет фраз — по теме, нет темы — «нет данных»', () => {
    expect(list.map(level)).toEqual(['mid', 'high', 'low', 'unknown'])
  })
  it('«Высокий спрос» не пуст: высокий по теме', () => {
    expect(filterByDemand(list, topics, 'high', volumes).map(x => x.caption)).toEqual(['Лабубу macaron'])
  })
  it('порядок: сначала проверенные фразы, внутри — больший спрос', () => {
    const fr = (phrase: string, volume: number) => ({ phrase: null, volume, phrases: [{ phrase, checked: true, volume }], checked: true })
    const rows = [{ n: null, d: { volume: 9000 } }, { n: fr('а', 140), d: { volume: 3000 } }, { n: fr('б', 900), d: null }, { n: null, d: { volume: 20000 } }]
    expect([...rows].sort(compareByDemand).map(r => r.n ? `фраза ${r.n.volume}` : `тема ${r.d!.volume}`)).toEqual(['фраза 900', 'фраза 140', 'тема 20000', 'тема 9000'])
  })
})

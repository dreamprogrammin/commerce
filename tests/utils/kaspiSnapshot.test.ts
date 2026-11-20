import type { KaspiSnapshot } from '@/utils/kaspiSnapshot'
import { describe, expect, it } from 'vitest'
import {
  decodeKaspiHash,
  encodeKaspiHash,
  kaspiBookmarklet,
  kaspiSearchUrl,
  kaspiSummaries,
  normalizeKaspiUrl,
  parseKaspiInput,
  parseKaspiPage,
  parseKaspiReadReply,
} from '@/utils/kaspiSnapshot'

/** Цифры Kaspi (20.11.2026): «по мимо гугла главный источник еще каспи магазин». Страницы — придуманные, не снятые с Kaspi. */

const TOPIC = '11111111-1111-4111-8111-111111111111'
const OFFER = '22222222-2222-4222-8222-222222222222'

describe('normalizeKaspiUrl', () => {
  it('без меток, города и якоря; чужой сайт — null', () => {
    expect(normalizeKaspiUrl('https://kaspi.kz/shop/p/kukla-123/?c=750000000#reviews')).toBe('https://kaspi.kz/shop/p/kukla-123/')
    expect(normalizeKaspiUrl('https://kaspi.kz/shop/p/kukla-123')).toBe('https://kaspi.kz/shop/p/kukla-123')
    expect(normalizeKaspiUrl('https://evil.kz/?u=https://kaspi.kz/')).toBeNull()
    expect(normalizeKaspiUrl('http://kaspi.kz/shop/p/x/')).toBeNull()
    expect(normalizeKaspiUrl(5)).toBeNull()
  })
  it('поиск — обычная ссылка с названием', () => {
    expect(kaspiSearchUrl(' Кукла барби ')).toBe('https://kaspi.kz/shop/search/?text=%D0%9A%D1%83%D0%BA%D0%BB%D0%B0%20%D0%B1%D0%B0%D1%80%D0%B1%D0%B8')
  })
})

describe('parseKaspiPage', () => {
  it('сначала JSON-LD, потом текст, в том числе внутри @graph', () => {
    const ld = JSON.stringify({ '@graph': [{ '@type': 'BreadcrumbList' }, {
      '@type': 'Product',
      'name': 'Кукла Барби ветеринар',
      'offers': { '@type': 'AggregateOffer', 'lowPrice': '12990', 'offerCount': 7 },
      'aggregateRating': { ratingValue: '4.8', reviewCount: '1234' },
    }] })
    const r = parseKaspiPage({ url: 'https://kaspi.kz/shop/p/barbie-1/?c=1', title: 'x', ld: ['{битый', ld], text: '999 ₸ 3 отзыва' })
    expect(r).toMatchObject({ title: 'Кукла Барби ветеринар', price: 12990, reviews: 1234, rating: 4.8, sellers: 7, url: 'https://kaspi.kz/shop/p/barbie-1/' })
    expect(r.found).toEqual(['title', 'price', 'reviews', 'rating', 'sellers'])
  })
  it('без JSON-LD — по тексту; рассрочка «× 12» — не цена', () => {
    const text = 'Кукла\n4,9 (1 234 отзыва)\n1 083 ₸ x 12\nЦена 12 990 ₸\nПредложения 15 продавцов'
    const r = parseKaspiPage({ url: 'https://kaspi.kz/shop/p/k-2/', title: 'Кукла Лол – купить | Kaspi Магазин', ld: [], text })
    expect(r).toMatchObject({ title: 'Кукла Лол – купить', price: 12990, reviews: 1234, rating: 4.9, sellers: 15 })
  })
  it('ничего не нашлось — пустые поля, а не выдумка', () => {
    const r = parseKaspiPage({ url: '', title: '', ld: [], text: 'Войдите в Kaspi' })
    expect(r).toMatchObject({ price: null, reviews: null, rating: null, sellers: null, url: null })
    expect(r.found).toEqual([])
  })
  it('рейтинг выше 5 не принимается', () => {
    const ld = JSON.stringify({ '@type': 'Product', 'name': 'x', 'aggregateRating': { ratingValue: 48 } })
    expect(parseKaspiPage({ url: '', title: '', ld: [ld], text: '' }).rating).toBeNull()
  })
})

describe('часть адреса после «#»', () => {
  it('кодирует и раскодирует кириллицу; чужое — null', () => {
    const raw = { url: 'https://kaspi.kz/shop/p/x/', title: 'Кукла «Лол»', ld: ['{"a":1}'], text: '12 990 ₸' }
    const hash = encodeKaspiHash(raw)
    expect(hash).toMatch(/^kaspi=[\w-]+$/)
    expect(decodeKaspiHash(`#${hash}`)).toEqual({ ...raw, cards: [] })
    expect(decodeKaspiHash('#other=1')).toBeNull()
    expect(decodeKaspiHash('#kaspi=@@@')).toBeNull()
  })
  it('закладка ведёт на страницу «Kaspi» нужного сайта и называет вкладку', () => {
    const src = decodeURIComponent(kaspiBookmarklet('https://uhti.kz/'))
    expect(src.startsWith('javascript:(function(){')).toBe(true)
    expect(src).toContain('"https://uhti.kz/admin/kaspi#kaspi="')
    expect(src).toContain('"uhti-kaspi"')
  })
})

describe('kaspiSummaries', () => {
  const snap = (id: number, takenAt: string, reviews: number | null, url: string | null = 'https://kaspi.kz/shop/p/a/'): KaspiSnapshot => ({
    id,
    topicId: TOPIC,
    offerId: null,
    offerItem: null,
    url,
    source: 'page',
    takenAt,
    title: '',
    price: 100,
    reviews,
    rating: null,
    sellers: 3,
  })
  it('прирост — от самого раннего замера того же товара', () => {
    const s = kaspiSummaries([
      snap(2, '2026-11-10T00:00:00Z', 1100),
      snap(1, '2026-11-01T00:00:00Z', 1000),
      snap(3, '2026-11-15T00:00:00Z', 1180),
    ], r => r.topicId).get(TOPIC)!
    expect(s).toMatchObject({ reviewsGrowth: 180, growthDays: 14, count: 3 })
    expect(s.last.id).toBe(3)
  })
  it('один замер или другой товар — прироста нет', () => {
    expect(kaspiSummaries([snap(1, '2026-11-01T00:00:00Z', 10)], r => r.topicId).get(TOPIC)!.reviewsGrowth).toBeNull()
    const s = kaspiSummaries([snap(1, '2026-11-01T00:00:00Z', 10), snap(2, '2026-11-05T00:00:00Z', 50, 'https://kaspi.kz/shop/p/b/')], r => r.topicId).get(TOPIC)!
    expect(s.reviewsGrowth).toBeNull()
  })
})

describe('parseKaspiInput', () => {
  const ok = { topicId: TOPIC, price: '12 990', reviews: 5, rating: '4,8', sellers: '', source: 'page', url: 'https://kaspi.kz/shop/p/a/?c=1', title: ' Кукла ' }
  it('принимает и приводит', () => {
    expect(parseKaspiInput(ok)).toEqual({ topicId: TOPIC, offerId: null, offerItem: null, url: 'https://kaspi.kz/shop/p/a/', title: 'Кукла', price: 12990, reviews: 5, rating: 4.8, sellers: null, source: 'page' })
    expect(parseKaspiInput({ offerId: OFFER, offerItem: 2, reviews: 1, source: 'manual' })).toMatchObject({ offerId: OFFER, offerItem: 2, topicId: null })
  })
  it('отказывает понятным текстом', () => {
    expect(parseKaspiInput({ ...ok, topicId: null })).toBe('Выберите тему или товар поставщика')
    expect(parseKaspiInput({ ...ok, offerId: OFFER })).toBe('Выберите тему или товар поставщика')
    expect(parseKaspiInput({ ...ok, price: '12.5' })).toBe('Цена, отзывы и продавцы — целые числа')
    expect(parseKaspiInput({ ...ok, rating: 7 })).toBe('Рейтинг — от 0 до 5')
    expect(parseKaspiInput({ ...ok, rating: 'хорошо' })).toBe('Рейтинг — число от 0 до 5')
    expect(parseKaspiInput({ topicId: TOPIC, source: 'page' })).toBe('Нет ни одной цифры')
    expect(parseKaspiInput({ ...ok, url: 'https://evil.kz/' })).toBe('Ссылка — только на kaspi.kz')
    expect(parseKaspiInput({ ...ok, source: 'robot' })).toBe('Неверный источник')
  })
})

describe('parseKaspiReadReply', () => {
  it('json в обёртке ```json, кривые товары пропускает', () => {
    const raw = '```json\n{"items":[{"title":"Кукла","price":"12990","reviews":1234,"rating":4.8,"sellers":null},{"title":""},5]}\n```'
    expect(parseKaspiReadReply(raw)).toEqual([{ title: 'Кукла', price: 12990, reviews: 1234, rating: 4.8, sellers: null }])
    expect(parseKaspiReadReply('не json')).toEqual([])
  })
})

describe('kaspiLineParts', () => {
  it('цена, отзывы с приростом, рейтинг, продавцы', async () => {
    const { kaspiLineParts } = await import('@/utils/kaspiSnapshot')
    const last = { id: 1, topicId: TOPIC, offerId: null, offerItem: null, url: null, source: 'page' as const, takenAt: '2026-11-15T00:00:00Z', title: '', price: 12990, reviews: 1234, rating: 4.8, sellers: 21 }
    expect(kaspiLineParts({ last, reviewsGrowth: 80, growthDays: 14, count: 2 }))
      .toEqual(['12\u00A0990\u00A0₸', '1\u00A0234\u00A0отзыва (+80 за\u00A014\u00A0дн.)', '★\u00A04,8', '21\u00A0продавец'])
    expect(kaspiLineParts({ last: { ...last, price: null, rating: null, sellers: 11, reviews: 5 }, reviewsGrowth: null, growthDays: null, count: 1 }))
      .toEqual(['5\u00A0отзывов', '11\u00A0продавцов'])
    expect(kaspiLineParts({ last: { ...last, price: null, reviews: null, rating: null, sellers: 0 }, reviewsGrowth: null, growthDays: null, count: 1 })).toEqual(['нет на Kaspi'])
  })
})

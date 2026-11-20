import type { KaspiCandidate, KaspiSummary } from '@/utils/kaspiSnapshot'
import { describe, expect, it } from 'vitest'
import { articleKey, kaspiAbsent, kaspiStrength, matchCandidate, nameScore, rankTop } from '@/utils/kaspiMatch'
import { parseKaspiCards } from '@/utils/kaspiSnapshot'

/** Сверка с выдачей Kaspi и топ (20.11.2026): «отбирает их по артикулам и картинкам … выдвигает в топ». Выдача придумана. */

const cand = (title: string, text = ''): KaspiCandidate => ({ url: `https://kaspi.kz/shop/p/${title.length}/`, title, text, image: null, price: 1000, reviews: 10, rating: 4.5, sellers: 2 })

describe('parseKaspiCards', () => {
  it('товары выдачи: цифры из текста карточки, картинка только с CDN Kaspi, без повторов и чужих ссылок', () => {
    const list = parseKaspiCards({
      url: 'https://kaspi.kz/shop/search/?text=x',
      title: '',
      ld: [],
      text: '',
      cards: [
        { href: 'https://kaspi.kz/shop/p/kukla-1/?c=1', title: 'Кукла Барби', text: 'Кукла Барби\n4,8 (1 234 отзыва)\n12 990 ₸', img: 'https://resources.cdn-kaspi.kz/img/m/p/1.jpg' },
        { href: 'https://kaspi.kz/shop/p/kukla-1/', title: 'Кукла Барби', text: '', img: '' },
        { href: 'https://kaspi.kz/shop/c/dolls/', title: 'Раздел', text: '', img: '' },
        { href: 'https://kaspi.kz/shop/p/car-2/', title: 'Машинка', text: '990 ₸', img: 'https://evil.example/x.jpg' },
      ],
    })
    expect(list.map(c => [c.url, c.price, c.reviews, c.rating, c.image])).toEqual([
      ['https://kaspi.kz/shop/p/kukla-1/', 12990, 1234, 4.8, 'https://resources.cdn-kaspi.kz/img/m/p/1.jpg'],
      ['https://kaspi.kz/shop/p/car-2/', 990, null, null, null],
    ])
  })
})

describe('matchCandidate', () => {
  it('артикул в названии или тексте карточки — сразу он, без учёта регистра и дефисов', () => {
    expect(articleKey('Арт. F603-eg')).toBe('АРТF603EG')
    const r = matchCandidate({ name: 'Кукла', article: 'F603-EG', brand: null }, [cand('Кукла Hasbro'), cand('Кукла Hasbro', 'Артикул: f603eg')])
    expect(r).toMatchObject({ pick: 1, by: 'article' })
  })
  it('короткий или без цифр артикул не сверяется', () => {
    expect(matchCandidate({ name: 'Мяч', article: 'A1', brand: null }, [cand('Мяч A1 детский')]).by).not.toBe('article')
    expect(matchCandidate({ name: 'Мяч', article: 'ABCDE', brand: null }, [cand('мяч abcde')]).by).not.toBe('article')
  })
  it('название: уверенно — при 60% слов и отрыве; «куклы» и «кукла» — одно слово', () => {
    expect(nameScore({ name: 'Кукла Барби ветеринар', article: null, brand: null }, 'Куклы Barbie Барби ветеринар с питомцем')).toBe(1)
    const r = matchCandidate({ name: 'Кукла Барби ветеринар', article: null, brand: null }, [cand('Машинка Hot Wheels'), cand('Кукла Барби ветеринар с собакой')])
    expect(r).toMatchObject({ pick: 1, by: 'name' })
  })
  it('два похожих названия — не выбирает, отдаёт на фото похожие первыми', () => {
    const r = matchCandidate({ name: 'Кукла Барби ветеринар', article: null, brand: null }, [cand('Машинка'), cand('Кукла Барби ветеринар розовая'), cand('Кукла Барби ветеринар синяя')])
    expect(r.pick).toBeNull()
    expect(r.ranked.slice(0, 2).map(x => x.index).sort()).toEqual([1, 2])
  })
})

function summary(reviews: number | null, growth: number | null = null, days: number | null = null, extra: Partial<KaspiSummary['last']> = {}): KaspiSummary {
  return {
    last: { id: 1, topicId: null, offerId: 'o', offerItem: 0, url: null, source: 'page', takenAt: '2026-11-20T00:00:00Z', title: '', price: 1000, reviews, rating: 4.8, sellers: 3, ...extra },
    reviewsGrowth: growth,
    growthDays: days,
    count: growth == null ? 1 : 2,
  }
}

describe('топ спроса', () => {
  it('«нет на Kaspi» — 0 продавцов без цены и отзывов; сила 0', () => {
    const none = summary(null, null, null, { sellers: 0, price: null })
    expect(kaspiAbsent(none)).toBe(true)
    expect(kaspiStrength(none)).toBe(0)
    expect(kaspiAbsent(summary(5))).toBe(false)
  })
  it('прирост отзывов прибавляет силу', () => {
    expect(kaspiStrength(summary(1000, 300, 30))).toBeGreaterThan(kaspiStrength(summary(1000)))
  })
  it('kaspi весит больше Google: товар с отзывами выше товара с тем же поиском без Kaspi', () => {
    const top = rankTop([
      { key: 'google-only', google: 5000, kaspi: null },
      { key: 'kaspi-hit', google: 1000, kaspi: summary(2000) },
      { key: 'small', google: 100, kaspi: summary(20) },
      { key: 'absent', google: 5000, kaspi: summary(null, null, null, { sellers: 0, price: null }) },
    ])
    expect(top[0]!.key).toBe('kaspi-hit')
    // Поиск Google тот же, но «нет на Kaspi» — ниже товара без замера
    expect(top.findIndex(t => t.key === 'google-only')).toBeLessThanOrEqual(top.findIndex(t => t.key === 'absent'))
    expect(top.find(t => t.key === 'kaspi-hit')!.hit).toBe(true)
    expect(top.find(t => t.key === 'small')!.hit).toBe(false)
    expect(top.find(t => t.key === 'absent')!.absent).toBe(true)
  })
  it('пустой список и все без цифр — без деления на ноль', () => {
    expect(rankTop([])).toEqual([])
    expect(rankTop([{ key: 'a', google: null, kaspi: null }])[0]!.score).toBe(0)
  })
})

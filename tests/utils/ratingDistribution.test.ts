import { describe, expect, it } from 'vitest'
import { formatAverageRating, summarizeRatingDistribution } from '@/utils/ratingDistribution'

describe('summarizeRatingDistribution', () => {
  it('считает итог и среднюю по всему распределению', () => {
    const s = summarizeRatingDistribution([
      { stars: 5, count: 8 },
      { stars: 4, count: 2 },
    ])
    expect(s.total).toBe(10)
    expect(s.average).toBeCloseTo(4.8, 5)
  })

  it('возвращает пять строк даже при неполном ответе', () => {
    const s = summarizeRatingDistribution([{ stars: 5, count: 3 }])
    expect(s.buckets.map(b => b.stars)).toEqual([5, 4, 3, 2, 1])
    expect(s.buckets.find(b => b.stars === 1)!.count).toBe(0)
  })

  /*
   * Ради этого всё и делалось. Раньше проценты считались от categoryStats —
   * суммы review_count по товарам ТЕКУЩЕЙ страницы, — а числитель приходил
   * из категорийного RPC. При 12 отзывах в категории и 3 на странице шкала
   * показывала 400%.
   */
  it('проценты считает от собственного итога, а не от чужого числа', () => {
    const s = summarizeRatingDistribution([
      { stars: 5, count: 9 },
      { stars: 1, count: 3 },
    ])
    expect(s.total).toBe(12)
    expect(s.buckets.find(b => b.stars === 5)!.percentage).toBe(75)
    expect(s.buckets.find(b => b.stars === 1)!.percentage).toBe(25)
    for (const b of s.buckets)
      expect(b.percentage).toBeLessThanOrEqual(100)
  })

  it('пустое распределение — ноль отзывов и никакой средней', () => {
    for (const input of [[], null, undefined]) {
      const s = summarizeRatingDistribution(input)
      expect(s.total).toBe(0)
      expect(s.average).toBeNull()
      expect(s.buckets.every(b => b.percentage === 0)).toBe(true)
    }
  })

  it('складывает повторяющиеся звёзды и игнорирует мусор', () => {
    const s = summarizeRatingDistribution([
      { stars: 5, count: 2 },
      { stars: 5, count: 3 },
      { stars: 9, count: 100 },
      { stars: 4, count: -5 },
      // @ts-expect-error проверяем устойчивость к нечисловому ответу
      { stars: 3, count: 'три' },
    ])
    expect(s.total).toBe(5)
    expect(s.buckets.find(b => b.stars === 5)!.count).toBe(5)
  })
})

describe('formatAverageRating', () => {
  it('запятая как разделитель', () => {
    expect(formatAverageRating(4.75)).toBe('4,8')
    expect(formatAverageRating(5)).toBe('5,0')
  })

  it('без отзывов — прочерк, а не «0,0»', () => {
    expect(formatAverageRating(null)).toBe('—')
  })
})

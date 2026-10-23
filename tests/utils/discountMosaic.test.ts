import type { MosaicProduct } from '@/utils/discountMosaic'
import { describe, expect, it } from 'vitest'
import {
  maxDiscountOf,
  MOSAIC_SMALL_LIMIT,
  mosaicSequence,
  mosaicTitle,
  pickMosaic,
  seasonOf,
} from '@/utils/discountMosaic'

function product(id: string, price: number, percent: number, brand: string | null = id): MosaicProduct {
  return {
    id,
    slug: id,
    name: id,
    price,
    final_price: Math.round(price * (1 - percent / 100)),
    discount_percentage: percent,
    bonus_points_award: 100,
    brand_id: brand,
    image_url: `${id}.webp`,
  }
}

/** Выборка как с боя 23.10.2026: сверху три одинаковые куклы Mermaze по 50%. */
const POOL: MosaicProduct[] = [
  product('mermaze-1', 33290, 50, 'mermaze'),
  product('mermaze-2', 32990, 50, 'mermaze'),
  product('mermaze-3', 33990, 50, 'mermaze'),
  product('sluban', 21390, 40),
  product('puzzle', 6990, 35, null),
  ...Array.from({ length: 30 }, (_, i) => product(`p${i}`, 9000 + i * 10, 20)),
  product('lego-dc', 77590, 15, 'lego'),
]

describe('pickMosaic', () => {
  const { big, small } = pickMosaic(POOL)

  it('крупные — самая большая экономия в тенге, и бренды не повторяются', () => {
    expect(big.map(p => p.id)).toEqual(['mermaze-3', 'lego-dc', 'sluban'])
  })

  it('мелкие — глубокие скидки по порядку запроса, без крупных', () => {
    expect(small.slice(0, 4).map(p => p.id)).toEqual(['mermaze-1', 'mermaze-2', 'puzzle', 'p0'])
    expect(small).toHaveLength(MOSAIC_SMALL_LIMIT)
    expect(small.some(p => big.includes(p))).toBe(false)
  })

  it('товары без бренда друг другу не мешают', () => {
    const pool = Array.from({ length: 15 }, (_, i) => product(`n${i}`, 50000 - i * 1000, 10, null))
    expect(pickMosaic(pool).big.map(p => p.id)).toEqual(['n0', 'n1', 'n2'])
  })

  it('мало товаров — крупных меньше или нет вовсе', () => {
    expect(pickMosaic(POOL.slice(0, 4)).big).toHaveLength(0)
    expect(pickMosaic(POOL.slice(0, 10)).big).toHaveLength(2)
  })

  it('товар без настоящей скидки в мозаику не попадает', () => {
    const broken = { ...product('broken', 9000, 10), final_price: 9000 }
    const { big: b, small: s } = pickMosaic([broken, ...POOL])
    expect([...b, ...s].some(p => p.id === 'broken')).toBe(false)
  })
})

describe('mosaicSequence', () => {
  const big = POOL.slice(0, 3)
  const small = POOL.slice(5, 5 + 16)

  it('порядок макета: крупная + 4, крупная + 8, крупная + 4', () => {
    const tiles = mosaicSequence(big, small)
    expect(tiles).toHaveLength(19)
    expect(tiles.map((t, i) => (t.big ? i : -1)).filter(i => i >= 0)).toEqual([0, 5, 14])
  })

  it('нечётная последняя группа укорачивается — без дыры в колонке', () => {
    const tiles = mosaicSequence(big, small.slice(0, 15))
    expect(tiles.filter(t => !t.big)).toHaveLength(14)
  })

  it('мелкие между крупными всегда парами', () => {
    for (const n of [0, 1, 3, 7, 12, 16]) {
      const tiles = mosaicSequence(big, small.slice(0, n))
      const runs = tiles.map(t => (t.big ? '|' : 's')).join('').split('|')
      expect(runs.every(run => run.length % 2 === 0)).toBe(true)
    }
  })
})

describe('заголовок', () => {
  it('«до N%» — по плиткам, с округлением как на плашке', () => {
    expect(maxDiscountOf([{ discount_percentage: 15 }, { discount_percentage: 49.6 }])).toBe(50)
    expect(mosaicTitle('Осенние', 50)).toBe('Осенние скидки до 50%')
  })

  it('сезон — по дате в Алматы (UTC+5)', () => {
    expect(seasonOf(new Date('2026-10-23T12:00:00Z'))).toBe('Осенние')
    // 30 ноября 20:00 UTC — в Алматы уже 1 декабря
    expect(seasonOf(new Date('2026-11-30T20:00:00Z'))).toBe('Зимние')
    expect(seasonOf(new Date('2027-02-28T12:00:00Z'))).toBe('Зимние')
    expect(seasonOf(new Date('2027-03-01T00:00:00Z'))).toBe('Весенние')
    expect(seasonOf(new Date('2027-06-01T00:00:00Z'))).toBe('Летние')
  })
})

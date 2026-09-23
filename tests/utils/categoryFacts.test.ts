import { describe, expect, it } from 'vitest'
import { categoryFactsFromRows, topBrandNames } from '../../utils/categoryFacts'

// Хаб «Конструкторы» на 23 сентября 2026, в миниатюре: LEGO больше всех,
// самый дешёвый набор — не на первой странице выдачи и не у LEGO.
const LEGO = { id: 'lego', name: 'LEGO' }
const SMONEO = { id: 'smoneo', name: 'Smoneo' }
const SLUBAN = { id: 'sluban', name: 'Sluban' }
const CADA = { id: 'cada', name: 'CaDA' }
const FEELO = { id: 'feelo', name: 'Feelo' }
const GUDI = { id: 'gudi', name: 'Gudi' }
// Порядок, в котором их отдаёт RPC: по алфавиту
const RPC_ORDER = [CADA, FEELO, GUDI, LEGO, SLUBAN, SMONEO]

function rows(brand: string | null, n: number, price = 10_000, finalPrice: number | null = null) {
  return Array.from({ length: n }, () => ({ brand_id: brand, price, final_price: finalPrice }))
}

describe('categoryFactsFromRows', () => {
  it('считает товары, бренды и самую низкую цену по всей ветке', () => {
    const facts = categoryFactsFromRows([
      ...rows('lego', 14, 20_000, 18_890),
      ...rows('smoneo', 8, 14_990, 12_690),
      ...rows('sluban', 3, 9_990),
      ...rows('sluban', 1, 6_200, 5_890),
      ...rows(null, 1, 7_000),
    ])
    expect(facts.count).toBe(27)
    expect(facts.minPrice).toBe(5_890)
    expect(facts.brandCounts).toEqual({ lego: 14, smoneo: 8, sluban: 4 })
  })

  it('цена со скидкой главнее обычной, нули и пустые цены не считаются', () => {
    const facts = categoryFactsFromRows([
      { brand_id: 'a', price: '12990', final_price: '10290' },
      { brand_id: 'a', price: 0, final_price: null },
      { brand_id: 'a', price: null, final_price: null },
    ])
    expect(facts.minPrice).toBe(10_290)
    expect(facts.count).toBe(3)
  })

  it('пустой раздел — ноль товаров и без цены', () => {
    expect(categoryFactsFromRows([])).toEqual({ count: 0, minPrice: null, brandCounts: {} })
  })
})

describe('topBrandNames', () => {
  const counts = { lego: 14, smoneo: 8, sluban: 4, cada: 2, feelo: 2, gudi: 2 }

  it('берёт бренды с наибольшим числом товаров, а не первые по алфавиту', () => {
    expect(topBrandNames(RPC_ORDER, counts)).toEqual(['LEGO', 'Smoneo', 'Sluban'])
  })

  it('при равенстве — по алфавиту', () => {
    expect(topBrandNames(RPC_ORDER, { cada: 2, feelo: 1, lego: 14, sluban: 2 })).toEqual(['LEGO', 'CaDA', 'Sluban'])
  })

  it('бренд без активных товаров в разделе не попадает', () => {
    expect(topBrandNames(RPC_ORDER, { lego: 3 })).toEqual(['LEGO'])
  })
})

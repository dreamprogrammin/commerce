import { describe, expect, it } from 'vitest'
import { composeBrandMeta, composeEmptyBrandMeta, topLines } from '@/utils/brandMeta'
import { META_DESCRIPTION_LIMIT } from '@/utils/seoDescription'

/*
 * Описание бренда для выдачи — из его товаров. 22 сентября 2026 у ZURU
 * описанием шёл текст о бренде с сериями X-Shot, 5 Surprise и Pets Alive,
 * которых в магазине нет, и без единой цены.
 */
const zuru = [
  { price: 8790, final_price: 7390, stock_quantity: 2, lineName: 'Robo Alive' },
  { price: 9990, final_price: 8990, stock_quantity: 1, lineName: 'Robo Alive' },
  { price: 26990, final_price: 25390, stock_quantity: 1, lineName: 'Smashers Horror House' },
  { price: 15990, final_price: 14190, stock_quantity: 3, lineName: 'Smashers Horror House' },
  { price: 12990, final_price: 11390, stock_quantity: 3, lineName: 'Smashers Horror House' },
  { price: 11990, final_price: 10390, stock_quantity: 1, lineName: 'Rainbocorns ZURU' },
  { price: 21990, final_price: 20290, stock_quantity: 1, lineName: 'Smashers Dino Island' },
  { price: 14990, final_price: 13290, stock_quantity: 1, lineName: null },
]

describe('topLines', () => {
  it('до трёх серий, от самой большой', () => {
    expect(topLines(zuru)).toEqual(['Smashers Horror House', 'Robo Alive', 'Rainbocorns ZURU'])
  })
})

describe('composeBrandMeta', () => {
  it('без описания владельца — факты и серии, которые реально есть', () => {
    const d = composeBrandMeta({ word: 'Игрушки', brandName: 'Zuru', products: zuru })
    expect(d).toBe('Игрушки Zuru в Алматы: 8 моделей от 7\u00A0390 до 25\u00A0390 ₸ — Smashers Horror House, Robo Alive, Rainbocorns ZURU. Доставка 1–3 дня, самовывоз.')
    expect(d!.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('есть описание владельца — оно остаётся, факты впереди', () => {
    const d = composeBrandMeta({ word: 'Конструкторы', brandName: 'Feelo', products: zuru.slice(0, 2), lead: 'Крупные развивающие блоки для малышей.' })
    expect(d).toBe('2 модели от 7\u00A0390 до 8\u00A0990 ₸. Крупные развивающие блоки для малышей.')
  })

  it('без слова раздела — просто бренд', () => {
    expect(composeBrandMeta({ word: null, brandName: 'Feelo', products: zuru.slice(0, 1) }))
      .toBe('Feelo в Алматы: 1 модель за 7\u00A0390 ₸ — Robo Alive. Доставка 1–3 дня, самовывоз.')
  })

  it('товаров нет — null, страница берёт запасные варианты', () => {
    expect(composeBrandMeta({ word: 'Игрушки', brandName: 'Zuru', products: [] })).toBeNull()
  })
})

describe('composeEmptyBrandMeta', () => {
  it('говорит, что товаров нет, и называет раздел с похожим', () => {
    expect(composeEmptyBrandMeta('BOWA', [{ label: 'Игровые наборы' }]))
      .toBe('Товаров BOWA сейчас нет в наличии. Похожие игрушки — в разделе «Игровые наборы» интернет-магазина Ухтышка в Алматы.')
  })

  it('два раздела — через «и»', () => {
    const text = composeEmptyBrandMeta('SOBA', [{ label: 'Автотреки' }, { label: 'Радиоуправляемые машинки' }])
    expect(text).toContain('в разделах «Автотреки» и «Радиоуправляемые машинки»')
    expect(text.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('без похожего — ведёт в каталог, не обещает «купить»', () => {
    const text = composeEmptyBrandMeta('Eva Puzzle', [])
    expect(text).toBe('Товаров Eva Puzzle сейчас нет в наличии. Игрушки других брендов — в каталоге интернет-магазина Ухтышка в Алматы.')
    expect(text).not.toMatch(/купить/i)
  })
})

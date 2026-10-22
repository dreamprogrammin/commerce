import { describe, expect, it } from 'vitest'
import { composeBrandDescription, composeBrandMeta, composeBrandTitle, composeEmptyBrandMeta, topLines } from '@/utils/brandMeta'
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
    expect(d).toBe('Игрушки Zuru в Алматы: 8 моделей от 7\u00A0390 до 25\u00A0390 ₸ — Smashers Horror House, Robo Alive, Rainbocorns ZURU. Доставка 1–3 дня, по Казахстану 3–7 дней, самовывоз.')
    expect(d!.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('есть описание владельца — оно остаётся, факты впереди', () => {
    const d = composeBrandMeta({ word: 'Конструкторы', brandName: 'Feelo', products: zuru.slice(0, 2), lead: 'Крупные развивающие блоки для малышей.' })
    expect(d).toBe('2 модели от 7\u00A0390 до 8\u00A0990 ₸. Крупные развивающие блоки для малышей.')
  })

  it('без слова раздела — просто бренд', () => {
    expect(composeBrandMeta({ word: null, brandName: 'Feelo', products: zuru.slice(0, 1) }))
      .toBe('Feelo в Алматы: 1 модель за 7\u00A0390 ₸ — Robo Alive. Доставка 1–3 дня, по Казахстану 3–7 дней, самовывоз.')
  })

  /*
   * С 21 октября 2026 строка доставки называет Казахстан. Длинные серии —
   * полная строка не влезает, идёт короткая: обрезки посреди доставки нет.
   */
  it('длинные серии — короткая строка «по Казахстану», без обрезки', () => {
    const products = [
      { price: 8790, final_price: 7390, stock_quantity: 2, lineName: 'Robo Alive' },
      { price: 26990, final_price: 25390, stock_quantity: 1, lineName: 'Smashers Horror House' },
      { price: 11990, final_price: 10390, stock_quantity: 1, lineName: 'Rainbocorns Sparkle Heart' },
    ]
    const d = composeBrandMeta({ word: 'Игрушки', brandName: 'Zuru', products })!
    expect(d.endsWith('. Доставка по Казахстану, самовывоз.')).toBe(true)
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
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

/*
 * Заголовок и описание страницы бренда целиком — им же считает предпросмотр
 * в админке. До 22.10.2026 предпросмотр писал «Bibi-inn - Купить товары бренда
 * в Алматы» и показывал «SEO описание», а страница отдавала другое.
 */
describe('composeBrandTitle', () => {
  it('написанное руками главнее: meta_title, потом старое seo_title', () => {
    expect(composeBrandTitle({ brandName: 'LEGO', word: 'Конструкторы', metaTitle: 'Свой', seoTitle: 'Старый' })).toBe('Свой')
    expect(composeBrandTitle({ brandName: 'LEGO', word: 'Конструкторы', metaTitle: '', seoTitle: 'Старый' })).toBe('Старый')
  })

  it('пусто — слово раздела и бренд, как у бренд-лендинга', () => {
    expect(composeBrandTitle({ brandName: 'Bibi-inn', word: 'Игрушки' }))
      .toBe('Игрушки Bibi-inn — купить в Алматы с доставкой | Ухтышка')
  })

  it('без товаров слова раздела нет — прежний шаблон', () => {
    expect(composeBrandTitle({ brandName: 'Bibi-inn', word: null }))
      .toBe('Bibi-inn - Купить товары бренда в Алматы | Ухтышка')
  })
})

describe('composeBrandDescription', () => {
  const rattle = [{ price: 2890, final_price: 2690, stock_quantity: 6, lineName: null }]
  const base = { brandName: 'Bibi-inn', word: 'Игрушки', alternatives: [] as { label: string }[] }

  it('есть товары — из товаров, «SEO описание» и «Описание» в выдачу не идут', () => {
    const d = composeBrandDescription({ ...base, products: rattle, hasProducts: true, seoDescription: 'Своё SEO', description: '<h2>О бренде</h2><p>Текст о бренде.</p>' })
    expect(d.replace(/\u00A0/g, ' ')).toBe('Игрушки Bibi-inn в Алматы: 1 модель за 2 690 ₸. Доставка 1–3 дня, по Казахстану 3–7 дней, самовывоз.')
    expect(d).toBe(composeBrandMeta({ word: 'Игрушки', brandName: 'Bibi-inn', products: rattle }))
  })

  it('ручное meta_description остаётся — факты впереди', () => {
    const d = composeBrandDescription({ ...base, products: rattle, hasProducts: true, metaDescription: 'Погремушки для малышей.' })
    expect(d).toMatch(/^1 модель за 2\s690 ₸\. Погремушки для малышей\.$/)
  })

  it('товаров нет — как есть, с разделами-заменами', () => {
    const d = composeBrandDescription({ ...base, word: null, products: [], hasProducts: false, seoDescription: 'Своё SEO', alternatives: [{ label: 'Развивающие игрушки' }] })
    expect(d).toBe(composeEmptyBrandMeta('Bibi-inn', [{ label: 'Развивающие игрушки' }]))
  })

  it('товары не загрузились — запасные: meta_description, первый абзац SEO-вёрстки, первый абзац описания', () => {
    const unknown = { ...base, word: null, products: [], hasProducts: null }
    expect(composeBrandDescription({ ...unknown, metaDescription: 'Ручное.' })).toBe('Ручное.')
    expect(composeBrandDescription({ ...unknown, seoDescription: '<h2>Заголовок</h2><p>Первый абзац о бренде.</p>' })).toBe('Первый абзац о бренде.')
    expect(composeBrandDescription({ ...unknown, description: '<h2>Bibi-inn</h2><p>Погремушки и прорезыватели.</p>' }))
      .toBe('Погремушки и прорезыватели. Доставка по Казахстану.')
  })
})

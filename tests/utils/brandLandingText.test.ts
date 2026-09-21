import { describe, expect, it } from 'vitest'
import {
  brandCategoryPhrase,
  brandLandingFacts,
  composeBrandLandingMeta,
  composeBrandLandingSummary,
  composeBrandLandingText,
  composeBrandLandingTitle,
  prependBrandLandingFacts,
} from '@/utils/brandLandingText'
import { META_DESCRIPTION_LIMIT } from '@/utils/seoDescription'

const products = [
  { name: 'Радиоуправляемая пожарная машина MOKA 2075 — 1:16, выдвижная лестница', slug: 'moka-2075', price: 8490, final_price: 7990, stock_quantity: 6, min_age_years: 3, max_age_years: null },
  { name: 'Радиоуправляемый экскаватор MOKA 2135 — подвижный ковш', slug: 'moka-2135', price: 7990, final_price: 7490, stock_quantity: 0, min_age_years: 3, max_age_years: 8 },
  { name: 'Машина-перевёртыш MOKA STUNT BIG 2053R — 4WD', slug: 'moka-2053r', price: 18890, final_price: 15990, stock_quantity: 2, min_age_years: 5, max_age_years: 12 },
]

describe('brandCategoryPhrase', () => {
  it('ставит бренд перед «для …», а не в конец', () => {
    // Было на бою: «Конструкторы Мальчикам LEGO».
    expect(brandCategoryPhrase('Конструкторы для мальчиков', 'LEGO')).toBe('Конструкторы LEGO для мальчиков')
    expect(brandCategoryPhrase('Куклы для девочек', 'Defa Lucy')).toBe('Куклы Defa Lucy для девочек')
  })

  it('без «для» — бренд в конце', () => {
    expect(brandCategoryPhrase('Радиоуправляемые машинки', 'MokaToys')).toBe('Радиоуправляемые машинки MokaToys')
  })

  it('название раздела и бренда совпадают — без повтора', () => {
    expect(brandCategoryPhrase('LEGO', 'LEGO')).toBe('LEGO')
  })

  it('бренд уже в названии раздела — второй раз не ставит', () => {
    // Было бы «Куклы L.O.L L.O.L. Surprise для девочек».
    expect(brandCategoryPhrase('Куклы L.O.L для девочек', 'L.O.L. Surprise')).toBe('Куклы L.O.L для девочек')
  })
})

describe('brandLandingFacts', () => {
  it('считает по ТЕКУЩЕЙ цене, со скидкой', () => {
    const f = brandLandingFacts(products)
    expect(f).toMatchObject({ count: 3, inStock: 2, min: 7490, max: 15990, minAge: 3 })
  })

  it('верхний возраст — только если он есть у ВСЕХ товаров', () => {
    // У пожарной машины верхней границы нет: «от 3 до 12 лет» было бы неправдой про неё.
    expect(brandLandingFacts(products).maxAge).toBeNull()
    expect(brandLandingFacts(products.slice(1)).maxAge).toBe(12)
  })

  it('пустой список — без цен', () => {
    expect(brandLandingFacts([])).toMatchObject({ count: 0, min: null, max: null })
  })
})

describe('composeBrandLandingMeta', () => {
  it('цены «от … до …» и число моделей бренда, а не всего раздела', () => {
    const d = composeBrandLandingMeta('Радиоуправляемые машинки MokaToys', brandLandingFacts(products))
    expect(d).toMatch(/Радиоуправляемые машинки MokaToys в Алматы: 3 модели от 7\xA0490 до 15\xA0990 ₸/)
    expect(d).toContain('Доставка 1–3 дня')
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('одна цена — без «до»', () => {
    const one = brandLandingFacts([products[0]])
    expect(composeBrandLandingMeta('Машинки MokaToys', one)).toMatch(/1 модель за 7\xA0990 ₸/)
  })
})

describe('composeBrandLandingTitle', () => {
  it('короткий, с ценой «от»', () => {
    const t = composeBrandLandingTitle('Радиоуправляемые машинки MokaToys', brandLandingFacts(products))
    expect(t).toBe('Радиоуправляемые машинки MokaToys — от 7 490 ₸ | Ухтышка')
    expect(t.length).toBeLessThanOrEqual(65)
  })
})

describe('composeBrandLandingText', () => {
  const html = composeBrandLandingText({
    phrase: 'Радиоуправляемые машинки MokaToys',
    brandName: 'MokaToys',
    products,
  })

  it('говорит факты: число моделей, цены, возраст, наличие', () => {
    expect(html).toContain('3 модели')
    expect(html).toContain('от 7 490 до 15 990 ₸')
    expect(html).toContain('для детей от 3 лет.')
    expect(html).toMatch(/в наличии 2/)
  })

  it('возраст склоняет: «от 1 года», «до 12 лет»', () => {
    const one = products.slice(1).map(p => ({ ...p, min_age_years: 1 }))
    expect(composeBrandLandingText({ phrase: 'X', brandName: 'X', products: one })).toContain('для детей от 1 до 12 лет.')
    const baby = [{ ...products[0], min_age_years: 1, max_age_years: null }]
    expect(composeBrandLandingText({ phrase: 'X', brandName: 'X', products: baby })).toContain('для детей от 1 года.')
  })

  it('модели по цене, от дешёвых: текст не скачет от порядка выборки', () => {
    const items = [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(m => m[1])
    expect(items[0]).toBe('Радиоуправляемый экскаватор MOKA 2135 — 7\u00A0490 ₸')
    const reversed = composeBrandLandingText({ phrase: 'Радиоуправляемые машинки MokaToys', brandName: 'MokaToys', products: [...products].reverse() })
    expect(reversed).toBe(html)
  })

  it('больше двенадцати — остаток одной строкой', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...products[0], name: `Модель ${i}`, slug: `m${i}` }))
    const x = composeBrandLandingText({ phrase: 'X', brandName: 'X', products: many })
    expect(x.match(/<li/g)).toHaveLength(12)
    expect(x).toContain('И ещё 2 модели — среди товаров выше.')
  })

  it('перечисляет модели короткими названиями и с ценой', () => {
    expect(html).toContain('>Радиоуправляемая пожарная машина MOKA 2075 — 7\u00A0990 ₸</li>')
    expect(html).not.toContain('выдвижная лестница') // хвост после « — » отрезан
  })

  it('разбирается тем же парсером, что и тексты разделов, — без потерь', async () => {
    const { parseHTMLToBlocks } = await import('@/utils/parseSEOContent')
    const blocks = parseHTMLToBlocks(html)
    expect(blocks.map(b => b.type)).toEqual(['h2', 'p', 'ul'])
    expect(blocks[2].items).toHaveLength(3)
  })

  it('иконки в тексте существуют в коллекции', async () => {
    const { extractIconNames, ICON_NAME_FIXES } = await import('@/utils/iconNames')
    for (const n of extractIconNames(html))
      expect(ICON_NAME_FIXES[n], n).toBeUndefined()
    expect(extractIconNames(html)).toEqual(['fluent-emoji-flat:shopping-bags', 'fluent-emoji-flat:check-mark-button'])
  })

  it('не обещает того, чего нет: без «доставка за 1 день» и без эмодзи', () => {
    expect(html).not.toMatch(/за 1 день/)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('экранирует названия', () => {
    const x = composeBrandLandingText({ phrase: 'X', brandName: 'X', products: [{ ...products[0], name: 'A <b> & "B"', slug: 's' }] })
    expect(x).toContain('A &lt;b&gt; &amp; &quot;B&quot;')
  })
})

describe('composeBrandLandingSummary', () => {
  it('число моделей и цены «от … до …» одной строкой', () => {
    expect(composeBrandLandingSummary(brandLandingFacts(products))).toBe('3 модели · от 7\u00A0490 до 15\u00A0990 ₸')
  })
  it('без товаров — пусто', () => {
    expect(composeBrandLandingSummary(brandLandingFacts([]))).toBe('')
  })
})

describe('prependBrandLandingFacts', () => {
  const own = 'Куклы L.O.L. Surprise в Ухтышке — шары-сюрпризы, куклы OMG, Tweens и Remix. Оригинальные LOL для девочек. Доставка по всему Казахстану!'

  it('ставит число моделей и цены «от … до …» ВПЕРЁД текста владельца', () => {
    const d = prependBrandLandingFacts(own, brandLandingFacts(products))
    // \s: при обрезке truncateWords склеивает пробелы, неразрывный в цене становится обычным.
    expect(d).toMatch(/^3 модели от 7\s490 до 15\s990 ₸\. Куклы L\.O\.L\. Surprise в Ухтышке/)
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('без товаров текст владельца как есть', () => {
    expect(prependBrandLandingFacts(own, brandLandingFacts([]))).toBe(own)
  })
})

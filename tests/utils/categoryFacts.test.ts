import { describe, expect, it } from 'vitest'
import { categoryStaticText } from '../../constants/categoryStaticText'
import { SHOP } from '../../constants/shop'
import {
  ageBreakdown,
  categoryFactsFromRows,
  composeCategoryFactsParagraph,
  factsTopBrands,
  insertAfterFirstParagraph,
  priceRangePhrase,
  sinceAge,
  stockPhrase,
  topBrandNames,
} from '../../utils/categoryFacts'

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
    expect(categoryFactsFromRows([])).toEqual({
      count: 0,
      inStock: 0,
      minPrice: null,
      maxPrice: null,
      prices: [],
      brandCounts: {},
      brandNames: {},
      ageGroups: [],
    })
  })

  it('считает наличие, самую высокую цену и возраст по группам', () => {
    const facts = categoryFactsFromRows([
      { brand_id: null, price: 9_990, final_price: 8_590, stock_quantity: 3, min_age_months: 72 },
      { brand_id: null, price: 4_590, final_price: 4_090, stock_quantity: 0, min_age_months: 36 },
      { brand_id: null, price: 19_990, final_price: 18_890, stock_quantity: null, min_age_months: 36 },
      { brand_id: null, price: 7_990, final_price: null, stock_quantity: 5, min_age_months: null },
    ])
    expect(facts.inStock).toBe(2)
    expect(facts.maxPrice).toBe(18_890)
    expect(facts.prices).toEqual([4_090, 7_990, 8_590, 18_890])
    expect(facts.ageGroups).toEqual([[36, 2], [72, 1]])
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

/*
 * «Радиоуправляемые машинки» на бою 25 сентября 2026: 18 моделей, все в
 * наличии, цены со скидкой от 4 090 до 18 890 ₸, 17 моделей с трёх лет и
 * бульдозер HSTAR с шести.
 */
const RC_PRICES = [4_090, 4_390, 4_590, 4_590, 7_490, 7_490, 7_490, 8_590, 9_290, 11_590, 11_590, 14_290, 15_090, 15_090, 15_190, 15_190, 15_790, 18_890]
const RC = categoryFactsFromRows(RC_PRICES.map(price => ({
  brand_id: null,
  price: price + 500,
  final_price: price,
  stock_quantity: 4,
  min_age_months: price === 15_790 ? 72 : 36,
})))
const RC_LIVE = categoryStaticText['radioupravlyaemye-mashinki']!.live!

// Цены идут с неразрывным пробелом внутри числа — сверяем текст без него
const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ')

describe('цифры раздела словами', () => {
  it('абзац: число, цены, наличие и возраст по группам', () => {
    expect(plain(composeCategoryFactsParagraph(RC))).toBe(
      'Сейчас в разделе 18 моделей от 4 090 до 18 890 ₸, все в наличии. С 3 лет — 17 из них, с 6 лет — 1.',
    )
  })

  it('один возраст у всех — «все — для детей…»', () => {
    const facts = categoryFactsFromRows([
      { brand_id: null, price: 5_000, final_price: null, stock_quantity: 1, min_age_months: 36 },
      { brand_id: null, price: 6_000, final_price: null, stock_quantity: 1, min_age_months: 36 },
    ])
    expect(plain(composeCategoryFactsParagraph(facts))).toBe(
      'Сейчас в разделе 2 модели от 5 000 до 6 000 ₸, все в наличии. Все — для детей с 3 лет.',
    )
  })

  it('без возраста — только число и цены; пустой раздел — ничего', () => {
    const facts = categoryFactsFromRows([
      { brand_id: null, price: 7_990, final_price: null, stock_quantity: 0, min_age_months: null },
    ])
    expect(plain(composeCategoryFactsParagraph(facts))).toBe('Сейчас в разделе 1 модель за 7 990 ₸, сейчас нет в наличии.')
    expect(composeCategoryFactsParagraph(categoryFactsFromRows([]))).toBeNull()
  })

  it('наличие и цены — во всех видах', () => {
    expect(stockPhrase({ ...RC, inStock: 16 })).toBe('в наличии 16 из 18')
    expect(plain(priceRangePhrase({ ...RC, minPrice: null, maxPrice: null }))).toBe('')
    expect(sinceAge(0)).toBe('с рождения')
    expect(sinceAge(18)).toBe('с 18 месяцев')
    expect(sinceAge(12)).toBe('с 1 года')
  })

  it('больше трёх возрастов — хвост сливается в «… и старше»', () => {
    expect(ageBreakdown({ ...RC, ageGroups: [[12, 2], [36, 10], [72, 3], [96, 1]] })).toEqual([
      ['с 1 года', 2],
      ['с 3 лет', 10],
      ['с 6 лет и старше', 4],
    ])
  })
})

describe('«Радиоуправляемые машинки»: вопросы с цифрами', () => {
  it('сколько стоит — цены, число и сколько дешевле 10 000 ₸', () => {
    const [price] = RC_LIVE.faq!(RC)
    expect(price!.q).toBe('Сколько стоит радиоуправляемая машинка в Ухтышке?')
    expect(plain(price!.a)).toBe(
      'От 4 090 до 18 890 ₸. Сейчас в разделе 18 моделей, 9 из них дешевле 10 000 ₸. Точная цена — в карточке модели, самовывоз в Алматы бесплатный.',
    )
  })

  it('с какого возраста — что есть в магазине, а не общий совет', () => {
    const [, age] = RC_LIVE.faq!(RC)
    expect(age!.q).toBe('С какого возраста радиоуправляемые машинки в Ухтышке?')
    expect(age!.a).toBe('С 3 лет — 17 моделей из 18, с 6 лет — 1. Возраст указан в карточке каждой модели.')
  })

  it('возраст одинаковый у всех — одной фразой; не у всех указан — без обещания про карточку', () => {
    const same = categoryFactsFromRows(RC_PRICES.map(price => ({ brand_id: null, price, final_price: null, stock_quantity: 1, min_age_months: 36 })))
    expect(RC_LIVE.faq!(same)[1]!.a).toBe('Все 18 моделей раздела — для детей с 3 лет. Возраст указан в карточке каждой модели.')

    const partly = categoryFactsFromRows([
      { brand_id: null, price: 5_000, final_price: null, stock_quantity: 1, min_age_months: 36 },
      { brand_id: null, price: 6_000, final_price: null, stock_quantity: 1, min_age_months: null },
    ])
    expect(RC_LIVE.faq!(partly)[1]!.a).toBe('С 3 лет — 1 модель из 2.')
  })

  it('все дешевле рубежа или одна цена — без «N из них дешевле»', () => {
    const cheap = categoryFactsFromRows([
      { brand_id: null, price: 4_090, final_price: null, stock_quantity: 1, min_age_months: 36 },
      { brand_id: null, price: 4_090, final_price: null, stock_quantity: 1, min_age_months: 36 },
    ])
    expect(plain(RC_LIVE.faq!(cheap)[0]!.a)).toBe('4 090 ₸. Сейчас в разделе 2 модели. Точная цена — в карточке модели, самовывоз в Алматы бесплатный.')
  })

  it('₸ не отрывается от числа: ни перед знаком, ни внутри числа нет обычного пробела', () => {
    // На 390 px ответ про самовывоз переносил «₸ — бесплатно» на новую строку
    const texts = [
      composeCategoryFactsParagraph(RC),
      ...RC_LIVE.faq!(RC).map(item => item.a),
      categoryStaticText['radioupravlyaemye-mashinki']!.faq[0]!.a,
    ]
    for (const text of texts)
      expect(text).not.toMatch(/\d ₸|\d \d{3}/)
  })

  it('пустой раздел — вопросов с цифрами нет', () => {
    expect(RC_LIVE.faq!(categoryFactsFromRows([]))).toEqual([])
    expect(RC_LIVE.paragraph!(categoryFactsFromRows([]))).toBeNull()
  })

  it('где забрать — адрес и часы из constants/shop.ts, первым среди написанных', () => {
    const [pickup] = categoryStaticText['radioupravlyaemye-mashinki']!.faq
    expect(pickup!.q).toBe('Где забрать радиоуправляемую машинку в Алматы?')
    expect(pickup!.a).toContain(SHOP.street)
    expect(pickup!.a).toContain(SHOP.openingHoursHuman)
    expect(plain(pickup!.a)).toContain('Курьер по Алматы — 1 000 ₸, от 15 000 ₸ — бесплатно')
  })
})

/*
 * Хаб «Конструкторы» на бою 25 сентября 2026: 33 набора, 32 в наличии, от
 * 5 890 до 79 890 ₸ (7 дешевле 10 000, 27 дешевле 20 000), восемь разных
 * возрастов от 3 до 12 лет, LEGO 14 · Smoneo 8 · Sluban 4. Цены — не боевые
 * поштучно, а с теми же рубежами.
 */
function spread<T>(pairs: [T, number][]): T[] {
  return pairs.flatMap(([value, n]) => Array.from({ length: n }, () => value))
}
const HUB_AGES = spread([[36, 11], [48, 2], [60, 2], [72, 12], [84, 1], [96, 2], [120, 2], [144, 1]])
const HUB_BRANDS = spread<string | null>([['LEGO', 14], ['Smoneo', 8], ['Sluban', 4], ['CaDA', 2], ['Feelo', 2], ['Gudi', 2], [null, 1]])
const HUB_PRICES = [5_890, ...spread([[8_990, 6], [14_990, 20], [24_990, 5]]), 79_890]
const HUB = categoryFactsFromRows(HUB_AGES.map((age, i) => ({
  brand_id: HUB_BRANDS[i] ? HUB_BRANDS[i]!.toLowerCase() : null,
  brands: HUB_BRANDS[i] ? { name: HUB_BRANDS[i]! } : null,
  price: HUB_PRICES[i]!,
  final_price: null,
  stock_quantity: i === 32 ? 0 : 2,
  min_age_months: age,
})))
const HUB_STATIC = categoryStaticText['constructors-root']!

describe('конструкторы: цифры', () => {
  it('ведущие бренды — по фактам самого раздела, с числом наборов', () => {
    expect(factsTopBrands(HUB)).toEqual([
      { name: 'LEGO', count: 14 },
      { name: 'Smoneo', count: 8 },
      { name: 'Sluban', count: 4 },
    ])
  })

  it('абзац хаба: бренды с числом и разброс возраста вместо перечня из восьми', () => {
    expect(plain(HUB_STATIC.live!.paragraph!(HUB))).toBe(
      'Сейчас в разделе 33 конструктора от 5 890 до 79 890 ₸, в наличии 32 из 33. '
      + 'Больше всего — LEGO (14), Smoneo (8) и Sluban (4). '
      + 'Возраст — от 3 до 12 лет, чаще всего с 6 лет: 12 из 33.',
    )
  })

  it('«мальчикам»: при равенстве брендов — по алфавиту, самый частый возраст при равенстве — младший', () => {
    const ages = spread([[36, 1], [48, 2], [60, 2], [72, 8], [84, 1], [96, 2], [120, 2], [144, 1]])
    const brands = spread([['LEGO', 14], ['Sluban', 2], ['CaDA', 2], ['Feelo', 1]])
    const facts = categoryFactsFromRows(ages.map((age, i) => ({
      brand_id: brands[i]!.toLowerCase(),
      brands: { name: brands[i]! },
      price: i === 0 ? 6_190 : i === 18 ? 79_890 : 12_990,
      final_price: null,
      stock_quantity: 1,
      min_age_months: age,
    })))
    expect(plain(categoryStaticText['konstruktory-malchikam']!.live!.paragraph!(facts))).toBe(
      'Сейчас в разделе 19 конструкторов от 6 190 до 79 890 ₸, все в наличии. '
      + 'Больше всего — LEGO (14), CaDA (2) и Sluban (2). '
      + 'Возраст — от 3 до 12 лет, чаще всего с 6 лет: 8 из 19.',
    )
    const tie = categoryFactsFromRows(spread([[48, 2], [36, 2], [72, 1], [96, 1]]).map(age => ({ brand_id: null, price: 5_000, final_price: null, stock_quantity: 1, min_age_months: age })))
    expect(plain(composeCategoryFactsParagraph(tie))).toContain('чаще всего с 3 лет: 2 из 6')
  })

  it('сколько стоит — два рубежа цены', () => {
    const [price] = HUB_STATIC.live!.faq!(HUB)
    expect(price!.q).toBe('Сколько стоит детский конструктор в Ухтышке?')
    expect(plain(price!.a)).toBe(
      'От 5 890 до 79 890 ₸. Сейчас в разделе 33 конструктора, 7 из них дешевле 10 000 ₸, 27 — дешевле 20 000 ₸. '
      + 'Точная цена — в карточке набора, самовывоз в Алматы бесплатный.',
    )
    expect(price!.a).not.toMatch(/\d ₸|\d \d{3}/)
  })

  it('где купить — первым среди написанных вопросов хаба, с адресом и часами', () => {
    const [where] = HUB_STATIC.faq
    expect(where!.q).toBe('Где купить конструктор в Алматы?')
    expect(where!.a).toContain(SHOP.street)
    expect(where!.a).toContain(SHOP.openingHoursHuman)
  })

  it('абзац встаёт в HTML сразу за первым абзацем, с экранированием', () => {
    expect(insertAfterFirstParagraph('<h2>А</h2><p>первый</p><h2>Б</h2><p>второй</p>', 'цифры & <цены>'))
      .toBe('<h2>А</h2><p>первый</p>\n<p>цифры &amp; &lt;цены&gt;</p><h2>Б</h2><p>второй</p>')
    expect(insertAfterFirstParagraph('<ul><li>пункт</li></ul>', 'цифры')).toBe('<p>цифры</p>\n<ul><li>пункт</li></ul>')
  })
})

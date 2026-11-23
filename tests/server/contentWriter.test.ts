import type { OfferItem } from '~/utils/supplierOfferList'
import { describe, expect, it } from 'vitest'
import { buildAdminPrompt, PROMPT_SHOP_RULES } from '~/constants/adminPrompts'
import {
  BRAND_SYSTEM,
  categoryPaths,
  cleanCaption,
  matchSiteBrand,
  normBrandName,
  offerProductData,
  parseBrandReply,
  parseProductReply,
  productSystem,
} from '~/server/utils/contentWriter'

/*
 * «Тексты для сайта» (23 ноября 2026): «На сайт» в «Товарах поставщиков» —
 * описание, раздел и бренд от ИИ. Здесь — всё, что стоит между ответом
 * модели и формой: номера разделов и брендов, разметка, подпись поставщика.
 */

const rows = [
  { id: 'boys', name: 'Мальчикам', parent_id: null },
  { id: 'cars', name: 'Машинки', parent_id: 'boys' },
  { id: 'rc', name: ' Радиоуправляемые машинки', parent_id: 'cars' },
  { id: 'kids', name: 'Малышам', parent_id: null },
  { id: 'dev', name: 'Развивающие игрушки', parent_id: 'kids' },
]
const categories = categoryPaths(rows)
const brands = [
  { id: 'b-lol', name: 'L.O.L. Surprise!', slug: 'lol-surprise' },
  { id: 'b-sub', name: 'SuboTech', slug: 'subotech' },
]
const item: OfferItem = {
  name: 'Машинка на пульте PO-1013',
  article: 'PO-1013',
  brand: 'Roadster',
  price: 1013,
  priceFrom: 'text',
  imagePrice: null,
  priceNote: 'от 3 шт',
  age: '3+',
  confidence: 'high',
  doubt: null,
}

describe('разделы и бренды сайта', () => {
  it('путь раздела — от верхнего, без пробелов по краям; порядок по пути', () => {
    expect(categories.map(c => c.path)).toEqual([
      'Малышам',
      'Малышам › Развивающие игрушки',
      'Мальчикам',
      'Мальчикам › Машинки',
      'Мальчикам › Машинки › Радиоуправляемые машинки',
    ])
  })

  it('петля в родителях не вешает сборку пути', () => {
    const loop = categoryPaths([{ id: 'a', name: 'А', parent_id: 'b' }, { id: 'b', name: 'Б', parent_id: 'a' }])
    expect(loop.map(c => c.path).sort()).toEqual(['А › Б', 'Б › А'])
  })

  it('бренд под другим написанием — тот же: регистр, точки, слаг', () => {
    expect(normBrandName('L.O.L. Surprise!')).toBe('lolsurprise')
    expect(matchSiteBrand(brands, 'LOL surprise')?.id).toBe('b-lol')
    expect(matchSiteBrand(brands, 'lol-surprise')?.id).toBe('b-lol')
    expect(matchSiteBrand(brands, 'Subo Tech')?.id).toBe('b-sub')
    expect(matchSiteBrand(brands, 'Hasbro')).toBeNull()
    expect(matchSiteBrand(brands, '!!!')).toBeNull()
  })
})

describe('подпись поставщика — без контактов и денег', () => {
  it('телефоны, ссылки, упоминания и суммы вычищены, остальное на месте', () => {
    const text = cleanCaption('Машинка на пульте, арт. PO-1013\nЦена 1 500 тг, от 3 шт\nЗвоните +7 (777) 123-45-67 или 87771234567\nhttps://t.me/supplier @supplier_kz\nВозраст 3+')
    expect(text).toContain('арт. PO-1013')
    expect(text).toContain('Возраст 3+')
    expect(text).toContain('от 3 шт')
    for (const gone of ['1 500', '777', '123-45-67', 't.me', '@supplier', 'https'])
      expect(text).not.toContain(gone)
  })

  it('сумма не съедает артикул со строки выше', () => {
    expect(cleanCaption('Артикул 60411\n2000₸')).toBe('Артикул 60411')
  })

  it('пустая подпись — пустая строка', () => {
    expect(cleanCaption(null)).toBe('')
    expect(cleanCaption('   ')).toBe('')
  })
})

describe('запрос к модели', () => {
  it('ДАННЫЕ — подписи кнопки «Скопировать промпт», без цены поставщика', () => {
    const data = offerProductData(item, 'Цена 1 500 тг\nКрутая машинка', 1)
    expect(data).toContain('- Название сейчас (с коробки / от поставщика): Машинка на пульте PO-1013')
    expect(data).toContain('- Бренд: Roadster')
    expect(data).toContain('- Код модели (артикул с коробки): PO-1013')
    expect(data).toContain('Крутая машинка')
    expect(data).not.toMatch(/1013 ₸|1 500|от 3 шт/)
    expect(data).not.toContain('В посте товаров')
  })

  it('несколько товаров в посте — модель знает, про какой писать', () => {
    expect(offerProductData(item, null, 3)).toContain('В посте товаров: 3 — пиши только про этот: «Машинка на пульте PO-1013», артикул PO-1013')
  })

  it('правила магазина и задание — как у кнопки, но ответ JSON, а не «Имя поля:»', () => {
    const system = productSystem(categories, brands)
    expect(system.startsWith(PROMPT_SHOP_RULES)).toBe(true)
    expect(buildAdminPrompt('product')).toContain('Отвечай строго по полям из задания')
    expect(system).not.toContain('Отвечай строго по полям из задания')
    expect(system).toContain('Название товара: схема «Тип + бренд/серия')
    expect(system).toContain('5. Мальчикам › Машинки › Радиоуправляемые машинки')
    expect(system).toContain('1. L.O.L. Surprise!')
    expect(BRAND_SYSTEM).toContain('Заголовок страницы (title)')
    expect(BRAND_SYSTEM).not.toContain('Отвечай строго по полям из задания')
  })
})

describe('ответ модели о товаре', () => {
  const reply = (over: Record<string, unknown> = {}) => JSON.stringify({
    name: 'Машинка на радиоуправлении Roadster PO-1013 — 1:24, пульт 2,4 ГГц',
    description: '<h2 data-icon="fluent-emoji-flat:racing-car">Машинка</h2><p>Едет.</p>',
    seo_description: 'Машинка на радиоуправлении Roadster PO-1013, пульт 2,4 ГГц, масштаб 1:24. Купить в Ухтышке с доставкой по Казахстану, для детей от 3 лет.',
    category: 5,
    brand: 0,
    new_brand: 'Roadster',
    ...over,
  })

  it('номера — в id раздела и бренда; нового бренда нет в списке — он и остаётся новым', () => {
    const r = parseProductReply(reply(), categories, brands)
    expect(r.category).toEqual({ id: 'rc', path: 'Мальчикам › Машинки › Радиоуправляемые машинки' })
    expect(r.brand).toBeNull()
    expect(r.newBrand).toBe('Roadster')
    expect(r.description).toBe('<h2 data-icon="fluent-emoji-flat:racing-car">Машинка</h2><p>Едет.</p>')
    expect(r.warnings).toEqual([])
  })

  it('номер не из списка — «не выбрано»', () => {
    const r = parseProductReply(reply({ category: 99, brand: -1 }), categories, brands)
    expect(r.category).toBeNull()
    expect(r.brand).toBeNull()
    expect(parseProductReply(reply({ category: 0 }), categories, brands).category).toBeNull()
  })

  it('«новый» бренд, который на сайте есть, — существующий', () => {
    const r = parseProductReply(reply({ new_brand: 'LOL Surprise' }), categories, brands)
    expect(r.brand).toEqual({ id: 'b-lol', name: 'L.O.L. Surprise!' })
    expect(r.newBrand).toBeNull()
  })

  it('бренд из списка главнее «нового»', () => {
    const r = parseProductReply(reply({ brand: 2, new_brand: 'Roadster' }), categories, brands)
    expect(r.brand?.id).toBe('b-sub')
    expect(r.newBrand).toBeNull()
  })

  it('чужая разметка вырезается, человеку — предупреждение', () => {
    const r = parseProductReply(reply({ description: '<h2>Машинка</h2><script>alert(1)</script><p onclick="x()">Едет <a href="https://x">тут</a></p>' }), categories, brands)
    expect(r.description).toBe('<h2>Машинка</h2><p>Едет тут</p>')
    expect(r.warnings.join(' ')).toMatch(/вырезаны неразрешённые теги: script, a/)
  })

  it('длины и вода — предупреждения, а не отказ', () => {
    const r = parseProductReply(reply({
      name: 'Очень длинное название машинки на радиоуправлении Roadster PO-1013 для мальчиков — пульт',
      seo_description: 'Коротко.',
      description: '<p>Широкий выбор машинок — заказывайте прямо сейчас, доставка по Казахстану за 1–3 дня.</p>',
    }), categories, brands)
    const all = r.warnings.join(' | ')
    expect(all).toMatch(/Название до « — » — \d+ знаков/)
    expect(all).toMatch(/SEO описание — 8 знаков/)
    expect(all).toMatch(/Шаблонная вода/)
    expect(all).toMatch(/Неверное обещание доставки/)
  })

  it('не JSON — ошибка, а не пустая форма', () => {
    expect(() => parseProductReply('Не могу помочь', categories, brands)).toThrow('Ответ модели не разобрался')
  })
})

describe('ответ модели о бренде', () => {
  const reply = (over: Record<string, unknown> = {}) => JSON.stringify({
    found: true,
    name: 'Roadster Toys',
    meta_title: 'Машинки Roadster Toys — купить в Алматы | Ухтышка',
    seo_h1: 'Машинки Roadster Toys',
    seo_description: 'Машинки Roadster Toys на радиоуправлении: модели для детей от 3 лет. Доставка по Алматы за 1–3 рабочих дня и самовывоз из Шапагата.',
    seo_keywords: ['roadster toys', 'машинки roadster', 'roadster toys', ' '],
    description: '<h2>О бренде</h2><p>Машинки.</p><img src=x onerror=alert(1)>',
    ...over,
  })

  it('страница бренда: слаг из названия, ключевые слова без повторов и пустых, разметка вычищена', () => {
    const { page, warnings } = parseBrandReply(reply())
    expect(page).toMatchObject({ name: 'Roadster Toys', slug: 'roadster-toys', seo_h1: 'Машинки Roadster Toys' })
    expect(page?.seo_keywords).toEqual(['roadster toys', 'машинки roadster'])
    expect(page?.description).toBe('<h2>О бренде</h2><p>Машинки.</p>')
    expect(warnings.join(' ')).toMatch(/вырезаны неразрешённые теги: img/)
  })

  it('found=false или без названия — бренда нет', () => {
    expect(parseBrandReply(reply({ found: false })).page).toBeNull()
    expect(parseBrandReply(reply({ name: '  ' })).page).toBeNull()
  })

  it('проверки длины — те же, что у генератора страниц брендов', () => {
    const { warnings } = parseBrandReply(reply({ meta_title: 'Машинки Roadster Toys на радиоуправлении — купить в Алматы с доставкой' }))
    expect(warnings.join(' ')).toMatch(/Google обрежет после 60/)
    expect(warnings.join(' ')).toMatch(/нет названия магазина/)
  })
})

import { describe, expect, it } from 'vitest'
import { feedAgeGroup, feedDescription, feedGender, feedItemGroups, feedItemXml, feedTitle } from '@/utils/merchantFeed'
import { cleanProductName } from '@/utils/productName'

/*
 * Фид Merchant Center по спецификации. Разбор 22 сентября 2026: пробел в
 * начале 8 названий, сырой HTML во всех описаниях, «Ухтышка» брендом у 92
 * товаров без бренда, identifier_exists = false (разрешены yes/no),
 * sale_price у 12 товаров без скидки — от одного округления цены.
 */
const base = {
  id: 'p1',
  name: ' Кукла шарнирная DEFA Lucy 8493 — 10 шарниров',
  slug: 'kukla-defa-8493',
  description: '<h2 data-icon="fluent-emoji-flat:star">Кукла Lucy</h2><p>Шарнирная кукла&nbsp;29 см &amp; питомец.</p><ul><li data-icon="x">10 шарниров</li><li>Аксессуары</li></ul>',
  price: 8490,
  final_price: 7990,
  discount_percentage: 5,
  stock_quantity: 3,
  barcode: null,
  brandName: 'DEFA',
  categoryName: 'Куклы для девочек',
  imageUrl: 'https://img/x_lg.webp',
}

describe('cleanProductName', () => {
  it('срезает пробелы по краям и двойные внутри', () => {
    expect(cleanProductName('  Кукла  DEFA  ')).toBe('Кукла DEFA')
  })
})

describe('feedTitle', () => {
  it('без пробела в начале и не длиннее 150 знаков', () => {
    expect(feedTitle(base.name)).toBe('Кукла шарнирная DEFA Lucy 8493 — 10 шарниров')
    expect(feedTitle(`Конструктор ${'деталь '.repeat(40)}`).length).toBeLessThanOrEqual(150)
  })
})

describe('feedDescription', () => {
  it('простой текст: блоки строками, пункты — «•», без тегов и сущностей', () => {
    const d = feedDescription(base.description, base.name)
    // Неразрывный пробел в фиде — обычный: это простой текст, а не вёрстка.
    expect(d).toBe('Кукла Lucy\nШарнирная кукла 29 см & питомец.\n• 10 шарниров\n• Аксессуары')
    expect(d).not.toMatch(/<|data-icon|&nbsp;|&amp;/)
  })

  it('пустое описание — название', () => {
    expect(feedDescription(null, ' Кукла ')).toBe('Кукла')
  })

  it('не длиннее 5000 знаков', () => {
    expect(feedDescription(`<p>${'слово '.repeat(2000)}</p>`, 'x').length).toBeLessThanOrEqual(5000)
  })
})

describe('feedItemXml', () => {
  it('настоящая скидка: price — до скидки, sale_price — текущая', () => {
    const xml = feedItemXml(base, 'https://uhti.kz')
    expect(xml).toContain('<g:price>8490 KZT</g:price>')
    expect(xml).toContain('<g:sale_price>7990 KZT</g:sale_price>')
  })

  it('«скидка» только от округления (0 %) — без sale_price', () => {
    const xml = feedItemXml({ ...base, price: 4390, final_price: 4290, discount_percentage: 0 }, 'https://uhti.kz')
    expect(xml).toContain('<g:price>4290 KZT</g:price>')
    expect(xml).not.toContain('sale_price')
  })

  it('без бренда — поле brand не отдаётся, а не «Ухтышка»', () => {
    const xml = feedItemXml({ ...base, brandName: null }, 'https://uhti.kz')
    expect(xml).not.toContain('<g:brand>')
    expect(xml).not.toContain('Ухтышка')
  })

  it('identifier_exists — «no», а не «false»; с настоящим GTIN — gtin', () => {
    expect(feedItemXml(base, 'https://uhti.kz')).toContain('<g:identifier_exists>no</g:identifier_exists>')
    const withGtin = feedItemXml({ ...base, barcode: '4006381333931' }, 'https://uhti.kz')
    expect(withGtin).toContain('<g:gtin>4006381333931</g:gtin>')
    expect(withGtin).not.toContain('identifier_exists')
  })

  it('текст не может закрыть CDATA раньше времени', () => {
    const xml = feedItemXml({ ...base, name: 'Набор ]]> <script>' }, 'https://uhti.kz')
    expect(xml).toContain('<g:title><![CDATA[Набор ]]]]><![CDATA[> <script>]]></g:title>')
  })
})

/*
 * Характеристики в фиде (23 сентября 2026): до этого у каждого товара было
 * одно фото из ~6, ни возраста, ни пола, ни цвета, ни параметров.
 */
describe('характеристики в фиде', () => {
  const full = {
    ...base,
    additionalImageUrls: ['https://img/x_lg.webp', 'https://img/2_lg.webp', 'https://img/2_lg.webp', 'https://img/3_lg.webp'],
    minAgeMonths: 36,
    gender: 'female',
    color: 'Розовый',
    details: [{ name: 'Тип куклы', value: 'Шарнирная кукла' }, { name: 'Возраст', value: 'от 3 лет' }],
    itemGroupId: 'grp-1',
  }
  const xml = feedItemXml(full, 'https://uhti.kz')

  it('дополнительные фото — без главного и без повторов', () => {
    expect(xml.match(/<g:additional_image_link>/g)).toHaveLength(2)
    expect(xml).not.toContain('<g:additional_image_link>https://img/x_lg.webp</g:additional_image_link>')
  })

  it('не больше 10 дополнительных фото', () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://img/${i}_lg.webp`)
    expect(feedItemXml({ ...base, additionalImageUrls: many }, 'https://uhti.kz').match(/<g:additional_image_link>/g)).toHaveLength(10)
  })

  it('возраст, пол, цвет, группа вариантов, параметры', () => {
    expect(xml).toContain('<g:age_group>toddler</g:age_group>')
    expect(xml).toContain('<g:gender>female</g:gender>')
    expect(xml).toContain('<g:color><![CDATA[Розовый]]></g:color>')
    expect(xml).toContain('<g:item_group_id>grp-1</g:item_group_id>')
    expect(xml).toContain('<g:product_detail><g:section_name>Характеристики</g:section_name><g:attribute_name><![CDATA[Тип куклы]]></g:attribute_name><g:attribute_value><![CDATA[Шарнирная кукла]]></g:attribute_value></g:product_detail>')
  })

  it('нет данных — нет полей', () => {
    const bare = feedItemXml(base, 'https://uhti.kz')
    expect(bare).not.toMatch(/age_group|<g:gender>|<g:color>|item_group_id|product_detail|additional_image_link/)
  })
})

describe('feedAgeGroup — границы по спецификации Google', () => {
  it.each([
    [0, 'newborn'],
    [2, 'newborn'],
    [3, 'infant'],
    [6, 'infant'],
    [11, 'infant'],
    [12, 'toddler'],
    [18, 'toddler'],
    [36, 'toddler'],
    [59, 'toddler'],
    [60, 'kids'],
    [72, 'kids'],
    [144, 'kids'],
    [155, 'kids'],
    [156, 'adult'],
    [216, 'adult'],
  ])('%s мес → %s', (months, group) => {
    expect(feedAgeGroup(months)).toBe(group)
  })

  it('без возраста — без группы', () => {
    expect(feedAgeGroup(null)).toBeNull()
    expect(feedAgeGroup(undefined)).toBeNull()
  })
})

describe('feedGender', () => {
  it('только значения из спецификации', () => {
    expect(feedGender('female')).toBe('female')
    expect(feedGender('unisex')).toBe('unisex')
    expect(feedGender(null)).toBeNull()
    expect(feedGender('девочки')).toBeNull()
  })
})

describe('feedItemGroups — связка вариантов только там, где у всех свой цвет', () => {
  it('все с цветом и цвета разные — связка есть', () => {
    const g = feedItemGroups([
      { id: 'a', groupId: 'tolokar', color: 'Голубой' },
      { id: 'b', groupId: 'tolokar', color: 'Жёлтый' },
      { id: 'c', groupId: null, color: 'Розовый' },
    ])
    expect(g.get('a')).toBe('tolokar')
    expect(g.get('b')).toBe('tolokar')
    expect(g.has('c')).toBe(false)
  })

  it('у одного варианта цвета нет — вся группа без связки (танк «песочный камуфляж»)', () => {
    const g = feedItemGroups([
      { id: 'a', groupId: 'tank', color: 'Зелёный' },
      { id: 'b', groupId: 'tank', color: null },
    ])
    expect(g.size).toBe(0)
  })

  it('одинаковые цвета или один товар в группе — без связки', () => {
    expect(feedItemGroups([{ id: 'a', groupId: 'g', color: 'Чёрный' }, { id: 'b', groupId: 'g', color: 'Чёрный' }]).size).toBe(0)
    expect(feedItemGroups([{ id: 'a', groupId: 'g', color: 'Чёрный' }]).size).toBe(0)
  })
})

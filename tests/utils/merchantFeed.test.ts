import { describe, expect, it } from 'vitest'
import { feedDescription, feedItemXml, feedTitle } from '@/utils/merchantFeed'
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

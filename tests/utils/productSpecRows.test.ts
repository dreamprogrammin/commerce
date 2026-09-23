import { describe, expect, it } from 'vitest'
import { attributeSpecRows, filterLink } from '@/utils/productSpecRows'

/*
 * Строки характеристик карточки (23 сентября 2026). До этого значения
 * атрибутов на странице не показывались вовсе, а строка «Количество
 * деталей» ждала несуществующий тип атрибута.
 */
const RC = 'cat-rc'
const HREF = '/catalog/boys/mashinki/radioupravlyaemye-mashinki'

const power = {
  name: 'Питание',
  slug: 'pitanie',
  display_type: 'select',
  attribute_options: [{ id: 71, value: 'Аккумулятор' }, { id: 72, value: 'Батарейки' }],
  category_attributes: [{ category_id: RC }],
}
const color = {
  name: 'Цвет',
  slug: 'color',
  display_type: 'color',
  attribute_options: [{ id: 3, value: 'Жёлтый', meta: { hex: '#facc15' } }],
  category_attributes: [{ category_id: 'cat-tolokar' }],
}
const pieces = {
  name: 'Количество деталей ',
  slug: 'kolichestvo-detaley',
  display_type: 'numeric',
  unit: 'шт',
  category_attributes: [{ category_id: RC }],
}
const kind = {
  name: 'Вид техники',
  slug: 'vid-tehniki',
  display_type: 'select',
  attribute_options: [{ id: 90, value: 'Танк' }],
  category_attributes: [{ category_id: RC }],
}

describe('attributeSpecRows', () => {
  const rows = attributeSpecRows({
    categoryId: RC,
    categoryHref: HREF,
    values: [
      { attribute_id: 1, option_id: 3, numeric_value: null, attributes: color },
      { attribute_id: 2, option_id: 72, numeric_value: null, attributes: power },
      { attribute_id: 3, option_id: null, numeric_value: '404', attributes: pieces },
      { attribute_id: 4, option_id: 90, numeric_value: null, attributes: kind },
    ],
  })

  it('порядок: что это, как работает, как выглядит', () => {
    expect(rows.map(r => r.label)).toEqual(['Вид техники', 'Питание', 'Количество деталей', 'Цвет'])
  })

  it('значение со ссылкой на раздел с фильтром — если фильтр в разделе есть', () => {
    expect(rows.find(r => r.label === 'Питание')).toMatchObject({ value: 'Батарейки', to: `${HREF}?attr_pitanie=72` })
  })

  it('атрибут не привязан к разделу — без ссылки: каталог такой фильтр из адреса не прочтёт', () => {
    expect(rows.find(r => r.label === 'Цвет')?.to).toBeUndefined()
    expect(rows.find(r => r.label === 'Цвет')?.swatch).toBe('#facc15')
  })

  it('число — с единицей, без ссылки; пробел в конце имени атрибута срезан', () => {
    expect(rows.find(r => r.key === 'attr-kolichestvo-detaley')).toEqual({ key: 'attr-kolichestvo-detaley', label: 'Количество деталей', value: '404 шт' })
  })

  it('без раздела — без ссылок, но строки есть', () => {
    const plain = attributeSpecRows({ categoryId: null, categoryHref: null, values: [{ attribute_id: 2, option_id: 71, numeric_value: null, attributes: power }] })
    expect(plain).toEqual([{ key: 'attr-pitanie', label: 'Питание', value: 'Аккумулятор', to: undefined, swatch: undefined }])
  })

  it('битое значение (варианта нет) — строки нет', () => {
    expect(attributeSpecRows({ categoryId: RC, categoryHref: HREF, values: [{ attribute_id: 2, option_id: 999, numeric_value: null, attributes: power }] })).toEqual([])
  })
})

describe('filterLink', () => {
  it('материал и страна — фильтром раздела', () => {
    expect(filterLink(HREF, 'materials', 1)).toBe(`${HREF}?materials=1`)
    expect(filterLink(null, 'countries', 1)).toBeUndefined()
    expect(filterLink(HREF, 'countries', null)).toBeUndefined()
  })
})

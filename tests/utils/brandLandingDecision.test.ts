import { describe, expect, it } from 'vitest'
import { categoryNamesBrand, countProductsByCategoryBrand, decideBrandLanding } from '@/utils/brandLanding'

/*
 * Дерево как на бою: «Мальчикам» → «Машинки» → «Радиоуправляемые машинки»,
 * и все 9 машинок MokaToys лежат в самом глубоком разделе. Фильтр по разделу
 * включает подразделы, поэтому одни и те же 9 товаров видны на ТРЁХ адресах.
 */
const categories = [
  { id: 'boys', parent_id: null },
  { id: 'mashinki', parent_id: 'boys' },
  { id: 'rc', parent_id: 'mashinki' },
  { id: 'treki', parent_id: 'mashinki' },
  { id: 'kukly', parent_id: 'girls' },
  { id: 'girls', parent_id: null },
  { id: 'kukly-lol', parent_id: 'kukly', name: 'Куклы L.O.L', seo_h1: 'Куклы L.O.L для девочек' },
]
const moka = Array.from({ length: 9 }, () => ({ brand_id: 'moka', category_id: 'rc' }))
const lol = [
  ...Array.from({ length: 3 }, () => ({ brand_id: 'lol', category_id: 'kukly-lol' })),
  { brand_id: 'lol', category_id: 'kukly' },
]
const hola = [{ brand_id: 'hola', category_id: 'treki' }, { brand_id: 'hola', category_id: 'treki' }]
const counts = countProductsByCategoryBrand([...moka, ...lol, ...hola], categories)

describe('decideBrandLanding', () => {
  it('открывает самую точную связку', () => {
    expect(decideBrandLanding('rc', 'moka', counts, categories)).toEqual({ indexable: true })
  })

  it('закрывает родителя, если у него тот же набор, что у подраздела', () => {
    // «Машинки + MokaToys» — те же 9 товаров, что «Радиоуправляемые машинки + MokaToys».
    expect(decideBrandLanding('mashinki', 'moka', counts, categories))
      .toEqual({ indexable: false, reason: 'same-as-child', sameAsChildId: 'rc' })
  })

  it('корневой раздел не открывает никогда', () => {
    // «Мальчикам MokaToys» — аудиторный хаб, а не товарная связка.
    expect(decideBrandLanding('boys', 'moka', counts, categories))
      .toEqual({ indexable: false, reason: 'root-category' })
  })

  it('родитель с БОЛЬШИМ набором, чем любой подраздел, открыт', () => {
    // «Куклы + L.O.L.» — 4 товара, а в «Куклах L.O.L.» только 3: это разные страницы.
    expect(decideBrandLanding('kukly', 'lol', counts, categories, 'L.O.L. Surprise')).toEqual({ indexable: true })
    // Без имени бренда (старые вызовы) правило по названию не срабатывает.
    expect(decideBrandLanding('kukly-lol', 'lol', counts, categories)).toEqual({ indexable: true })
  })

  it('раздел, уже названный брендом, не открывает', () => {
    // «Куклы L.O.L» + L.O.L. Surprise: на бою выходило «Куклы L.O.L L.O.L.
    // Surprise для девочек» с теми же тремя куклами, что у самого раздела.
    expect(decideBrandLanding('kukly-lol', 'lol', counts, categories, 'L.O.L. Surprise'))
      .toEqual({ indexable: false, reason: 'category-names-brand' })
  })

  it('меньше трёх товаров — закрыта', () => {
    expect(decideBrandLanding('treki', 'hola', counts, categories))
      .toEqual({ indexable: false, reason: 'few-products' })
  })

  it('пары без товаров вовсе — закрыта', () => {
    expect(decideBrandLanding('treki', 'moka', counts, categories))
      .toEqual({ indexable: false, reason: 'few-products' })
  })
})

describe('categoryNamesBrand', () => {
  it('узнаёт бренд в названии раздела, точки внутри не мешают', () => {
    expect(categoryNamesBrand(['Куклы L.O.L'], 'L.O.L. Surprise')).toBe(true)
    expect(categoryNamesBrand([null, 'Конструкторы LEGO City'], 'LEGO')).toBe(true)
  })

  it('часть слова — не совпадение', () => {
    expect(categoryNamesBrand(['Конструкторы Legoland-совместимые'], 'LEGO')).toBe(false)
  })

  it('короткое первое слово бренда не сравнивает', () => {
    // «My Little Home»: «my» слишком легко встретить случайно.
    expect(categoryNamesBrand(['My world'], 'My Little Home')).toBe(false)
    expect(categoryNamesBrand(['Куклы'], '')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { composeProductDescription, composeProductTitle, productGenderText } from '@/utils/productMeta'
import { composeProductMeta } from '@/utils/seoDescription'
import { buildProductTitle } from '@/utils/seoTitle'

/*
 * Заголовок и описание карточки целиком — ими же считает предпросмотр в
 * админке. До 22.10.2026 предпросмотр писал «<название> - Купить в
 * интернет-магазине | Ухтышка», а страница — обрезанное по слову название.
 * Сам `composeProductMeta` проверяется в productMeta.test.ts.
 */
const NAME = 'Погремушка на присоске Sky Wheel ABL002-2 — вертушка-колесо, фактурные колечки, 11×7×18 см, от 3 месяцев'

describe('composeProductTitle', () => {
  it('написанное руками главнее: meta_title, потом seo_title', () => {
    expect(composeProductTitle({ name: NAME, metaTitle: 'Свой', seoTitle: 'Старый' })).toBe('Свой')
    expect(composeProductTitle({ name: NAME, metaTitle: null, seoTitle: 'Старый' })).toBe('Старый')
  })

  it('пусто — обрезанное по слову название, как на странице', () => {
    const title = composeProductTitle({ name: NAME })
    expect(title).toBe(buildProductTitle(NAME))
    expect(title).not.toContain('Купить в интернет-магазине')
  })
})

describe('composeProductDescription', () => {
  const facts = { name: NAME, gender: null, age: 'от 3 месяцев', inStock: true, price: 2690 }

  it('ручное meta_description, потом SEO-описание из админки', () => {
    expect(composeProductDescription({ ...facts, metaDescription: 'Ручное.', seoDescription: 'SEO.' })).toBe('Ручное.')
    expect(composeProductDescription({ ...facts, seoDescription: 'SEO.' })).toBe('SEO.')
  })

  it('пусто — строка из фактов, а не сырое «Описание»', () => {
    expect(composeProductDescription(facts)).toBe(composeProductMeta(facts))
    expect(composeProductDescription(facts)).toContain('2 690 ₸')
  })
})

describe('productGenderText', () => {
  it('девочки, мальчики; унисекс и пусто — ничего', () => {
    expect(productGenderText('female')).toBe('для девочек')
    expect(productGenderText('male')).toBe('для мальчиков')
    expect(productGenderText('unisex')).toBeNull()
    expect(productGenderText(null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { composeProductMeta, META_DESCRIPTION_LIMIT } from '@/utils/seoDescription'

const VILLA = 'Конструктор Вилла с интерьером и ландшафтом 216 деталей — уютный дом твоей мечты'
const DOCTOR = 'Игровой набор Доктор Tourist 008-105A чемодан-тележка 3в1 — 65 см, медицинские инструменты, от 3 лет'

describe('composeProductMeta', () => {
  it('не обещает доставку за день', () => {
    // На проде 17 сентября 2026: «Доставка по Алматы за 1 день» у двух карточек.
    const out = composeProductMeta({ name: VILLA, inStock: true, price: 13490 })
    expect(out).not.toMatch(/за 1 день/i)
    expect(out).toContain('1–3 дня')
  })

  it('не повторяет возраст, если он уже в названии', () => {
    // Было: «…медицинские инструменты, от 3 лет от 3 лет».
    const out = composeProductMeta({ name: DOCTOR, age: 'от 3 лет', inStock: true, price: 6990 })
    expect(out.match(/от 3 лет/g)?.length).toBe(1)
  })

  it('дописывает возраст и пол, когда в названии их нет', () => {
    const out = composeProductMeta({ name: 'Кукла шарнирная DEFA Lucy', gender: 'для девочек', age: 'от 3 лет', price: 4990 })
    expect(out).toContain('для девочек от 3 лет')
  })

  it('рейтинг с одного отзыва в сниппет не идёт', () => {
    const one = composeProductMeta({ name: VILLA, rating: 5, reviewsCount: 1, price: 13490 })
    expect(one).not.toMatch(/рейтинг/i)
    const many = composeProductMeta({ name: VILLA, rating: 4.5, reviewsCount: 6, price: 13490 })
    expect(many).toMatch(/Рейтинг 4,5 из 5 по 6 отзывам/)
  })

  it('без эмодзи', () => {
    const out = composeProductMeta({ name: VILLA, rating: 5, reviewsCount: 9, inStock: true, price: 13490 })
    expect(out).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('укладывается в лимит и сохраняет цену, даже когда название длинное', () => {
    const long = 'Радиоуправляемый внедорожник ВАЗ Нива LIGHT JT333 хамелеон — 1:16, открывающиеся двери, аккумулятор, 37×10×18 см, свет и звук, для детей от 3 лет и старше'
    const out = composeProductMeta({ name: long, inStock: true, price: 9590 })
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
    // Цена — то, ради чего кликают: её обрезка не должна съедать первой.
    // Разделитель разрядов в formatPrice — U+00A0, а не обычный пробел.
    expect(out).toMatch(/От 9\u00A0590 ₸\.$/)
  })

  it('нет наличия — нет и слова «В наличии»', () => {
    const out = composeProductMeta({ name: VILLA, inStock: false, price: 13490 })
    expect(out).not.toContain('В наличии')
  })

  it('город называется один раз', () => {
    const out = composeProductMeta({ name: 'Самокат детский, Алматы', inStock: true, price: 1000 })
    expect(out.match(/Алматы/g)?.length).toBe(1)
  })
})

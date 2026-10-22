import { describe, expect, it } from 'vitest'
import { brandHeadingWord, DEFAULT_BRAND_HEADING_WORD, findTopRootSlug } from '@/utils/brandHeading'

describe('brandHeadingWord', () => {
  it('корню-типу отдаёт его собственное слово', () => {
    expect(brandHeadingWord('constructors-root')).toBe('Конструкторы')
    expect(brandHeadingWord('games')).toBe('Игры')
  })

  it('корень-аудиторию заменяет нейтральным словом', () => {
    // «Мальчикам Zuru — купить в Алматы» по-русски не читается.
    expect(brandHeadingWord('boys')).toBe('Игрушки')
    expect(brandHeadingWord('girls')).toBe('Игрушки')
    expect(brandHeadingWord('kiddy')).toBe('Игрушки')
  })

  it('незнакомый корень не ломает заголовок', () => {
    expect(brandHeadingWord('novyy-razdel-2027')).toBe(DEFAULT_BRAND_HEADING_WORD)
  })

  it('без корня заголовок остаётся прежним', () => {
    expect(brandHeadingWord(null)).toBeNull()
    expect(brandHeadingWord(undefined)).toBeNull()
    expect(brandHeadingWord('')).toBeNull()
  })
})

describe('findTopRootSlug', () => {
  const categories = [
    { id: 'kiddy', parent_id: null, slug: 'kiddy' },
    { id: 'dev-toys', parent_id: 'kiddy', slug: 'razvivayushchie-igrushki' },
    { id: 'katalki', parent_id: 'kiddy', slug: 'katalki' },
    { id: 'boys', parent_id: null, slug: 'boys' },
    { id: 'cars', parent_id: 'boys', slug: 'mashinki' },
    { id: 'rc', parent_id: 'cars', slug: 'radioupravlyaemye-mashinki' },
  ]

  it('корень, где у бренда больше всего товаров, — через вложенные разделы', () => {
    const products = [{ category_id: 'rc' }, { category_id: 'rc' }, { category_id: 'katalki' }]
    expect(findTopRootSlug(products, categories)).toBe('boys')
  })

  it('товары в разных подразделах одного корня считаются вместе', () => {
    const products = [{ category_id: 'dev-toys' }, { category_id: 'katalki' }, { category_id: 'rc' }]
    expect(findTopRootSlug(products, categories)).toBe('kiddy')
  })

  it('без товаров и без известных разделов — null', () => {
    expect(findTopRootSlug([], categories)).toBeNull()
    expect(findTopRootSlug([{ category_id: null }, { category_id: 'нет-такого' }], categories)).toBeNull()
  })

  it('петля parent_id в данных не вешает подсчёт', () => {
    const loop = [{ id: 'a', parent_id: 'b', slug: 'a' }, { id: 'b', parent_id: 'a', slug: 'b' }]
    expect(() => findTopRootSlug([{ category_id: 'a' }], loop)).not.toThrow()
  })
})

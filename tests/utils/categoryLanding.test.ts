import { describe, expect, it } from 'vitest'
import { countProductsByCategory, isCategoryIndexable } from '@/utils/categoryLanding'

/*
 * Почему этот файл появился. 16 сентября 2026 в карте сайта лежали все 64
 * категории, включая 13 без единого активного товара в ветке: за 90 дней они
 * собрали 347 показов и ноль кликов. Правило повторяет бренд-лендинги — нет
 * товара, нет страницы в индексе.
 */
const categories = [
  { id: 'kiddy', parent_id: null },
  { id: 'kukly', parent_id: 'girls' },
  { id: 'girls', parent_id: null },
  { id: 'kukly-lol', parent_id: 'kukly' },
  { id: 'katalki', parent_id: 'kiddy' },
]

describe('countProductsByCategory', () => {
  it('засчитывает товар всем родителям, а не только своей категории', () => {
    const counts = countProductsByCategory([{ category_id: 'kukly-lol' }], categories)
    expect(counts.get('kukly-lol')).toBe(1)
    expect(counts.get('kukly')).toBe(1)
    expect(counts.get('girls')).toBe(1)
    expect(counts.get('kiddy')).toBeUndefined()
  })

  it('пустая ветка остаётся без счётчика', () => {
    const counts = countProductsByCategory([{ category_id: 'kukly-lol' }], categories)
    expect(counts.get('katalki')).toBeUndefined()
  })

  it('переживает петлю в дереве, а не виснет', () => {
    const looped = [
      { id: 'a', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
    ]
    const counts = countProductsByCategory([{ category_id: 'a' }], looped)
    expect(counts.get('a')).toBe(1)
    expect(counts.get('b')).toBe(1)
  })

  it('товар без категории не ломает подсчёт', () => {
    expect(countProductsByCategory([{ category_id: null }], categories).size).toBe(0)
  })
})

describe('isCategoryIndexable', () => {
  it('с товаром в ветке — открыта', () => {
    expect(isCategoryIndexable('kukly', 19)).toBe(true)
  })

  it('без товара — закрыта', () => {
    expect(isCategoryIndexable('bizidoski', 0)).toBe(false)
    expect(isCategoryIndexable('bizidoski', null)).toBe(false)
    expect(isCategoryIndexable('bizidoski', undefined)).toBe(false)
  })

  it('исключение владельца остаётся открытым и без товара', () => {
    expect(isCategoryIndexable('katalki', 0)).toBe(true)
  })
})

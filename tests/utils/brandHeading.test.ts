import { describe, expect, it } from 'vitest'
import { brandHeadingWord, DEFAULT_BRAND_HEADING_WORD } from '@/utils/brandHeading'

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

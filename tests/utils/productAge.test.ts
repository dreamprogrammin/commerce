import { describe, expect, it } from 'vitest'
import { ageToMonths, formatAgeRange, monthsToInput, productAgeMonths } from '@/utils/productAge'

/*
 * Возраст игрушки в месяцах (22 сентября 2026). До этого возраст хранился
 * целыми годами: пирамидка «от 6 месяцев» лежала как «1», и на карточке
 * выходило «от 1 лет».
 *
 * Эти же случаи проверяет миграция 20260922120000_product_age_in_months.sql
 * для `public.age_range_ru` — вопросы о товарах пишет база, и тексты на
 * сайте и в вопросах должны совпадать.
 */
const CASES: [number | null, number | null, string | null][] = [
  [6, null, 'от 6 месяцев'],
  [9, null, 'от 9 месяцев'],
  [1, null, 'от 1 месяца'],
  [21, null, 'от 21 месяца'],
  [12, null, 'от 1 года'],
  [18, null, 'от 18 месяцев'],
  [24, null, 'от 2 лет'],
  [36, null, 'от 3 лет'],
  [42, null, 'от 3,5 года'],
  [72, null, 'от 6 лет'],
  [252, null, 'от 21 года'],
  [0, null, 'с рождения'],
  [0, 12, 'с рождения до 1 года'],
  [null, 36, 'до 3 лет'],
  [null, 6, 'до 6 месяцев'],
  [48, 144, 'от 4 до 12 лет'],
  [12, 36, 'от 1 до 3 лет'],
  [6, 18, 'от 6 до 18 месяцев'],
  [12, 18, 'от 12 до 18 месяцев'],
  [18, 96, 'от 18 месяцев до 8 лет'],
  [6, 36, 'от 6 месяцев до 3 лет'],
  [36, 36, 'от 3 лет'],
  [null, null, null],
]

describe('formatAgeRange', () => {
  it.each(CASES)('%s–%s мес → %s', (min, max, expected) => {
    expect(formatAgeRange(min, max)).toBe(expected)
  })

  it('никакого «от 1 лет»', () => {
    for (const months of [12, 252, 13 * 12, 101 * 12])
      expect(formatAgeRange(months, null)).not.toMatch(/\b1 лет|\b21 лет|\b101 лет/)
  })
})

describe('ageToMonths — админ вписывает как на коробке', () => {
  it('годы пересчитываются в месяцы', () => {
    expect(ageToMonths(6, 'years')).toBe(72)
    expect(ageToMonths(1.5, 'years')).toBe(18)
    expect(ageToMonths(3, 'years')).toBe(36)
  })

  it('месяцы остаются месяцами', () => {
    expect(ageToMonths(18, 'months')).toBe(18)
    expect(ageToMonths(0, 'months')).toBe(0)
  })

  it('пусто и мусор — без возраста', () => {
    expect(ageToMonths(null, 'years')).toBeNull()
    expect(ageToMonths(undefined, 'months')).toBeNull()
    expect(ageToMonths(Number.NaN, 'years')).toBeNull()
    expect(ageToMonths(-1, 'years')).toBeNull()
  })

  it('не больше 100 лет — как CHECK в базе', () => {
    expect(ageToMonths(150, 'years')).toBe(1200)
  })
})

describe('monthsToInput — в админке возраст виден так, как его вводили', () => {
  it('целые годы — годами', () => {
    expect(monthsToInput(72)).toEqual({ value: 6, unit: 'years' })
    expect(monthsToInput(12)).toEqual({ value: 1, unit: 'years' })
  })

  it('полгода после трёх лет — годами', () => {
    expect(monthsToInput(42)).toEqual({ value: 3.5, unit: 'years' })
  })

  it('малышовые — месяцами', () => {
    expect(monthsToInput(6)).toEqual({ value: 6, unit: 'months' })
    expect(monthsToInput(18)).toEqual({ value: 18, unit: 'months' })
    expect(monthsToInput(0)).toEqual({ value: 0, unit: 'months' })
  })

  it('пусто — пусто, по умолчанию годы', () => {
    expect(monthsToInput(null)).toEqual({ value: null, unit: 'years' })
  })

  it('туда и обратно без потерь', () => {
    for (const months of [0, 6, 9, 18, 24, 36, 42, 72, 144])
      expect(ageToMonths(monthsToInput(months).value, monthsToInput(months).unit)).toBe(months)
  })
})

describe('productAgeMonths', () => {
  it('месяцы из базы главнее лет', () => {
    expect(productAgeMonths({ min_age_months: 6, max_age_months: null, min_age_years: 1, max_age_years: null }))
      .toEqual({ min: 6, max: null })
  })

  it('пока миграция не применена — месяцы из лет', () => {
    expect(productAgeMonths({ min_age_years: 3, max_age_years: 12 })).toEqual({ min: 36, max: 144 })
  })

  it('возраст не указан', () => {
    expect(productAgeMonths({ min_age_months: null, max_age_months: null, min_age_years: null, max_age_years: null }))
      .toEqual({ min: null, max: null })
  })
})

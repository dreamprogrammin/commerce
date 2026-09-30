import { describe, expect, it } from 'vitest'
import { calculateBonusPoints, calculateFinalPrice, roundToMarketingPrice } from '@/utils/bonusCalculator'

/**
 * Цена для покупателя и бонусы — зеркало колонки `products.final_price`.
 *
 * До 30 сентября 2026 округление «до 90» применялось и без скидки и срезало
 * 100 ₸ с цены, которая уже оканчивалась на 90: 1 290 → 1 190. Плитка каталога
 * показывала 1 290, карточка и касса — 1 190. Правильная цена — введённая
 * (миграция 20260930120000).
 */
describe('calculateFinalPrice', () => {
  it('без скидки — ровно введённая цена', () => {
    expect(calculateFinalPrice(1290, 0)).toBe(1290)
    expect(calculateFinalPrice(79990, 0)).toBe(79990)
    expect(calculateFinalPrice(400, 0)).toBe(400)
    // И цена не «на 90» не округляется: скидки нет — округлять нечего
    expect(calculateFinalPrice(1000, 0)).toBe(1000)
  })

  it('со скидкой — прежнее психологическое округление', () => {
    expect(calculateFinalPrice(4890, 10)).toBe(4390)
    expect(calculateFinalPrice(13990, 5)).toBe(13190)
    expect(calculateFinalPrice(900, 50)).toBe(450)
  })

  it('отрицательная скидка считается нулевой', () => {
    expect(calculateFinalPrice(1290, -5)).toBe(1290)
  })
})

describe('calculateBonusPoints', () => {
  it('без скидки — 5 % от введённой цены', () => {
    expect(calculateBonusPoints(1290, 0, 5)).toBe(65)
    expect(calculateBonusPoints(79990, 0, 5)).toBe(4000)
  })

  it('со скидкой — от округлённой цены', () => {
    expect(calculateBonusPoints(4890, 10, 5)).toBe(220)
  })
})

describe('roundToMarketingPrice', () => {
  it('округление как было: до сотен минус 10, дешевле 500 — до десятков', () => {
    expect(roundToMarketingPrice(15302)).toBe(15290)
    expect(roundToMarketingPrice(450)).toBe(450)
  })
})

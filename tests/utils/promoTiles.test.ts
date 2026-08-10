import { describe, expect, it } from 'vitest'
import { isDiscountPromo, promoEmoji, promoGradientClass, promoSubtitle } from '@/utils/promoTiles'

/**
 * Баг, ради которого написан этот файл: вёрстка каталога отличала «Акции» от
 * «Новинок» сравнением `item.id === 'sale'`, а в настройке
 * `additional_menu_items` лежат id `new-items` и `promotions`. Условие не
 * срабатывало никогда, «Акции» рисовались как «Новинки», и на uhti.kz обе
 * карточки были синими с подписью «Новые поступления».
 *
 * Ниже — те самые id из прода, а не выдуманные.
 */
const NEW_ITEMS_ID = 'new-items'
const PROMOTIONS_ID = 'promotions'

describe('промо-плитки каталога', () => {
  it('«Акции» из настроек — скидочная плитка', () => {
    expect(isDiscountPromo(PROMOTIONS_ID)).toBe(true)
  })

  it('«Новинки» — не скидочная', () => {
    expect(isDiscountPromo(NEW_ITEMS_ID)).toBe(false)
  })

  it('две плитки из настроек не могут быть одного вида', () => {
    expect(isDiscountPromo(PROMOTIONS_ID)).not.toBe(isDiscountPromo(NEW_ITEMS_ID))
  })

  it('подписи различаются и говорят по делу', () => {
    expect(promoSubtitle(PROMOTIONS_ID)).toBe('Скидки до 50%')
    expect(promoSubtitle(NEW_ITEMS_ID)).toBe('Новые поступления')
  })

  it('эмодзи и градиент у «Акций» свои, не как у «Новинок»', () => {
    expect(promoEmoji(PROMOTIONS_ID)).not.toBe(promoEmoji(NEW_ITEMS_ID))
    expect(promoGradientClass(PROMOTIONS_ID)).not.toBe(promoGradientClass(NEW_ITEMS_ID))
    expect(promoGradientClass(PROMOTIONS_ID)).toContain('amber')
  })

  it('старые/запасные id тоже читаются как скидки', () => {
    expect(isDiscountPromo('sale')).toBe(true)
    expect(isDiscountPromo('discounts')).toBe(true)
  })

  it('незнакомый id не считается скидкой', () => {
    expect(isDiscountPromo('brands')).toBe(false)
    expect(isDiscountPromo('')).toBe(false)
  })
})

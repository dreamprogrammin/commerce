/**
 * Психологическое округление цен (Стандарт "90 тенге")
 *
 * Примеры:
 * - 15 302 ₸ → 15 290 ₸
 * - 15 050 ₸ → 14 990 ₸
 * - 8 765 ₸ → 8 690 ₸
 * - 450 ₸ → 450 ₸ (для товаров < 500₸ округляем до 0/5)
 *
 * Формула: FLOOR(price / 100) * 100 - 10
 * Исключение: Для товаров < 500₸ округляем до 10 (без -10)
 *
 * ВАЖНО: Должна совпадать с SQL формулой в products.final_price.
 * Применяется ТОЛЬКО к цене со скидкой — см. calculateFinalPrice.
 */
export function roundToMarketingPrice(price: number): number {
  if (price <= 0)
    return 0

  // Для товаров дешевле 500 ₸: округляем до 10 (без -10)
  if (price < 500) {
    return Math.floor(price / 10) * 10
  }

  // Для товаров от 500 ₸: округляем до сотен и вычитаем 10
  return Math.floor(price / 100) * 100 - 10
}

/**
 * Единая формула расчёта бонусов.
 * Должна совпадать с SQL: ROUND(final_price * percent / 100)
 * где final_price = calculateFinalPrice(price, discount_percentage)
 */
export function calculateBonusPoints(
  price: number,
  discountPercentage: number,
  bonusPercent: number,
): number {
  if (price <= 0 || bonusPercent <= 0)
    return 0
  const finalPrice = calculateFinalPrice(price, discountPercentage)

  // Рассчитываем бонусы от округленной цены
  return Math.round((finalPrice * bonusPercent) / 100)
}

/**
 * Рассчитывает финальную цену с учетом скидки и психологического округления
 */
export function calculateFinalPrice(
  price: number,
  discountPercentage: number,
): number {
  if (price <= 0)
    return 0
  // Без скидки — ровно введённая цена, как в products.final_price с
  // 30 сентября 2026. Раньше округление срезало 100 ₸ и с неё: 1 290 → 1 190,
  // и плитка каталога расходилась с кассой.
  if (!(discountPercentage > 0))
    return price
  const priceWithDiscount = (price * (100 - discountPercentage)) / 100
  return roundToMarketingPrice(priceWithDiscount)
}

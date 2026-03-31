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
 * ВАЖНО: Должна совпадать с SQL формулой в products.final_price
 */
export function roundToMarketingPrice(price: number): number {
  if (price <= 0) return 0;

  // Для товаров дешевле 500 ₸: округляем до 10 (без -10)
  if (price < 500) {
    return Math.floor(price / 10) * 10;
  }

  // Для товаров от 500 ₸: округляем до сотен и вычитаем 10
  return Math.floor(price / 100) * 100 - 10;
}

/**
 * Единая формула расчёта бонусов.
 * Должна совпадать с SQL: ROUND(final_price * percent / 100)
 * где final_price = roundToMarketingPrice(price * (100 - discount_percentage) / 100)
 */
export function calculateBonusPoints(
  price: number,
  discountPercentage: number,
  bonusPercent: number,
): number {
  if (price <= 0 || bonusPercent <= 0) return 0;
  const discount = discountPercentage > 0 ? discountPercentage : 0;

  // Сначала применяем скидку
  const priceWithDiscount = (price * (100 - discount)) / 100;

  // Затем применяем психологическое округление
  const finalPrice = roundToMarketingPrice(priceWithDiscount);

  // Рассчитываем бонусы от округленной цены
  return Math.round((finalPrice * bonusPercent) / 100);
}

/**
 * Рассчитывает финальную цену с учетом скидки и психологического округления
 */
export function calculateFinalPrice(
  price: number,
  discountPercentage: number,
): number {
  if (price <= 0) return 0;
  const discount = discountPercentage > 0 ? discountPercentage : 0;
  const priceWithDiscount = (price * (100 - discount)) / 100;
  return roundToMarketingPrice(priceWithDiscount);
}

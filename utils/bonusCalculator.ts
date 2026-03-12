/**
 * Единая формула расчёта бонусов.
 * Должна совпадать с SQL: ROUND(final_price * percent / 100)
 * где final_price = price * (100 - discount_percentage) / 100
 */
export function calculateBonusPoints(
  price: number,
  discountPercentage: number,
  bonusPercent: number,
): number {
  if (price <= 0 || bonusPercent <= 0) return 0
  const discount = discountPercentage > 0 ? discountPercentage : 0
  const finalPrice = Math.round(price * (100 - discount) / 100)
  return Math.round(finalPrice * bonusPercent / 100)
}

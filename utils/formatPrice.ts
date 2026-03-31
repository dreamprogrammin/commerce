/**
 * Форматирование цены с разделением тысяч пробелами.
 * Работает одинаково на сервере и клиенте (без зависимости от локали).
 *
 * @param price - цена в числовом формате
 * @returns отформатированная строка (например: "7 500")
 */
export function formatPrice(price: number): string {
  // Округляем до целого
  const rounded = Math.round(price);

  // Используем регулярку для добавления пробелов между тысячами
  // Это работает одинаково на сервере и клиенте
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Форматирование цены с учетом скидки.
 *
 * @deprecated Используйте product.final_price из базы данных вместо этой функции.
 * База данных рассчитывает цену с психологическим округлением (стандарт "90 тенге").
 * Эта функция оставлена только для обратной совместимости.
 *
 * @param price - оригинальная цена
 * @param discountPercent - процент скидки (0-100)
 * @returns объект с original, final ценами и флагом hasDiscount
 */
export function formatPriceWithDiscount(
  price: number,
  discountPercent?: number | null,
): {
  original: string;
  final: string;
  finalNumber: number;
  hasDiscount: boolean;
} {
  const hasDiscount = !!discountPercent && discountPercent > 0;
  const finalNumber = hasDiscount
    ? Math.round(price * (1 - discountPercent / 100))
    : Math.round(price);

  return {
    original: formatPrice(price),
    final: formatPrice(finalNumber),
    finalNumber,
    hasDiscount,
  };
}

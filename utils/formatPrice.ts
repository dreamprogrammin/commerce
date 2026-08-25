/**
 * Форматирование цены с разделением тысяч НЕРАЗРЫВНЫМ пробелом.
 * Работает одинаково на сервере и клиенте (без зависимости от локали).
 *
 * @param price - цена в числовом формате
 * @returns отформатированная строка (например: "7 500", разделитель U+00A0)
 */
export function formatPrice(price: number): string {
  // Округляем до целого
  const rounded = Math.round(price)

  /*
   * Разделитель — U+00A0, а не обычный пробел.
   *
   * По обычному пробелу браузер имеет право перенести строку, и «15 890 ₸»
   * в узкой колонке разрывается посреди числа. В проекте это уже ловили: в
   * ProductCard.vue стоит класс `whitespace-nowrap` именно с этим
   * комментарием. Такой класс приходится помнить в каждом новом месте с
   * ценой — в шаблонах ₸ встречается 119 раз, а защита стояла в 12.
   * Неразрывный пробел снимает вопрос сразу и везде.
   *
   * Регулярка, а не Intl: Intl зависит от данных ICU, а они у сервера и
   * браузера разные. Проверено 25 августа 2026 — на `kk-KZ` Node отдаёт
   * «15 890 ₸», а Chromium «KZT 15,890», то есть при SSR это расхождение
   * гидрации. Здесь же результат одинаков всегда.
   *
   * U+00A0 входит в подмножество `latin`, доплаты за шрифт нет.
   */
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')
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
  original: string
  final: string
  finalNumber: number
  hasDiscount: boolean
} {
  const hasDiscount = !!discountPercent && discountPercent > 0
  const finalNumber = hasDiscount
    ? Math.round(price * (1 - discountPercent / 100))
    : Math.round(price)

  return {
    original: formatPrice(price),
    final: formatPrice(finalNumber),
    finalNumber,
    hasDiscount,
  }
}

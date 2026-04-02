/**
 * Форматирует рейтинг с запятой вместо точки (европейский формат)
 * @param rating - Числовое значение рейтинга
 * @returns Отформатированная строка (например, "4,8")
 */
export function formatRating(rating: number | null | undefined): string {
  if (!rating) return "0,0";
  return rating.toFixed(1).replace(".", ",");
}

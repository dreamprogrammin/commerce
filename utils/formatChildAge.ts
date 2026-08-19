/**
 * Возраст ребёнка словами по дате рождения: «3 года», «11 месяцев».
 *
 * Вынесено из pages/profile/children.vue отдельным модулем ради тестов —
 * склонения и переход через месяц дают достаточно краевых случаев,
 * чтобы их стоило закрепить.
 */

/** Русское склонение по числу: 1 год / 2 года / 5 лет. */
export function pluralizeRu(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20)
    return forms[2]
  if (last > 1 && last < 5)
    return forms[1]
  if (last === 1)
    return forms[0]
  return forms[2]
}

/**
 * @param birthDate дата рождения (Date, ISO-строка или что принимает Date)
 * @param now       «сегодня» — параметр, чтобы тесты не зависели от текущей даты
 */
export function formatChildAge(
  birthDate: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!birthDate)
    return 'Возраст не указан'

  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate)
  if (Number.isNaN(birth.getTime()))
    return 'Возраст не указан'

  let months
    = (now.getFullYear() - birth.getFullYear()) * 12
      + (now.getMonth() - birth.getMonth())

  // День рождения в этом месяце ещё не наступил — месяц не засчитан
  if (now.getDate() < birth.getDate())
    months--

  // Дата в будущем: отрицательный возраст показывать нечего
  if (months < 0)
    months = 0

  if (months === 0)
    return 'Меньше месяца'

  if (months < 12)
    return `${months} ${pluralizeRu(months, ['месяц', 'месяца', 'месяцев'])}`

  const years = Math.floor(months / 12)
  return `${years} ${pluralizeRu(years, ['год', 'года', 'лет'])}`
}

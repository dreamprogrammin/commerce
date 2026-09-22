/**
 * Возраст игрушки: в базе — месяцы, в админке и на сайте — как на коробке.
 *
 * Зачем (22 сентября 2026). До этого возраст хранился целыми годами
 * (`min_age_years`), и игрушку «от 6 месяцев» можно было записать только как
 * «от 1 года»: так и лежали пирамидка HOLA от 6 месяцев, погремушка от 9 и
 * развивающий столик от 18 — все «1», а на карточке выходило «от 1 лет».
 * Владелец: «многие игрушки для малышей бывают по месяцам… а есть игрушки
 * условно от 3 лет» и «админу будет неудобно считать месяцы, если там 6 лет».
 *
 * Поэтому:
 *  • в базе `min_age_months` / `max_age_months`; годы (`min_age_years`)
 *    остались для старого кода и пересчитываются триггером
 *    (миграция `20260922120000_product_age_in_months.sql`);
 *  • в админке число и единица — «6 лет» или «18 мес», месяцы считает код;
 *  • на сайте до трёх лет дробное — месяцами («от 18 месяцев»), целые годы —
 *    годами («от 1 года», «от 3 лет»).
 *
 * Та же логика показа есть в базе — `public.age_range_ru` в той же миграции,
 * ею пишут автоматические вопросы о товарах. Меняете здесь — меняйте и там;
 * тест `tests/utils/productAge.test.ts` и SQL-проверка в миграции держат
 * одинаковый набор случаев.
 */
import { pluralizeRu } from './formatChildAge'

export type AgeUnit = 'months' | 'years'

/** Верхний предел — 100 лет. Такой же `CHECK` стоит в базе. */
export const MAX_AGE_MONTHS = 1200

// Родительный падеж — возраст всегда стоит после «от» и «до»:
// от 1 года, от 2 лет, от 21 года; от 1 месяца, от 6 месяцев.
const YEARS: [string, string, string] = ['года', 'лет', 'лет']
const MONTHS: [string, string, string] = ['месяца', 'месяцев', 'месяцев']

function isWholeYears(months: number): boolean {
  return months > 0 && months % 12 === 0
}

/** «6 месяцев», «1 года», «3 лет», «3,5 года» — под «от» и «до». */
export function ageGenitive(months: number): string {
  if (isWholeYears(months)) {
    const years = months / 12
    return `${years} ${pluralizeRu(years, YEARS)}`
  }
  if (months < 36)
    return `${months} ${pluralizeRu(months, MONTHS)}`
  // 3,5 года и старше: дробное число — родительный единственного
  const years = String(Math.round((months / 12) * 10) / 10).replace('.', ',')
  return `${years} года`
}

/**
 * «от 6 месяцев», «от 1 года», «от 6 месяцев до 3 лет», «от 4 до 12 лет»,
 * «с рождения». `null`, если возраст не указан.
 */
export function formatAgeRange(
  minMonths: number | null | undefined,
  maxMonths: number | null | undefined,
): string | null {
  const min = minMonths ?? null
  const max = maxMonths ?? null
  if (min === null && max === null)
    return null

  if (min !== null && max !== null && max > min) {
    if (min === 0)
      return `с рождения до ${ageGenitive(max)}`
    if (isWholeYears(min) && isWholeYears(max))
      return `от ${min / 12} до ${max / 12} ${pluralizeRu(max / 12, YEARS)}`
    if (!isWholeYears(max) && max < 36)
      return `от ${min} до ${max} ${pluralizeRu(max, MONTHS)}`
    return `от ${ageGenitive(min)} до ${ageGenitive(max)}`
  }
  if (min !== null)
    return min === 0 ? 'с рождения' : `от ${ageGenitive(min)}`
  return `до ${ageGenitive(max as number)}`
}

/** Месяцы из того, что ввели в админке: «6 лет» → 72, «18 мес» → 18, «1,5 года» → 18. */
export function ageToMonths(value: number | null | undefined, unit: AgeUnit): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0)
    return null
  return Math.min(MAX_AGE_MONTHS, Math.round(unit === 'years' ? value * 12 : value))
}

/**
 * Как показать месяцы в админке — в тех единицах, в которых их, скорее всего,
 * вводили: 72 → «6 лет», 42 → «3,5 года», 18 → «18 мес», 0 → «0 мес».
 */
export function monthsToInput(months: number | null | undefined): { value: number | null, unit: AgeUnit } {
  if (months === null || months === undefined)
    return { value: null, unit: 'years' }
  if (isWholeYears(months) || (months > 36 && months % 6 === 0))
    return { value: months / 12, unit: 'years' }
  return { value: months, unit: 'months' }
}

/**
 * Возраст товара в месяцах. Пока миграция не применена, колонок с месяцами в
 * ответе базы нет — тогда берутся годы.
 */
export function productAgeMonths(product: {
  min_age_months?: number | null
  max_age_months?: number | null
  min_age_years?: number | null
  max_age_years?: number | null
}): { min: number | null, max: number | null } {
  const fromYears = (years: number | null | undefined) =>
    years === null || years === undefined ? null : years * 12
  return {
    min: product.min_age_months !== undefined ? product.min_age_months : fromYears(product.min_age_years),
    max: product.max_age_months !== undefined ? product.max_age_months : fromYears(product.max_age_years),
  }
}

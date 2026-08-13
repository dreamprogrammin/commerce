/**
 * Мета-описание категории для выдачи.
 *
 * Собиралось оно тремя обрезками через `substring`, и каждая рубила посреди
 * слова. На проде это было видно глазами: «…оружие и транспорт дл (Hst»,
 * «…широкий выбо (», «…первые друзья и помощники в  (Ho».
 *
 * Две отдельные беды, и вторая заметнее первой:
 *  • обрезка по числу знаков, а не по границе слова;
 *  • список брендов приклеивался к тексту ДО обрезки, поэтому нож приходился
 *    на сам список — от «(Hasbro, LEGO)» оставалось «(Hst».
 *
 * Отсюда порядок: сначала укоротить текст, оставив место под бренды, и только
 * потом дописать их целиком.
 */

import { truncateWords } from './seoTitle'

/** Сколько знаков отдаём вводной части, до цен, рейтинга и доставки. */
export const CATEGORY_LEAD_LIMIT = 80

/** Ниже этого вводная часть превращается в огрызок — тогда бренды опускаем. */
const MIN_LEAD_LENGTH = 24

/** Google показывает около 160 знаков; 162 + многоточие укладываются в 165. */
export const META_DESCRIPTION_LIMIT = 165
const META_DESCRIPTION_CUT = 162

/**
 * Финальная обрезка готового описания. Отличается от прежней только тем,
 * что не рубит слово пополам.
 */
export function clampDescription(text: string | null | undefined): string {
  const clean = (text ?? '').trim()
  if (clean.length <= META_DESCRIPTION_LIMIT)
    return clean

  return `${truncateWords(clean, META_DESCRIPTION_CUT)}...`
}

/**
 * Вводная часть описания категории: текст из `meta_description` плюс список
 * ходовых брендов, если ни один из них в тексте ещё не упомянут.
 *
 * Список брендов либо попадает целиком, либо не попадает вовсе — обрезанный
 * он бесполезен и выглядит как опечатка.
 */
export function composeCategoryLead(
  text: string | null | undefined,
  brands: string[],
  limit: number = CATEGORY_LEAD_LIMIT,
): string {
  const clean = (text ?? '').replace(/<[^>]*>/g, '').trim()
  if (!clean)
    return ''

  const usable = brands.filter(Boolean)
  const alreadyMentioned = usable.some(brand =>
    clean.toLowerCase().includes(brand.toLowerCase()),
  )

  if (!usable.length || alreadyMentioned)
    return truncateWords(clean, limit)

  const suffix = ` (${usable.join(', ')})`
  const room = limit - suffix.length

  // Бренды длиннее самого описания — толку от них тут нет
  if (room < MIN_LEAD_LENGTH)
    return truncateWords(clean, limit)

  // Если описание начинается с короткого предложения, бренды красивее смотрятся
  // сразу после него, а не в самом хвосте.
  const sentenceEnd = clean.search(/[.!?]\s/)
  if (sentenceEnd > 0 && sentenceEnd < 60 && sentenceEnd + 1 <= room) {
    const head = clean.slice(0, sentenceEnd + 1)
    const rest = truncateWords(clean.slice(sentenceEnd + 1), room - head.length)
    return rest ? `${head}${suffix} ${rest}` : head + suffix
  }

  return truncateWords(clean, room) + suffix
}

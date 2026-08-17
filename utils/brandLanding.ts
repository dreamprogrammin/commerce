/**
 * Адреса бренд-лендингов: `/catalog/<категория>/brand/<бренд>`.
 *
 * Раньше бренд передавался параметром — `/catalog/boys?brand=mattel`. Работало,
 * но стоило дорого: кеш страниц категорий (`isr` в `nuxt.config.ts`) включить
 * было нельзя, потому что vercel-пресет подменяет query-строку в маршруте
 * ISR-функции, и бренд-лендинг отдавал всю категорию — 12 карточек вместо
 * одной, с категорийным H1. Проверено дважды, цифры в комментарии к
 * `routeRules`. Без параметра подменять нечего.
 *
 * Сегмент `brand` служебный: категории с таким слагом быть не может, иначе
 * адрес стал бы неоднозначным. Проверка на это есть в `parseCatalogSlug`.
 */

/** Служебный сегмент пути. */
export const BRAND_SEGMENT = 'brand'

export interface CatalogSlugParts {
  /** Сегменты категории без хвоста `brand/<slug>`. */
  categorySegments: string[]
  /** Слаг бренда, если адрес — бренд-лендинг. */
  brandSlug: string | null
}

/**
 * Разбирает сегменты `/catalog/**` на категорию и бренд.
 *
 * Хвост опознаётся только целиком (`…/brand/<slug>`): одинокий `brand` в конце
 * — это обычная категория с таким слагом, а не половина бренд-лендинга.
 */
export function parseCatalogSlug(
  segments: string[] | undefined | null,
): CatalogSlugParts {
  const parts = (segments ?? []).filter(Boolean)
  const at = parts.length - 2

  if (at >= 0 && parts[at] === BRAND_SEGMENT && parts[at + 1]) {
    return {
      categorySegments: parts.slice(0, at),
      brandSlug: parts[at + 1],
    }
  }

  return { categorySegments: parts, brandSlug: null }
}

/**
 * Путь бренд-лендинга. `categoryPath` — адрес категории (`/catalog/boys`),
 * ведущий и хвостовой слеши не важны.
 */
export function buildBrandLandingPath(
  categoryPath: string,
  brandSlug: string,
): string {
  return `${categoryPath.replace(/\/+$/, '')}/${BRAND_SEGMENT}/${brandSlug}`
}

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
 *
 * Если на входе УЖЕ бренд-лендинг, прежний хвост снимается, а не наращивается.
 * Это не теоретическая аккуратность: `CategoryBrands` строит ссылки от
 * `route.path`, и на самом бренд-лендинге получалось
 * `/catalog/boys/brand/mattel/brand/hstar`. На превью такой адрес отдавал
 * 404 — то есть КАЖДЫЙ чип бренда на бренд-лендинге вёл в никуда, и Nuxt
 * ещё и префетчил под эти адреса `_payload.json`, ловя 404 в консоли.
 *
 * Хвост опознаётся только целиком (`…/brand/<slug>`) — то же правило, что в
 * `parseCatalogSlug`: одинокий `brand` в конце это обычная категория с таким
 * слагом, и трогать её нельзя.
 */
export function buildBrandLandingPath(
  categoryPath: string,
  brandSlug: string,
): string {
  const trimmed = categoryPath.replace(/\/+$/, '')
  const segments = trimmed.split('/')
  const at = segments.length - 2

  const base
    = at >= 0 && segments[at] === BRAND_SEGMENT && segments[at + 1]
      ? segments.slice(0, at).join('/')
      : trimmed

  return `${base}/${BRAND_SEGMENT}/${brandSlug}`
}

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

import { MIN_PRODUCTS_FOR_BRAND_LANDING } from '@/constants'

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

/** Категория в виде, достаточном для обхода дерева вверх. */
export interface BrandLandingCategoryNode {
  id: string
  parent_id: string | null
}

/** Товар в виде, достаточном для подсчёта пар. */
export interface BrandLandingProductRef {
  category_id: string | null
  brand_id: string | null
}

/** Ключ пары в таблице подсчёта. */
export function brandLandingPairKey(
  categoryId: string,
  brandId: string,
): string {
  return `${categoryId}|${brandId}`
}

/**
 * Сколько товаров у каждой пары категория+бренд, считая товары во ВСЕХ
 * потомках категории.
 *
 * Рекурсия здесь не украшение, а условие совпадения с тем, что видит
 * посетитель: страница каталога отбирает товары через `get_filtered_products`,
 * а та разворачивает категорию в `get_category_and_children_ids`. Считать
 * прямые совпадения `p.category_id = c.id` — значит получить ноль на
 * родительской категории, у которой все товары разложены по подкатегориям.
 * Ровно на этом спотыкается `get_category_brand_combinations`: пара
 * «машинки + mokatoys» (9 товаров) ей не видна, потому что товары лежат
 * в дочерних «радиоуправляемые машинки».
 *
 * Обход идёт от товара ВВЕРХ по родителям, а не от категории вниз: так дерево
 * проходится один раз на товар, а не один раз на пару. `seen` защищает от
 * зацикливания, если в данных окажется петля parent_id — молчаливый бесконечный
 * цикл в обработчике карты сайта дороже лишнего множества.
 */
export function countProductsByCategoryBrand(
  products: readonly BrandLandingProductRef[],
  categories: readonly BrandLandingCategoryNode[],
): Map<string, number> {
  const parentOf = new Map<string, string | null>()
  for (const category of categories)
    parentOf.set(category.id, category.parent_id ?? null)

  const counts = new Map<string, number>()

  for (const product of products) {
    const brandId = product.brand_id
    if (!brandId || !product.category_id)
      continue

    const seen = new Set<string>()
    let categoryId: string | null | undefined = product.category_id

    while (categoryId && !seen.has(categoryId)) {
      seen.add(categoryId)
      const key = brandLandingPairKey(categoryId, brandId)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      categoryId = parentOf.get(categoryId) ?? null
    }
  }

  return counts
}

/**
 * Годится ли бренд-лендинг для индекса по числу товаров.
 *
 * `null` означает «сосчитать не удалось» (данные ещё грузятся или запрос
 * упал) и трактуется как «годится»: закрывать рабочую страницу из-за сбоя
 * запроса нельзя — тот же принцип fail-open, что у бренд-страницы
 * в pages/brand/[slug].vue.
 */
export function isBrandLandingIndexable(
  productsCount: number | null | undefined,
): boolean {
  if (productsCount === null || productsCount === undefined)
    return true

  return productsCount >= MIN_PRODUCTS_FOR_BRAND_LANDING
}

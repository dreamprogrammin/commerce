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
  /** Имена нужны только decideBrandLanding — узнать раздел, названный брендом. */
  name?: string | null
  seo_h1?: string | null
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

/**
 * Решение по связке «раздел + бренд»: открывать ли её для индекса.
 *
 * Зачем отдельное правило. Фильтр по разделу включает подразделы, поэтому
 * один и тот же набор товаров виден сразу на нескольких адресах: все 9
 * машинок MokaToys — и в «Радиоуправляемых машинках», и в «Машинках», и в
 * «Мальчикам». Открыть все — отдать Google три копии одной страницы. Открыть
 * ни одной (как было до 21 сентября 2026, пока для связки не написан текст в
 * category_brand_seo) — остаться без страниц под запросы вида «машинки moka».
 *
 * Правило:
 *  • корневой раздел — никогда: это аудиторные хабы («Мальчикам»), а не
 *    товарные разделы, и «Мальчикам MokaToys» — не запрос;
 *  • меньше MIN_PRODUCTS_FOR_BRAND_LANDING товаров — закрыта, пустая полка;
 *  • если в каком-то ПОДРАЗДЕЛЕ у бренда ровно столько же товаров — закрыта:
 *    это дубль более точной связки, открыта будет та;
 *  • раздел уже назван брендом («Куклы L.O.L» + L.O.L. Surprise) — закрыта:
 *    страница раздела и есть страница бренда в нём, а связка повторила бы
 *    её с теми же товарами и почти тем же заголовком;
 *  • иначе открыта. Родитель с набором БОЛЬШЕ любого подраздела («Куклы +
 *    L.O.L.»: 4 товара против 3 в «Куклах L.O.L.») — отдельная страница.
 *
 * Страница и карта сайта обязаны звать ОДНУ эту функцию: иначе в карте
 * окажутся закрытые адреса или наоборот. Ссылки на связки со страницы
 * бренда — тоже по ней.
 */
export type BrandLandingVerdict
  = | { indexable: true }
    | { indexable: false, reason: 'root-category' | 'few-products' | 'unknown-category' | 'category-names-brand' }
    | { indexable: false, reason: 'same-as-child', sameAsChildId: string }

/** Слова названия: без точек внутри («L.O.L.» → «lol»), в нижнем регистре. */
function nameWords(name: string | null | undefined): string[] {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.'’·]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * Назван ли раздел брендом: первое слово бренда встречается словом в имени
 * раздела. Короткие первые слова (MG Toys, RC Toys, My Little Home) не
 * сравниваются — «my» и «rc» слишком легко совпасть случайно.
 */
export function categoryNamesBrand(
  categoryNames: readonly (string | null | undefined)[],
  brandName: string | null | undefined,
): boolean {
  const first = nameWords(brandName)[0]
  if (!first || first.length < 3)
    return false
  return categoryNames.some(name => nameWords(name).includes(first))
}

export function decideBrandLanding(
  categoryId: string,
  brandId: string,
  counts: ReadonlyMap<string, number>,
  categories: readonly BrandLandingCategoryNode[],
  brandName?: string | null,
): BrandLandingVerdict {
  const category = categories.find(c => c.id === categoryId)
  if (!category)
    return { indexable: false, reason: 'unknown-category' }
  if (!category.parent_id)
    return { indexable: false, reason: 'root-category' }
  if (categoryNamesBrand([category.name, category.seo_h1], brandName))
    return { indexable: false, reason: 'category-names-brand' }

  const count = counts.get(brandLandingPairKey(categoryId, brandId)) ?? 0
  if (count < MIN_PRODUCTS_FOR_BRAND_LANDING)
    return { indexable: false, reason: 'few-products' }

  for (const child of categories) {
    if (child.parent_id === categoryId && (counts.get(brandLandingPairKey(child.id, brandId)) ?? 0) === count)
      return { indexable: false, reason: 'same-as-child', sameAsChildId: child.id }
  }

  return { indexable: true }
}

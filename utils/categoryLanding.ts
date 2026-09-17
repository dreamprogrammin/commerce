/**
 * Годится ли страница категории для индекса.
 *
 * ЗАЧЕМ. 16 сентября 2026 в карте сайта лежали ВСЕ 64 категории, включая 13, у
 * которых нет ни одного активного товара во всей ветке. Google их исправно
 * обходил и показывал: за 90 дней 347 показов и ноль кликов. Часть при этом
 * стояла высоко — бизидоски на 6-м месте, мягкие игрушки на 4,8, металлические
 * машинки на 6-м. Человек приходит по такому запросу и видит пустую полку.
 *
 * Правило ровно то же, что у бренд-лендингов (`isBrandLandingIndexable`), и по
 * той же причине: страница без товара не должна ни висеть в индексе, ни
 * предлагаться картой сайта. Появится товар — вернётся сама, без правок в коде.
 *
 * ТОВАР СЧИТАЕТСЯ ПО ВСЕЙ ВЕТКЕ, а не по самой категории. Иначе под нож пошли
 * бы родительские разделы: у «Кукол» ноль собственных товаров, но 19 в
 * подкатегориях, и по числу показов это лучшая страница каталога.
 */

import { CATEGORIES_KEPT_INDEXABLE_WITHOUT_PRODUCTS } from '@/constants'

export interface CategoryProductRef {
  category_id?: string | null
}

export interface CategoryTreeNode {
  id: string
  parent_id?: string | null
}

/**
 * Сколько активных товаров в ветке каждой категории.
 *
 * Товар засчитывается своей категории и всем её родителям — так же, как их
 * отбирает `get_filtered_products`. Иначе страница раздела считалась бы
 * пустой при полных подразделах.
 */
export function countProductsByCategory(
  products: readonly CategoryProductRef[],
  categories: readonly CategoryTreeNode[],
): Map<string, number> {
  const parentOf = new Map<string, string | null>()
  for (const category of categories)
    parentOf.set(category.id, category.parent_id ?? null)

  const counts = new Map<string, number>()

  for (const product of products) {
    // `seen` — страховка от петли в дереве: одна кривая строка в базе иначе
    // повесила бы сборку карты сайта намертво.
    const seen = new Set<string>()
    let categoryId: string | null | undefined = product.category_id

    while (categoryId && !seen.has(categoryId)) {
      seen.add(categoryId)
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
      categoryId = parentOf.get(categoryId) ?? null
    }
  }

  return counts
}

/**
 * Пускать ли категорию в индекс и в карту сайта.
 *
 * `slug` нужен ради списка исключений: владелец может держать страницу
 * открытой под товар, который вот-вот появится.
 */
export function isCategoryIndexable(
  slug: string | null | undefined,
  productsInBranch: number | null | undefined,
): boolean {
  if (slug && (CATEGORIES_KEPT_INDEXABLE_WITHOUT_PRODUCTS as readonly string[]).includes(slug))
    return true

  return (productsInBranch ?? 0) > 0
}

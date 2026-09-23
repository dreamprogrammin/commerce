/**
 * Факты раздела для мета-описания — по ВСЕМ активным товарам ветки.
 *
 * Зачем (23 сентября 2026). Описание раздела в выдаче собиралось из двух
 * источников, и оба врали:
 *
 * - «Бренды: …» сортировались по `products_count`, а RPC
 *   `get_brands_by_category_slug` такого поля не отдаёт. Сортировка ничего
 *   не делала, и в описание шли первые три бренда ПО АЛФАВИТУ: у хаба
 *   «Конструкторы» — «CaDA · Feelo · Gudi», хотя LEGO там 14 наборов из 33,
 *   а у CaDA, Feelo и Gudi по два;
 * - цена «от …» бралась с первой страницы выдачи: у того же хаба «от
 *   6 190 ₸», а самый дешёвый набор раздела стоит 5 890 ₸.
 *
 * Число моделей и так считалось по всей ветке отдельным запросом — теперь
 * тот же запрос берёт бренд и цену каждого товара, и все три факта выходят
 * из одного ответа.
 */

export interface CategoryFactRow {
  brand_id: string | null
  price: number | string | null
  final_price: number | string | null
}

export interface CategoryFacts {
  /** Активных товаров в разделе вместе с подразделами. */
  count: number
  /** Самая низкая цена со скидкой; `null`, если цен нет. */
  minPrice: number | null
  /** Сколько товаров у каждого бренда: id бренда → число. */
  brandCounts: Record<string, number>
}

export function categoryFactsFromRows(rows: CategoryFactRow[]): CategoryFacts {
  const brandCounts: Record<string, number> = {}
  let minPrice: number | null = null
  for (const row of rows) {
    // Как в выдаче: цена со скидкой, а если её нет — обычная.
    const price = Number(row.final_price || row.price)
    if (price > 0 && (minPrice === null || price < minPrice))
      minPrice = price
    if (row.brand_id)
      brandCounts[row.brand_id] = (brandCounts[row.brand_id] ?? 0) + 1
  }
  return { count: rows.length, minPrice, brandCounts }
}

/**
 * Бренды с наибольшим числом товаров в разделе; при равенстве — по алфавиту.
 * Бренд без активных товаров в разделе не попадает вовсе: RPC брендов
 * смотрит и на снятые с продажи товары.
 */
export function topBrandNames(
  brands: { id: string, name: string }[],
  brandCounts: Record<string, number>,
  limit = 3,
): string[] {
  return brands
    .filter(b => (brandCounts[b.id] ?? 0) > 0)
    .sort((a, b) => (brandCounts[b.id]! - brandCounts[a.id]!) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map(b => b.name)
}

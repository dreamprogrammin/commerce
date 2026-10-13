/**
 * Выборка товаров для сетки плиток на страницах-подборках (`/catalog/promotions`,
 * `/catalog/new`).
 *
 * Было `select('*')` и все картинки с размытыми превью. На акциях это 703 КБ
 * `_payload.json` (замер 13 октября 2026): 277 data:URI на 438 КБ — превью
 * КАЖДОГО кадра галереи у всех 50 товаров — плюс все столбцы товара с
 * описаниями. Payload и HTML этой страницы пишутся в кеш ISR при каждой
 * пересборке, и Vercel считает записи по 8 КБ.
 *
 * Здесь — только то, что рисует `ProductCard`. Корзине этого хватает: при
 * добавлении она сама забирает товар целиком по id (`cartStore.addItem`).
 * Адреса картинок нужны все (плитка листает галерею), превью — только у
 * первого кадра (`cover`), и только у первых карточек — правило то же, что у
 * каталога (`BLUR_PRODUCTS_LIMIT` в productsStore, `EAGER_CARDS` в
 * ProductCard).
 */
export const PRODUCT_TILE_SELECT
  = 'id, name, slug, price, final_price, discount_percentage, stock_quantity, bonus_points_award, is_new, avg_rating, review_count, brand_id, category_id, product_images(id, image_url, display_order), cover:product_images(blur_placeholder)'

/** Сколько первых карточек получают превью — совпадает с `EAGER_CARDS`. */
export const TILE_BLUR_LIMIT = 4

interface TileRow {
  product_images?: { display_order?: number | null }[] | null
  cover?: { blur_placeholder: string | null }[] | null
}

/**
 * Превью первого кадра — первым `TILE_BLUR_LIMIT` товарам, остальным null.
 * Запрос должен сортировать `product_images` и `cover` по `display_order` и
 * ограничить `cover` одной строкой.
 */
export function toProductTiles<T extends TileRow>(rows: T[]) {
  return rows.map(({ cover, product_images, ...product }, position) => ({
    ...product,
    product_images: (product_images ?? []).map((image, index) => ({
      ...image,
      blur_placeholder: index === 0 && position < TILE_BLUR_LIMIT
        ? (cover?.[0]?.blur_placeholder ?? null)
        : null,
    })),
  }))
}

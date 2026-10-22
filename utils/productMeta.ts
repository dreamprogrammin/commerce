/**
 * Заголовок и описание карточки товара для выдачи — целиком, со всеми
 * запасными вариантами. Ими пользуются и страница товара, и предпросмотр в
 * админке (`components/admin/products/ProductForm.vue`).
 *
 * Зачем отдельно. До 22 октября 2026 предпросмотр в админке писал свою
 * версию: «<название> - Купить в интернет-магазине | Ухтышка», а страница
 * отдавала обрезанное по слову название (`buildProductTitle`) — так у 182
 * товаров из 186, у которых заголовок не задан руками. Без SEO-описания
 * предпросмотр показывал сырое «Описание», а страница собирает строку из
 * фактов (`composeProductMeta`). Та же беда была у брендов —
 * `utils/brandMeta.ts`.
 */

import { composeProductMeta } from './seoDescription'
import { buildProductTitle } from './seoTitle'

/** «для девочек» / «для мальчиков» по полю `gender`; унисекс и пусто — null. */
export function productGenderText(gender: string | null | undefined): string | null {
  switch (gender) {
    case 'female':
      return 'для девочек'
    case 'male':
      return 'для мальчиков'
    default:
      return null
  }
}

/**
 * Заголовок: написанный руками `meta_title`, потом старое `seo_title`, иначе
 * обрезанное по слову название — см. `buildProductTitle` в utils/seoTitle.ts.
 */
export function composeProductTitle(input: {
  name: string | null | undefined
  metaTitle?: string | null
  seoTitle?: string | null
}): string {
  if (input.metaTitle)
    return input.metaTitle
  if (input.seoTitle)
    return input.seoTitle
  return buildProductTitle(input.name)
}

/**
 * Описание: написанное руками `meta_description`, потом SEO-описание из
 * админки (`seo_description` — заполнено у 184 товаров из 186 на 22.10.2026),
 * иначе собранное из фактов — `composeProductMeta`.
 */
export function composeProductDescription(input: {
  name: string
  metaDescription?: string | null
  seoDescription?: string | null
  /** «для девочек» / «для мальчиков» — `productGenderText`. */
  gender?: string | null
  /** «от 3 лет» — `formatAgeRange(productAgeMonths(…))`. */
  age?: string | null
  inStock: boolean
  rating?: number | null
  reviewsCount?: number | null
  price?: number | null
}): string {
  if (input.metaDescription)
    return input.metaDescription
  if (input.seoDescription)
    return input.seoDescription
  return composeProductMeta({
    name: input.name,
    gender: input.gender,
    age: input.age,
    inStock: input.inStock,
    rating: input.rating,
    reviewsCount: input.reviewsCount,
    price: input.price,
  })
}

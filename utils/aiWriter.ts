/**
 * «Тексты для сайта» (23 ноября 2026) — что отвечает сервер
 * (server/utils/contentWriter.ts) форме нового товара
 * (pages/admin/products/new.vue) после «На сайт» в «Товарах поставщиков».
 */

export interface WriterCategory {
  id: string
  /** «Мальчикам › Машинки › Радиоуправляемые машинки» */
  path: string
}

export interface WrittenProduct {
  name: string
  /** HTML по формату сайта — разметка уже проверена на сервере */
  description: string
  seoDescription: string
  category: WriterCategory | null
  brand: { id: string, name: string } | null
  /** Бренд с товара, которого на сайте нет, — его ищет «бренд в интернете» */
  newBrand: string | null
  /** Что поправить руками: длины, вырезанная разметка, вода */
  warnings: string[]
}

export interface WrittenOfferProduct extends WrittenProduct {
  /** «anthropic/claude-sonnet-5-5» */
  model: string
  /** Фото поста ушло модели */
  photo: boolean
}

/** Страница бренда — поля как в таблице brands */
export interface BrandPage {
  name: string
  slug: string
  meta_title: string
  seo_h1: string
  seo_description: string
  seo_keywords: string[]
  description: string
}

export type BrandResearch
  = | { found: false, name: string, reason: string, searches: number, model: string }
    | {
      found: true
      /** Бренд нашёлся на сайте под другим написанием — его и выбрать */
      existing: { id: string, name: string } | null
      page: BrandPage | null
      /** Что нашёл поиск — человеку для проверки */
      facts: string
      sources: { url: string, title: string }[]
      warnings: string[]
      searches: number
      model: string
    }

/** Что подставить в форму товара: поле получает значение, пока его не трогали */
export interface AiProductFill {
  name: string
  description: string
  seoDescription: string
  categoryId: string | null
  brandId: string | null
}

import type { AiRequestUsage, WriterBudget } from './aiCost'

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
  /** Бренд с товара, которого на сайте нет: ИИ его не ищет — человек создаёт его в окне формы (24.11.2026) */
  newBrand: string | null
  /** Что поправить руками: длины, вырезанная разметка, вода */
  warnings: string[]
}

export interface WrittenOfferProduct extends WrittenProduct {
  /** «anthropic/claude-sonnet-5-5» */
  model: string
  /** Фото поста ушло модели */
  photo: boolean
  /** Токены и курс — строка «Расход» в карточке (24.11.2026); нет — ответ сервера старой сборки */
  usage?: AiRequestUsage
  /** Бюджет ИИ после этого ответа (24.11.2026); null — журнала нет или база не ответила */
  budget?: WriterBudget | null
}

/** Что подставить в форму товара: поле получает значение, пока его не трогали */
export interface AiProductFill {
  name: string
  description: string
  seoDescription: string
  categoryId: string | null
  brandId: string | null
}

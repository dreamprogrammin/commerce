import type { AiRequestUsage, WriterBudget } from './aiCost'
import type { DemandPhrase } from './writerDemand'

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
  /**
   * Когда ответ сохранён у товара поставщика (26.11.2026) — после перезагрузки
   * форма возьмёт его, а не попросит ИИ снова. null — не сохранился (до
   * миграции 20261126120000 колонки нет); нет поля — сервер старой сборки.
   */
  savedAt?: string | null
  /**
   * Запросы покупателей, которые ушли модели вместе с товаром (27.11.2026):
   * фраза и поисков в месяц. Пусто — спроса по товару нет, текст написан без
   * него; нет поля — ответ сервера старой сборки.
   */
  demand?: DemandPhrase[]
}

/**
 * Ответ ИИ, сохранённый у товара поставщика (`supplier_offers.written_texts`,
 * 26.11.2026). Остатка бюджета в нём нет: он устаревает.
 */
export type SavedOfferProduct = Omit<WrittenOfferProduct, 'budget' | 'savedAt'> & {
  /** Когда ИИ написал — ISO */
  writtenAt: string
}

/** Что сохранить из ответа: всё, кроме остатка бюджета */
export function toSavedOfferProduct(result: WrittenOfferProduct, writtenAt: string): SavedOfferProduct {
  return {
    name: result.name,
    description: result.description,
    seoDescription: result.seoDescription,
    category: result.category,
    brand: result.brand,
    newBrand: result.newBrand,
    warnings: result.warnings,
    model: result.model,
    photo: result.photo,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.demand ? { demand: result.demand } : {}),
    writtenAt,
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * Сохранённые тексты из базы по номерам товаров поста. Берутся только целые
 * ответы: запись не той формы молча пропускается — форма тогда предложит
 * «Сгенерировать», а не подставит обрывок.
 */
export function savedOfferTexts(raw: unknown): Record<string, SavedOfferProduct> {
  const texts: Record<string, SavedOfferProduct> = {}
  if (!isObject(raw))
    return texts
  for (const [key, v] of Object.entries(raw)) {
    if (!/^\d{1,3}$/.test(key) || !isObject(v))
      continue
    const { name, description, seoDescription, model, writtenAt, category, brand, usage } = v
    const whole = typeof name === 'string' && typeof description === 'string' && typeof seoDescription === 'string'
      && typeof model === 'string' && typeof writtenAt === 'string' && !Number.isNaN(Date.parse(writtenAt))
    if (!whole)
      continue
    texts[key] = {
      name,
      description,
      seoDescription,
      category: isObject(category) && typeof category.id === 'string' && typeof category.path === 'string'
        ? { id: category.id, path: category.path }
        : null,
      brand: isObject(brand) && typeof brand.id === 'string' && typeof brand.name === 'string'
        ? { id: brand.id, name: brand.name }
        : null,
      newBrand: typeof v.newBrand === 'string' && v.newBrand ? v.newBrand : null,
      warnings: Array.isArray(v.warnings) ? v.warnings.filter((w): w is string => typeof w === 'string') : [],
      model,
      photo: v.photo === true,
      ...(savedUsage(usage) ? { usage: savedUsage(usage)! } : {}),
      ...(Array.isArray(v.demand) ? { demand: savedDemand(v.demand) } : {}),
      writtenAt,
    }
  }
  return texts
}

function savedDemand(raw: unknown[]): DemandPhrase[] {
  return raw.filter((p): p is DemandPhrase => isObject(p) && typeof p.phrase === 'string' && typeof p.volume === 'number' && Number.isFinite(p.volume))
    .map(p => ({ phrase: p.phrase, volume: p.volume }))
}

const count = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null

/** Расход сохранённого ответа — для строки «Расход»; без входа и выхода строки нет */
function savedUsage(raw: unknown): AiRequestUsage | null {
  if (!isObject(raw))
    return null
  const input = count(raw.input)
  const output = count(raw.output)
  if (input === null || output === null)
    return null
  const rate = raw.rate
  return {
    input,
    cacheWrite: count(raw.cacheWrite) ?? 0,
    cacheRead: count(raw.cacheRead) ?? 0,
    output,
    rate: isObject(rate) && count(rate.kzt) && typeof rate.date === 'string'
      ? { kzt: rate.kzt as number, date: rate.date, ...(rate.stale === true ? { stale: true } : {}) }
      : null,
  }
}

/** Что подставить в форму товара: поле получает значение, пока его не трогали */
export interface AiProductFill {
  name: string
  description: string
  seoDescription: string
  categoryId: string | null
  brandId: string | null
}

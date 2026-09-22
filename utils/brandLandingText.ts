/**
 * Тексты связки «раздел + бренд»: заголовок, описание для выдачи и
 * уникальный текст страницы — из фактов самой связки.
 *
 * Зачем. До 21 сентября 2026 связка открывалась для индекса, только если
 * для неё руками написан текст в category_brand_seo (таких 14 на 63 пары с
 * товарами). Остальные закрывались noindex, а в описание для выдачи молча
 * подставлялось описание ВСЕГО раздела: у «Радиоуправляемых машинок
 * MokaToys» стояло «24 модели» — это весь раздел, у MokaToys их 9. Плюс
 * название раздела шло в дательном падеже: «Конструкторы Мальчикам LEGO».
 *
 * Здесь всё собирается из самих товаров связки, поэтому уникально по
 * построению: другое число, другие цены, другие модели.
 * Написанный руками текст, если он есть, по-прежнему главнее — страница
 * берёт его первым.
 */

import { categoryNamesBrand } from './brandLanding'
import { formatPrice } from './formatPrice'
import { clampDescription, DELIVERY_SHORT, pluralRu } from './seoDescription'
import { truncateWords } from './seoTitle'

export interface BrandLandingProduct {
  name: string
  slug: string
  price: number
  final_price: number | null
  stock_quantity: number | null
  min_age_years: number | null
  max_age_years: number | null
}

export interface BrandLandingFacts {
  count: number
  inStock: number
  /** Текущие цены — со скидкой, как на странице. */
  min: number | null
  max: number | null
  minAge: number | null
  maxAge: number | null
}

/**
 * «Конструкторы для мальчиков» + «LEGO» → «Конструкторы LEGO для мальчиков».
 * Бренд встаёт перед «для …»: «Конструкторы для мальчиков LEGO» читается
 * как опечатка. Без «для» — в конец. Если бренд уже в названии раздела
 * («Куклы L.O.L для девочек»), второй раз его не ставим.
 */
export function brandCategoryPhrase(category: string, brand: string): string {
  const c = (category ?? '').trim()
  const b = (brand ?? '').trim()
  if (!c)
    return b
  if (!b || c.toLowerCase() === b.toLowerCase() || categoryNamesBrand([c], b))
    return c
  const at = c.indexOf(' для ')
  return at > 0 ? `${c.slice(0, at)} ${b}${c.slice(at)}` : `${c} ${b}`
}

/** Текущая цена товара — со скидкой, как на карточке; 0, если цены нет. */
function currentPrice(p: BrandLandingProduct): number {
  const n = Math.round(Number(p.final_price || p.price))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/*
 * Возраст — только если он указан у ВСЕХ товаров связки. У большинства
 * товаров верхней границы нет (3+, 6+): взяв «до 12» у двух товаров из
 * девяти, текст пообещал бы «от 3 до 12 лет» и про те, у которых её нет.
 */
function ageBound(values: readonly (number | null | undefined)[], pick: (...n: number[]) => number): number | null {
  const known = values.filter((n): n is number => n !== null && n !== undefined)
  return known.length && known.length === values.length ? pick(...known) : null
}

export function brandLandingFacts(products: readonly BrandLandingProduct[]): BrandLandingFacts {
  const prices = products.map(currentPrice).filter(n => n > 0)
  return {
    count: products.length,
    inStock: products.filter(p => (p.stock_quantity ?? 0) > 0).length,
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    minAge: ageBound(products.map(p => p.min_age_years), Math.min),
    maxAge: ageBound(products.map(p => p.max_age_years), Math.max),
  }
}

/** «от 7 490 до 15 990 ₸», «за 7 990 ₸» при одной цене, '' без цен. */
function priceRange(f: BrandLandingFacts): string {
  if (f.min === null || f.max === null)
    return ''
  return f.min === f.max
    ? `за ${formatPrice(f.min)} ₸`
    : `от ${formatPrice(f.min)} до ${formatPrice(f.max)} ₸`
}

const models = (n: number) => `${n} ${pluralRu(n, 'модель', 'модели', 'моделей')}`

/** «9 моделей от 7 490 до 18 890 ₸» — число и цены одной фразой. */
export function modelsAndPrices(f: BrandLandingFacts): string {
  const range = priceRange(f)
  return `${models(f.count)}${range ? ` ${range}` : ''}`
}

/** Строка под заголовком страницы: «9 моделей · от 7 490 до 18 890 ₸». */
export function composeBrandLandingSummary(f: BrandLandingFacts): string {
  if (!f.count)
    return ''
  const range = priceRange(f)
  return `${models(f.count)}${range ? ` · ${range}` : ''}`
}

/** Описание для выдачи: число моделей бренда и цены «от … до …». */
export function composeBrandLandingMeta(phrase: string, f: BrandLandingFacts): string {
  return clampDescription(`${phrase} в Алматы: ${modelsAndPrices(f)}. ${DELIVERY_SHORT}.`)
}

/**
 * Написанное руками описание связки — с фактами впереди: «4 модели от
 * 10 290 до 12 690 ₸. <текст владельца>».
 *
 * Тексты владельца писались без цен, а цены «от … до …» в выдаче — то, ради
 * чего связку открывают. Впереди, потому что мобильная выдача режет описание
 * около 120 знаков, и до конца строки дело не доходит. Хвост текста
 * владельца при этом может срезаться — по границе слова, clampDescription.
 */
export function prependBrandLandingFacts(stored: string, f: BrandLandingFacts): string {
  const text = (stored ?? '').trim()
  if (!f.count)
    return text
  return clampDescription(`${modelsAndPrices(f)}. ${text}`)
}

const TITLE_SUFFIX = ' | Ухтышка'
const TITLE_LIMIT = 60

/** Заголовок: название связки и цена «от», если влезает в 60 знаков. */
export function composeBrandLandingTitle(phrase: string, f: BrandLandingFacts): string {
  const withPrice = f.min !== null ? `${phrase} — от ${formatPrice(f.min)} ₸${TITLE_SUFFIX}` : ''
  if (withPrice && withPrice.length <= TITLE_LIMIT)
    return withPrice
  const plain = `${phrase}${TITLE_SUFFIX}`
  if (plain.length <= TITLE_LIMIT)
    return plain
  return `${truncateWords(phrase, TITLE_LIMIT - TITLE_SUFFIX.length)}${TITLE_SUFFIX}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Короткое имя модели: до « — », где у нас начинается перечень свойств. */
function shortName(name: string): string {
  return (name ?? '').split(' — ')[0].trim()
}

const MAX_LISTED = 12

/**
 * Уникальный текст связки. Только факты — ничего, что магазин не обещает:
 * сроки доставки с /terms, без эмодзи и без «за 1 день».
 *
 * Модели — списком «название — цена», а не ссылками: текст раздела рисуется
 * через parseHTMLToBlocks, который из абзаца выкидывает все внутренние теги,
 * так что ссылки всё равно не дожили бы до страницы. Сетка товаров над
 * текстом и так ведёт на каждую карточку. Иконки — существующие имена
 * fluent-emoji-flat, как в остальных текстах сайта (см. utils/iconNames.ts).
 */
export function composeBrandLandingText(input: {
  phrase: string
  brandName: string
  products: readonly BrandLandingProduct[]
}): string {
  const f = brandLandingFacts(input.products)
  const range = priceRange(f)
  // «Для детей от 18 лет» — нелепость; с подросткового возраста просто «от N лет».
  const forWhom = f.minAge !== null && f.minAge >= 14 ? '' : ' для детей'
  const age = f.minAge !== null && f.maxAge !== null && f.maxAge > f.minAge
    ? `,${forWhom} от ${f.minAge} до ${f.maxAge} ${pluralRu(f.maxAge, 'года', 'лет', 'лет')}`
    : f.minAge !== null ? `,${forWhom} от ${f.minAge} ${pluralRu(f.minAge, 'года', 'лет', 'лет')}` : ''
  const stock = f.inStock === f.count
    ? 'Все модели в наличии.'
    : f.inStock > 0 ? `Сейчас в наличии ${f.inStock} из ${f.count}.` : 'Сейчас моделей нет в наличии.'

  /*
   * Порядок — по цене, от дешёвых: выборка приходит из базы без порядка, и
   * без сортировки текст менялся бы от запроса к запросу при тех же товарах.
   */
  const sorted = [...input.products].sort((a, b) =>
    currentPrice(a) - currentPrice(b) || (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
  const listed = sorted.slice(0, MAX_LISTED).map((p) => {
    const price = currentPrice(p)
    const priceText = price > 0 ? ` — ${formatPrice(price)} ₸` : ''
    return `<li data-icon="fluent-emoji-flat:check-mark-button">${escapeHtml(shortName(p.name))}${priceText}</li>`
  })
  const more = sorted.length - listed.length

  return [
    `<h2 data-icon="fluent-emoji-flat:shopping-bags">${escapeHtml(input.phrase)} в Ухтышке</h2>`,
    `<p>${models(f.count)} ${escapeHtml(input.brandName)}${range ? ` ${range}` : ''}${age}. ${stock} `
    + 'Доставка по Алматы — 1–3 рабочих дня, по Казахстану — 3–7 дней, можно забрать самовывозом.</p>',
    listed.length ? `<ul>${listed.join('')}</ul>` : '',
    more > 0 ? `<p>И ещё ${models(more)} — среди товаров выше.</p>` : '',
  ].filter(Boolean).join('\n')
}

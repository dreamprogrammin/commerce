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

import { formatPrice, formatTenge } from './formatPrice'
import { ageGenitive, formatAgeRange } from './productAge'
import { pluralRu } from './seoDescription'

export interface CategoryFactRow {
  brand_id: string | null
  price: number | string | null
  final_price: number | string | null
  /** Остаток. Нет поля или `null` — не в наличии, как на карточке. */
  stock_quantity?: number | null
  /** Нижняя граница возраста в месяцах; `null` — не указана. */
  min_age_months?: number | null
  /** Бренд тем же запросом (`brands(name)`) — для «LEGO (14)» в абзаце. */
  brands?: { name: string } | null
}

export interface CategoryFacts {
  /** Активных товаров в разделе вместе с подразделами. */
  count: number
  /** Из них в наличии — с остатком больше нуля. */
  inStock: number
  /** Самая низкая цена со скидкой; `null`, если цен нет. */
  minPrice: number | null
  /** Самая высокая цена со скидкой; `null`, если цен нет. */
  maxPrice: number | null
  /** Цены со скидкой по возрастанию — для «N из них дешевле …». */
  prices: number[]
  /** Сколько товаров у каждого бренда: id бренда → число. */
  brandCounts: Record<string, number>
  /**
   * Имена брендов раздела: id → имя. Свои, а не из списка брендов страницы:
   * тот один на все страницы каталога (`useState('catalog-brands')`), и у
   * удержанной страницы в нём оказываются бренды соседнего раздела.
   */
  brandNames: Record<string, string>
  /**
   * Нижняя граница возраста → сколько товаров, по возрастанию возраста:
   * `[[36, 17], [72, 1]]` — 17 товаров с трёх лет и один с шести. Товары без
   * возраста сюда не входят.
   */
  ageGroups: [months: number, count: number][]
}

export function categoryFactsFromRows(rows: CategoryFactRow[]): CategoryFacts {
  const brandCounts: Record<string, number> = {}
  const brandNames: Record<string, string> = {}
  const ages = new Map<number, number>()
  const prices: number[] = []
  let inStock = 0
  for (const row of rows) {
    // Как в выдаче: цена со скидкой, а если её нет — обычная.
    const price = Number(row.final_price || row.price)
    if (price > 0)
      prices.push(price)
    if (row.brand_id)
      brandCounts[row.brand_id] = (brandCounts[row.brand_id] ?? 0) + 1
    if (row.brand_id && row.brands?.name)
      brandNames[row.brand_id] = row.brands.name
    if ((row.stock_quantity ?? 0) > 0)
      inStock++
    if (row.min_age_months !== null && row.min_age_months !== undefined)
      ages.set(row.min_age_months, (ages.get(row.min_age_months) ?? 0) + 1)
  }
  prices.sort((a, b) => a - b)
  return {
    count: rows.length,
    inStock,
    minPrice: prices[0] ?? null,
    maxPrice: prices.at(-1) ?? null,
    prices,
    brandCounts,
    brandNames,
    ageGroups: [...ages.entries()].sort((a, b) => a[0] - b[0]),
  }
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
  return topBrandCounts(brands, brandCounts, limit).map(b => b.name)
}

/** Ведущие бренды раздела по его же фактам: `[{ name: 'LEGO', count: 14 }, …]`. */
export function factsTopBrands(f: CategoryFacts, limit = 3): { name: string, count: number }[] {
  return topBrandCounts(Object.entries(f.brandNames).map(([id, name]) => ({ id, name })), f.brandCounts, limit)
}

/** То же, что `topBrandNames`, но с числом товаров: `[{ name: 'LEGO', count: 14 }, …]`. */
export function topBrandCounts(
  brands: { id: string, name: string }[],
  brandCounts: Record<string, number>,
  limit = 3,
): { name: string, count: number }[] {
  return brands
    .filter(b => (brandCounts[b.id] ?? 0) > 0)
    .sort((a, b) => (brandCounts[b.id]! - brandCounts[a.id]!) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map(b => ({ name: b.name, count: brandCounts[b.id]! }))
}

/*
 * Факты словами — для абзаца с цифрами и вопросов раздела (план аудита,
 * 24 сентября 2026, п. 17: «на „Радиоуправляемых машинках“ нет цифр для
 * цитаты» — число моделей и цены стояли только в описании для выдачи, а в
 * тексте было «цена — в карточке каждой модели»).
 *
 * Руками такие числа в текст не пишутся: они устаревают с каждой поставкой и
 * уценкой. Здесь они собираются из фактов при каждой сборке страницы.
 */

export type NounForms = readonly [one: string, few: string, many: string]
const MODELS: NounForms = ['модель', 'модели', 'моделей']

/** «18 моделей», «1 модель». */
export function countPhrase(n: number, forms: NounForms = MODELS): string {
  return `${n} ${pluralRu(n, forms[0], forms[1], forms[2])}`
}

/** «от 4 090 до 18 890 ₸», «за 7 990 ₸» при одной цене, '' без цен. */
export function priceRangePhrase(f: CategoryFacts): string {
  if (f.minPrice === null || f.maxPrice === null)
    return ''
  return f.minPrice === f.maxPrice
    ? `за ${formatTenge(f.minPrice)}`
    : `от ${formatPrice(f.minPrice)} до ${formatTenge(f.maxPrice)}`
}

/** «все в наличии», «в наличии 16 из 18», «сейчас нет в наличии». */
export function stockPhrase(f: CategoryFacts): string {
  if (f.inStock === f.count)
    return f.count === 1 ? 'в наличии' : 'все в наличии'
  return f.inStock > 0 ? `в наличии ${f.inStock} из ${f.count}` : 'сейчас нет в наличии'
}

/** Сколько товаров дешевле `limit` тенге. */
export function countCheaperThan(f: CategoryFacts, limit: number): number {
  return f.prices.filter(p => p < limit).length
}

/** «с 3 лет», «с 1 года», «с 6 месяцев», «с рождения». */
export function sinceAge(months: number): string {
  return months === 0 ? 'с рождения' : `с ${ageGenitive(months)}`
}

/** Возраст указан у каждого товара раздела. */
export function allAgesKnown(f: CategoryFacts): boolean {
  return f.ageGroups.reduce((sum, [, n]) => sum + n, 0) === f.count
}

const MAX_AGE_GROUPS = 3

/**
 * Возраст по группам: `[['с 3 лет', 17], ['с 6 лет', 1]]`. Групп больше
 * трёх — хвост сливается в одну, «с 8 лет и старше»: перечень из шести
 * возрастов цитатой уже не служит. Пусто, если возраст не указан ни у кого.
 */
export function ageBreakdown(f: CategoryFacts): [since: string, count: number][] {
  const out = f.ageGroups
    .slice(0, MAX_AGE_GROUPS - 1)
    .map(([months, n]): [string, number] => [sinceAge(months), n])
  const tail = f.ageGroups.slice(MAX_AGE_GROUPS - 1)
  if (tail.length === 1)
    out.push([sinceAge(tail[0]![0]), tail[0]![1]])
  else if (tail.length > 1)
    out.push([`${sinceAge(tail[0]![0])} и старше`, tail.reduce((sum, [, n]) => sum + n, 0)])
  return out
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «LEGO (14), Smoneo (8) и Sluban (4)». */
function brandList(brands: readonly { name: string, count: number }[]): string {
  const items = brands.map(b => `${b.name} (${b.count})`)
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0] ?? ''
}

/**
 * Возраст одной фразой.
 *
 * До трёх разных возрастов — перечнем: «С 3 лет — 17 из них, с 6 лет — 1».
 * Больше — разброс и самый частый: у хаба «Конструкторы» восемь возрастов от
 * 3 до 12 лет, и перечень из восьми пар цитатой не служит.
 */
function ageSentence(f: CategoryFacts): string {
  const groups = f.ageGroups
  if (!groups.length)
    return ''
  if (groups.length === 1 && allAgesKnown(f))
    return `${f.count === 1 ? 'Для детей' : 'Все — для детей'} ${sinceAge(groups[0]![0])}.`
  if (groups.length <= MAX_AGE_GROUPS) {
    const [first, ...rest] = ageBreakdown(f)
    return `${[`${capitalize(first![0])} — ${first![1]} из них`, ...rest.map(([s, k]) => `${s} — ${k}`)].join(', ')}.`
  }
  // Самый частый; при равенстве — младший: группы идут по возрастанию
  const [mode, n] = groups.reduce((best, g) => g[1] > best[1] ? g : best)
  return `Возраст — ${formatAgeRange(groups[0]![0], groups.at(-1)![0])}, чаще всего ${sinceAge(mode)}: ${n} из ${f.count}.`
}

export interface FactsParagraphOptions {
  /** Как называть товар: «модель» — по умолчанию, у конструкторов — «конструктор». */
  forms?: NounForms
  /**
   * Бренды с числом товаров, по убыванию (`factsTopBrands`). Нужны там, где
   * бренд — часть запроса: «LEGO (14)» на конструкторах отвечает на «лего
   * алматы». У машинок не передаются: текст раздела и так называет MokaToys.
   */
  brands?: readonly { name: string, count: number }[]
}

/**
 * Абзац с цифрами раздела: «Сейчас в разделе 18 моделей от 4 090 до
 * 18 890 ₸, все в наличии. С 3 лет — 17 из них, с 6 лет — 1.»
 * `null`, если товаров нет: пустой раздел хвалить нечем.
 */
export function composeCategoryFactsParagraph(f: CategoryFacts, options: FactsParagraphOptions = {}): string | null {
  if (!f.count)
    return null
  const range = priceRangePhrase(f)
  const head = `Сейчас в разделе ${countPhrase(f.count, options.forms)}${range ? ` ${range}` : ''}, ${stockPhrase(f)}.`
  const brands = options.brands?.length
    ? options.brands.length === 1 && options.brands[0]!.count === f.count
      ? `Все — ${options.brands[0]!.name}.`
      : `Больше всего — ${brandList(options.brands)}.`
    : ''
  return [head, brands, ageSentence(f)].filter(Boolean).join(' ')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Абзац с цифрами — в готовый HTML раздела, сразу за первым абзацем: там
 * раздел описывает ассортимент словами, и число с ценами его продолжает.
 * Абзацев нет — в начало.
 */
export function insertAfterFirstParagraph(html: string, paragraph: string): string {
  const p = `<p>${escapeHtml(paragraph)}</p>`
  const at = html.indexOf('</p>')
  return at < 0 ? `${p}\n${html}` : `${html.slice(0, at + 4)}\n${p}${html.slice(at + 4)}`
}

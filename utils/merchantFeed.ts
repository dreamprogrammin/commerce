/**
 * Товар для фида Google Merchant Center — по правилам спецификации.
 *
 * Разобрано 22 сентября 2026 по боевым данным (178 товаров) и по
 * спецификации (support.google.com/merchants/answer/7052112):
 *  • title — простой текст до 150 знаков. У 8 товаров название начиналось с
 *    пробела;
 *  • description — простой текст до 5000 знаков. Отдавался сырой HTML с
 *    `data-icon` — у всех 178;
 *  • brand — «для товаров, у которых бренда действительно нет, оставьте поле
 *    пустым». У 92 товаров без бренда стояло «Ухтышка»: для Google бренд —
 *    производитель, а не магазин;
 *  • identifier_exists — только `yes` или `no`. Стояло `false`;
 *  • sale_price — только при настоящей скидке, как на странице. У 12
 *    товаров скидка 0 %, а final_price ниже price только от округления
 *    (4390 → 4290): фид называл это распродажей, хотя сайт зачёркнутую цену
 *    не показывает. Правило то же, что у разметки на сайте —
 *    strikethroughPrice (utils/offerSchema.ts).
 */

import { validGtin } from './gtin'
import { offerPrice, strikethroughPrice } from './offerSchema'
import { decodeHtmlEntities } from './parseSEOContent'
import { cleanProductName } from './productName'

export const FEED_TITLE_LIMIT = 150
export const FEED_DESCRIPTION_LIMIT = 5000

export interface FeedProduct {
  id: string
  name: string
  slug: string
  description: string | null
  price: number | string
  final_price: number | null
  discount_percentage: number | null
  stock_quantity: number | null
  barcode: string | null
  brandName: string | null
  categoryName: string | null
  imageUrl: string
  /** Остальные фото по порядку; Merchant Center берёт до 10. */
  additionalImageUrls?: readonly string[]
  /** Возраст «от» в месяцах — для age_group. */
  minAgeMonths?: number | null
  /** 'female' | 'male' | 'unisex' — как в базе. */
  gender?: string | null
  color?: string | null
  /** Характеристики для product_detail — те же строки, что на карточке. */
  details?: readonly { name: string, value: string }[]
  /** Группа цветовых вариантов — только если у каждого варианта есть свой цвет. */
  itemGroupId?: string | null
}

export const FEED_ADDITIONAL_IMAGES_LIMIT = 10

/*
 * age_group — по спецификации Google: newborn до 3 месяцев, infant 3–12,
 * toddler 1–5 лет, kids 5–13, adult старше. Берётся нижняя граница
 * возраста: «от 3 лет» — это toddler, «от 6 лет» — kids. Для игрушек поле
 * необязательное, но по нему Google подбирает товар к запросам вида
 * «кукла для девочки 3 лет». Возраст в месяцах — с 22 сентября 2026.
 */
export function feedAgeGroup(minAgeMonths: number | null | undefined): string | null {
  if (minAgeMonths === null || minAgeMonths === undefined || !Number.isFinite(minAgeMonths))
    return null
  if (minAgeMonths < 3)
    return 'newborn'
  if (minAgeMonths < 12)
    return 'infant'
  if (minAgeMonths < 60)
    return 'toddler'
  if (minAgeMonths < 156)
    return 'kids'
  return 'adult'
}

/*
 * item_group_id — связка цветовых вариантов (model_group_id). Google требует
 * у каждого товара группы значение, которым варианты различаются (для нас —
 * цвет); без него товар группы отклоняется. На 23 сентября 2026 у танка
 * «песочный камуфляж» цвета нет (песочного нет среди вариантов), и его
 * группа уходит без связки. Связка — только если у всех вариантов группы в
 * фиде цвет есть и цвета разные.
 */
export function feedItemGroups(
  products: readonly { id: string, groupId: string | null, color: string | null }[],
): Map<string, string> {
  const groups = new Map<string, { id: string, color: string | null }[]>()
  for (const p of products) {
    if (!p.groupId)
      continue
    const list = groups.get(p.groupId) ?? []
    list.push({ id: p.id, color: p.color?.trim() || null })
    groups.set(p.groupId, list)
  }
  const out = new Map<string, string>()
  for (const [groupId, list] of groups) {
    const colors = list.map(x => x.color)
    const ok = list.length > 1
      && colors.every(Boolean)
      && new Set(colors).size === colors.length
    if (ok) {
      for (const x of list)
        out.set(x.id, groupId)
    }
  }
  return out
}

export function feedGender(gender: string | null | undefined): string | null {
  return gender === 'female' || gender === 'male' || gender === 'unisex' ? gender : null
}

/** Обрезка по границе слова, без висящего хвоста. */
function cut(text: string, limit: number): string {
  if (text.length <= limit)
    return text
  const head = text.slice(0, limit)
  const space = head.lastIndexOf(' ')
  return (space > limit * 0.6 ? head.slice(0, space) : head).replace(/[\s,;:—–-]+$/, '')
}

export function feedTitle(name: string): string {
  return cut(cleanProductName(name), FEED_TITLE_LIMIT)
}

/**
 * HTML описания → простой текст: блоки — отдельными строками, пункты
 * списка — «• пункт». Спецификация разрешает переносы строк и списки, а
 * теги — нет.
 */
export function feedDescription(html: string | null | undefined, fallback: string): string {
  const text = decodeHtmlEntities(
    (html ?? '')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|h[1-6]|ul|ol|li|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
  const lines = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const joined = lines.join('\n')
  return cut(joined || cleanProductName(fallback), FEED_DESCRIPTION_LIMIT)
}

/** CDATA, в котором текст не может закрыть секцию раньше времени. */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

export function feedItemXml(p: FeedProduct, baseUrl: string): string {
  const current = offerPrice(p)
  const struck = strikethroughPrice(p).priceSpecification?.price
  const brand = p.brandName?.trim()
  const gtin = validGtin(p.barcode)
  const lines = [
    `<g:id>${p.id}</g:id>`,
    `<g:title>${cdata(feedTitle(p.name))}</g:title>`,
    `<g:description>${cdata(feedDescription(p.description, p.name))}</g:description>`,
    `<g:link>${baseUrl}/catalog/products/${p.slug}</g:link>`,
    `<g:image_link>${p.imageUrl}</g:image_link>`,
    `<g:availability>${(p.stock_quantity ?? 0) > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>`,
    // Цена до скидки — в price, текущая — в sale_price; без скидки — только price.
    struck ? `<g:price>${struck} KZT</g:price>` : `<g:price>${current} KZT</g:price>`,
    struck ? `<g:sale_price>${current} KZT</g:sale_price>` : '',
    brand ? `<g:brand>${cdata(brand)}</g:brand>` : '',
    `<g:condition>new</g:condition>`,
    `<g:google_product_category>1253</g:google_product_category>`,
    `<g:product_type>${cdata(p.categoryName?.trim() || 'Игрушки')}</g:product_type>`,
    gtin ? `<g:gtin>${gtin}</g:gtin>` : `<g:identifier_exists>no</g:identifier_exists>`,
    ...[...new Set(p.additionalImageUrls ?? [])]
      .filter(url => url && url !== p.imageUrl)
      .slice(0, FEED_ADDITIONAL_IMAGES_LIMIT)
      .map(url => `<g:additional_image_link>${url}</g:additional_image_link>`),
    feedAgeGroup(p.minAgeMonths) ? `<g:age_group>${feedAgeGroup(p.minAgeMonths)}</g:age_group>` : '',
    feedGender(p.gender) ? `<g:gender>${feedGender(p.gender)}</g:gender>` : '',
    p.color?.trim() ? `<g:color>${cdata(p.color.trim())}</g:color>` : '',
    p.itemGroupId ? `<g:item_group_id>${p.itemGroupId}</g:item_group_id>` : '',
    ...(p.details ?? [])
      .filter(d => d.name.trim() && d.value.trim())
      .map(d => `<g:product_detail><g:section_name>Характеристики</g:section_name><g:attribute_name>${cdata(d.name.trim())}</g:attribute_name><g:attribute_value>${cdata(d.value.trim())}</g:attribute_value></g:product_detail>`),
  ].filter(Boolean)
  return `    <item>\n${lines.map(l => `      ${l}`).join('\n')}\n    </item>`
}

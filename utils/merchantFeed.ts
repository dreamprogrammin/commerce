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
  ].filter(Boolean)
  return `    <item>\n${lines.map(l => `      ${l}`).join('\n')}\n    </item>`
}

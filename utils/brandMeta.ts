/**
 * Описание страницы бренда для выдачи — из товаров бренда.
 *
 * Зачем. 22 сентября 2026 у ZURU (место 7.3, 238 показов за 90 дней, CTR
 * 1,7 %) описанием шёл кусок текста о бренде: «Robo Alive, X-Shot,
 * Rainbocorns, 5 Surprise, Pets Alive и другие серии… Доставка по всему
 * Казахстану!» — трёх из пяти серий в магазине нет, а ни числа товаров, ни
 * цен не было вовсе. У Feelo (место 5.7) — «города, горки, виллы» при двух
 * товарах. На местах 5–9 клик решает строка в выдаче, и в ней должно быть
 * то, ради чего кликают: сколько моделей, почём и какие серии есть.
 *
 * Правило:
 *  • написал владелец мета-описание (meta_description) — оно остаётся,
 *    число моделей и цены «от … до …» встают впереди;
 *  • не написал — описание собирается целиком из товаров: «Игрушки ZURU в
 *    Алматы: 8 моделей от 7 390 до 25 390 ₸ — Smashers, Rainbocorns, Robo
 *    Alive. Доставка 1–3 дня, самовывоз.»;
 *  • товаров нет — null, страница берёт прежние запасные варианты.
 */

import { brandLandingFacts, modelsAndPrices, prependBrandLandingFacts } from './brandLandingText'
import { clampDescription, DELIVERY_SHORT } from './seoDescription'

export interface BrandMetaProduct {
  price: number | string
  final_price: number | null
  stock_quantity: number | null
  lineName: string | null
}

const MAX_LINES = 3

/** До трёх серий бренда, от самой большой к меньшей. */
export function topLines(products: readonly BrandMetaProduct[]): string[] {
  const counts = new Map<string, number>()
  for (const p of products) {
    const name = p.lineName?.trim()
    if (name)
      counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, MAX_LINES)
    .map(([name]) => name)
}

export function composeBrandMeta(input: {
  word: string | null
  brandName: string
  products: readonly BrandMetaProduct[]
  lead?: string | null
}): string | null {
  if (!input.products.length)
    return null
  const facts = brandLandingFacts(input.products.map(p => ({
    name: '',
    slug: '',
    price: Number(p.price),
    final_price: p.final_price,
    stock_quantity: p.stock_quantity,
    min_age_years: null,
    max_age_years: null,
  })))

  const lead = input.lead?.trim()
  if (lead)
    return prependBrandLandingFacts(lead, facts)

  const subject = [input.word?.trim(), input.brandName.trim()].filter(Boolean).join(' ')
  const lines = topLines(input.products)
  return clampDescription(
    `${subject} в Алматы: ${modelsAndPrices(facts)}${lines.length ? ` — ${lines.join(', ')}` : ''}. ${DELIVERY_SHORT}.`,
  )
}

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
 *    Alive. Доставка 1–3 дня, по Казахстану 3–7 дней, самовывоз.» (с 21
 *    октября 2026 — с Казахстаном, `deliveryLinesForMeta`);
 *  • товаров нет — null, страница берёт прежние запасные варианты.
 */

import { brandLandingFacts, modelsAndPrices, prependBrandLandingFacts } from './brandLandingText'
import { clampDescription, withDeliveryForMeta } from './seoDescription'
import { leadExcerpt } from './seoText'

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
  return withDeliveryForMeta(
    delivery => `${subject} в Алматы: ${modelsAndPrices(facts)}${lines.length ? ` — ${lines.join(', ')}` : ''}. ${delivery}.`,
  )
}

/**
 * Описание пустого бренда — товаров нет ни одного.
 *
 * Восемь таких страниц открыты для индекса ради спроса (см.
 * `BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS`), а описанием в выдаче шло «Купить
 * игрушки BOWA в Казахстане…». Человек кликал — и попадал на пустую сетку.
 * Теперь строка в выдаче говорит, как есть, и называет те же разделы, что
 * блок на самой странице (`emptyBrandAlternatives`).
 */
export function composeEmptyBrandMeta(
  brandName: string,
  alternatives: readonly { label: string }[],
): string {
  const where = alternatives.length
    ? `Похожие игрушки — в ${alternatives.length === 1 ? 'разделе' : 'разделах'} ${alternatives.map(a => `«${a.label}»`).join(' и ')}`
    : 'Игрушки других брендов — в каталоге'
  return clampDescription(`Товаров ${brandName.trim()} сейчас нет в наличии. ${where} интернет-магазина Ухтышка в Алматы.`)
}

const SITE_NAME = 'Ухтышка'

/**
 * Заголовок страницы бренда для выдачи. Им же считает предпросмотр в админке
 * (`components/admin/brands/BrandForm.vue`): до 22 октября 2026 тот писал
 * свою версию — «X - Купить товары бренда в Алматы» — при том что страница
 * давно отдавала «Конструкторы X — купить в Алматы с доставкой».
 *
 * Порядок: написанное руками (`meta_title`, потом старое `seo_title`), иначе
 * «Конструкторы LEGO — купить в Алматы с доставкой», а не «LEGO - Купить
 * товары бренда в Алматы». Формулировка повторяет заголовок бренд-лендинга в
 * категории: по тем же запросам он держится на 20-й позиции против 28-й у
 * страницы бренда (Search Console, лето 2026). Слово раздела — из товаров
 * бренда (`brandHeadingWord(findTopRootSlug(…))`); товаров нет — прежний
 * шаблон.
 */
export function composeBrandTitle(input: {
  brandName: string
  word: string | null
  metaTitle?: string | null
  seoTitle?: string | null
}): string {
  if (input.metaTitle)
    return input.metaTitle
  if (input.seoTitle)
    return input.seoTitle
  if (input.word)
    return `${input.word} ${input.brandName} — купить в Алматы с доставкой | ${SITE_NAME}`
  return `${input.brandName} - Купить товары бренда в Алматы | ${SITE_NAME}`
}

/**
 * Описание страницы бренда для выдачи — целиком, со всеми запасными
 * вариантами. Им же считает предпросмотр в админке: до 22 октября 2026 тот
 * показывал поле «SEO описание» или сырую вёрстку «Описания», а страница с
 * товарами отдаёт описание из товаров.
 *
 * Порядок:
 *  • есть товары — из товаров: число моделей, цены «от … до …» и серии,
 *    которые реально есть (`composeBrandMeta`); написанное владельцем
 *    `meta_description` остаётся, факты встают впереди;
 *  • товаров нет (план по аудиту, п. 10) — строка говорит, как есть, и
 *    называет те же разделы, что блок на странице. Прежде шло «Купить
 *    игрушки BOWA в Казахстане…» из базы при пустой сетке;
 *  • дальше — только когда товары не загрузились (`hasProducts` не false, а
 *    список пуст): ручное `meta_description`, затем первый абзац
 *    `seo_description`, затем первый абзац `description`.
 *
 * `seo_description` — это ВЁРСТКА страницы бренда, а не мета-описание.
 * Раньше она уходила в `<meta name="description">` как есть, и на проде
 * 20 августа `/brand/hstar` отдавал в описании две тысячи знаков HTML
 * (`<h2 data-icon="…">`, списки, абзацы). Из вёрстки берётся первый абзац о
 * бренде (`leadExcerpt`): снятая целиком, она приклеивала заголовок к абзацу
 * без точки. Абзаца о бренде нет — пустая строка, и берётся следующий вариант.
 */
export function composeBrandDescription(input: {
  brandName: string
  word: string | null
  products: readonly BrandMetaProduct[]
  /** false — у бренда нет ни одного активного товара; null — ещё неизвестно. */
  hasProducts: boolean | null | undefined
  alternatives: readonly { label: string }[]
  metaDescription?: string | null
  seoDescription?: string | null
  description?: string | null
}): string {
  const composed = composeBrandMeta({
    word: input.word,
    brandName: input.brandName,
    products: input.products,
    lead: input.metaDescription,
  })
  if (composed)
    return composed
  if (input.hasProducts === false)
    return composeEmptyBrandMeta(input.brandName, input.alternatives)
  if (input.metaDescription)
    return input.metaDescription
  const seoLead = leadExcerpt(input.seoDescription, 160)
  if (seoLead)
    return seoLead
  const lead = leadExcerpt(input.description, 140)
  if (lead)
    return `${lead.replace(/[.!?…]+$/, '')}. Доставка по Казахстану.`
  return `Каталог товаров бренда ${input.brandName} в интернет-магазине ${SITE_NAME}. Оригинальная продукция с гарантией качества. Доставка по Казахстану.`
}

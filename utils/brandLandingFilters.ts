/**
 * Отбор товаров в подборке лендинга: возраст, цена, тема.
 *
 * Вынесено из компонента ради тестов — на возрастных границах и темах легко
 * ошибиться молча, а проверять их в браузере дорого.
 */
import type { ProductWithGallery } from '@/types'

/** Возраст товара из `products`; у части товаров он не заполнен. */
export function productAgeRange(product: ProductWithGallery): { min: number | null, max: number | null } {
  return {
    min: (product as any).min_age_years ?? null,
    max: (product as any).max_age_years ?? null,
  }
}

/**
 * Подходит ли набор ребёнку из отрезка [lo, hi].
 *
 * Считаем ПЕРЕСЕЧЕНИЕ отрезков, а не попадание нижней границы: ползунок
 * спрашивает «что подойдёт ребёнку 5–7 лет», и набор «4–12» подходит. В
 * прежней версии с тремя чипами счёт шёл по нижней границе — там это было
 * нужно, чтобы один набор не попал сразу во все три корзины и сумма по чипам
 * не превысила число товаров. У ползунка такой суммы нет.
 *
 * Набор без указанного возраста не отсеивается, пока ползунок стоит на всём
 * диапазоне, и скрывается, как только его сузили: иначе он всплывал бы в
 * любом отборе, притворяясь подходящим.
 */
export function matchesAge(
  product: ProductWithGallery,
  lo: number,
  hi: number,
  bounds: { lo: number, hi: number },
): boolean {
  const { min, max } = productAgeRange(product)
  const full = lo <= bounds.lo && hi >= bounds.hi
  if (min == null && max == null)
    return full
  const from = min ?? bounds.lo
  const to = max ?? bounds.hi
  return to >= lo && from <= hi
}

export function matchesPrice(product: ProductWithGallery, lo: number, hi: number): boolean {
  const price = product.final_price ?? product.price
  return price >= lo && price <= hi
}

/**
 * Темы наборов. Тематических меток у товара в базе нет: атрибуты у
 * конструкторов не заполнены, категория у всех одна. Тема выводится из
 * названия и серии — так же, как её задумал макет.
 *
 * Это эвристика, и она честно об этом говорит: чип показывается, только если
 * под него попал хотя бы один товар, а весь блок — если тем набралось две.
 */
export const BRAND_THEMES: { key: string, label: string, match: RegExp }[] = [
  { key: 'heroes', label: 'Супергерои', match: /marvel|\bdc\b|мстител|бэтмен|человек-паук|халк|локи|железный человек|гоблин|грут|ракета/i },
  { key: 'rescue', label: 'Спасатели', match: /полиц|пожарн|спасательн|скорая|водная|патрул/i },
  { key: 'space', label: 'Космос', match: /космич|межзвёзд|ракетоплан|шаттл|планет|астронавт/i },
  { key: 'city', label: 'Город и техника', match: /\bcity\b|город|машин|мотоцикл|каток|грузов|кран|экскаватор|трактор|вертол/i },
  { key: 'anime', label: 'Аниме и ниндзя', match: /one piece|аниме|ninjago|ниндзя|самурай/i },
  { key: 'home', label: 'Дом и друзья', match: /friends|подруг|\bдом\b|кафе|салон|ферма|питом/i },
]

/** Темы товара — по названию и названию серии. Может быть несколько. */
export function themesOf(product: ProductWithGallery, lineName?: string | null): string[] {
  const haystack = `${product.name ?? ''} ${lineName ?? ''}`
  return BRAND_THEMES.filter(theme => theme.match.test(haystack)).map(theme => theme.key)
}

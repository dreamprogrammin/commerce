/**
 * Промо-плитки каталога: «Новинки» и «Акции».
 *
 * Сами пункты приходят из настройки `additional_menu_items` (таблица
 * `settings`), а вёрстка различает их по id — от него зависят градиент,
 * эмодзи и подпись под заголовком.
 *
 * Единственный источник правды на две вёрстки. Десктопная карточка сверялась
 * с id `sale`, которого в настройках нет: реальные id — `new-items` и
 * `promotions`. Условие никогда не срабатывало, и «Акции» уходили в ветку
 * «Новинок» — синий градиент, ✨ и подпись «Новые поступления». На uhti.kz
 * это было видно вживую: обе карточки выглядели одинаково.
 */

/**
 * id промо-пунктов, которые означают скидки.
 *
 * `promotions` — то, что реально лежит в настройках. `sale` и `discounts`
 * оставлены запасом: пункты редактируются в админке, и id могут переименовать.
 */
const DISCOUNT_PROMO_IDS = new Set(['promotions', 'sale', 'discounts'])

/** Скидочная плитка («Акции») или нет («Новинки» и всё остальное). */
export function isDiscountPromo(id: string): boolean {
  return DISCOUNT_PROMO_IDS.has(id)
}

/** Подпись под названием плитки. */
export function promoSubtitle(id: string): string {
  return isDiscountPromo(id) ? 'Скидки до 50%' : 'Новые поступления'
}

/** Эмодзи в десктопной карточке. */
export function promoEmoji(id: string): string {
  return isDiscountPromo(id) ? '🏷️' : '✨'
}

/** Градиент десктопной карточки (классы Tailwind). */
export function promoGradientClass(id: string): string {
  return isDiscountPromo(id)
    ? 'bg-gradient-to-br from-amber-400 via-orange-400 to-red-400'
    : 'bg-gradient-to-br from-blue-400 via-indigo-400 to-violet-400'
}

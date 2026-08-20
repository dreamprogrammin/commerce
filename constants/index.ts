export const BUCKET_NAME_CATEGORY = 'category-images'
export const BUCKET_NAME_PRODUCT = 'product-images'
export const NO_PARENT_OPTION_NAME = ''
export const NO_PARENT_SLUG_VALUE_FOR_SELECT = '__NO_PARENT__'
export const BUCKET_NAME_BRANDS = 'brand-logos'
export const BUCKET_NAME_PRODUCT_LINES = 'product-line-logos'
export const BUCKET_NAME_SLIDES = 'slides-images'
export const BUCKET_NAME_BANNERS = 'banners'
export const BUCKET_NAME_REVIEWS = 'review-images'
/**
 * Доставка. Порог бесплатной доставки и цена курьера живут здесь, а не в
 * страницах: «Итого» в корзине и в оформлении обязано совпадать до тенге, а
 * раньше обе константы были продублированы в pages/cart.vue и
 * pages/checkout.vue и могли разъехаться при правке одной из них.
 */
export const FREE_SHIPPING_THRESHOLD = 15000
export const COURIER_DELIVERY_COST = 1000

/**
 * Имя Telegram-бота для ссылок привязки. Было продублировано в четырёх
 * компонентах; при смене бота половина ссылок молча вела бы на старого.
 * Пользуются им через composables/profile/useTelegramLink.ts.
 */
export const TELEGRAM_BOT_USERNAME = 'babyShopOfficialStoreKz_bot'

/**
 * Бренды без единого активного товара, которые всё равно остаются в индексе.
 *
 * Правило по умолчанию: у бренда нет активных товаров — страница закрывается
 * `noindex` и не попадает в карту сайта. Смысл понятен: пустая полка.
 *
 * Но у части таких страниц уже есть поисковый спрос на собственном SEO-тексте,
 * и закрывать их — значит выбросить рабочие входы. Данные Search Console за
 * 90 дней (21 мая — 18 августа 2026), все десять брендов с нулём товаров:
 *
 *   mg-toys          2 клика, 41 показ,  позиция 2.6
 *   eva-puzzle       1 клик,  90 показов, позиция 6.0
 *   koala-diary      0 кликов, 15 показов, позиция 6.2
 *   bowa             0 кликов, 11 показов, позиция 2.8
 *   fivestar-toys    0 кликов, 11 показов, позиция 9.2
 *   soba             0 кликов,  2 показа,  позиция 6.5
 *   rc-toys          0 кликов,  1 показ,   позиция 6.0
 *   shantou-yisheng  0 кликов,  1 показ,   позиция 8.0
 *   air-blaster      показов нет вовсе
 *   polese           показов нет вовсе
 *
 * Отсюда список: восемь верхних остаются открытыми, `air-blaster` и `polese`
 * закрываются. Решение владельца от 20 августа 2026.
 *
 * ЭТО СНИМОК ДАННЫХ, А НЕ ВЕЧНАЯ ИСТИНА. Список стоит пересматривать, когда
 * снова будете смотреть Search Console: у бренда мог появиться товар (тогда
 * строка тут просто перестаёт что-либо значить) или, наоборот, спрос мог
 * пропасть. Проверяется отчётом по страницам с фильтром `/brand/`.
 */
export const BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS: readonly string[] = [
  'bowa',
  'eva-puzzle',
  'fivestar-toys',
  'koala-diary',
  'mg-toys',
  'rc-toys',
  'shantou-yisheng',
  'soba',
]

export const BANNER_PLACEMENTS = {
  HOMEPAGE_HERO: 'homepage_hero',
  HOMEPAGE_GENDER: 'homepage_gender',
  CATEGORY_TOP: 'category_top',
  CATEGORY_SIDEBAR: 'category_sidebar',
  PRODUCT_PAGE: 'product_page',
  CHECKOUT: 'checkout',
} as const

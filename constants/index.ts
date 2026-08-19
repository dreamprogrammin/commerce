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

export const BANNER_PLACEMENTS = {
  HOMEPAGE_HERO: 'homepage_hero',
  HOMEPAGE_GENDER: 'homepage_gender',
  CATEGORY_TOP: 'category_top',
  CATEGORY_SIDEBAR: 'category_sidebar',
  PRODUCT_PAGE: 'product_page',
  CHECKOUT: 'checkout',
} as const

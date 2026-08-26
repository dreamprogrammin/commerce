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
 * Картинки сайта для разметки и соцсетей — АБСОЛЮТНЫМИ адресами.
 *
 * Заведены константами, потому что этот тип ошибки на проекте повторялся:
 * в разметке стояли ссылки на файлы, которых в `public/` нет. На 20 августа
 * 2026 `https://uhti.kz/logo.png` и `https://uhti.kz/og-brand.jpeg` отдавали
 * `404`, причём первый — из узла `Organization`, то есть Google не мог
 * получить логотип магазина вообще. Раньше тем же способом сломалась
 * `/og-brands.jpeg` на `pages/brands/index.vue` (там об этом есть отметка).
 *
 * Если меняете значение — сначала проверьте, что файл лежит в `public/`.
 */
export const SITE_LOGO_URL = 'https://uhti.kz/android-chrome-512x512.png'
export const SITE_LOGO_SIZE = 512
export const SITE_OG_IMAGE_URL = 'https://uhti.kz/og-home-toys.jpeg'
export const SITE_OG_IMAGE_SIZE = 1024

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

/**
 * Ключ подсказки о высоте персональных секций главной.
 *
 * Персональное рисуется только на клиенте (SSR-разметка главной общая для всех
 * и лежит в ISR-кеше), поэтому место под него резервируется по прошлому визиту:
 * страница и компоненты кладут сюда измеренные высоты, а инлайн-скрипт в <head>
 * читает их до первой отрисовки. У гостя и у того, у кого этих секций нет,
 * подсказки нет — и резерв равен нулю.
 *
 * Формат: `{ order?: number, wishlist?: number, at: number }`, значения в px.
 */
export const HOME_RESERVE_HINT_KEY = 'uhti:home-reserve'

/** Подсказка живёт неделю: за это время и заказ закрывается, и избранное меняется. */
export const HOME_RESERVE_HINT_TTL = 7 * 24 * 60 * 60 * 1000

/** Части главной, под которые резервируется место, и переменные CSS для них. */
export const HOME_RESERVE_PARTS = {
  order: '--active-order-reserve',
  wishlist: '--wishlist-reserve',
} as const

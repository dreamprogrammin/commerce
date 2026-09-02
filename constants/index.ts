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
  loyalty: '--loyalty-reserve',
} as const

/**
 * Сколько товаров должно быть у пары категория+бренд, чтобы бренд-лендинг
 * `/catalog/<категория>/brand/<бренд>` считался индексируемым.
 *
 * Зачем порог вообще. До 2 сентября 2026 и `robotsRule` в
 * pages/catalog/[...slug].vue, и карта сайта решали по одному признаку —
 * «есть строка в `category_brand_seo`». Число товаров не проверял никто, а
 * товары уходят из категорий и распродаются. К сентябрю это дало ровно то,
 * чего и следовало ждать: из 14 страниц в карте три содержали НОЛЬ товаров
 * (`avtotreki/brand/soba`, `konstruktory-malchikam/brand/mg-toys`,
 * `.../brand/play-smart`), ещё четыре — один-два. Проверено на проде: адрес
 * отдавал 200 и `index, follow`, в разметке не было ни одного узла ItemList,
 * а H1 при этом терял бренд («Автотреки для мальчиков» вместо «Автотреки
 * SOBA»), потому что бренда нет в списке брендов категории — его нечем
 * резолвить, когда у него нет товаров.
 *
 * Значение совпадает с порогом самой автогенерации: `HAVING COUNT(p.id) >= 3`
 * в `get_category_brand_combinations`. То есть страница индексируется ровно
 * при том же условии, при котором генератор считает её достойной создания.
 *
 * ВАЖНО: порог обязан применяться в ДВУХ местах сразу — на странице
 * (`robotsRule`) и в `server/api/sitemap-routes.ts`. Расхождение между ними
 * означает либо `noindex`-адрес в карте, либо индексируемую страницу, до
 * которой роботу неоткуда дойти. По этой же причине константа одна.
 */
export const MIN_PRODUCTS_FOR_BRAND_LANDING = 3

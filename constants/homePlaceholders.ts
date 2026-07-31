/**
 * Плейсхолдеры для главной страницы.
 *
 * Сюда вынесено всё, что в дизайне (Homepage.dc.html) захардкожено и не имеет
 * источника данных в текущей схеме. Каждый экспорт помечен комментарием
 * `PLACEHOLDER —` с описанием бэкенд-работы, которая его закроет.
 *
 * Ничего «фактического» (сроки доставки, пороги, проценты) здесь выдумывать
 * НЕЛЬЗЯ — только переносить уже проверенные значения из кода/оферты.
 */

/**
 * PLACEHOLDER — дедлайна акции нет в схеме.
 *
 * Бэкенд-варианты (в порядке возрастания трудозатрат):
 *   1. строка в `settings` c ключом 'product_of_the_day' и JSON
 *      { product_id, starts_at, ends_at } — паттерн уже используется,
 *      см. categoriesStore.ts (чтение key='additional_menu_items');
 *   2. колонки `products.deal_ends_at timestamptz` + `products.deal_price numeric`;
 *   3. отдельная таблица `deals_of_the_day` (product_id, starts_at, ends_at, is_active).
 *
 * Сам товар РЕАЛЬНЫЙ — берётся из productsStore.fetchFeaturedProducts(1).
 * Фабрикуется только дедлайн: считаем до конца текущих локальных суток.
 */
export const DEAL_COUNTDOWN_MODE = 'end-of-local-day' as const

/**
 * Плитки выгод в блоке «Акции и бонусы».
 *
 * ⚠️ Копия выверена по коду, а не по прототипу:
 *
 * • «бесплатно от 15 000 ₸» — ПРАВДА: FREE_SHIPPING_THRESHOLD = 15000
 *   (pages/checkout.vue). Значение продублировано здесь осознанно, потому что
 *   константа объявлена локально в двух страницах; при вынесении в общий
 *   модуль заменить импортом.
 *
 * • Срок доставки — в прототипе стоит «1–2 дня», но это ПРОТИВОРЕЧИТ
 *   опубликованной оферте: pages/terms.vue → «По Алматы: 1-3 рабочих дня».
 *   Публикуем цифру из оферты. Не менять без правки terms.vue.
 *
 * • Маршрута /delivery в проекте нет — ведём на раздел доставки в оферте.
 */
export const HOME_FREE_SHIPPING_THRESHOLD = 15000

export const HOME_DELIVERY_TILE = {
  id: 'delivery',
  title: 'Доставка 1–3 дня',
  subtitle: 'по Алматы, бесплатно от 15 000 ₸',
  icon: 'lucide:truck',
  href: '/terms',
  accent: 'blue',
} as const

/**
 * Плитка скидок. `title` НЕ захардкожен — процент подставляется из
 * promo_campaigns.discount_percentage (таблица публично читаема,
 * см. pages/promo/[slug].vue). Эти значения — фолбэк на случай,
 * когда активных кампаний нет: тогда плитка ведёт в общий раздел акций
 * и не утверждает конкретную цифру.
 */
export const HOME_DISCOUNT_TILE_FALLBACK = {
  id: 'discounts',
  title: 'Акции и распродажа',
  subtitle: 'на хиты недели',
  icon: 'lucide:badge-percent',
  href: '/catalog/all?sort_by=discount',
  accent: 'orange',
} as const

/**
 * Быстрые чипы над лентой товаров.
 *
 * Первые три ведут в статические разделы каталога; остальные подмешиваются
 * в рантайме из categoriesStore.menuTree, чтобы ни один чип не вёл в 404
 * (в прототипе список захардкожен — Homepage.dc.html:577).
 */
export const HOME_STATIC_CHIPS = [
  { id: 'all', label: 'Все', to: '/catalog/all' },
  { id: 'new', label: 'Новинки', to: '/catalog/all?sort_by=newest' },
  { id: 'popular', label: 'Популярное', to: '/catalog/all?sort_by=popularity' },
] as const

/** Сколько корневых категорий подмешать к статическим чипам. */
export const HOME_CHIPS_CATEGORY_LIMIT = 5

/**
 * Тинты плиток категорий (Homepage.dc.html: CATCOL).
 * Ключи — позиция корневой категории в menuTree, а не её slug:
 * slug'и в проде отличаются от прототипа, привязка по индексу устойчивее.
 */
export const CATEGORY_TILE_TINTS = [
  '#e3edfb', // мальчикам
  '#f8ebf1', // девочкам
  '#fbf0d1', // малышам
  '#e5f2ea', // конструкторы
  '#ede7fa', // творчество
  '#fce8db', // активный отдых
] as const

export const CATEGORY_TILE_TINT_FALLBACK
  = 'color-mix(in oklch, var(--primary) 10%, #fff)'

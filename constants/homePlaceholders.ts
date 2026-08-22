import { formatPrice } from '@/utils/formatPrice'
import { FREE_SHIPPING_THRESHOLD } from './index'

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
 * • Порог бесплатной доставки больше не дублируется: константа переехала в
 *   constants/index.ts, и подпись собирается из неё. Раньше здесь лежала
 *   копия числа с пометкой «при вынесении в общий модуль заменить импортом» —
 *   вынесли, заменили.
 *
 * • Срок доставки — в прототипе стоит «1–2 дня», но это ПРОТИВОРЕЧИТ
 *   опубликованной оферте: pages/terms.vue → «По Алматы: 1-3 рабочих дня».
 *   Публикуем цифру из оферты. Не менять без правки terms.vue.
 *
 * • Маршрута /delivery в проекте нет — ведём на раздел доставки в оферте.
 */

/**
 * Порог прописью — единственное место, где число превращается в текст.
 * Собирается из FREE_SHIPPING_THRESHOLD, чтобы подпись не могла разойтись
 * с тем, что реально считает корзина. Через formatPrice, а не
 * toLocaleString: последний в Node и в браузере разделяет разряды
 * по-разному, и строка разъехалась бы между сервером и клиентом.
 */
export const FREE_SHIPPING_LABEL = `${formatPrice(FREE_SHIPPING_THRESHOLD)} ₸`

export const HOME_DELIVERY_TILE = {
  id: 'delivery',
  title: 'Доставка 1–3 дня',
  subtitle: `по Алматы, бесплатно от ${FREE_SHIPPING_LABEL}`,
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
 * Тинты плиток категорий (PopularCategories.dc.html: CATCOL).
 * Ключи — позиция корневой категории в menuTree, а не её slug:
 * slug'и в проде отличаются от прототипа, привязка по индексу устойчивее.
 *
 * Значения обновлены по PopularCategories.dc.html. Прежний набор
 * (#e3edfb, #f8ebf1, #fbf0d1, #e5f2ea, #ede7fa, #fce8db) приехал из более
 * раннего Homepage.dc.html и был заметно бледнее — плитки читались почти
 * белыми. Порядок тот же, так что соответствие категориям не съехало.
 */
export const CATEGORY_TILE_TINTS = [
  '#9fd3ea', // мальчикам
  '#f6c3cc', // девочкам
  '#f7d08a', // малышам
  '#b4dfb9', // конструкторы
  '#cfc3ee', // творчество
  '#a3ddd8', // активный отдых
] as const

export const CATEGORY_TILE_TINT_FALLBACK
  = 'color-mix(in oklch, var(--primary) 10%, #fff)'

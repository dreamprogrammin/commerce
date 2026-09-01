/**
 * Настройки оболочки страницы для макета `Shell.vue`.
 *
 * Страница объявляет их в `definePageMeta({ shell: ... })`. Раньше каждое
 * такое сочетание было отдельным макетом, из-за чего переход между страницами
 * уничтожал дерево целиком — см. комментарий в `layouts/Shell.vue`.
 */
export interface ShellOptions {
  /** Шапка на десктопе. `none` — не показывать вовсе. */
  header?: 'overlay' | 'default' | 'static' | 'none'
  /**
   * Показывать ли шапку и на узком экране.
   *
   * На витрине её роль там играет герой или собственный таббар страницы,
   * поэтому по умолчанию шапка только десктопная. У флоу оформления своего
   * мобильного заголовка нет, и прежний `Checkout.vue` рисовал `SiteHeader`
   * без обёртки — он сам подстраивается под ширину. Без этого флага шапка на
   * мобилке пропадала.
   */
  headerOnMobile?: boolean
  /** Собственная шапка на узком экране. */
  mobileHeader?: 'catalog' | 'app' | 'none'
  /**
   * Обвязка поверх содержимого: шаги заказа и локейшн-панель.
   *
   * Живёт отдельным компонентом (`OrderCheckoutChrome`), а не в самой
   * оболочке: оболочка не должна знать про шаги заказа.
   */
  chrome?: 'checkout' | 'none'
  /**
   * Собственный фон страницы.
   *
   * У карточки товара он `--page-surface`, у остальных — фон документа.
   */
  surface?: boolean
  /**
   * Растягивать ли `<main>` во всю высоту (`flex-1`).
   *
   * Сам `<main>` рисуется ВСЕГДА, даже там, где прежний макет обходился без
   * него. Условная обёртка меняет положение страницы в дереве, и Vue
   * пересоздаёт её при каждом переходе — удержание при этом молча
   * перестаёт работать. Проверено меткой 1 сентября: через каталог главная
   * переживала переход, через корзину — нет.
   */
  grow?: boolean
  /** Подвал. `layered` нужен там, где под ним фиксированный герой. */
  footer?: 'layered' | 'plain' | 'none'
  /**
   * Отступ сверху у `<main>` на узком экране, под фиксированный таббар.
   * Значение в пикселях: у таббара каталога 56, у общего таббара 76.
   */
  padTop?: 0 | 56 | 76
  /** Резерв под нижнюю навигацию у `<main>` на узком экране. */
  padBottom?: boolean
}

/** Прежний `CatalogListing.vue`: обычная нелипкая шапка, обычный подвал. */
export const catalogShell: Required<ShellOptions> = {
  surface: false,
  headerOnMobile: false,
  header: 'static',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 0,
  padBottom: true,
}

/** Прежний `Home.vue`: шапка поверх героя, подвал в слое, отступов нет. */
export const homeShell: Required<ShellOptions> = {
  surface: false,
  headerOnMobile: false,
  header: 'overlay',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'layered',
  padTop: 0,
  padBottom: false,
}

/** Прежний `Catalog.vue`: обычная шапка, мобильный таббар, без подвала. */
export const catalogRootShell: Required<ShellOptions> = {
  surface: false,
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'catalog',
  chrome: 'none',
  grow: true,
  footer: 'none',
  padTop: 56,
  padBottom: true,
}

/**
 * Прежний `Checkout.vue`: обычная шапка, обвязка шагов заказа, без подвала.
 *
 * `grow: false` — прежний макет не растягивал содержимое во всю высоту.
 */
export const checkoutShell: Required<ShellOptions> = {
  surface: false,
  headerOnMobile: true,
  header: 'default',
  mobileHeader: 'none',
  chrome: 'checkout',
  grow: false,
  footer: 'none',
  padTop: 0,
  padBottom: false,
}

/**
 * Прежний `ProductDetail.vue`: липкая шапка, свой фон, обычный подвал.
 *
 * Мобильный тулбар карточки — часть содержимого страницы
 * (`ProductMobileHeader`), а не оболочки: он `position: sticky` и сам
 * резервирует высоту в потоке, поэтому `padTop` здесь не нужен.
 */
export const productShell: Required<ShellOptions> = {
  surface: true,
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'none',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 0,
  padBottom: true,
}

/**
 * Прежний `default.vue`: липкая шапка, общий мобильный таббар, обычный подвал.
 *
 * Сюда переехали страницы, у которых не было своего макета: бренды, «о нас»,
 * правовые тексты, регистрация, уведомления. Пока они жили на `default`,
 * переход на них уничтожал оболочку целиком — и на экране оставалась прежняя
 * страница, уже подскочившая наверх (замер 1 сентября, `/brands`: 976 мс).
 */
export const pageShell: Required<ShellOptions> = {
  surface: false,
  headerOnMobile: false,
  header: 'default',
  mobileHeader: 'app',
  chrome: 'none',
  grow: true,
  footer: 'plain',
  padTop: 76,
  padBottom: true,
}

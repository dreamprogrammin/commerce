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
  /** Собственная шапка на узком экране. */
  mobileHeader?: 'catalog' | 'none'
  /** Подвал. `layered` нужен там, где под ним фиксированный герой. */
  footer?: 'layered' | 'plain' | 'none'
  /** Отступ сверху у `<main>` на узком экране (под фиксированный таббар). */
  padTop?: boolean
  /** Резерв под нижнюю навигацию у `<main>` на узком экране. */
  padBottom?: boolean
}

/** Прежний `CatalogListing.vue`: обычная нелипкая шапка, обычный подвал. */
export const catalogShell: Required<ShellOptions> = {
  header: 'static',
  mobileHeader: 'none',
  footer: 'plain',
  padTop: false,
  padBottom: true,
}

/** Прежний `Home.vue`: шапка поверх героя, подвал в слое, отступов нет. */
export const homeShell: Required<ShellOptions> = {
  header: 'overlay',
  mobileHeader: 'none',
  footer: 'layered',
  padTop: false,
  padBottom: false,
}

/** Прежний `Catalog.vue`: обычная шапка, мобильный таббар, без подвала. */
export const catalogRootShell: Required<ShellOptions> = {
  header: 'default',
  mobileHeader: 'catalog',
  footer: 'none',
  padTop: true,
  padBottom: true,
}

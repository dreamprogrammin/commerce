import type { InjectionKey } from 'vue'

export interface HeaderOverlay {
  showOverlay: () => void
  hideOverlay: () => void
  isVisible: Readonly<Ref<boolean>>
}

export const HeaderOverlayKey: InjectionKey<HeaderOverlay> = Symbol('HeaderOverlay')

/**
 * Режим отрисовки шапки.
 *
 * `solid`   — обычная шапка в потоке документа (все layout'ы, кроме главной).
 * `overlay` — прозрачная шапка поверх героя на главной; при скролле
 *             «схлопывается» в стеклянную плашку с отступами.
 *
 * Потомки шапки (HeaderBottom, AppTabBar) инжектят ключ С ДЕФОЛТОМ,
 * поэтому остальные шесть layout'ов не требуют никаких изменений.
 */
export interface HeaderVariant {
  variant: Readonly<Ref<'solid' | 'overlay'>>
  isScrolled: Readonly<Ref<boolean>>
}

export const HeaderVariantKey: InjectionKey<HeaderVariant> = Symbol('HeaderVariant')

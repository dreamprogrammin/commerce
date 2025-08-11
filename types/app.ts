import type { InjectionKey } from 'vue'

export interface HeaderOverlay {
  showOverlay: () => void
  hideOverlay: () => void
  isVisible: Readonly<Ref<boolean>>
}

export const HeaderOverlayKey: InjectionKey<HeaderOverlay> = Symbol('HeaderOverlay')

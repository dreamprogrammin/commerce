/**
 * SSR-safe mobile detection composable.
 *
 * Использует useMediaQuery из @vueuse/core — результат кешируется глобально,
 * не обращается к DOM при каждом рендере компонента.
 * На SSR всегда возвращает false (безопасно для гидрации).
 */
import { useMediaQuery } from '@vueuse/core'

export function useIsMobile(breakpoint = 1023) {
  // На сервере возвращаем false чтобы избежать hydration mismatch
  if (import.meta.server) {
    return ref(false)
  }
  return useMediaQuery(`(max-width: ${breakpoint}px)`)
}

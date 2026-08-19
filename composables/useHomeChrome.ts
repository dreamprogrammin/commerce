/**
 * Прилипание мобильной строки поиска на главной.
 *
 * В прототипе (Homepage.dc.html:923-933) над строкой поиска стоит нулевой по
 * высоте сентинел. Как только он уходит за верхнюю кромку вьюпорта, строка
 * фиксируется у верха экрана. В момент прилипания снимается реальная высота
 * строки, и вместо неё подставляется распорка той же высоты — иначе контент
 * «подпрыгнул» бы на величину строки.
 *
 * Состояние прозрачной→стеклянной ШАПКИ здесь НЕ живёт: им владеет
 * `Header.vue` в режиме `overlay` (шапка десктопная, её порог завязан на
 * высоту героя). Разводим ответственность, чтобы не считать одно и то же
 * в двух местах.
 *
 * Наблюдатель вешается только на клиенте и снимается автоматически
 * (`useIntersectionObserver` из @vueuse/core).
 */
import type { Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

/** Фолбэк высоты липкой строки, пока не удалось замерить (Homepage.dc.html:929). */
const STICKY_ROW_FALLBACK_HEIGHT = 72

export interface UseHomeStickySearchOptions {
  /** Нулевой по высоте сентинел прямо над строкой поиска. */
  sentinelEl: Ref<HTMLElement | null>
  /** Сама строка поиска — с неё снимается высота для распорки. */
  searchRowEl: Ref<HTMLElement | null>
}

export function useHomeStickySearch(options: UseHomeStickySearchOptions) {
  const { sentinelEl, searchRowEl } = options

  const isSearchStuck = ref(false)
  const stuckRowHeight = ref(STICKY_ROW_FALLBACK_HEIGHT)

  useIntersectionObserver(
    sentinelEl,
    ([entry]) => {
      if (!entry)
        return
      const stuck = entry.boundingClientRect.top <= 0 && !entry.isIntersecting
      if (stuck && !isSearchStuck.value) {
        const measured = searchRowEl.value?.offsetHeight
        if (measured)
          stuckRowHeight.value = measured
      }
      isSearchStuck.value = stuck
    },
    { threshold: 0 },
  )

  return {
    isSearchStuck: readonly(isSearchStuck),
    stuckRowHeight: readonly(stuckRowHeight),
  }
}

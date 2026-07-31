<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { HeaderOverlay, HeaderVariant } from '@/types/app'
import { computed, onMounted, onUnmounted, provide, readonly, ref, toRef } from 'vue'
import { carouselContainerVariants } from '@/lib/variants'
import { HeaderOverlayKey, HeaderVariantKey } from '@/types/app'

const props = withDefaults(
  defineProps<{
    /**
     * `solid`   — обычная шапка в потоке (все layout'ы, кроме главной).
     * `overlay` — прозрачная шапка поверх героя; при скролле «схлопывается»
     *             в стеклянную плашку с отступами (только на главной).
     */
    variant?: 'solid' | 'overlay'
  }>(),
  { variant: 'solid' },
)

const containerClass = carouselContainerVariants({ contained: 'always' })
const isHeaderOverlayVisible = ref(false)
const desktopTabBarRef = ref<{ closeAllPopups: () => void } | null>(null)

function showHeaderOverlay(): void {
  isHeaderOverlayVisible.value = true
}

function hideHeaderOverlay(): void {
  isHeaderOverlayVisible.value = false
}

const overlayProvider: HeaderOverlay = {
  showOverlay: showHeaderOverlay,
  hideOverlay: hideHeaderOverlay,
  isVisible: readonly(isHeaderOverlayVisible),
}

provide(HeaderOverlayKey, overlayProvider)

// ---------------------------------------------------------------------------
// Режим overlay: прозрачная шапка над героем, стекло при скролле.
// Порог из прототипа — scrollY > высотаГероя * 0.55 (Homepage.dc.html:711).
// Шапка в этом режиме показывается только на десктопе (обёртка hidden lg:block
// в layouts/Home.vue), поэтому высоту героя аппроксимируем по вьюпорту:
// на десктопе герой = clamp(560px, 80vh, 760px).
// ---------------------------------------------------------------------------
const SCROLLED_RATIO = 0.55
const isScrolled = ref(false)

function desktopHeroHeight(): number {
  const vh = window.innerHeight || 760
  return Math.min(760, Math.max(560, vh * 0.8))
}

let rafId = 0
function onScroll() {
  if (rafId)
    return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    isScrolled.value = window.scrollY > desktopHeroHeight() * SCROLLED_RATIO
  })
}

onMounted(() => {
  if (props.variant !== 'overlay')
    return
  window.addEventListener('scroll', onScroll, { passive: true })
  isScrolled.value = window.scrollY > desktopHeroHeight() * SCROLLED_RATIO
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (rafId)
    cancelAnimationFrame(rafId)
})

// Прокидываем режим и состояние скролла потомкам (мега-меню, пилюли).
// Потребители инжектят С ДЕФОЛТОМ, поэтому прочие layout'ы не затрагиваются.
const headerVariantProvider: HeaderVariant = {
  variant: readonly(toRef(props, 'variant')),
  isScrolled: readonly(isScrolled),
}
provide(HeaderVariantKey, headerVariantProvider)

function handleOverlayClick() {
  hideHeaderOverlay()
  desktopTabBarRef.value?.closeAllPopups()
}

const isOverlay = computed(() => props.variant === 'overlay')

/**
 * Класс корня шапки.
 * В режиме `solid` строка ПОБАЙТОВО совпадает с прежней вёрсткой — это
 * гарантия неизменности остальных шести layout'ов.
 */
const headerClass = computed(() =>
  isOverlay.value
    ? 'fixed left-0 right-0 top-0 z-[100]'
    : 'relative z-50 bg-white md:bg-blue-500 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800',
)

/** Динамический inline-стиль стеклянного состояния (Homepage.dc.html:920). */
const overlayStyle = computed<CSSProperties>(() => {
  if (!isOverlay.value)
    return {}
  const scrolled = isScrolled.value
  return {
    padding: '14px 0',
    // НЕ overflow:hidden: мега-меню AppTabBar рендерится ВНУТРИ шапки и было бы
    // обрезано. Скруглённое стекло рисуется фоном, контент отступает от углов.
    overflow: 'visible',
    top: scrolled ? '12px' : '0',
    left: scrolled ? '12px' : '0',
    right: scrolled ? '12px' : '0',
    borderRadius: scrolled ? '22px' : '0',
    background: scrolled
      ? 'color-mix(in srgb, var(--header-bg) 66%, transparent)'
      : 'transparent',
    backdropFilter: scrolled ? 'blur(18px) saturate(1.5)' : 'none',
    WebkitBackdropFilter: scrolled ? 'blur(18px) saturate(1.5)' : 'none',
    border: scrolled
      ? '1px solid rgba(255,255,255,.22)'
      : '1px solid transparent',
    boxShadow: scrolled ? '0 10px 30px rgba(15,23,42,.2)' : 'none',
    transition:
      'top .25s ease, left .25s ease, right .25s ease, border-radius .25s ease, background .25s ease, box-shadow .25s ease, backdrop-filter .25s ease',
  }
})
</script>

<template>
  <header :class="headerClass" :style="overlayStyle">
    <!-- <CommonHeaderTop :class="containerClass" /> -->
    <div :class="containerClass">
      <CommonHeaderBottom />
      <div class="hidden lg:block py-2">
        <ClientOnly>
          <CommonAppTabBar ref="desktopTabBarRef" />
          <template #fallback>
            <div class="h-11 w-full bg-white/10 backdrop-blur-sm rounded-xl animate-pulse border border-white/10" />
          </template>
        </ClientOnly>
      </div>
    </div>
  </header>

  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isHeaderOverlayVisible"
      class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
      @click="handleOverlayClick"
    />
  </Transition>
</template>

<script setup lang="ts">
import type { HeaderOverlay } from '@/types/app'
import { carouselContainerVariants } from '@/lib/variants'
import { HeaderOverlayKey } from '@/types/app'

const isHeaderOverlayVisible = ref(false)
const desktopTabBarRef = ref<{ closeAllPopups: () => void } | null>(null)
const mobileTabBarRef = ref<{ closeAll: () => void } | null>(null)

const containerClass = carouselContainerVariants({ contained: 'always' })

// Отслеживание скролла для мобильного таббара
const isTabBarFixed = ref(false)
const scrollThreshold = 100 // Порог скролла в пикселях
let lastScrollY = 0
let isScrollingDown = false

function handleScroll() {
  const currentScrollY = window.scrollY
  isScrollingDown = currentScrollY > lastScrollY
  lastScrollY = currentScrollY

  // Показываем только при скролле вниз и превышении порога
  if (currentScrollY > scrollThreshold && isScrollingDown) {
    isTabBarFixed.value = true
  }
  else if (currentScrollY <= scrollThreshold || !isScrollingDown) {
    isTabBarFixed.value = false
  }
}

onMounted(() => {
  if (process.client) {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }
})

onUnmounted(() => {
  if (process.client) {
    window.removeEventListener('scroll', handleScroll)
  }
})

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

function handleOverlayClick() {
  hideHeaderOverlay()
  desktopTabBarRef.value?.closeAllPopups()
  mobileTabBarRef.value?.closeAll()
}
</script>

<template>
  <header class="header z-[50] bg-white md:bg-blue-500 dark:bg-gray-900 relative border-b border-gray-200 dark:border-gray-800">
    <CommonHeaderTop :class="containerClass" />
    <div :class="containerClass">
      <CommonHeaderBottom />

      <!-- Десктопная версия (скрыта на мобильных) -->
      <div class="hidden lg:block py-2">
        <ClientOnly>
          <CommonAppTabBar ref="desktopTabBarRef" />
          <template #fallback>
            <div class="h-11 w-full bg-white/10 backdrop-blur-sm rounded-xl animate-pulse border border-white/10" />
          </template>
        </ClientOnly>
      </div>

      <!-- Мобильная версия с фиксацией при скролле -->
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-full"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-full"
      >
        <div
          v-if="isTabBarFixed"
          class="block lg:hidden py-3 fixed top-0 left-0 right-0 z-[51] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-md"
        >
          <div :class="containerClass">
            <ClientOnly>
              <CommonAppTabBarMobile ref="mobileTabBarRef" />
              <template #fallback>
                <div class="h-10 w-full bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse" />
              </template>
            </ClientOnly>
          </div>
        </div>
      </Transition>

      <!-- Обычная версия (не фиксированная) -->
      <div v-if="!isTabBarFixed" class="block lg:hidden py-3">
        <ClientOnly>
          <CommonAppTabBarMobile ref="mobileTabBarRef" />
          <template #fallback>
            <div class="h-10 w-full bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse" />
          </template>
        </ClientOnly>
      </div>
    </div>
  </header>

  <!-- Оверлей -->
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
      class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 will-change-[opacity]"
      @click="handleOverlayClick"
    />
  </Transition>
</template>

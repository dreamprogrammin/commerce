<script setup lang="ts">
import type { HeaderOverlay } from '@/types/app'
import { carouselContainerVariants } from '@/lib/variants'
import { HeaderOverlayKey } from '@/types/app'

const isHeaderOverlayVisible = ref(false)
const desktopTabBarRef = ref<{ closeAllPopups: () => void } | null>(null)
const mobileTabBarRef = ref<{ closeAll: () => void } | null>(null)

const containerClass = carouselContainerVariants({ contained: 'always' })

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
  <header class="header z-[50] bg-white dark:bg-gray-900 relative shadow-sm border-b border-gray-100 dark:border-gray-800/50">
    <CommonHeaderTop :class="containerClass" />
    <div :class="containerClass">
      <CommonHeaderBottom />

      <!-- Десктопная версия (скрыта на мобильных) -->
      <div class="hidden lg:block">
        <CommonAppTabBar ref="desktopTabBarRef" />
      </div>

      <!-- Мобильная версия (показывается только на мобильных) -->
      <div class="block lg:hidden py-3">
        <CommonAppTabBarMobile ref="mobileTabBarRef" />
      </div>
    </div>
  </header>

  <!-- Оверлей -->
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isHeaderOverlayVisible"
      class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[40]"
      @click="handleOverlayClick"
    />
  </Transition>
</template>

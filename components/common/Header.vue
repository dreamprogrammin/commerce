<script setup lang="ts">
import type { HeaderOverlay } from '@/types/app'
import { provide, readonly, ref } from 'vue'
import { carouselContainerVariants } from '@/lib/variants'
import { HeaderOverlayKey } from '@/types/app'

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

function handleOverlayClick() {
  hideHeaderOverlay()
  desktopTabBarRef.value?.closeAllPopups()
}
</script>

<template>
  <header class="relative z-50 bg-white md:bg-blue-500 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
    <CommonHeaderTop :class="containerClass" />
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

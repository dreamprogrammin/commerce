<script setup lang="ts">
import type { HeaderOverlay } from '@/types/app'
import { carouselContainerVariants } from '@/lib/variants'
import { HeaderOverlayKey } from '@/types/app'

const isHeaderOverlayVisible = ref(false)

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
}
</script>

<template>
  <header class="header z-[50] bg-amber-200 relative shadow-sm">
    <CommonHeaderTop :class="containerClass" />
    <div :class="containerClass">
      <CommonHeaderBottom />
      <CommonAppTabBar />
    </div>
  </header>
  <div
    v-if="isHeaderOverlayVisible"
    class="fixed inset-0 bg-black/50 z-[40] transition-opacity duration-200"
    @click="handleOverlayClick"
  />
</template>

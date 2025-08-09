<script setup lang="ts">
const isHeaderOverlayVisible = ref<boolean>(false)

function showHeaderOverlay(): void {
  isHeaderOverlayVisible.value = true
}

function hideHeaderOverlay(): void {
  isHeaderOverlayVisible.value = false
}

provide('headerOverlay', {
  showOverlay: showHeaderOverlay,
  hideOverlay: hideHeaderOverlay,
  isVisible: readonly(isHeaderOverlayVisible),
})

function handleOverlayClick() {
  hideHeaderOverlay()
}
</script>

<template>
  <header class="header z-[50] bg-amber-200 relative shadow-sm">
    <CommonHeaderTop />
    <div class="app-container">
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

<script setup lang="ts">
// Футер грузим лениво — он внизу страницы, не нужен при первом рендере
const LazyCommonFooter = defineAsyncComponent(() => import('@/components/common/Footer.vue'))
</script>

<template>
  <div class="flex flex-col" style="min-height: 100dvh">
    <!-- Header только на десктопе; не sticky — на этой странице "прилипает" только CategoryScrollBar -->
    <div class="hidden lg:block">
      <CommonSiteHeader :sticky="false" />
    </div>

    <!-- Мобильный тулбар — часть контента страницы (CategoryMobileHeader), не layout-chrome -->
    <main class="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <slot />
    </main>

    <!-- Footer — ленивый -->
    <LazyCommonFooter />
  </div>
</template>

<script setup lang="ts">
// Футер грузим лениво — он внизу страницы, не нужен при первом рендере
const LazyCommonFooter = defineAsyncComponent(() => import('@/components/common/Footer.vue'))
</script>

<template>
  <div class="flex flex-col" style="min-height: 100dvh">
    <!-- Header только на десктопе -->
    <div class="hidden lg:block">
      <CommonSiteHeader />
    </div>

    <!-- Таббар только на мобильных -->
    <div class="lg:hidden">
      <CommonAppTabBarMobile />
    </div>

    <!-- Резерв под нижнюю навигацию — в подвале (Footer.vue), а не здесь. -->
    <main
      class="flex-1 lg:pt-0 pt-[76px]"
    >
      <slot />
    </main>

    <!-- Footer — ленивый -->
    <LazyCommonFooter />
  </div>
</template>

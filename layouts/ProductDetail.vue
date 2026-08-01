<script setup lang="ts">
// Футер грузим лениво — он внизу страницы, не нужен при первом рендере
const LazyCommonFooter = defineAsyncComponent(() => import('@/components/common/Footer.vue'))
</script>

<template>
  <div class="flex flex-col bg-[var(--page-surface)]" style="min-height: 100dvh">
    <!-- Header только на десктопе -->
    <div class="hidden lg:block">
      <CommonSiteHeader />
    </div>

    <!--
      Мобильный тулбар — часть контента страницы (ProductMobileHeader),
      а не layout-chrome: он position:sticky, поэтому сам резервирует высоту
      в потоке и не требует ручного pt-* у <main>.
    -->
    <main class="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <slot />
    </main>

    <!-- Footer — ленивый -->
    <LazyCommonFooter />
  </div>
</template>

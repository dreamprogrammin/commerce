<script setup lang="ts">
// Layout специально для главной страницы
</script>

<template>
  <div class="flex flex-col" style="min-height: 100dvh;">
    <!-- Header только на десктопе -->
    <div class="hidden lg:block">
      <CommonHeader />
    </div>

    <!-- Мобильная версия с mobile header -->
    <div class="lg:hidden">
      <!-- Mobile Header - статичный -->
      <CommonMobileHeader />
    </div>

    <!-- Main без padding-top, т.к. mobile header статичный -->
    <main class="flex-1  pt-[65px] lg:pt-0">
      <slot />
    </main>
  </div>
</template>

<template>
  <div class="flex flex-col" style="min-height: 100dvh;">
    <!-- Header только на десктопе -->
    <div class="hidden lg:block">
      <CommonHeader />
    </div>

    <!-- Таббар только на мобильных -->
    <div class="lg:hidden">
      <CommonAppTabBarMobile />
    </div>

    <main class="flex-1 lg:pt-0 pt-[76px]">
      <slot />
    </main>
  </div>
</template>

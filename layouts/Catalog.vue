<template>
  <div>
    <div class="hidden md:block">
      <CommonHeader />
    </div>
    <!-- Sticky таббар для мобильных -->
    <div class="lg:hidden sticky top-0 z-40">
      <CommonCatalogMobileHeader />
    </div>

    <!-- Добавляем отступ сверху чтобы контент не прятался под fixed header -->
    <main class="pt-[56px] lg:pt-0 lg:pb-0 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <slot />
    </main>
  </div>
</template>

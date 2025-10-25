<template>
  <CommonHeader />
  <main>
    <!-- 1. Контейнер, который будет ограничен (для большинства страниц) -->
    <div class="mx-auto">
      <slot />
    </div>

    <!-- 2. Секции, которые должны быть full-width (вы их будете вызывать напрямую) -->
  </main>
</template>

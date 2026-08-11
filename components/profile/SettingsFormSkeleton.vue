<script setup lang="ts">
/**
 * Скелетон формы настроек. Отдельным компонентом, потому что нужен в двух
 * местах сразу — в ветке загрузки и в #fallback у <ClientOnly>, — а раньше
 * эти две разметки были скопированы и успели разъехаться по высоте.
 * Высоты повторяют реальную форму, чтобы карточка не прыгала.
 */
</script>

<template>
  <div class="animate-pulse">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="h-[74px] rounded-[13px] bg-muted" />
      <div class="h-[74px] rounded-[13px] bg-muted" />
    </div>
    <div class="mt-4 h-[74px] rounded-[13px] bg-muted" />
    <div class="mt-4 h-[74px] rounded-[13px] bg-muted" />
    <div class="mt-6 h-12 w-56 rounded-full bg-muted" />
  </div>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <!--
    Сетка повторяет структуру ProductGrid.vue.
    На мобильных будет 2 колонки, на sm - 3, и т.д.
  -->
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
    <!-- Рендерим 10 карточек-заглушек для хорошего заполнения -->
    <div v-for="n in 10" :key="n" class="border rounded-lg overflow-hidden bg-card flex flex-col">
      <!-- Скелетон для изображения (квадратный) -->
      <Skeleton class="aspect-square w-full" />

      <!-- Скелетон для контента под картинкой -->
      <div class="p-4 space-y-3 flex-grow flex flex-col">
        <Skeleton class="h-5 w-3/4" /> <!-- Для названия -->
        <div class="flex items-baseline justify-between">
          <Skeleton class="h-6 w-1/3" /> <!-- Для цены -->
          <Skeleton class="h-4 w-1/4" /> <!-- Для бонусов -->
        </div>
        <!-- Скелетон для кнопки/счетчика -->
        <div class="mt-auto pt-2">
          <Skeleton class="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>

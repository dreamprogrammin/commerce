<script setup lang="ts">
// Импортируем компонент-скелетон из нашей UI-библиотеки
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <!--
    Этот шаблон повторяет структуру твоей страницы товара (`pages/product/[slug].vue`),
    но вместо реальных данных мы используем "кости" (скелетоны).
  -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
    <!-- Левая колонка: скелетон для главного изображения -->
    <div>
      <Skeleton class="aspect-square w-full rounded-lg" />
      <!--
        Здесь можно добавить скелетоны для галереи миниатюр,
        если она планируется в будущем.
      -->
      <div class="mt-4 grid grid-cols-5 gap-4">
        <Skeleton v-for="n in 4" :key="n" class="aspect-square w-full rounded-md" />
      </div>
    </div>

    <!-- Правая колонка: скелетоны для информации о товаре -->
    <div class="space-y-6">
      <!-- Скелетон для "хлебных крошек" и заголовка -->
      <div class="space-y-2">
        <Skeleton class="h-4 w-1/4" />
        <Skeleton class="h-10 w-3/4" />
      </div>

      <!-- Скелетон для цены -->
      <Skeleton class="h-12 w-1/3" />

      <!-- Скелетон для описания -->
      <div class="space-y-2">
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-5/6" />
      </div>

      <!-- Скелетон для блока с бонусами -->
      <Skeleton class="h-14 w-full rounded-lg" />

      <!-- Скелетон для инпута количества и кнопки -->
      <div class="flex items-center gap-4 pt-4">
        <Skeleton class="h-12 w-24" />
        <Skeleton class="h-12 flex-grow" />
      </div>
    </div>
  </div>
</template>

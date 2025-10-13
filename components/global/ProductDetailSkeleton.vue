<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div>
    <!-- Скелетон для хлебных крошек -->
    <Skeleton class="h-6 w-1/2 mb-6" />

    <!-- Основная сетка страницы -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
      <!-- Левая колонка: скелетон для галереи -->
      <div class="lg:col-span-8">
        <ProductCarouselSkeleton />
      </div>

      <!-- Правая колонка: скелетоны для информации о товаре -->
      <div class="lg:col-span-4 space-y-6">
        <!-- ... (весь остальной код для правой колонки остается БЕЗ ИЗМЕНЕНИЙ) ... -->
        <Skeleton class="h-5 w-1/-4" />
        <Skeleton class="h-10 w-3/4" />
        <Skeleton class="h-12 w-1/3" />
        <div class="space-y-2 pt-4">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-5/6" />
        </div>
        <div class="space-y-3 pt-4 border-t">
          <Skeleton class="h-5 w-1/2" />
          <Skeleton class="h-14 w-full rounded-lg" />
          <Skeleton class="h-14 w-full rounded-lg" />
        </div>
        <div class="flex justify-between items-baseline pt-4 border-t">
          <Skeleton class="h-6 w-1/3" />
          <Skeleton class="h-10 w-1/2" />
        </div>
        <Skeleton class="h-14 w-full rounded-lg" />
        <div class="pt-4">
          <Skeleton class="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>

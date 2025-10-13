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
        <!--
          Используем `flex`, чтобы имитировать структуру ProductGallery.
          `h-[600px]` задает ту же фиксированную высоту.
        -->
        <div class="flex flex-row gap-4 h-[600px]">
          <!-- Скелетоны для ВЕРТИКАЛЬНЫХ миниатюр -->
          <div class="hidden md:flex flex-col gap-4 w-24 flex-shrink-0">
            <Skeleton v-for="n in 4" :key="n" class="aspect-square w-full rounded-lg" />
          </div>

          <!-- Скелетон для основного изображения -->
          <div class="flex-1">
            <Skeleton class="h-full w-full rounded-lg" />
          </div>
        </div>
      </div>

      <!-- Правая колонка: скелетоны для информации о товаре -->
      <div class="lg:col-span-4 space-y-6">
        <Skeleton class="h-5 w-1/4" />
        <Skeleton class="h-10 w-3/4" />
        <Skeleton class="h-12 w-1/3" />
        <div class="space-y-2 pt-4">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-5/6" />
        </div>

        <!-- Скелетон для блока "С этим товаром покупают" -->
        <div class="space-y-3 pt-4 border-t">
          <Skeleton class="h-5 w-1/2" />
          <Skeleton class="h-14 w-full rounded-lg" />
          <Skeleton class="h-14 w-full rounded-lg" />
        </div>

        <!-- Скелетон для общей стоимости -->
        <div class="flex justify-between items-baseline pt-4 border-t">
          <Skeleton class="h-6 w-1/3" />
          <Skeleton class="h-10 w-1/2" />
        </div>

        <!-- Скелетон для блока с бонусами -->
        <Skeleton class="h-14 w-full rounded-lg" />

        <!-- Скелетон для счетчика/кнопки "в корзину" -->
        <div class="pt-4">
          <Skeleton class="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <!--
    Основной контейнер-сетка, в точности повторяющий `ProductGallery.vue`.
    `h-[600px]` задает ту же высоту, что и в реальном компоненте.
  -->
  <div class="grid grid-cols-12 gap-4 h-[600px]">
    <!-- 1. Скелетон для колонки с миниатюрами -->
    <div class="hidden md:block col-span-2">
      <!--
        Используем `flex` для вертикального расположения с отступами,
        чтобы имитировать `pt-2` на `CarouselItem`.
      -->
      <div class="flex flex-col gap-2 h-full">
        <!--
          Рендерим 4 скелетона, так как `basis-1/4` показывает 4 элемента.
          `h-1/4` и `pb-2` имитируют `basis-1/4` и `pt-2`.
        -->
        <div v-for="n in 4" :key="n" class="h-1/4 pb-2">
          <Skeleton class="aspect-square w-full h-full rounded-lg" />
        </div>
      </div>
    </div>

    <!-- 2. Скелетон для колонки с основным изображением -->
    <div class="col-span-12 md:col-span-10">
      <Skeleton class="h-full w-full rounded-lg" />
    </div>
  </div>
</template>

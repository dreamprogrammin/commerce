<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="overflow-hidden">
    <!--
      Используем `flex`, чтобы имитировать поведение карусели.
      `pl-*` имитируют отступы контейнера.
    -->
    <div class="flex -ml-4 pl-4 sm:pl-6 lg:pl-12">
      <!-- Рендерим 6 карточек-заглушек, чтобы заполнить даже большие экраны -->
      <div
        v-for="n in 6"
        :key="n"
        class="pl-4 shrink-0
               basis-[52.63%]
               sm:basis-[45%]
               md:basis-[30%]
               lg:basis-[22%]
               xl:basis-[18%]"
      >
        <!-- Внутренняя структура карточки - такая же, как в ProductGridSkeleton -->
        <div class="border rounded-lg overflow-hidden bg-card flex flex-col">
          <Skeleton class="aspect-square w-full" />
          <div class="p-4 space-y-3 flex-grow flex flex-col">
            <Skeleton class="h-5 w-3/4" />
            <div class="flex items-baseline justify-between">
              <Skeleton class="h-6 w-1/3" />
              <Skeleton class="h-4 w-1/4" />
            </div>
            <div class="mt-auto pt-2">
              <Skeleton class="h-10 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

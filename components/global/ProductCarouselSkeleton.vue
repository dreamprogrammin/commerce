<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="overflow-hidden">
    <!--
      Геометрия ленты обязана 1-в-1 повторять ProductCarousel.vue
      (padding, отрицательный margin и basis у слайдов), иначе при переходе
      skeleton → карусель карточки прыгают по горизонтали. Боковой отступ —
      здесь, а не на обёртке: обёртка = окно прокрутки, оно full-bleed.
    -->
    <div class="flex pl-[var(--page-gutter)] lg:pl-0 -ml-3 md:-ml-1 -mr-1">
      <!-- Рендерим 6 карточек-заглушек, чтобы заполнить даже большие экраны -->
      <div
        v-for="n in 6"
        :key="n"
        class="pl-2 md:pl-0 shrink-0
               basis-[52.63%]
               sm:basis-[45%]
               md:basis-[30%]
               lg:basis-[22%]
               xl:basis-[18%]"
      >
        <div class="p-1 h-full">
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
  </div>
</template>

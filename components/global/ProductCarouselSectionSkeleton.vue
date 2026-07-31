<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { carouselContainerVariants, sectionSpacingVariants } from '@/lib/variants'

/**
 * Скелетон ЦЕЛОЙ секции с каруселью товаров (отступы + заголовок + лента).
 *
 * Существует ровно для того, чтобы «пустое» состояние совпадало с готовой
 * секцией по всем трём осям:
 *   • вертикальные отступы — py-4 (обёртка ProductsCarousel) + py-8 (ProductCarousel);
 *   • ширина заголовка — контейнер 'always';
 *   • геометрия ленты — контейнер 'desktop', а боковой отступ внутри
 *     ProductCarouselSkeleton, ровно как в ProductCarousel.
 * Иначе при переходе skeleton → карусель контент дёргается.
 *
 * title не передан (лента ещё не смонтирована и заголовок неизвестен) —
 * вместо <h2> рисуется серая плашка.
 */
defineProps<{
  title?: string
}>()

const headerContainerClass = carouselContainerVariants({ contained: 'always' })
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <div :class="sectionSpacingVariants({ size: 'xs' })">
    <div :class="sectionSpacingVariants({ size: 'sm' })">
      <div :class="headerContainerClass">
        <div class="flex justify-between items-center mb-8">
          <h2 v-if="title" class="text-xl md:text-3xl font-bold tracking-tight">
            {{ title }}
          </h2>
          <Skeleton v-else class="h-8 w-1/3 rounded-lg" />
        </div>
      </div>

      <div class="overflow-hidden">
        <div class="w-full" :class="carouselContainerClass">
          <ProductCarouselSkeleton />
        </div>
      </div>
    </div>
  </div>
</template>

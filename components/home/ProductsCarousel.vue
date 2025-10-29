<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { carouselContainerVariants } from '@/lib/variants'

const props = defineProps<{
  products: BaseProduct[] | null
  isLoading: boolean
  title: string
  seeAllLink: string
}>()

// Используем единый стиль контейнеров
const containerClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <section class="py-4">
    <!-- 1. Если идет загрузка, показываем скелетон -->
    <div v-if="isLoading" :class="containerClass">
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
        {{ props.title }}
      </h2>
      <ProductCarouselSkeleton />
    </div>

    <!-- 2. Если загрузка завершена И есть товары, показываем карусель -->
    <ProductCarousel v-else-if="products && products.length > 0" :products="products">
      <template #header>
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-2xl md:text-3xl font-bold tracking-tight">
            {{ props.title }}
          </h2>
          <Button v-if="products.length > 4" as-child variant="link">
            <NuxtLink :to="props.seeAllLink">
              Смотреть все &rarr;
            </NuxtLink>
          </Button>
        </div>
      </template>
    </ProductCarousel>

    <!-- 3. Если загрузка завершена, но товаров нет, НЕ показываем ничего -->
  </section>
</template>

<script setup lang="ts">
import type { ProductRow } from '@/types'

defineProps<{
  products: ProductRow[]
  isLoading: boolean
}>()
</script>

<template>
  <div class="container py-8 md:py-12">
    <div class="flex justify-between mb-8 items-center">
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
        Популярные товары
      </h2>

      <Button v-if="products && products.length > 4" as-child variant="link">
        <NuxtLink to="/catalog/all?sort_by=popularity">
          Смотреть все &rarr;
        </NuxtLink>
      </Button>
    </div>
    <HomeProductCarouselSkeleton v-if="isLoading" />

    <ProductCarousel :products="products" title="Популярные товары" />
  </div>
</template>

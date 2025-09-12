<script setup lang="ts">
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productsStore = useProductsStore()

const { data: products, pending: isLoading } = useAsyncData(
  'newest-products',
  () => productsStore.fetchNewestProducts(10),
  { lazy: true, default: () => [] },
)
</script>

<template>
  <div v-if="isLoading || (products && products.length > 0)" class="container py-8 md:py-12">
    <div class="flex justify-between items-center mb-8">
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
        Новые поступления
      </h2>

      <Button v-if="products && products.length > 4" as-child variant="link">
        <NuxtLink to="/catalog/all?sort_by=newest">
          Смотреть все &rarr;
        </NuxtLink>
      </Button>
    </div>

    <HomeProductCarouselSkeleton v-if="isLoading" />

    <ProductCarousel v-else :products="products!" title="Новые поступления" />
  </div>
</template>

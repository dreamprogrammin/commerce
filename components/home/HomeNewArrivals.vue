<script setup lang="ts">
import { useProductsStore } from '@/stores/publicStore/productsStore'
import ProductCarouselSkeleton from './ProductCarouselSkeleton.vue'

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

    <HoneProductCarouselSkeleton v-if="isLoading" />

    <Carousel
      v-else-if="products && products.length > 0"
      class="w-full"
      :opts="{ align: 'start', loop: products.length > 4 }"
    >
      <CarouselContent class="-ml-4">
        <CarouselItem
          v-for="product in products"
          :key="product.id"
          class="pl-4 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
        >
          <div class="p-1 h-full">
            <ProductCard :product="product" class="h-full" />
          </div>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious class="hidden sm:inline-flex" />
      <CarouselNext class="hidden sm:inline-flex" />
    </Carousel>
  </div>
</template>

<script setup lang="ts">
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()

const { data: products, pending: isLoading } = useAsyncData(
  'popular-categories',
  () => productStore.fetchPopularProducts(10),
  { lazy: true, default: () => [] },
)
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
    <homeProductCarouselSkeleton v-if="isLoading" />
    <Carousel v-else-if="products && products.length > 0">
      <CarouselContent>
        <CarouselItem v-for="product in products" :key="product.id" class="md:basis-1/3 lg:basis-1/4">
          <div class="p-1">
            <ProductCard :product="product" />
          </div>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
</template>

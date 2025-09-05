<script setup lang="ts">
import ProductCard from '@/components/global/ProductCard.vue' // Переиспользуем нашу карточку!
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'

const recommendationsStore = useRecommendationsStore()

const { data: products, pending: isLoading } = useAsyncData(
  'recommended-products',
  async () => {
    await recommendationsStore.fetchRecommendations()
    return recommendationsStore.recommendedProducts
  },
  { lazy: true, default: () => [] },
)
</script>

<template>
  <div class="container py-8 md:py-12">
    <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
      Вам может понравиться
    </h2>
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

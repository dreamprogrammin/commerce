<script setup lang="ts">
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'

const props = defineProps<{
  type: 'popular' | 'newest' | 'recommended'
  title: string
}>()

const productsStore = useProductsStore()
const recommendationsStore = useRecommendationsStore()

const { data: products, pending: isLoading } = useAsyncData(
  `home-products-${props.type}`, // Ключ кэша зависит от типа
  () => {
    switch (props.type) {
      case 'popular':
        return productsStore.fetchPopularProducts(10)
      case 'newest':
        return productsStore.fetchNewestProducts(10)
      case 'recommended':
        return recommendationsStore.fetchRecommendations()
    }
  },
  { lazy: true, default: () => [] },
)

const seeAllLink = computed(() => {
  switch (props.type) {
    case 'popular':
      return '/catalog/all?sort_by=popularity'
    case 'newest':
      return '/catalog/all?sort_by=newest'
    case 'recommended':
      return '/catalog/all?recommended=true' // Пример
    default:
      return '/catalog/all'
  }
})
</script>

<template>
  <div v-if="isLoading || (products && products.length > 0)">
    <ProductCarouselSkeleton v-if="isLoading" />

    <ProductCarousel v-else-if="products && products.length > 0" :products="products">
      <template #header>
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-2xl md:text-3xl font-bold tracking-tight">
            {{ props.title }}
          </h2>
          <Button v-if="products && products.length > 4" as-child variant="link">
            <NuxtLink :to="seeAllLink">
              Смотреть все &rarr;
            </NuxtLink>
          </Button>
        </div>
      </template>
    </ProductCarousel>
  </div>
</template>

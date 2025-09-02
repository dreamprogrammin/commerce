<script setup lang="ts">
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()

const { data: product, pending: isLoading } = useAsyncData(
  'featured-data',
  () => productStore.fetchFeaturedProduct(),
  { lazy: true },
)
</script>

<template>
  <div class="min-h-[420px]">
    <Card v-if="isLoading" class="h-full flex flex-col" />
  </div>
</template>

<style scoped>

</style>

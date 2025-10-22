<script setup lang="ts">
import type { BaseProduct } from '@/types'

defineProps<{
  products: BaseProduct[]
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    <ProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
    />
  </div>
</template>

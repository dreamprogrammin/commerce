<script setup lang="ts">
import type { BaseProduct } from '@/types'

defineProps<{
  products: BaseProduct[]
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
    <ProductCard
      v-for="(product, index) in products"
      :key="product.id"
      :product="product"
      :position="index"
    />
  </div>
</template>

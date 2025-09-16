<script setup lang="ts">
import type { ProductWithGallery } from '@/types'

defineProps<{
  products: ProductWithGallery[]
  title?: string
}>()
</script>

<template>
  <section v-if="products && products.length > 0" class="container py-8 md:py-12">
    <slot name="header" />

    <Carousel
      class="w-full"
      :opts="{
        align: 'start',
        loop: products.length > 4,
      }"
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
  </section>
</template>

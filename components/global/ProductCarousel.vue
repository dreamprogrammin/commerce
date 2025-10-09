<script setup lang="ts">
import type { ProductWithGallery } from '@/types'

defineProps<{
  products: ProductWithGallery[]
  title?: string
}>()
</script>

<template>
  <section v-if="products && products.length > 0" class="container py-8 md:py-12">
    <div class="container">
      <slot name="header" />
    </div>

    <Carousel
      class="w-full"
      :opts="{
        loop: products.length > 5,
      }"
    >
      <CarouselContent class="-ml-4">
        <CarouselItem
          v-for="product in products"
          :key="product.id"
          class="pl-4 w-[45%] sm:w-[30%] md:w-[22%] lg:w-[18%]"
        >
          <div class="p-1 h-full">
            <ProductCard :product="product" class="h-full" />
          </div>
        </CarouselItem>
      </CarouselContent>
      <!-- <CarouselPrevious class="hidden sm:inline-flex" />
      <CarouselNext class="hidden sm:inline-flex" /> -->
    </Carousel>
  </section>
</template>

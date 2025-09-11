<script setup lang="ts">
import type { ProductRow } from '@/types'

const props = defineProps<{
  products: ProductRow[]
  title?: string
}>()
</script>

<template>
  <!-- Мы рендерим секцию, только если есть товары для отображения -->
  <section v-if="products && products.length > 0" class="container py-8 md:py-12">
    <!-- Если передан заголовок, показываем его -->
    <div v-if="props.title" class="flex justify-between items-center mb-8">
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight">
        {{ props.title }}
      </h2>
      <!--
        Здесь можно будет добавить ссылку "Смотреть все",
        передавая ее через props, если понадобится.
      -->
    </div>

    <Carousel
      class="w-full"
      :opts="{
        align: 'start',
        // Зацикливаем карусель, только если товаров больше, чем помещается на экране
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
            <!-- Переиспользуем нашу карточку товара -->
            <ProductCard :product="product" class="h-full" />
          </div>
        </CarouselItem>
      </CarouselContent>
      <CarouselPrevious class="hidden sm:inline-flex" />
      <CarouselNext class="hidden sm:inline-flex" />
    </Carousel>
  </section>
</template>

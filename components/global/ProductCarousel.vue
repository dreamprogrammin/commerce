<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { useMediaQuery } from '@vueuse/core'

defineProps<{
  products: BaseProduct[] | null
  title?: string
}>()

const isDesktop = useMediaQuery('(min-width: 1024px)')
</script>

<template>
  <section v-if="products && products.length > 0" class="py-8 md:py-12">
    <!-- `container` нужен только для заголовка -->
    <div class="app-container">
      <slot name="header" />
    </div>

    <!--
      Обертка `overflow-hidden` важна, чтобы спрятать горизонтальный скроллбар,
      который может появиться из-за отрицательного margin.
    -->
    <div class="overflow-hidden">
      <div
        class="
          pl-0 sm:pl-6 lg:pl-8
          -mr-2 sm:-mr-6 lg:mx-auto
        "
        :class="{ container: isDesktop }"
      >
        <Carousel
          class="w-full"
          :opts="{
            align: 'start',
          }"
        >
          <!--
          `pl-4 sm:pl-6 lg:pl-8` - этот padding должен соответствовать padding'у вашего .container,
          чтобы первый элемент был выровнен по левому краю.
          `-ml-4` компенсирует `pl-4` на `CarouselItem`.
        -->
          <CarouselContent class="-ml-1">
            <CarouselItem
              v-for="product in products"
              :key="product.id"
              class="pl-4
                   basis-[52.63%]
                   sm:basis-[45%]
                   md:basis-[30%]
                   lg:basis-[22%]
                   xl:basis-[18%]"
            >
              <div class="p-1 h-full">
                <ProductCard :product="product" class="h-full" />
              </div>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  </section>
</template>

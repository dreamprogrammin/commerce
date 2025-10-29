<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { carouselContainerVariants } from '@/lib/variants'

defineProps<{
  products: BaseProduct[] | null
  title?: string
}>()

const headerContainerClass = carouselContainerVariants({ contained: 'always' })
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <section v-if="products && products.length > 0" class="py-8 md:py-12">
    <!-- `container` нужен только для заголовка -->
    <div :class="headerContainerClass">
      <slot name="header" />
    </div>

    <!--
      Обертка `overflow-hidden` важна, чтобы спрятать горизонтальный скроллбар,
      который может появиться из-за отрицательного margin.
    -->
    <div class="overflow-hidden">
      <div
        class="
          pl-0 -mr-2 sm:-mr-6 lg:mx-auto
        "
      >
        <Carousel
          class="w-full"
          :class="carouselContainerClass"
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
              class="pl-4 md:pl-0
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

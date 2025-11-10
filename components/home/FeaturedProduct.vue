<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()
const { getImageUrl } = useSupabaseStorage()

const { data: products, pending: isLoading } = useAsyncData(
  'featured-products',
  () => productStore.fetchFeaturedProducts(),
  { lazy: true },
)

const currentSlide = ref(0)
const emblaApi = ref<any>(null)

function onCarouselInit(api: any) {
  emblaApi.value = api
  if (api) {
    currentSlide.value = api.selectedScrollSnap()
    api.on('select', () => {
      currentSlide.value = api.selectedScrollSnap()
    })
  }
}

const productsList = computed(() => {
  if (!products.value)
    return []
  return Array.isArray(products.value) ? products.value : [products.value]
})

function getProductImageUrl(imageUrl: string) {
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, {
    width: 400,
    height: 400,
    quality: 90,
    format: 'webp',
    resize: 'contain',
  })
}

function getMainImageUrl(product: any) {
  if (product?.product_images?.length > 0) {
    return getProductImageUrl(product.product_images[0]?.image_url)
  }
  return null
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'KZT',
    minimumFractionDigits: 0,
  }).format(price)
}

function calculateDiscount(price: number, discount: number) {
  return price * (1 - discount / 100)
}
</script>

<template>
  <div class="relative">
    <!-- Loading State -->
    <div v-if="isLoading" class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6">
      <div class="flex items-start justify-between mb-4">
        <Skeleton class="h-6 w-24" />
        <Skeleton class="h-12 w-12 rounded-xl" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton class="aspect-square rounded-xl" />
        <div class="space-y-3">
          <Skeleton class="h-5 w-3/4" />
          <Skeleton class="h-12 w-full rounded-xl" />
          <Skeleton class="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>

    <!-- Products Carousel -->
    <div
      v-else-if="productsList.length > 0"
      class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow duration-300"
    >
      <Carousel
        class="w-full"
        :opts="{
          align: 'center',
          loop: true,
        }"
        @init-api="onCarouselInit"
      >
        <CarouselContent>
          <CarouselItem
            v-for="product in productsList"
            :key="product.id"
          >
            <div class="p-6">
              <!-- Header -->
              <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-2">
                  <div class="w-10 h-10 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center">
                    <Icon name="lucide:flame" class="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                      Товар дня
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      Специальная цена
                    </p>
                  </div>
                </div>

                <!-- Timer -->
                <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <Icon name="lucide:timer" class="w-4 h-4 text-blue-500" />
                  <span class="text-sm font-bold text-gray-900 dark:text-white">23:59</span>
                </div>
              </div>

              <!-- Main Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Product Image -->
                <NuxtLink
                  :to="`/catalog/products/${product.slug}`"
                  class="block group relative"
                >
                  <div class="relative aspect-square bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group-hover:shadow-md transition-all duration-300">
                    <!-- Badges -->
                    <div class="absolute top-3 left-3 z-10 flex gap-2">
                      <div v-if="product.discount_percentage > 0" class="bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-bold">
                        -{{ product.discount_percentage }}%
                      </div>
                      <div class="bg-blue-500 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                        <Icon name="lucide:gift" class="w-3 h-3" />
                        +{{ product.bonus_points_award }}
                      </div>
                    </div>

                    <img
                      v-if="getMainImageUrl(product)"
                      :src="getMainImageUrl(product) || undefined"
                      :alt="product.name"
                      class="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    >
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <Icon name="lucide:image-off" class="w-12 h-12 text-gray-400" />
                    </div>
                  </div>
                </NuxtLink>

                <!-- Product Info -->
                <div class="flex flex-col justify-between space-y-4">
                  <div class="space-y-3">
                    <!-- Category -->
                    <div v-if="product.categories" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300">
                      <Icon name="lucide:tag" class="w-3 h-3" />
                      {{ product.categories.name }}
                    </div>

                    <!-- Name -->
                    <NuxtLink :to="`/catalog/products/${product.slug}`" class="block group">
                      <h4 class="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                        {{ product.name }}
                      </h4>
                    </NuxtLink>

                    <!-- Price -->
                    <div class="space-y-2">
                      <div v-if="product.discount_percentage > 0" class="flex items-center gap-2">
                        <span class="text-lg text-gray-400 line-through">
                          {{ formatPrice(product.price) }}
                        </span>
                        <span class="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded font-medium">
                          -{{ product.discount_percentage }}%
                        </span>
                      </div>
                      <div class="text-3xl font-black text-gray-900 dark:text-white">
                        {{ formatPrice(product.discount_percentage > 0 ? calculateDiscount(product.price, product.discount_percentage) : product.price) }}
                      </div>
                      <div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <Icon name="lucide:coins" class="w-4 h-4 text-blue-500" />
                        <span>Кешбэк <strong class="text-blue-600 dark:text-blue-400">{{ product.bonus_points_award }} ₸</strong></span>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="space-y-2">
                    <Button
                      as-child
                      class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-11"
                    >
                      <NuxtLink :to="`/catalog/products/${product.slug}`">
                        <Icon name="lucide:shopping-cart" class="w-4 h-4 mr-2" />
                        Купить
                      </NuxtLink>
                    </Button>
                    <div class="grid grid-cols-2 gap-2">
                      <Button variant="outline" class="rounded-xl">
                        <Icon name="lucide:heart" class="w-4 h-4" />
                      </Button>
                      <Button as-child variant="outline" class="rounded-xl">
                        <NuxtLink :to="`/catalog/products/${product.slug}`">
                          Подробнее
                        </NuxtLink>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CarouselItem>
        </CarouselContent>

        <!-- Navigation -->
        <div v-if="productsList.length > 1" class="flex items-center justify-center gap-3 pb-4">
          <CarouselPrevious class="relative translate-y-0 h-8 w-8 rounded-lg" />
          <div class="flex gap-1.5">
            <button
              v-for="(_, index) in productsList"
              :key="index"
              class="h-1.5 rounded-full transition-all duration-300"
              :class="currentSlide === index ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-300 dark:bg-gray-600'"
              @click="emblaApi?.scrollTo(index)"
            />
          </div>
          <CarouselNext class="relative translate-y-0 h-8 w-8 rounded-lg" />
        </div>
      </Carousel>
    </div>

    <!-- Empty State -->
    <div v-else class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 p-12">
      <div class="flex flex-col items-center justify-center text-center space-y-4">
        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
          <Icon name="lucide:gift" class="w-8 h-8 text-gray-400" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">
            Готовим предложение
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Скоро появится товар с максимальным кешбэком
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

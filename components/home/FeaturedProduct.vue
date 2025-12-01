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
    <div v-if="isLoading" class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 sm:p-6">
      <div class="flex items-start justify-between mb-3 sm:mb-4">
        <Skeleton class="h-5 sm:h-6 w-20 sm:w-24" />
        <Skeleton class="h-10 sm:h-12 w-10 sm:w-12 rounded-xl" />
      </div>
      <div class="space-y-3">
        <Skeleton class="aspect-square rounded-xl" />
        <Skeleton class="h-4 sm:h-5 w-3/4" />
        <Skeleton class="h-10 sm:h-12 w-full rounded-xl" />
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
            <div class="p-3 sm:p-6">
              <!-- Header -->
              <div class="flex items-center justify-between mb-3 sm:mb-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 dark:bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <Icon name="lucide:flame" class="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">
                      Товар дня
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                      Специальная цена
                    </p>
                  </div>
                </div>

                <!-- Timer -->
                <div class="flex items-center gap-1 sm:gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2 border border-gray-200 dark:border-gray-700">
                  <Icon name="lucide:timer" class="w-3 sm:w-4 h-3 sm:h-4 text-blue-500" />
                  <span class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">23:59</span>
                </div>
              </div>

              <!-- Main Content - Mobile First Layout -->
              <div class="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                <!-- Product Image -->
                <NuxtLink
                  :to="`/catalog/products/${product.slug}`"
                  class="block group relative"
                >
                  <div class="relative w-full max-w-xs mx-auto sm:max-w-none aspect-square bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group-hover:shadow-md transition-all duration-300">
                    <!-- Badges -->
                    <div class="absolute top-2 sm:top-3 left-2 sm:left-3 z-10 flex gap-1.5 sm:gap-2">
                      <div v-if="product.discount_percentage > 0" class="bg-red-500 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-bold">
                        -{{ product.discount_percentage }}%
                      </div>
                      <div class="bg-blue-500 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-bold flex items-center gap-0.5 sm:gap-1">
                        <Icon name="lucide:gift" class="w-2.5 sm:w-3 h-2.5 sm:h-3" />
                        +{{ product.bonus_points_award }}
                      </div>
                    </div>

                    <img
                      v-if="getMainImageUrl(product)"
                      :src="getMainImageUrl(product) || undefined"
                      :alt="product.name"
                      class="w-full h-full object-contain p-4 sm:p-6 group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    >
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <Icon name="lucide:image-off" class="w-10 sm:w-12 h-10 sm:h-12 text-gray-400" />
                    </div>
                  </div>
                </NuxtLink>

                <!-- Product Info -->
                <div class="flex flex-col justify-between space-y-3 sm:space-y-4">
                  <div class="space-y-2 sm:space-y-3">
                    <!-- Category -->
                    <div v-if="product.categories" class="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300">
                      <Icon name="lucide:tag" class="w-3 h-3" />
                      {{ product.categories.name }}
                    </div>

                    <!-- Name -->
                    <NuxtLink :to="`/catalog/products/${product.slug}`" class="block group">
                      <h4 class="text-base sm:text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                        {{ product.name }}
                      </h4>
                    </NuxtLink>

                    <!-- Price -->
                    <div class="space-y-1 sm:space-y-2">
                      <div v-if="product.discount_percentage > 0" class="flex items-center gap-2">
                        <span class="text-base sm:text-lg text-gray-400 line-through">
                          {{ formatPrice(product.price) }}
                        </span>
                        <span class="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 sm:px-2 py-0.5 rounded font-medium">
                          -{{ product.discount_percentage }}%
                        </span>
                      </div>
                      <div class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                        {{ formatPrice(product.discount_percentage > 0 ? calculateDiscount(product.price, product.discount_percentage) : product.price) }}
                      </div>
                      <div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <Icon name="lucide:coins" class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-blue-500" />
                        <span>Кешбэк <strong class="text-blue-600 dark:text-blue-400">{{ product.bonus_points_award }} ₸</strong></span>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="space-y-1.5 sm:space-y-2">
                    <Button
                      as-child
                      class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 sm:h-11 text-sm"
                    >
                      <NuxtLink :to="`/catalog/products/${product.slug}`">
                        <Icon name="lucide:shopping-cart" class="w-3.5 sm:w-4 h-3.5 sm:h-4 mr-1.5 sm:mr-2" />
                        Купить
                      </NuxtLink>
                    </Button>
                    <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <div class="border rounded-xl h-9 text-xs flex justify-center">
                        <ProductWishlistButton :product-id="product.id" :product-name="product.name" />
                      </div>
                      <Button as-child variant="outline" class="rounded-xl h-9 text-xs">
                        <NuxtLink :to="`/catalog/products/${product.slug}`">
                          <span class="hidden sm:inline">Подробнее</span>
                          <Icon name="lucide:info" class="sm:hidden w-3.5 h-3.5" />
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
        <div v-if="productsList.length > 1" class="flex items-center justify-center gap-2 sm:gap-3 pb-3 sm:pb-4">
          <div class="flex gap-1 sm:gap-1.5">
            <button
              v-for="(_, index) in productsList"
              :key="index"
              class="h-1.5 rounded-full transition-all duration-300"
              :class="currentSlide === index ? 'w-5 sm:w-6 bg-blue-500' : 'w-1.5 bg-gray-300 dark:bg-gray-600'"
              @click="emblaApi?.scrollTo(index)"
            />
          </div>
        </div>
      </Carousel>
    </div>

    <!-- Empty State -->
    <div v-else class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 p-8 sm:p-12">
      <div class="flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4">
        <div class="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-800 rounded-xl sm:rounded-2xl flex items-center justify-center">
          <Icon name="lucide:gift" class="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">
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

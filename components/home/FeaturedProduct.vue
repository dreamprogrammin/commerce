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
    <div v-if="isLoading" class="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 shadow-sm">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Skeleton class="h-8 w-8 rounded-lg" />
            <Skeleton class="h-4 w-16" />
          </div>
          <Skeleton class="h-7 w-12 rounded-lg" />
        </div>
        <Skeleton class="aspect-square rounded-lg" />
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-6 w-24" />
        <Skeleton class="h-9 w-full rounded-lg" />
      </div>
    </div>

    <!-- Products Carousel -->
    <div
      v-else-if="productsList.length > 0"
      class="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow duration-300"
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
            <div class="p-3 sm:p-4">
              <!-- Header -->
              <div class="flex items-center justify-between mb-2 sm:mb-3">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <div class="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon name="lucide:flame" class="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                      Товар дня
                    </h3>
                  </div>
                </div>

                <!-- Timer -->
                <div class="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1 border border-red-200 dark:border-red-800 flex-shrink-0">
                  <Icon name="lucide:timer" class="w-3 h-3 text-red-600 dark:text-red-400" />
                  <span class="text-xs font-bold text-red-600 dark:text-red-400">23:59</span>
                </div>
              </div>

              <!-- Main Content -->
              <div class="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
                <!-- Product Image -->
                <NuxtLink
                  :to="`/catalog/products/${product.slug}`"
                  class="block group relative"
                >
                  <div class="relative w-full aspect-square bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group-hover:shadow-md transition-all duration-300">
                    <!-- Badges -->
                    <div class="absolute top-2 left-2 z-10 flex flex-col gap-1">
                      <div v-if="product.discount_percentage > 0" class="bg-red-500 text-white px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-0.5">
                        <Icon name="lucide:zap" class="w-2.5 h-2.5" />
                        -{{ product.discount_percentage }}%
                      </div>
                      <div class="bg-blue-500 text-white px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-0.5">
                        <Icon name="lucide:gift" class="w-2.5 h-2.5" />
                        +{{ product.bonus_points_award }}
                      </div>
                    </div>

                    <img
                      v-if="getMainImageUrl(product)"
                      :src="getMainImageUrl(product) || undefined"
                      :alt="product.name"
                      class="w-full h-full object-contain p-3 sm:p-4 group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    >
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <Icon name="lucide:image-off" class="w-8 h-8 text-gray-400" />
                    </div>
                  </div>
                </NuxtLink>

                <!-- Product Info -->
                <div class="flex flex-col space-y-2 min-h-[260px] sm:min-h-0">
                  <div class="space-y-1.5 flex-1">
                    <!-- Category -->
                    <div class="h-6">
                      <div v-if="product.categories" class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <Icon name="lucide:tag" class="w-2.5 h-2.5 text-blue-500" />
                        {{ product.categories.name }}
                      </div>
                    </div>

                    <!-- Name -->
                    <NuxtLink :to="`/catalog/products/${product.slug}`" class="block group">
                      <h4 class="text-sm sm:text-base font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight mb-2">
                        {{ product.name }}
                      </h4>
                    </NuxtLink>

                    <!-- Price -->
                    <div class="space-y-1">
                      <!-- Old Price -->
                      <div class="h-5 flex items-center">
                        <div v-if="product.discount_percentage > 0" class="flex items-center gap-1">
                          <span class="text-xs text-gray-400 line-through">
                            {{ formatPrice(product.price) }}
                          </span>
                          <span class="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1 py-0.5 rounded text-xs font-bold">
                            -{{ product.discount_percentage }}%
                          </span>
                        </div>
                      </div>

                      <!-- Current Price -->
                      <div class="h-8 flex items-center">
                        <span class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                          {{ formatPrice(product.discount_percentage > 0 ? calculateDiscount(product.price, product.discount_percentage) : product.price) }}
                        </span>
                      </div>

                      <!-- Cashback -->
                      <div class="flex items-center gap-1.5 p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 h-9">
                        <div class="w-6 h-6 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
                          <Icon name="lucide:coins" class="w-3 h-3 text-white" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-xs font-bold text-blue-600 dark:text-blue-400">
                            +{{ product.bonus_points_award }} ₸
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="space-y-1.5">
                    <Button
                      as-child
                      class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-sm font-bold shadow-sm"
                    >
                      <NuxtLink :to="`/catalog/products/${product.slug}`" class="flex items-center justify-center gap-1">
                        <Icon name="lucide:shopping-cart" class="w-3.5 h-3.5" />
                        Купить
                      </NuxtLink>
                    </Button>
                    <div class="grid grid-cols-2 gap-1.5">
                      <div class="border border-gray-300 dark:border-gray-700 rounded-lg h-9 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <ProductWishlistButton :product-id="product.id" :product-name="product.name" />
                      </div>
                      <Button
                        as-child
                        variant="outline"
                        class="rounded-lg h-9 text-xs font-semibold"
                      >
                        <NuxtLink :to="`/catalog/products/${product.slug}`" class="flex items-center justify-center gap-1">
                          <Icon name="lucide:info" class="w-3 h-3" />
                          <span class="hidden sm:inline">Еще</span>
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
        <div v-if="productsList.length > 1" class="flex items-center justify-center gap-2 pb-2">
          <div class="flex gap-1">
            <button
              v-for="(_, index) in productsList"
              :key="index"
              class="h-1 rounded-full transition-all duration-300"
              :class="currentSlide === index ? 'w-5 bg-primary' : 'w-1 bg-gray-300 dark:bg-gray-600'"
              @click="emblaApi?.scrollTo(index)"
            />
          </div>
        </div>
      </Carousel>
    </div>

    <!-- Empty State -->
    <div v-else class="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 p-6">
      <div class="flex flex-col items-center justify-center text-center space-y-2">
        <div class="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
          <Icon name="lucide:gift" class="w-6 h-6 text-gray-400" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
            Готовим предложение
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Скоро появится товар с выгодой
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.animate-bounce {
  animation: bounce 1.5s infinite;
}
</style>

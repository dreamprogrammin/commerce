<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()
const { getOptimizedUrl } = useSupabaseStorage()

const { data: products, pending: isLoading } = useAsyncData(
  'featured-products',
  () => productStore.fetchFeaturedProducts(), // Предполагаем массив товаров
  { lazy: true },
)

// Для одного товара - превращаем в массив
const productsList = computed(() => {
  if (!products.value)
    return []
  return Array.isArray(products.value) ? products.value : [products.value]
})

function getOptimizedImageUrl(imageUrl: string) {
  if (!imageUrl)
    return null
  return getOptimizedUrl(BUCKET_NAME_PRODUCT, imageUrl, {
    width: 500,
    height: 500,
    quality: 90,
    format: 'webp',
    resize: 'contain',
  })
}

function getMainImageUrl(product: any) {
  if (product?.product_images?.length > 0) {
    return getOptimizedImageUrl(product.product_images[0]?.image_url)
  }
  return null
}
</script>

<template>
  <div class="min-h-[450px] relative">
    <!-- Loading State -->
    <Card v-if="isLoading" class="h-full overflow-hidden border-2">
      <div class="relative h-full">
        <div class="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20" />

        <div class="relative flex flex-col h-full">
          <CardHeader class="text-center pb-4">
            <Skeleton class="h-8 w-48 mx-auto" />
            <Skeleton class="h-4 w-32 mx-auto mt-2" />
          </CardHeader>

          <CardContent class="flex-grow flex items-center justify-center">
            <Skeleton class="w-64 h-64 rounded-2xl" />
          </CardContent>

          <CardFooter class="pt-4 pb-6 gap-3">
            <Skeleton class="h-12 flex-1" />
          </CardFooter>
        </div>
      </div>
    </Card>

    <!-- Products Carousel -->
    <Card
      v-else-if="productsList.length > 0"
      class="h-full overflow-hidden border-2 border-blue-200 dark:border-blue-800 hover:shadow-xl transition-shadow duration-300"
    >
      <div class="relative h-full">
        <!-- Gradient Background -->
        <div class="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20" />

        <!-- Decorative Elements -->
        <div class="absolute top-0 right-0 w-40 h-40 bg-blue-200/30 dark:bg-blue-800/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div class="absolute bottom-0 left-0 w-32 h-32 bg-purple-200/30 dark:bg-purple-800/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

        <!-- Star Decorations -->
        <div class="absolute top-4 left-6 z-10">
          <Icon name="lucide:sparkle" class="w-4 h-4 text-yellow-400/60 animate-pulse" />
        </div>
        <div class="absolute top-8 right-8 z-10">
          <Icon name="lucide:star" class="w-3 h-3 text-pink-400/60 animate-pulse" style="animation-delay: 0.5s" />
        </div>

        <!-- Content -->
        <div class="relative flex flex-col h-full">
          <CardHeader class="text-center pb-3">
            <div class="flex items-center justify-center gap-2 mb-1">
              <div class="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center">
                <Icon name="lucide:gift" class="w-5 h-5 text-white" />
              </div>
              <CardTitle class="text-xl font-bold text-gray-900 dark:text-gray-100">
                Товар дня 🎁
              </CardTitle>
            </div>
            <CardDescription class="text-sm">
              Максимальный кешбэк бонусами
            </CardDescription>
          </CardHeader>

          <CardContent class="flex-grow px-6">
            <!-- Carousel -->
            <Carousel
              class="w-full"
              :opts="{
                align: 'center',
                loop: true,
              }"
            >
              <CarouselContent>
                <CarouselItem
                  v-for="product in productsList"
                  :key="product.id"
                  class="flex flex-col items-center justify-center gap-6"
                >
                  <!-- Product Image -->
                  <NuxtLink
                    :to="`/catalog/products/${product.slug}`"
                    class="block group"
                  >
                    <div class="relative w-56 h-56 mx-auto bg-white dark:bg-gray-900/50 rounded-3xl overflow-hidden border-2 border-blue-100 dark:border-blue-900 shadow-lg group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <img
                        v-if="getMainImageUrl(product)"
                        :src="getMainImageUrl(product) || undefined"
                        :alt="product.name"
                        class="w-full h-full object-contain p-4"
                        loading="lazy"
                      >
                      <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Icon name="lucide:image-off" class="w-12 h-12" />
                      </div>

                      <!-- Hover Overlay -->
                      <div class="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </NuxtLink>

                  <!-- Product Info -->
                  <div class="text-center space-y-3">
                    <div>
                      <NuxtLink
                        :to="`/catalog/products/${product.slug}`"
                        class="text-xl font-bold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2"
                      >
                        {{ product.name }}
                      </NuxtLink>
                      <p v-if="product.categories" class="text-sm text-muted-foreground mt-1">
                        {{ product.categories.name }}
                      </p>
                    </div>

                    <!-- Bonus Badge -->
                    <div class="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full shadow-md">
                      <Icon name="lucide:coins" class="w-5 h-5 text-white" />
                      <span class="text-white font-bold text-lg">
                        +{{ product.bonus_points_award }} бонусов
                      </span>
                    </div>
                  </div>
                </CarouselItem>
              </CarouselContent>

              <!-- Navigation -->
              <div v-if="productsList.length > 1" class="flex items-center justify-center gap-4 mt-6">
                <CarouselPrevious class="relative static translate-y-0 h-9 w-9 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30" />
                <CarouselNext class="relative static translate-y-0 h-9 w-9 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30" />
              </div>
            </Carousel>
          </CardContent>

          <CardFooter class="flex-col gap-3 pt-4 pb-6 px-6">
            <!-- Main Button -->
            <Carousel
              class="w-full"
              :opts="{
                align: 'center',
                loop: true,
                watchDrag: false,
              }"
            >
              <CarouselContent>
                <CarouselItem
                  v-for="product in productsList"
                  :key="product.id"
                >
                  <Button as-child size="lg" class="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all">
                    <NuxtLink :to="`/catalog/products/${product.slug}`">
                      <Icon name="lucide:eye" class="w-4 h-4 mr-2" />
                      Смотреть товар
                    </NuxtLink>
                  </Button>
                </CarouselItem>
              </CarouselContent>
            </Carousel>
          </CardFooter>
        </div>
      </div>
    </Card>

    <!-- Empty State -->
    <Card v-else class="h-full flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700">
      <CardContent class="text-center py-12">
        <Icon name="lucide:package-search" class="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <p class="text-lg font-medium text-muted-foreground">
          Предложение дня скоро появится!
        </p>
        <p class="text-sm text-muted-foreground mt-2">
          Следите за обновлениями 🎁
        </p>
      </CardContent>
    </Card>
  </div>
</template>

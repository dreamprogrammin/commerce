<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()
const { getOptimizedUrl } = useSupabaseStorage()

const { data: product, pending: isLoading } = useAsyncData(
  'featured-data',
  () => productStore.fetchFeaturedProduct(),
  { lazy: true },
)

const mainImageUrl = computed(() => {
  if (product.value && product.value.product_images && product.value.product_images.length > 0) {
    return product.value.product_images[0]?.image_url
  }
  return null
})

// Используем getOptimizedUrl для главного изображения товара
const optimizedMainImageUrl = computed(() => {
  if (!mainImageUrl.value)
    return null

  return getOptimizedUrl(BUCKET_NAME_PRODUCT, mainImageUrl.value, {
    width: 400,
    height: 400,
    quality: 85,
    format: 'webp',
    resize: 'contain',
  })
})
</script>

<template>
  <div class="min-h-[420px]">
    <Card v-if="isLoading" class="h-full flex flex-col">
      <CardHeader>
        <Skeleton class="h-8 w-3/4" />
        <Skeleton class="h-4 w-1/2 mt-2" />
      </CardHeader>
      <CardContent>
        <Skeleton class="h-40 w-40 rounded-full" />
      </CardContent>
      <CardFooter>
        <Skeleton class="h-10 w-full" />
      </CardFooter>
    </Card>

    <Card v-else-if="product" class="h-full flex flex-col bg-gradient-to-br from-primary/5 via-background to-background dark:from-primary/10">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">
          Товар дня!
        </CardTitle>
        <CardDescription>Максимальный кешбэк бонусами</CardDescription>
      </CardHeader>

      <CardContent class="flex-grow flex flex-col items-center justify-center gap-4 text-center">
        <NuxtLink :to="`/catalog/products/${product.slug}`" class="block">
          <div class="w-48 h-48 bg-muted rounded-lg overflow-hidden border">
            <img
              v-if="optimizedMainImageUrl"
              :src="optimizedMainImageUrl"
              :alt="product.name"
              class="w-full h-full object-contain"
              loading="lazy"
            >
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
              Нет изображения
            </div>
          </div>
        </NuxtLink>
        <div>
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="text-lg font-semibold hover:text-primary transition-colors">
            {{ product.name }}
          </NuxtLink>
          <p v-if="product.categories" class="text-sm text-muted-foreground">
            {{ product.categories.name }}
          </p>
        </div>
        <Badge variant="destructive" class="text-base py-1 px-3 animate-pulse">
          + {{ product.bonus_points_award }} бонусов
        </Badge>
      </CardContent>

      <CardFooter>
        <Button as-child class="w-full" size="lg">
          <NuxtLink :to="`/catalog/products/${product.slug}`">
            Смотреть товар
          </NuxtLink>
        </Button>
      </CardFooter>
    </Card>

    <div v-else class="h-full flex items-center justify-center bg-muted/50 rounded-lg p-8 text-center">
      <p class="text-muted-foreground">
        Предложение дня скоро появится!
      </p>
    </div>
  </div>
</template>

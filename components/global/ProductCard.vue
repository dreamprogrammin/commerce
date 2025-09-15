<script setup lang="ts">
import type { ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: ProductWithGallery
}>()

const cartStore = useCartStore()
const { getPublicUrl } = useSupabaseStorage()

const hasImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 0)
const hasMultipleImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 1)

const mainImageUrl = computed(() => hasImages.value ? props.product.product_images[0]?.image_url : null)
</script>

<template>
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card flex flex-col h-full">
    <!-- Теперь в шаблоне мы обращаемся к товару через `props.product` -->
    <div class=" relative bg-muted aspect-square overflow-hidden">
      <Carousel v-if="hasMultipleImages" class="w-full h-full">
        <CarouselContent>
          <CarouselItem v-for="image in product.product_images" :key="image.id">
            <NuxtLink :to="`/catalog/products/${props.product.slug}`" class="block bg-muted aspect-square">
              <div class="aspect-square overflow-hidden">
                <NuxtImg
                  :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || ''"
                  :alt="`${product.name} - фото ${image.display_order + 1}`"
                  format="webp"
                  quality="80"
                  width="400"
                  height="400"
                  loading="lazy"
                  placeholder
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </NuxtLink>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious class="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-80 transition-opacity hover:!opacity-100" />
        <CarouselNext class="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-80 transition-opacity hover:!opacity-100" />
      </Carousel>

      <NuxtLink v-else :to="`/catalog/products/${product.slug}`" class="block h-full">
        <NuxtImg
          v-if="mainImageUrl"
          :src="getPublicUrl(BUCKET_NAME_PRODUCT, mainImageUrl) || ''"
          :alt="product.name"
          format="webp" quality="80" width="400" height="400"
          loading="lazy" placeholder
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
          <span>Нет фото</span>
        </div>
      </NuxtLink>
    </div>

    <div class="p-4 space-y-2 flex-grow flex flex-col">
      <h3 class="font-semibold truncate h-6">
        {{ product.name }}
      </h3>
      <div class="flex items-baseline justify-between">
        <p class="text-lg font-bold">
          {{ product.price }} ₸
        </p>
        <p v-if="product.bonus_points_award > 0" class="text-xs text-primary">
          +{{ product.bonus_points_award }} бонусов
        </p>
      </div>
      <!--
        И при клике мы тоже передаем `props.product`.
        Теперь `addItem` гарантированно получит правильный объект товара.
      -->
      <Button class="w-full" @click="cartStore.addItem(product)">
        В корзину
      </Button>
    </div>
  </div>
</template>

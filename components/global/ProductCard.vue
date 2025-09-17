<script setup lang="ts">
import type { ProductWithGallery } from '@/types' // Убедитесь, что этот тип импортирован и правильный
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'

// --- PROPS ---
const props = defineProps<{
  product: ProductWithGallery
}>()

// --- ИНИЦИАЛИЗАЦИЯ ---
const cartStore = useCartStore()
const { getPublicUrl } = useSupabaseStorage()

// --- COMPUTED-СВОЙСТВА ДЛЯ УПРАВЛЕНИЯ UI ---
const hasImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 0)
const hasMultipleImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 1)

// --- ЛОГИКА ДЛЯ СКРОЛЛА МЫШЬЮ ---
const activeImageIndex = ref(0)

const activeImageUrl = computed(() => {
  if (hasImages.value) {
    const imageUrl = props.product.product_images[activeImageIndex.value]?.image_url
    return getPublicUrl(BUCKET_NAME_PRODUCT, imageUrl || null)
  }
  return null
})

/**
 * Вызывается при движении мыши (`mousemove`) над изображением.
 */
function handleMouseMove(event: MouseEvent) {
  if (!hasMultipleImages.value)
    return

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width

  if (width === 0 || !props.product.product_images)
    return

  const segmentWidth = width / props.product.product_images.length
  const newIndex = Math.min(
    Math.floor(x / segmentWidth),
    props.product.product_images.length - 1,
  )

  if (newIndex !== activeImageIndex.value) {
    activeImageIndex.value = newIndex
  }
}

/**
 * Сбрасывает изображение на первое, когда мышь уходит (`mouseleave`).
 */
function handleMouseLeave() {
  activeImageIndex.value = 0
}
</script>

<template>
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card flex flex-col h-full">
    <div
      class="relative bg-muted aspect-square overflow-hidden"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
      <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full">
        <NuxtImg
          v-if="activeImageUrl"
          :key="activeImageUrl"
          :src="activeImageUrl"
          :alt="product.name"
          format="webp"
          quality="80"
          width="400"
          height="400"
          loading="lazy"
          placeholder
          class="w-full h-full object-cover transition-opacity duration-200"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
          <span>Нет фото</span>
        </div>
      </NuxtLink>

      <!-- Индикаторы-точки внизу -->
      <div
        v-if="hasMultipleImages"
        class="absolute bottom-2 left-0 right-0 h-4 flex justify-center items-center gap-2 pointer-events-none"
      >
        <div
          v-for="(image, index) in product.product_images" :key="image.id"
          class="w-2 h-2 rounded-full transition-all duration-200"
          :class="index === activeImageIndex ? 'bg-white scale-125 shadow-md' : 'bg-white/50'"
        />
      </div>
    </div>

    <!-- Блок с информацией о товаре -->
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
      <div class="mt-auto pt-2">
        <Button class="w-full" @click="cartStore.addItem(product, 1)">
          В корзину
        </Button>
      </div>
    </div>
  </div>
</template>

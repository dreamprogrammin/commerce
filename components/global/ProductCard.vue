<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { BaseProduct } from '@/types'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: BaseProduct
}>()

const cartStore = useCartStore()
const { getImageUrl } = useSupabaseStorage()

const isTouchDevice = ref(false)
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

const emblaMobileApi = ref<CarouselApi>()
const mobileSelectedIndex = ref(0)

function onMobileSelect() {
  if (!emblaMobileApi.value)
    return
  mobileSelectedIndex.value = emblaMobileApi.value.selectedScrollSnap()
}

const itemInCart = computed(() => {
  return cartStore.items.find(item => item.product.id === props.product.id)
})

const quantityInCart = computed(() => {
  return itemInCart.value ? itemInCart.value.quantity : 0
})

const hasMultipleImages = computed(() =>
  Array.isArray(props.product.product_images) && props.product.product_images.length > 1,
)

const activeImageIndex = ref(0)

const priceDetails = computed(() => {
  const originalPrice = Number(props.product.price)
  const discountPercent = Number(props.product.discount_percentage)

  const hasDiscount = discountPercent > 0 && discountPercent <= 100

  if (!hasDiscount) {
    return {
      hasDiscount: false,
      finalPrice: originalPrice,
    }
  }

  const finalPrice = originalPrice - (originalPrice * discountPercent / 100)

  return {
    hasDiscount: true,
    finalPrice: Math.round(finalPrice),
    originalPrice,
    percent: Math.round(discountPercent),
  }
})

function handleMouseMove(event: MouseEvent) {
  if (!hasMultipleImages.value || isTouchDevice.value || !props.product.product_images) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width

  if (width === 0) {
    return
  }

  const segmentWidth = width / props.product.product_images.length
  const newIndex = Math.min(
    Math.floor(x / segmentWidth),
    props.product.product_images.length - 1,
  )

  if (newIndex !== activeImageIndex.value) {
    activeImageIndex.value = newIndex
  }
}

function handleMouseLeave() {
  activeImageIndex.value = 0
}

watch(emblaMobileApi, (api) => {
  if (api) {
    onMobileSelect()
    api.on('select', onMobileSelect)
    api.on('reInit', onMobileSelect)
  }
})

// Для десктопа (активное изображение при наведении)
const activeImageUrl = computed(() => {
  const imageUrl = props.product.product_images?.[activeImageIndex.value]?.image_url
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.PRODUCT_CARD)
})

// 👇 Функция для получения URL по индексу (для мобильной карусели)
function getImageUrlByIndex(index: number) {
  const imageUrl = props.product.product_images?.[index]?.image_url
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.PRODUCT_CARD)
}
</script>

<template>
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card flex flex-col h-full">
    <div
      class="relative bg-muted aspect-square overflow-hidden"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
      <div
        v-if="priceDetails.hasDiscount"
        class="absolute top-2 right-2 z-10"
      >
        <div class="bg-destructive text-white font-bold text-xs px-2 py-1 rounded-full">
          -{{ priceDetails.percent }}%
        </div>
      </div>
      <div class="absolute top-2 left-2 z-10">
        <ProductWishlistButton :product-id="product.id" :product-name="product.name" />
      </div>
      <ClientOnly>
        <!-- Рендеринг для НЕ-тач устройств (десктоп) -->
        <template v-if="!isTouchDevice">
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full">
            <ProgressiveImage
              :src="activeImageUrl"
              :alt="product.name"
              aspect-ratio="square"
              object-fit="cover"
              placeholder-type="shimmer"
            />
          </NuxtLink>
        </template>

        <!-- Рендеринг для тач-устройств (мобильные) -->
        <template v-else>
          <Carousel
            v-if="hasMultipleImages"
            class="w-full h-full"
            :opts="{ loop: true, align: 'start' }"
            @touchstart.stop
            @touchmove.stop
            @touchend.stop
            @init-api="(val) => emblaMobileApi = val"
          >
            <CarouselContent>
              <CarouselItem v-for="(_, index) in product.product_images" :key="index">
                <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full aspect-square">
                  <!-- 👇 Используем функцию с правильным индексом -->
                  <img
                    :src="getImageUrlByIndex(index) || '/images/placeholder.svg'"
                    :alt="`${product.name} - изображение ${index + 1}`"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  >
                </NuxtLink>
              </CarouselItem>
            </CarouselContent>
          </Carousel>

          <!-- Одно изображение на мобилке -->
          <NuxtLink v-else :to="`/catalog/products/${product.slug}`" class="block h-full">
            <img
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="product.name"
              class="w-full h-full object-cover"
              loading="lazy"
            >
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <span>Нет фото</span>
            </div>
          </NuxtLink>
        </template>

        <!-- #fallback для SSR -->
        <template #fallback>
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full">
            <img
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="product.name"
              class="w-full h-full object-cover"
              loading="lazy"
            >
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <span>Нет фото</span>
            </div>
          </NuxtLink>
        </template>
      </ClientOnly>

      <!-- Индикаторы-точки -->
      <div
        v-if="hasMultipleImages"
        class="absolute bottom-2 left-0 right-0 h-4 flex justify-center items-center gap-2 pointer-events-none"
      >
        <ClientOnly>
          <template v-if="!isTouchDevice">
            <div
              v-for="(_, index) in product.product_images"
              :key="index"
              class="w-2 h-2 rounded-full transition-all"
              :class="index === activeImageIndex ? 'bg-white scale-125 shadow-md' : 'bg-white/50'"
            />
          </template>
          <template v-else>
            <div
              v-for="(_, index) in product.product_images"
              :key="`dot-${index}`"
              class="w-2 h-2 rounded-full transition-all"
              :class="index === mobileSelectedIndex ? 'bg-white scale-125 shadow-md' : 'bg-white/50'"
            />
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- Блок с информацией о товаре -->
    <div class="p-4 space-y-2 flex-grow flex flex-col">
      <div v-if="product.brands" class="h-4">
        <NuxtLink
          :to="`/brand/${product.brands.slug}`"
          class="text-xs text-muted-foreground hover:text-primary transition-colors"
          @click.stop
        >
          {{ product.brands.name }}
        </NuxtLink>
      </div>
      <h3 class="font-semibold truncate h-6">
        {{ product.name }}
      </h3>
      <div class="flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <p class="text-lg font-bold">
            {{ priceDetails.finalPrice }} ₸
          </p>
          <p v-if="priceDetails.hasDiscount" class="text-sm text-muted-foreground line-through">
            {{ priceDetails.originalPrice }} ₸
          </p>
        </div>

        <p v-if="product.bonus_points_award && product.bonus_points_award > 0" class="text-xs text-primary">
          +{{ product.bonus_points_award }} бонусов
        </p>
      </div>
      <div class="mt-auto pt-2">
        <ClientOnly>
          <Button
            v-if="!itemInCart"
            class="w-full"
            :disabled="!product.stock_quantity || product.stock_quantity <= 0"
            @click="cartStore.addItem(product as BaseProduct, 1)"
          >
            <span v-if="product.stock_quantity && product.stock_quantity > 0">В корзину</span>
            <span v-else>Нет в наличии</span>
          </Button>

          <QuantitySelector
            v-else
            :product="product"
            :quantity="quantityInCart"
          />
          <template #fallback>
            <Button class="w-full" disabled>
              Загрузка...
            </Button>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

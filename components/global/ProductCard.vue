<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { BaseProduct } from '@/types'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT, BUCKET_NAME_BRANDS } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  product: BaseProduct
}>()

const cartStore = useCartStore()
const { getImageUrl } = useSupabaseStorage()

// --- DEVICE DETECTION ---
const isTouchDevice = ref(false)
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

// --- CAROUSEL STATE (для мобилы) ---
const emblaMobileApi = ref<CarouselApi>()
const mobileSelectedIndex = ref(0)

function onMobileSelect() {
  if (!emblaMobileApi.value)
    return
  mobileSelectedIndex.value = emblaMobileApi.value.selectedScrollSnap()
}

watch(emblaMobileApi, (api) => {
  if (api) {
    onMobileSelect()
    api.on('select', onMobileSelect)
    api.on('reInit', onMobileSelect)
  }
})

// --- CART STATE ---
const itemInCart = computed(() => {
  return cartStore.items.find(item => item.product.id === props.product.id)
})

const quantityInCart = computed(() => {
  return itemInCart.value ? itemInCart.value.quantity : 0
})

// --- IMAGE STATE ---
const activeImageIndex = ref(0)

const hasMultipleImages = computed(() =>
  Array.isArray(props.product.product_images) && props.product.product_images.length > 1,
)

/**
 * Получить URL изображения по индексу
 */
function getImageUrlByIndex(index: number): string | null {
  const imageUrl = props.product.product_images?.[index]?.image_url
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.CARD)
}

/**
 * Получить URL логотипа бренда
 */
function getBrandLogoUrl(): string | null {
  const logoUrl = props.product.brands?.logo_url
  if (!logoUrl)
    return null

  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}

/**
 * Активное изображение для десктопа (наведение мышью)
 */
const activeImageUrl = computed(() => {
  return getImageUrlByIndex(activeImageIndex.value)
})

// --- MOUSE INTERACTION (только для десктопа) ---
function handleMouseMove(event: MouseEvent) {
  if (!hasMultipleImages.value || isTouchDevice.value || !props.product.product_images) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width

  if (width === 0)
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

function handleMouseLeave() {
  activeImageIndex.value = 0
}

// --- PRICE CALCULATION ---
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
</script>

<template>
  <div class="bg-white border rounded-xl overflow-hidden group transition-all hover:shadow-xl flex flex-col h-full">
    <!-- 🖼️ ГАЛЕРЕЯ ИЗОБРАЖЕНИЙ -->
    <div
      class="relative bg-white aspect-square overflow-hidden"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
      <!-- 🏷️ БЕЙДЖ СКИДКИ -->
      <div
        v-if="priceDetails.hasDiscount"
        class="absolute top-3 right-3 z-10"
      >
        <Badge variant="destructive" class="font-bold text-xs px-2.5 py-1 shadow-lg">
          -{{ priceDetails.percent }}%
        </Badge>
      </div>

      <!-- ❤️ КНОПКА ДОБАВЛЕНИЯ В ИЗБРАННОЕ -->
      <div class="absolute top-3 left-3 z-10">
        <ProductWishlistButton :product-id="product.id" :product-name="product.name" />
      </div>

      <ClientOnly>
        <!-- 🖥️ ДЕСКТОП: Наведение мышью меняет изображение -->
        <template v-if="!isTouchDevice">
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full p-4">
            <ProgressiveImage
              :src="activeImageUrl"
              :alt="`${product.name}`"
              aspect-ratio="1/1"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="product.product_images?.[activeImageIndex]?.blur_placeholder"
              eager
            />
          </NuxtLink>
        </template>

        <!-- 📱 МОБИЛ: Карусель изображений -->
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
              <CarouselItem
                v-for="(image, index) in product.product_images"
                :key="`carousel-${index}`"
              >
                <NuxtLink
                  :to="`/catalog/products/${product.slug}`"
                  class="block h-full aspect-square p-4"
                >
                  <ProgressiveImage
                    :src="getImageUrlByIndex(index)"
                    :alt="`${product.name} - фото ${index + 1}`"
                    aspect-ratio="1/1"
                    object-fit="contain"
                    placeholder-type="lqip"
                    :blur-data-url="image.blur_placeholder"
                    eager
                  />
                </NuxtLink>
              </CarouselItem>
            </CarouselContent>
          </Carousel>

          <!-- 📷 Одно изображение на мобилке -->
          <NuxtLink v-else :to="`/catalog/products/${product.slug}`" class="block h-full p-4">
            <ProgressiveImage
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="`${product.name}`"
              aspect-ratio="1/1"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-muted-foreground text-sm"
            >
              📷 Нет фото
            </div>
          </NuxtLink>
        </template>

        <!-- ⚙️ Fallback для SSR -->
        <template #fallback>
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full p-4">
            <ProgressiveImage
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="`${product.name}`"
              aspect-ratio="1/1"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-muted-foreground text-sm"
            >
              📷 Нет фото
            </div>
          </NuxtLink>
        </template>
      </ClientOnly>

      <!-- 🔵 ИНДИКАТОРЫ-ТОЧКИ -->
      <div
        v-if="hasMultipleImages"
        class="absolute bottom-3 left-0 right-0 flex justify-center items-center gap-1.5 pointer-events-none"
      >
        <ClientOnly>
          <!-- Десктоп индикаторы -->
          <template v-if="!isTouchDevice">
            <div
              v-for="(_, index) in product.product_images"
              :key="`dot-desktop-${index}`"
              class="rounded-full transition-all"
              :class="index === activeImageIndex
                ? 'w-5 h-1.5 bg-gray-600'
                : 'w-1.5 h-1.5 bg-gray-300'
              "
            />
          </template>

          <!-- Мобил индикаторы -->
          <template v-else>
            <div
              v-for="(_, index) in product.product_images"
              :key="`dot-mobile-${index}`"
              class="rounded-full transition-all"
              :class="index === mobileSelectedIndex
                ? 'w-5 h-1.5 bg-gray-600'
                : 'w-1.5 h-1.5 bg-gray-300'
              "
            />
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- 📋 ИНФОРМАЦИЯ О ТОВАРЕ -->
    <div class="p-4 space-y-3 flex-grow flex flex-col">
      <!-- 🏢 Бренд -->
      <div v-if="product.brands" class="min-h-[16px]">
        <NuxtLink
          :to="`/brand/${product.brands.slug}`"
          class="flex items-center gap-2 group"
          @click.stop
        >
          <!-- Логотип бренда -->
          <div
            v-if="getBrandLogoUrl()"
            class="w-8 h-8 flex items-center justify-center rounded border border-border/50 group-hover:border-primary/30 transition-colors bg-background overflow-hidden flex-shrink-0"
          >
            <ProgressiveImage
              :src="getBrandLogoUrl()!"
              :alt="product.brands.name"
              object-fit="contain"
              placeholder-type="shimmer"
              class="w-full h-full p-0.5"
            />
          </div>
          <!-- Название бренда -->
          <span class="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium line-clamp-1">
            {{ product.brands.name }}
          </span>
        </NuxtLink>
      </div>

      <!-- 📝 Название товара -->
      <NuxtLink :to="`/catalog/products/${product.slug}`" class="block">
        <h3 class="font-semibold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors">
          {{ product.name }}
        </h3>
      </NuxtLink>

      <!-- 💰 Цена и бонусы -->
      <div class="space-y-1 mt-auto">
        <div class="flex items-baseline gap-2">
          <p class="text-xl font-bold text-primary">
            {{ formatPrice(priceDetails.finalPrice) }} ₸
          </p>
          <p v-if="priceDetails.hasDiscount" class="text-sm text-muted-foreground line-through">
            {{ formatPrice(priceDetails.originalPrice) }} ₸
          </p>
        </div>

        <!-- Бонусы -->
        <Badge
          v-if="product.bonus_points_award && product.bonus_points_award > 0"
          variant="secondary"
          class="inline-flex items-center gap-1 bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200"
        >
          <Icon name="lucide:gift" class="w-3 h-3" />
          <span>+{{ product.bonus_points_award }} бонусов</span>
        </Badge>
      </div>

      <!-- 🛒 КНОПКА ДОБАВЛЕНИЯ В КОРЗИНУ -->
      <div class="pt-3">
        <ClientOnly>
          <Button
            v-if="!itemInCart"
            class="w-full h-10 font-semibold"
            :disabled="!product.stock_quantity || product.stock_quantity <= 0"
            @click="cartStore.addItem(product as BaseProduct, 1)"
          >
            <Icon
              :name="product.stock_quantity && product.stock_quantity > 0 ? 'lucide:shopping-cart' : 'lucide:x-circle'"
              class="w-4 h-4 mr-2"
            />
            <span v-if="product.stock_quantity && product.stock_quantity > 0">
              В корзину
            </span>
            <span v-else>
              Нет в наличии
            </span>
          </Button>

          <QuantitySelector
            v-else
            :product="product"
            :quantity="quantityInCart"
          />

          <template #fallback>
            <Button class="w-full h-10" disabled>
              <Icon name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              Загрузка...
            </Button>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

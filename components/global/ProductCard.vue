<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { BaseProduct } from '@/types'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
// --- PROPS ---

/**
 * @props {ProductWithGallery} product - Основной объект товара, содержащий все данные,
 * включая вложенный массив изображений `product_images`.
 */
const props = defineProps<{
  product: BaseProduct
}>()

// --- ИНИЦИАЛИЗАЦИЯ ---

const cartStore = useCartStore()
const { getPublicUrl } = useSupabaseStorage()

const isTouchDevice = ref(false)
onMounted(() => {
  // `window` доступен только на клиенте, поэтому используем onMounted
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

const emblaMobileApi = ref<CarouselApi>()
const mobileSelectedIndex = ref(0)

function onMobileSelect() {
  if (!emblaMobileApi.value)
    return
  mobileSelectedIndex.value = emblaMobileApi.value.selectedScrollSnap()
}
// --- COMPUTED-СВОЙСТВА ДЛЯ УПРАВЛЕНИЯ UI ---

const itemInCart = computed(() => {
  return cartStore.items.find(item => item.product.id === props.product.id)
})

// `computed` для получения количества этого товара в корзине
const quantityInCart = computed(() => {
  return itemInCart.value ? itemInCart.value.quantity : 0
})

/**
 * @computed hasMultipleImages
 * @description Проверяет, содержит ли галерея товара более одного изображения.
 * Используется для включения интерактивных фич (карусель, скролл).
 * @returns {boolean}
 */
const hasMultipleImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 1)

// --- ЛОГИКА ДЛЯ ИНТЕРАКТИВНОЙ ГАЛЕРЕИ ПРИ НАВЕДЕНИИ МЫШИ ---

/**
 * @ref activeImageIndex
 * @description Хранит индекс текущего отображаемого изображения из массива `product_images`.
 * Изменяется при движении мыши над карточкой.
 */
const activeImageIndex = ref(0)

/**
 * @computed activeImageUrl
 * @description Реактивно вычисляет полный публичный URL для текущего активного изображения.
 * Зависит от `activeImageIndex`.
 * @returns {string | null} Полный URL изображения или `null`, если изображений нет.
 */
const activeImageUrl = computed(() => {
  // 1. Безопасно получаем `imageUrl`. Если `product_images` - null, результат будет `undefined`.
  const imageUrl = props.product.product_images?.[activeImageIndex.value]?.image_url

  // 2. Если `imageUrl` в итоге `undefined` (или `null`), `getPublicUrl` получит `null`.
  return getPublicUrl(BUCKET_NAME_PRODUCT, imageUrl || null)
})

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
    percent: Math.round(discountPercent), // <-- ДОБАВЛЯЕМ ЭТУ СТРОКУ
  }
})

/**
 * Обработчик события `mousemove`.
 * Вычисляет, над каким "сегментом" изображения находится курсор,
 * и обновляет `activeImageIndex` для показа соответствующей картинки.
 * @param {MouseEvent} event - Событие движения мыши.
 */
function handleMouseMove(event: MouseEvent) {
  // Логика работает, только если есть несколько картинок и это не тач-устройство
  if (!hasMultipleImages.value || isTouchDevice.value || !props.product.product_images) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  // ВОТ ЭТА СТРОКА БЫЛА ПРОПУЩЕНА
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

/**
 * Обработчик события `mouseleave`.
 * Сбрасывает галерею на первое (основное) изображение, когда
 * курсор покидает область карточки.
 */
function handleMouseLeave() {
  activeImageIndex.value = 0
}

watch(emblaMobileApi, (api) => {
  if (api) {
    onMobileSelect() // Устанавливаем начальное значение
    api.on('select', onMobileSelect)
    api.on('reInit', onMobileSelect)
  }
})
</script>

<template>
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card flex flex-col h-full">
    <!--
      Контейнер изображения с обработчиками событий мыши.
      Эта интерактивная область работает только для устройств с курсором.
      На тач-устройствах будет видна только первая картинка.
    -->
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
            <NuxtImg
              v-if="activeImageUrl"
              :key="activeImageUrl"
              :src="activeImageUrl"
              :alt="product.name"
              class="w-full h-full object-cover transition-opacity duration-200"
              format="webp" quality="80" width="400" height="400" loading="lazy" placeholder
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <span>Нет фото</span>
            </div>
          </NuxtLink>
        </template>

        <!-- Рендеринг для тач-устройств (мобильные) -->
        <template v-else>
          <Carousel
            v-if="hasMultipleImages"
            class="w-full h-full"
            :opts="{ loop: true, align: 'start' }"
            @touchstart.stop @touchmove.stop @touchend.stop
            @init-api="(val) => emblaMobileApi = val"
          >
            <CarouselContent>
              <CarouselItem v-for="(image, index) in product.product_images" :key="index">
                <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full aspect-square">
                  <NuxtImg
                    :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                    :alt="product.name"
                    class="w-full h-full object-cover"
                    format="webp" quality="80" width="400" height="400" loading="lazy" placeholder
                  />
                </NuxtLink>
              </CarouselItem>
            </CarouselContent>
          </Carousel>
          <NuxtLink v-else :to="`/catalog/products/${product.slug}`" class="block h-full">
            <NuxtImg
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="product.name"
              class="w-full h-full object-cover"
              format="webp" quality="80" width="400" height="400" loading="lazy" placeholder
            />
          </NuxtLink>
        </template>

        <!-- #fallback будет отрендерен на сервере и во время гидратации -->
        <template #fallback>
          <!-- Простой, универсальный рендеринг для SSR: просто первое изображение -->
          <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full">
            <NuxtImg
              v-if="activeImageUrl"
              :src="activeImageUrl"
              :alt="product.name"
              class="w-full h-full object-cover"
              format="webp" quality="80" width="400" height="400" loading="lazy" placeholder
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <span>Нет фото</span>
            </div>
          </NuxtLink>
        </template>
      </ClientOnly>

      <!-- Индикаторы-точки для визуальной обратной связи -->
      <div
        v-if="hasMultipleImages"
        class="absolute bottom-2 left-0 right-0 h-4 flex justify-center items-center gap-2 pointer-events-none"
      >
        <!-- Этот блок тоже можно обернуть в ClientOnly, если он вызывает проблемы,
         но обычно он безопасен -->
        <ClientOnly>
          <template v-if="!isTouchDevice">
            <div
              v-for="(_, index) in product.product_images" :key="index"
              class="w-2 h-2 rounded-full transition-all"
              :class="index === activeImageIndex ? 'bg-white scale-125 shadow-md' : 'bg-white/50'"
            />
          </template>
          <template v-else>
            <div
              v-for="(_, index) in product.product_images" :key="`dot-${index}`"
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
        <!-- Блок с ценой -->
        <div class="flex items-baseline gap-2">
          <!-- Новая цена (всегда показывается) -->
          <p class="text-lg font-bold">
            {{ priceDetails.finalPrice }} ₸
          </p>
          <!-- Старая зачеркнутая цена (показывается только если есть скидка) -->
          <p v-if="priceDetails.hasDiscount" class="text-sm text-muted-foreground line-through">
            {{ priceDetails.originalPrice }} ₸
          </p>
        </div>

        <!-- Бонусы (остаются без изменений) -->
        <p v-if="product.bonus_points_award && product.bonus_points_award > 0" class="text-xs text-primary">
          +{{ product.bonus_points_award }} бонусов
        </p>
      </div>
      <div class="mt-auto pt-2">
        <!-- Если товара НЕТ в корзине, показываем кнопку "В корзину" -->
        <ClientOnly>
          <!-- Если товара НЕТ в корзине, показываем кнопку "В корзину" -->
          <Button
            v-if="!itemInCart"
            class="w-full"
            :disabled="!product.stock_quantity || product.stock_quantity <= 0"
            @click="cartStore.addItem(product as BaseProduct, 1)"
          >
            <span v-if="product.stock_quantity && product.stock_quantity > 0">В корзину</span>
            <span v-else>Нет в наличии</span>
          </Button>

          <!-- Если товар УЖЕ в корзине, показываем наш счетчик -->
          <QuantitySelector
            v-else
            :product="product"
            :quantity="quantityInCart"
          />
          <!-- Fallback для Server Side Render (просто кнопка) -->
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

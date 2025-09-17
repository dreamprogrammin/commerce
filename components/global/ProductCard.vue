<script setup lang="ts">
import type { ProductWithGallery } from '@/types'
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
  product: ProductWithGallery
}>()

// --- ИНИЦИАЛИЗАЦИЯ ---

const cartStore = useCartStore()
const { getPublicUrl } = useSupabaseStorage()

// --- COMPUTED-СВОЙСТВА ДЛЯ УПРАВЛЕНИЯ UI ---

/**
 * @computed hasImages
 * @description Проверяет, есть ли у товара в принципе массив изображений и не пустой ли он.
 * @returns {boolean}
 */
const hasImages = computed(() => Array.isArray(props.product.product_images) && props.product.product_images.length > 0)

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
  if (hasImages.value) {
    const imageUrl = props.product.product_images[activeImageIndex.value]?.image_url
    // Превращаем `undefined` в `null` для совместимости с `getPublicUrl`
    return getPublicUrl(BUCKET_NAME_PRODUCT, imageUrl || null)
  }
  return null
})

/**
 * Обработчик события `mousemove`.
 * Вычисляет, над каким "сегментом" изображения находится курсор,
 * и обновляет `activeImageIndex` для показа соответствующей картинки.
 * @param {MouseEvent} event - Событие движения мыши.
 */
function handleMouseMove(event: MouseEvent) {
  // Логика работает, только если есть несколько картинок
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
 * Обработчик события `mouseleave`.
 * Сбрасывает галерею на первое (основное) изображение, когда
 * курсор покидает область карточки.
 */
function handleMouseLeave() {
  activeImageIndex.value = 0
}
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
      <NuxtLink :to="`/catalog/products/${product.slug}`" class="block h-full">
        <!--
          Отображается только ОДНО изображение, `src` которого реактивно
          обновляется благодаря `activeImageUrl`.
          `:key` помогает Vue плавно анимировать смену изображения.
        -->
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

      <!-- Индикаторы-точки для визуальной обратной связи -->
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

<script setup lang="ts">
import type { ProductImageRow } from '@/types'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useSeoAltText } from '@/composables/useSeoAltText'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const props = defineProps<{
  images: ProductImageRow[]
  productName?: string
  brandName?: string
  lineName?: string
  discountPercentage?: number | null
}>()

const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const { generateProductImageAlt } = useSeoAltText()

// --- Основная лента: scroll-snap вместо Embla ---------------------------------
// Единая механика с ProductCard.vue: нативный свайп на тач-устройствах,
// pointer-драг на десктопе. Точки и вертикальный рельс миниатюр ведомы
// одним и тем же activeIndex.
const sliderRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const hasMultipleImages = computed(() => props.images.length > 1)

function scrollToIndex(index: number, smooth = true) {
  const el = sliderRef.value
  if (!el)
    return
  el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
}

function onSliderScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (!el?.clientWidth)
    return
  const index = Math.round(el.scrollLeft / el.clientWidth)
  if (index !== activeIndex.value)
    activeIndex.value = index
}

function selectImage(index: number) {
  activeIndex.value = index
  scrollToIndex(index)
}

// Драг мышью. `didDrag` гасит клик, который иначе откроет лайтбокс
// сразу после протяжки (тот же приём, что в ProductCard.vue).
const didDrag = ref(false)
let dragStartX = 0
let dragStartLeft = 0
let isDragging = false

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'touch')
    return
  const el = sliderRef.value
  if (!el)
    return
  isDragging = true
  didDrag.value = false
  dragStartX = event.clientX
  dragStartLeft = el.scrollLeft
  el.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging)
    return
  const el = sliderRef.value
  if (!el)
    return
  const dx = event.clientX - dragStartX
  if (Math.abs(dx) > 5)
    didDrag.value = true
  el.scrollLeft = dragStartLeft - dx
}

function onPointerUp(event: PointerEvent) {
  if (!isDragging)
    return
  isDragging = false
  const el = sliderRef.value
  if (!el)
    return
  el.releasePointerCapture?.(event.pointerId)
  const width = el.clientWidth || 1
  const maxIndex = Math.max(props.images.length - 1, 0)
  const index = Math.max(0, Math.min(Math.round(el.scrollLeft / width), maxIndex))
  activeIndex.value = index
  scrollToIndex(index)
}

// Сброс на первый кадр при смене товара (цветовые варианты — отдельные URL,
// но Nuxt переиспользует компонент страницы).
watch(() => props.images, () => {
  activeIndex.value = 0
  nextTick(() => scrollToIndex(0, false))
})

// --- Лайтбокс -----------------------------------------------------------------
const isLightboxOpen = ref(false)
const lightboxApi = ref()
const lightboxSlide = ref(0)
const lightboxSlideCount = ref(0)

function openLightbox() {
  if (didDrag.value)
    return
  isLightboxOpen.value = true
}

function onInitLightbox(api: any) {
  lightboxApi.value = api
  if (!api)
    return
  api.scrollTo(activeIndex.value, true)
  lightboxSlideCount.value = api.scrollSnapList().length
  lightboxSlide.value = api.selectedScrollSnap()
  api.on('select', () => {
    lightboxSlide.value = api.selectedScrollSnap()
  })
}

function onLightboxKeydown(e: KeyboardEvent) {
  if (!lightboxApi.value)
    return
  if (e.key === 'ArrowLeft')
    lightboxApi.value.scrollPrev()
  if (e.key === 'ArrowRight')
    lightboxApi.value.scrollNext()
}

// --- URL и alt ----------------------------------------------------------------
function getThumbUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'sm')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_THUMB)
}

function getMainUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'md')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_MAIN)
}

function getFullUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'lg')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.LARGE)
}

function getImageVariants(imagePath: string) {
  return {
    sm: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'sm'),
    md: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'md'),
    lg: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'lg'),
  }
}

/**
 * Получить SEO-оптимизированный alt текст для изображения
 * Использует alt_text из БД, если есть, иначе генерирует на лету
 */
function getImageAlt(image: ProductImageRow, index: number): string {
  if (image.alt_text && !image.alt_text.includes('Изображение товара')) {
    return image.alt_text
  }

  if (props.productName) {
    return generateProductImageAlt({
      productName: props.productName,
      brandName: props.brandName,
      lineName: props.lineName,
      index,
      totalImages: props.images.length,
    })
  }

  return `Изображение товара ${index + 1}`
}
</script>

<template>
  <div class="pg-card">
    <!-- Рельс миниатюр: на мобильных — горизонтальный под кадром (column-reverse),
         на десктопе — вертикальный слева -->
    <div v-if="hasMultipleImages" class="pg-rail">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        type="button"
        class="pg-thumb"
        :class="{ 'pg-thumb--active': index === activeIndex }"
        :aria-label="`Показать изображение ${index + 1}`"
        :aria-current="index === activeIndex"
        @click="selectImage(index)"
      >
        <ProgressiveImage
          :src="getThumbUrl(image.image_url)"
          :blur-data-url="image.blur_placeholder"
          :alt="getImageAlt(image, index)"
          object-fit="contain"
          :placeholder-type="image.blur_placeholder ? 'lqip' : 'shimmer'"
          class="size-full"
        />
      </button>
    </div>

    <!-- Основной кадр -->
    <div class="pg-stage">
      <span v-if="discountPercentage" class="pg-discount">−{{ discountPercentage }}%</span>

      <div
        ref="sliderRef"
        class="pg-slider"
        @scroll.passive="onSliderScroll"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div
          v-for="(image, index) in images"
          :key="image.id"
          class="pg-slide"
          @click="openLightbox"
        >
          <ProgressiveImage
            :src="getMainUrl(image.image_url)"
            :src-sm="getImageVariants(image.image_url).sm"
            :src-md="getImageVariants(image.image_url).md"
            :src-lg="getImageVariants(image.image_url).lg"
            sizes="(max-width: 1024px) 100vw, 45vw"
            :blur-data-url="image.blur_placeholder"
            :alt="getImageAlt(image, index)"
            object-fit="contain"
            :placeholder-type="image.blur_placeholder ? 'lqip' : 'shimmer'"
            :eager="index === 0"
            :fetchpriority="index === 0 ? 'high' : 'auto'"
            class="size-full"
          />
        </div>
      </div>

      <div v-if="hasMultipleImages" class="pg-dots">
        <span
          v-for="(image, index) in images"
          :key="image.id"
          class="pg-dot"
          :class="{ 'pg-dot--active': index === activeIndex }"
        />
      </div>
    </div>

    <!-- LIGHTBOX -->
    <Dialog v-model:open="isLightboxOpen">
      <DialogContent
        class="!max-w-[100vw] !w-screen !h-screen !max-h-screen !p-0 !rounded-none !border-none !bg-black/95 !gap-0"
        @keydown="onLightboxKeydown"
      >
        <DialogTitle class="sr-only">
          Галерея изображений товара
        </DialogTitle>

        <!-- Закрыть -->
        <button
          class="absolute top-4 right-4 z-10 text-white/70 hover:text-white transition-colors"
          @click="isLightboxOpen = false"
        >
          <X class="size-8" />
          <span class="sr-only">Закрыть</span>
        </button>

        <!-- Счетчик слайдов -->
        <div
          v-if="hasMultipleImages"
          class="absolute top-4 left-4 z-10 text-white/70 text-sm"
        >
          {{ lightboxSlide + 1 }} / {{ lightboxSlideCount }}
        </div>

        <!-- Карусель лайтбокса -->
        <Carousel
          class="w-full h-full flex items-center"
          :opts="{ loop: true, startIndex: activeIndex }"
          @init-api="onInitLightbox"
        >
          <CarouselContent class="h-full">
            <CarouselItem
              v-for="(image, index) in images"
              :key="image.id"
              class="h-full flex items-center justify-center p-4 sm:p-8"
            >
              <img
                :src="getFullUrl(image.image_url) || undefined"
                :alt="getImageAlt(image, index)"
                class="max-w-full max-h-full object-contain select-none"
                draggable="false"
              >
            </CarouselItem>
          </CarouselContent>

          <!-- Стрелки навигации -->
          <template v-if="hasMultipleImages">
            <button
              class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2"
              @click="lightboxApi?.scrollPrev()"
            >
              <ChevronLeft class="size-6 sm:size-8" />
              <span class="sr-only">Предыдущее</span>
            </button>
            <button
              class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2"
              @click="lightboxApi?.scrollNext()"
            >
              <ChevronRight class="size-6 sm:size-8" />
              <span class="sr-only">Следующее</span>
            </button>
          </template>
        </Carousel>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .pg-card {
    display: flex;
    flex-direction: column-reverse;
    gap: 14px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 14px;
    box-shadow: var(--elevation-card);
  }

  .pg-rail {
    display: flex;
    flex-direction: row;
    gap: 10px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .pg-rail::-webkit-scrollbar {
    display: none;
  }

  .pg-thumb {
    flex: none;
    width: 60px;
    height: 60px;
    border-radius: 14px;
    padding: 7px;
    cursor: pointer;
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    display: grid;
    place-items: center;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .pg-thumb--active {
    border: 2px solid var(--primary);
    box-shadow: 0 4px 12px rgb(43 127 255 / 0.22);
  }

  .pg-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    aspect-ratio: 1;
    border-radius: 22px;
    overflow: hidden;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.8);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      inset 0 -18px 40px rgba(15, 23, 42, 0.05);
  }

  .pg-discount {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    box-shadow: 0 6px 16px rgb(220 38 38 / 0.32);
  }

  .pg-slider {
    display: flex;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    cursor: grab;
    scrollbar-width: none;
    -ms-overflow-style: none;
    touch-action: pan-y pinch-zoom;
  }

  .pg-slider::-webkit-scrollbar {
    display: none;
  }

  .pg-slider:active {
    cursor: grabbing;
  }

  .pg-slide {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    padding: 18px;
    cursor: zoom-in;
  }

  .pg-dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 13px;
    display: flex;
    justify-content: center;
    gap: 6px;
    pointer-events: none;
    z-index: 2;
  }

  .pg-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--rating-empty);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
    transition:
      width 0.22s ease,
      background 0.22s ease;
  }

  .pg-dot--active {
    width: 20px;
    background: var(--primary);
  }

  @media (width >= 64rem) {
    .pg-card {
      flex-direction: row;
      padding: 18px;
    }

    .pg-rail {
      flex-direction: column;
      overflow-x: visible;
      overflow-y: auto;
      max-height: 560px;
    }

    .pg-thumb {
      width: 72px;
      height: 72px;
    }

    .pg-slide {
      padding: 34px;
    }
  }
}
</style>

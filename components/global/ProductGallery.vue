<script setup lang="ts">
import type { ProductImageRow } from '@/types'
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const props = defineProps<{
  images: ProductImageRow[]
}>()

const { getImageUrl } = useSupabaseStorage()
const { images: imagesRef } = toRefs(props)

const {
  selectedIndex,
  thumbBasisClass,
  onInitMain,
  onInitThumb,
  onThumbClick,
} = useProductGallery(imagesRef, 4)

// Для точек на мобильных
const mainCarouselApi = ref()
const currentSlide = ref(0)
const slideCount = ref(0)

function onInitMainCarousel(api: any) {
  onInitMain(api)
  mainCarouselApi.value = api

  if (api) {
    slideCount.value = api.scrollSnapList().length
    currentSlide.value = api.selectedScrollSnap()

    api.on('select', () => {
      currentSlide.value = api.selectedScrollSnap()
    })
  }
}

// Lightbox
const isLightboxOpen = ref(false)
const lightboxApi = ref()
const lightboxSlide = ref(0)
const lightboxSlideCount = ref(0)

function openLightbox() {
  isLightboxOpen.value = true
}

function onInitLightbox(api: any) {
  lightboxApi.value = api

  if (api) {
    // Синхронизируем с текущим слайдом основной карусели
    api.scrollTo(currentSlide.value, true)
    lightboxSlideCount.value = api.scrollSnapList().length
    lightboxSlide.value = api.selectedScrollSnap()

    api.on('select', () => {
      lightboxSlide.value = api.selectedScrollSnap()
    })
  }
}

// Навигация клавишами в лайтбоксе
function onLightboxKeydown(e: KeyboardEvent) {
  if (!lightboxApi.value) return
  if (e.key === 'ArrowLeft') lightboxApi.value.scrollPrev()
  if (e.key === 'ArrowRight') lightboxApi.value.scrollNext()
}

function getThumbUrl(imagePath: string) {
  return getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_THUMB)
}

function getMainUrl(imagePath: string) {
  return getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_MAIN)
}

function getFullUrl(imagePath: string) {
  return getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.LARGE)
}
</script>

<template>
  <div class="grid grid-cols-12 grid-rows-1 gap-4 lg:pt-7">
    <!-- КОЛОНКА С МИНИАТЮРАМИ (только десктоп) -->
    <div v-if="images && images.length > 1" class="hidden lg:block col-span-2">
      <Carousel
        class="relative w-full max-w-xs"
        orientation="vertical"
        :opts="{ align: 'start', dragFree: true }"
        @init-api="onInitThumb"
      >
        <CarouselContent class="mt-0 h-150">
          <CarouselItem
            v-for="(image, index) in images"
            :key="image.id"
            :class="`cursor-pointer pt-2 ${thumbBasisClass}`"
            @click="onThumbClick(index)"
          >
            <div
              class="aspect-square p-2 rounded-lg overflow-hidden border-2 transition-opacity"
              :class="{
                'border-primary opacity-100': index === selectedIndex,
                'border-transparent opacity-60': index !== selectedIndex,
              }"
            >
              <img
                :src="getThumbUrl(image.image_url) || undefined"
                alt="Миниатюра товара"
                class="w-full h-full object-cover rounded-lg"
                loading="lazy"
              >
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious class="absolute -top-8 left-1/2 -translate-x-1/2 rotate-90" />
        <CarouselNext class="absolute -bottom-8 left-1/2 -translate-x-1/2 rotate-90" />
      </Carousel>
    </div>

    <!-- КОЛОНКА С ОСНОВНЫМ ИЗОБРАЖЕНИЕМ -->
    <div class="w-full" :class="images && images.length > 1 ? 'lg:col-span-10 col-span-12' : 'col-span-12'">
      <Carousel
        class="w-full h-full relative"
        :opts="{ loop: true }"
        @init-api="onInitMainCarousel"
      >
        <CarouselContent class="h-[400px] lg:h-[600px]">
          <CarouselItem v-for="(image, index) in images" :key="image.id" class="h-full">
            <div
              class="bg-muted rounded-lg overflow-hidden w-full flex items-center justify-center h-full cursor-zoom-in"
              @click="openLightbox"
            >
              <img
                :src="getMainUrl(image.image_url) || undefined"
                :alt="image.alt_text || `Изображение товара ${index + 1}`"
                class="w-full h-full object-contain"
                loading="lazy"
              >
            </div>
          </CarouselItem>
        </CarouselContent>

        <!-- Точки для мобильных (показываем только если больше 1 изображения) -->
        <div v-if="images && images.length > 1" class="flex lg:hidden justify-center gap-2 mt-4">
          <button
            v-for="index in slideCount"
            :key="index"
            class="w-2 h-2 rounded-full transition-all" :class="[
              currentSlide === index - 1
                ? 'bg-primary w-6'
                : 'bg-muted-foreground/30',
            ]"
            @click="mainCarouselApi?.scrollTo(index - 1)"
          />
        </div>
      </Carousel>
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
          v-if="images && images.length > 1"
          class="absolute top-4 left-4 z-10 text-white/70 text-sm"
        >
          {{ lightboxSlide + 1 }} / {{ lightboxSlideCount }}
        </div>

        <!-- Карусель лайтбокса -->
        <Carousel
          class="w-full h-full flex items-center"
          :opts="{ loop: true, startIndex: currentSlide }"
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
                :alt="image.alt_text || `Изображение товара ${index + 1}`"
                class="max-w-full max-h-full object-contain select-none"
                draggable="false"
              >
            </CarouselItem>
          </CarouselContent>

          <!-- Стрелки навигации -->
          <template v-if="images && images.length > 1">
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

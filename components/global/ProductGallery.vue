<script setup lang="ts">
import type { ProductImageRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const props = defineProps<{
  images: ProductImageRow[]
}>()

// 👇 Используем getOptimizedUrl вместо getPublicUrl
const { getImageUrl } = useSupabaseStorage()
const { images: imagesRef } = toRefs(props)

const {
  selectedIndex,
  thumbBasisClass,
  onInitMain,
  onInitThumb,
  onThumbClick,
} = useProductGallery(imagesRef, 4)

// 👇 Функция для получения оптимизированного URL
function getThumbUrl(imagePath: string) {
  return getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_THUMB)
}

function getMainUrl(imagePath: string) {
  return getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_MAIN)
}
</script>

<template>
  <div class="grid grid-cols-12 grid-rows-1 gap-4 pt-7">
    <!-- 1. КОЛОНКА С МИНИАТЮРАМИ -->
    <div v-if="images && images.length > 1" class="hidden md:block col-span-2">
      <Carousel
        class="relative w-full max-w-xs"
        orientation="vertical"
        :opts="{ align: 'start', dragFree: true }"
        @init-api="onInitThumb"
      >
        <CarouselContent class="mt-0 h-[600px]">
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
              <!-- 👇 Убрали provider="supabase" и используем оптимизированный URL -->
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

    <!-- 2. КОЛОНКА С ОСНОВНЫМ ИЗОБРАЖЕНИЕМ -->
    <div class="w-full" :class="images && images.length > 1 ? 'col-span-10' : 'col-span-12'">
      <Carousel
        class="w-full h-full relative"
        :opts="{ loop: true }"
        @init-api="onInitMain"
      >
        <CarouselContent class="h-[600px]">
          <CarouselItem v-for="(image, index) in images" :key="image.id" class="h-full">
            <div class="bg-muted rounded-lg overflow-hidden w-full flex items-center justify-center h-full">
              <!-- 👇 Убрали provider="supabase" и используем оптимизированный URL -->
              <img
                :src="getMainUrl(image.image_url) || undefined"
                :alt="image.alt_text || `Изображение товара ${index + 1}`"
                class="w-full h-full object-cover"
                loading="lazy"
              >
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  </div>
</template>

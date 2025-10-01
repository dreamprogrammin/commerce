<script setup lang="ts">
import type { CarouselApi } from '@/components/ui/carousel'
import type { ProductImageRow } from '@/types'
import { watchOnce } from '@vueuse/core'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

// --- 1. PROPS И ИНИЦИАЛИЗАЦИЯ ---
defineProps<{
  images: ProductImageRow[]
}>()
const { getPublicUrl } = useSupabaseStorage()

// --- 2. ЛОГИКА СИНХРОНИЗАЦИИ (из документации) ---
const emblaMainApi = ref<CarouselApi>()
const emblaThumbApi = ref<CarouselApi>()
const selectedIndex = ref(0)

function onSelect() {
  if (!emblaMainApi.value || !emblaThumbApi.value)
    return
  selectedIndex.value = emblaMainApi.value.selectedScrollSnap()
  emblaThumbApi.value.scrollTo(selectedIndex.value)
}

function onThumbClick(index: number) {
  if (!emblaMainApi.value || !emblaThumbApi.value)
    return
  emblaMainApi.value.scrollTo(index)
}

watchOnce(emblaMainApi, (emblaMainApi) => {
  if (!emblaMainApi)
    return
  onSelect()
  emblaMainApi.on('select', onSelect)
  emblaMainApi.on('reInit', onSelect)
})
</script>

<template>
  <!--
    Основной контейнер.
    `h-full` позволяет ему занять высоту родителя (например, 85vh со страницы).
  -->
  <div class="grid grid-cols-12 grid-rows-1 gap-4 h-full">
    <!-- 1. КОЛОНКА С МИНИАТЮРАМИ (ВЕРТИКАЛЬНАЯ КАРУСЕЛЬ) -->
    <div v-if="images && images.length > 1" class="hidden md:block col-span-2">
      <Carousel
        class="w-full h-full"
        orientation="vertical"
        :opts="{ align: 'start', dragFree: true }"
        @init-api="(val) => emblaThumbApi = val"
      >
        <CarouselContent class="-mt-4 h-full">
          <CarouselItem
            v-for="(image, index) in images"
            :key="image.id"
            class="pt-4 basis-1/4 cursor-pointer"
            @click="onThumbClick(index)"
          >
            <!-- Добавляем `opacity` в зависимости от `selectedIndex` -->
            <div
              class="aspect-square bg-muted rounded-lg overflow-hidden border-2 transition-opacity duration-200"
              :class="{ 'border-primary opacity-100': index === selectedIndex, 'border-transparent opacity-60': index !== selectedIndex }"
            >
              <NuxtImg
                :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                alt="Миниатюра товара"
                class="w-full h-full object-cover"
              />
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>

    <!-- 2. КОЛОНКА С ОСНОВНЫМ ИЗОБРАЖЕНИЕМ -->
    <div class="min-w-0" :class="images && images.length > 1 ? 'col-span-10' : 'col-span-12'">
      <Carousel
        class="w-full h-full relative"
        :opts="{ loop: true }"
        @init-api="(val) => emblaMainApi = val"
      >
        <CarouselContent>
          <CarouselItem v-for="(image, index) in images" :key="image.id" class="h-full">
            <div class="bg-muted aspect-square rounded-lg overflow-hidden h-full flex items-center justify-center">
              <NuxtImg
                :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                :alt="image.alt_text || `Изображение товара ${index + 1}`"
                class="w-auto h-auto max-w-full max-h-full object-contain"
              />
            </div>
          </CarouselItem>
        </CarouselContent>

        <!-- ТОЧКИ-ИНДИКАТОРЫ (только для мобильных) -->
        <div v-if="images && images.length > 1" class="absolute bottom-4 left-0 right-0 flex justify-center gap-2 md:hidden">
          <button
            v-for="(image, index) in images"
            :key="`dot-${image.id}`"
            class="w-2.5 h-2.5 rounded-full transition-all duration-300"
            :class="index === selectedIndex ? 'bg-primary scale-110' : 'bg-muted-foreground/50'"
            @click="onThumbClick(index)"
          />
        </div>
      </Carousel>
    </div>
  </div>
</template>

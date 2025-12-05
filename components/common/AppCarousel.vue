<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import Autoplay from 'embla-carousel-autoplay'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

/**
 * 🎨 Props для карусели слайдов
 */
const props = defineProps<{
  slides: SlideRow[]
  isLoading: boolean
  error: any
}>()

const { getImageUrl } = useSupabaseStorage()

// --- CAROUSEL CONFIG ---
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
const containerClass = carouselContainerVariants({ contained: 'always' })

const autoplayPlugin = Autoplay({
  delay: 4000,
  stopOnInteraction: false,
  stopOnMouseEnter: true,
})

const emblaApi = ref<CarouselApi>()

/**
 * 🔥 КЕШИРОВАНИЕ ИЗОБРАЖЕНИЙ С VUE QUERY
 * Предзагружаем все URL изображений и кешируем их
 */
const slideImagesQuery = useQuery({
  queryKey: computed(() => ['slide-images', props.slides.map(s => s.id)]),
  queryFn: async () => {
    const imagePromises = props.slides.map(async (slide) => {
      const desktopUrl = getSlideUrl(slide.image_url)
      const mobileUrl = slide.image_url_mobile
        ? getSlideUrlMobile(slide.image_url_mobile)
        : null

      return {
        id: slide.id,
        desktopUrl,
        mobileUrl,
        blurPlaceholder: slide.blur_placeholder,
        title: slide.title,
        ctaLink: slide.cta_link,
      }
    })

    return await Promise.all(imagePromises)
  },
  enabled: computed(() => props.slides.length > 0 && !props.isLoading && !props.error),
  staleTime: 10 * 60 * 1000, // 10 минут - изображения редко меняются
  gcTime: 30 * 60 * 1000, // 30 минут в кеше
  refetchOnMount: false, // Не перезагружать при монтировании
  refetchOnWindowFocus: false,
})

/**
 * Инициализация карусели при загрузке
 */
function onInit(api: CarouselApi) {
  emblaApi.value = api
}

/**
 * Остановить автопроигрывание при наведении мышью
 */
function stopAutoplay() {
  emblaApi.value?.plugins()?.autoplay?.stop()
}

/**
 * Возобновить автопроигрывание при уходе мышью
 */
function playAutoplay() {
  emblaApi.value?.plugins()?.autoplay?.play()
}

function getSlideUrl(imageUrl: string | null): string | null {
  if (!imageUrl || imageUrl.startsWith('http'))
    return imageUrl
  return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.SLIDER_BANNER)
}

function getSlideUrlMobile(imageUrl: string | null): string | null {
  if (!imageUrl || imageUrl.startsWith('http'))
    return imageUrl
  return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.MOBILE)
}

/**
 * 🔥 Получить закешированные данные изображения по ID
 */
function getCachedSlideData(slideId: number | string) {
  if (!slideImagesQuery.data.value)
    return null
  return slideImagesQuery.data.value.find(img => String(img.id) === String(slideId))
}

/**
 * 🔥 Статус загрузки с учетом кеша
 */
const isActuallyLoading = computed(() => {
  return props.isLoading || slideImagesQuery.isFetching.value
})
</script>

<template>
  <div class="w-full">
    <!-- 🎨 СКЕЛЕТОН КАРУСЕЛИ (при загрузке) -->
    <div v-if="isActuallyLoading" :class="carouselContainerClass">
      <div class="py-4">
        <div class="flex gap-3 md:gap-4 overflow-hidden ml-0 md:-ml-5">
          <!-- Главный видимый слайд-скелетон -->
          <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
            <div class="p-1">
              <Skeleton
                class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9"
              />
            </div>
          </div>

          <!-- Частично видимый следующий слайд -->
          <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
            <div class="p-1">
              <Skeleton
                class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ❌ ОШИБКА ЗАГРУЗКИ -->
    <div
      v-else-if="error || slideImagesQuery.isError.value"
      :class="`${containerClass} w-full aspect-21/9 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center`"
    >
      <h3 class="mt-4 text-lg font-semibold">
        ⚠️ Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ error?.message || slideImagesQuery.error.value?.message }}
      </p>
    </div>

    <!-- 🎬 ОСНОВНАЯ КАРУСЕЛЬ -->
    <ClientOnly v-else-if="slides.length > 0 && slideImagesQuery.data.value">
      <Carousel
        :class="carouselContainerClass"
        :plugins="[autoplayPlugin]"
        :opts="{
          align: 'start',
          loop: true,
        }"
        @init-api="onInit"
        @mouseenter="stopAutoplay"
        @mouseleave="playAutoplay"
      >
        <CarouselContent class="ml-0 md:-ml-5">
          <CarouselItem
            v-for="slide in slides"
            :key="slide.id"
            class="pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4"
          >
            <div class="p-1">
              <Card class="overflow-hidden border-none rounded-2xl group py-0">
                <!-- 🔗 Ссылка на CTA -->
                <NuxtLink
                  :to="slide.cta_link || ''"
                  :external="!!slide.cta_link?.startsWith('http')"
                  class="block"
                >
                  <!-- 🎯 Контейнер изображения с ResponsiveImage -->
                  <CardContent class="relative flex items-center justify-center p-0 overflow-hidden aspect-3/2 md:aspect-19/6 lg:aspect-21/9">
                    <!-- ✅ Используем ResponsiveImage с закешированными URL -->
                    <ResponsiveImage
                      v-if="getCachedSlideData(slide.id)?.desktopUrl"
                      :src="getCachedSlideData(slide.id)!.desktopUrl!"
                      :src-mobile="getCachedSlideData(slide.id)?.mobileUrl || undefined"
                      :blur-data-url="getCachedSlideData(slide.id)?.blurPlaceholder || undefined"
                      :alt="slide.title || 'Слайд'"
                      object-fit="cover"
                      :placeholder-type="getCachedSlideData(slide.id)?.blurPlaceholder ? 'lqip' : 'shimmer'"
                      class="w-full h-full"
                      :eager="true"
                    />

                    <!-- Градиент fallback если нет изображения -->
                    <div
                      v-else
                      class="w-full h-full bg-linear-to-br from-primary to-secondary"
                    />
                  </CardContent>
                </NuxtLink>
              </Card>
            </div>
          </CarouselItem>
        </CarouselContent>

        <!-- 🔘 Кнопки навигации (только на десктопе) -->
        <CarouselPrevious class="absolute left-4 hidden sm:inline-flex" />
        <CarouselNext class="absolute right-4 hidden sm:inline-flex" />
      </Carousel>

      <!-- ⚙️ Fallback для SSR -->
      <template #fallback>
        <div :class="carouselContainerClass">
          <div class="py-4">
            <div class="flex gap-3 md:gap-4 overflow-hidden ml-0 md:-ml-5">
              <!-- Главный видимый слайд-скелетон -->
              <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
                <div class="p-1">
                  <Skeleton
                    class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9"
                  />
                </div>
              </div>

              <!-- Частично видимый следующий слайд -->
              <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
                <div class="p-1">
                  <Skeleton
                    class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- 📭 ПУСТОЕ СОСТОЯНИЕ -->
    <div
      v-else
      :class="`${containerClass} w-full aspect-21/9 bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed`"
    >
      <p class="text-muted-foreground">
        📭 Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import Autoplay from 'embla-carousel-autoplay'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

/**
 * 🎨 Props для карусели слайдов
 */
defineProps<{
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

/**
 * 🎯 Получить оптимизированный URL слайда
 *
 * Поддерживает:
 * - Внешние URL (не трогаем)
 * - URL из Supabase Storage (оптимизируем через getImageUrl)
 */
function getSlideUrl(imageUrl: string | null): string | null {
  if (!imageUrl)
    return null

  // Если это полный URL (внешний источник) - возвращаем как есть
  if (imageUrl.startsWith('http'))
    return imageUrl

  // Если это путь в Storage - оптимизируем через getImageUrl
  return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.HERO)
}
</script>

<template>
  <div class="w-full">
    <!-- 🎨 СКЕЛЕТОН КАРУСЕЛИ (при загрузке) -->
    <div v-if="isLoading" :class="carouselContainerClass">
      <div class="py-4">
        <div class="flex gap-3 md:gap-4 overflow-hidden">
          <!-- Главный видимый слайд -->
          <div class="flex-shrink-0 w-[80%] md:w-[83.33%] lg:w-[87.5%] pl-3 lg:pl-0">
            <Skeleton
              class="w-full aspect-[21/9] rounded-2xl"
            />
          </div>

          <!-- Частично видимый следующий слайд -->
          <div class="flex-shrink-0 w-[20%] md:w-[16.67%] lg:w-[12.5%]">
            <Skeleton
              class="w-full aspect-[21/9] rounded-2xl opacity-60"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ❌ ОШИБКА ЗАГРУЗКИ -->
    <div
      v-else-if="error"
      :class="`${containerClass} w-full aspect-[21/9] bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center`"
    >
      <h3 class="mt-4 text-lg font-semibold">
        ⚠️ Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ error.message }}
      </p>
    </div>

    <!-- 🎬 ОСНОВНАЯ КАРУСЕЛЬ -->
    <ClientOnly v-else-if="slides.length > 0">
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
            class="pl-3 basis-4/5 md:basis-5/6 lg:basis-6/9 lg:pl-4 md:pl-4"
          >
            <div class="p-1">
              <Card class="overflow-hidden border-none rounded-2xl group py-0">
                <!-- 🔗 Ссылка на CTA -->
                <NuxtLink
                  :to="slide.cta_link || ''"
                  :external="!!slide.cta_link?.startsWith('http')"
                  class="block"
                >
                  <!-- 🎯 Контейнер изображения с ProgressiveImage -->
                  <CardContent class="relative flex items-center justify-center p-0 overflow-hidden aspect-[16/9] md:aspect-[19/6] lg:aspect-[21/9]">
                    <!-- ✅ Используем ProgressiveImage с blur_placeholder из БД -->
                    <ProgressiveImage
                      v-if="slide.image_url"
                      :src="getSlideUrl(slide.image_url)"
                      :blur-data-url="slide.blur_placeholder"
                      :alt="slide.title || 'Слайд'"
                      object-fit="cover"
                      :placeholder-type="slide.blur_placeholder ? 'blur' : 'shimmer'"
                      class="w-full h-full"
                    />

                    <!-- Градиент fallback если нет изображения -->
                    <div
                      v-else
                      class="w-full h-full bg-gradient-to-br from-primary to-secondary"
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
        <div :class="containerClass">
          <div class="py-4">
            <div class="flex gap-3 md:gap-4 overflow-hidden">
              <div class="flex-shrink-0 w-[80%] md:w-[83.33%] lg:w-[87.5%] pl-3 lg:pl-0">
                <Skeleton
                  class="w-full aspect-[21/9] rounded-2xl"
                />
              </div>
              <div class="flex-shrink-0 w-[20%] md:w-[16.67%] lg:w-[12.5%]">
                <Skeleton
                  class="w-full aspect-[21/9] rounded-2xl opacity-60"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- 📭 ПУСТОЕ СОСТОЯНИЕ -->
    <div
      v-else
      :class="`${containerClass} w-full aspect-[21/9] bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed`"
    >
      <p class="text-muted-foreground">
        📭 Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>

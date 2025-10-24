<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import Autoplay from 'embla-carousel-autoplay'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useSlides } from '@/composables/slides/useSlides'
import { BUCKET_NAME_SLIDES } from '@/constants' // Добавьте константу для bucket слайдов
import Skeleton from '../ui/skeleton/Skeleton.vue'

const { isLoading, slides, error } = useSlides()
const { getOptimizedUrl } = useSupabaseStorage()

const autoplayPlugin = Autoplay({
  delay: 4000,
  stopOnInteraction: false,
  stopOnMouseEnter: true,
})

const emblaApi = ref<CarouselApi>()

function onInit(api: CarouselApi) {
  emblaApi.value = api
}

function stopAutoplay() {
  emblaApi.value?.plugins()?.autoplay?.stop()
}

function playAutoplay() {
  emblaApi.value?.plugins()?.autoplay?.play()
}

// 👇 Функция для получения оптимизированного URL слайда
function getSlideImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return undefined

  // Если это уже полный URL (начинается с http), используем его напрямую
  if (imageUrl.startsWith('http')) {
    return imageUrl
  }

  // Иначе получаем оптимизированный URL из Supabase
  return getOptimizedUrl(BUCKET_NAME_SLIDES, imageUrl, {
    width: 1920,
    height: 800,
    quality: 85,
    format: 'webp',
    resize: 'cover',
  })
}
</script>

<template>
  <div class="w-full">
    <!-- Состояние загрузки -->
    <div v-if="isLoading">
      <Carousel
        class="w-full"
        :opts="{
          align: 'start',
          loop: false,
        }"
      >
        <CarouselContent class="-ml-4">
          <CarouselItem
            v-for="i in 2"
            :key="i"
            class="pl-4 basis-4/5 md:basis-5/6 lg:basis-7/8"
          >
            <div class="p-1">
              <Card
                class="overflow-hidden border-none shadow-xl rounded-2xl group py-0"
              >
                <CardContent
                  class="relative flex h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] items-center justify-center p-0"
                >
                  <Skeleton class="w-full h-full" />
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>

    <!-- Состояние ошибки -->
    <div
      v-else-if="error"
      class="w-full aspect-[16/7] bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center"
    >
      <h3 class="mt-4 text-lg font-semibold">
        Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ error.message }}
      </p>
    </div>

    <!-- Карусель с слайдами -->
    <Carousel
      v-else-if="slides && slides.length > 0"
      class="w-full"
      :plugins="[autoplayPlugin]"
      :opts="{
        align: 'start',
        loop: true,
      }"
      @init-api="onInit"
      @mouseenter="stopAutoplay"
      @mouseleave="playAutoplay"
    >
      <CarouselContent class="-ml-4">
        <CarouselItem
          v-for="slide in slides"
          :key="slide.id"
          class="pl-4 basis-4/5 md:basis-5/6 lg:basis-7/8"
        >
          <div class="p-1">
            <Card
              class="overflow-hidden border-none shadow-xl rounded-2xl group py-0"
            >
              <NuxtLink
                :to="slide.cta_link || ''"
                :external="!!slide.cta_link?.startsWith('http')"
                class="block"
              >
                <CardContent
                  class="relative flex h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] items-center justify-center p-0"
                >
                  <img
                    v-if="slide.image_url"
                    :src="getSlideImageUrl(slide.image_url) || undefined"
                    :alt="slide.title"
                    class="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-105"
                    loading="lazy"
                  >
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
      <CarouselPrevious class="absolute left-4 hidden sm:inline-flex" />
      <CarouselNext class="absolute right-4 hidden sm:inline-flex" />
    </Carousel>

    <!-- Пустое состояние -->
    <div
      v-else
      class="w-full aspect-[16/7] bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed"
    >
      <p class="text-muted-foreground">
        Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Ваши стили */
</style>

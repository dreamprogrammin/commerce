<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import Autoplay from 'embla-carousel-autoplay'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

defineProps<{
  slides: SlideRow[]
  isLoading: boolean
  error: any
}>()

const { getImageUrl } = useSupabaseStorage()
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
const containerClass = carouselContainerVariants({ contained: 'always' })
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

function getSlideUrl(imageUrl: string | null) {
  if (!imageUrl)
    return undefined

  if (imageUrl.startsWith('http'))
    return imageUrl

  return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.SLIDER_BANNER)
}
</script>

<template>
  <div class="w-full">
    <!-- 🎨 Скелетон карусели с выглядывающим вторым слайдом -->
    <div v-if="isLoading" :class="carouselContainerClass">
      <div class="py-4">
        <div class="flex gap-3 md:gap-4 overflow-hidden">
          <!-- Главный видимый слайд -->
          <div class="flex-shrink-0 w-[80%] md:w-[83.33%] lg:w-[87.5%] pl-3 lg:pl-0">
            <Skeleton class="h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] w-full rounded-2xl" />
          </div>

          <!-- Частично видимый следующий слайд -->
          <div class="flex-shrink-0 w-[20%] md:w-[16.67%] lg:w-[12.5%]">
            <Skeleton class="h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] w-full rounded-2xl opacity-60" />
          </div>
        </div>
      </div>
    </div>

    <!-- Ошибка загрузки -->
    <div
      v-else-if="error"
      :class="`${containerClass} w-full aspect-[16/7] bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center`"
    >
      <h3 class="mt-4 text-lg font-semibold">
        Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ error.message }}
      </p>
    </div>

    <!-- Основная карусель -->
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
            class="pl-3 basis-4/5 md:basis-5/6 lg:basis-7/8 lg:pl-4 md:pl-4"
          >
            <div class="p-1">
              <Card class="overflow-hidden border-none rounded-2xl group py-0">
                <NuxtLink
                  :to="slide.cta_link || ''"
                  :external="!!slide.cta_link?.startsWith('http')"
                  class="block"
                >
                  <CardContent class="relative flex h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] items-center justify-center p-0">
                    <img
                      v-if="slide.image_url"
                      :src="getSlideUrl(slide.image_url) || undefined"
                      :alt="slide.title"
                      class="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-105"
                      loading="eager"
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

      <!-- Fallback для SSR -->
      <template #fallback>
        <div :class="containerClass">
          <div class="py-4">
            <div class="flex gap-3 md:gap-4 overflow-hidden">
              <div class="flex-shrink-0 w-[80%] md:w-[83.33%] lg:w-[87.5%] pl-3 lg:pl-0">
                <Skeleton class="h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] w-full rounded-2xl" />
              </div>
              <div class="flex-shrink-0 w-[20%] md:w-[16.67%] lg:w-[12.5%]">
                <Skeleton class="h-[35vh] md:h-[65vh] min-h-[250px] max-h-[400px] w-full rounded-2xl opacity-60" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- Пустое состояние -->
    <div
      v-else
      :class="`${containerClass} w-full aspect-[16/7] bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed`"
    >
      <p class="text-muted-foreground">
        Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>

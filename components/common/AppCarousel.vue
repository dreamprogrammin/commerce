<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import Autoplay from 'embla-carousel-autoplay'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'

const props = defineProps<{
  slides: SlideRow[]
  isLoading: boolean
  error: any
}>()

const isDesktop = ref(false)
onMounted(() => {
  // Устанавливаем isDesktop только на клиенте
  isDesktop.value = window.matchMedia('(min-width: 1024px)').matches
})

const { getImageUrl } = useSupabaseStorage()

// 👇 Добавляем минимальную задержку для показа скелета
const showSkeleton = ref(true)
const minLoadingTime = 300 // миллисекунды

onMounted(() => {
  setTimeout(() => {
    showSkeleton.value = false
  }, minLoadingTime)
})

// Или используйте computed с задержкой
const isActuallyLoading = computed(() => {
  return props.isLoading || showSkeleton.value
})

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
    <div v-if="isActuallyLoading" class="app-container">
      <Skeleton class="h-[35vh] md:h-[65vh] w-full rounded-2xl" />
    </div>

    <div
      v-else-if="error"
      class="app-container w-full aspect-[16/7] bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center"
    >
      <h3 class="mt-4 text-lg font-semibold">
        Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ error.message }}
      </p>
    </div>

    <Carousel
      v-else-if="slides.length > 0"
      class="w-full"
      :class="{ 'app-container': isDesktop }"
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
      <ClientOnly>
        <CarouselPrevious class="absolute left-4 hidden sm:inline-flex" />
        <CarouselNext class="absolute right-4 hidden sm:inline-flex" />
      </ClientOnly>
    </Carousel>

    <div
      v-else
      class="app-container w-full aspect-[16/7] bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed"
    >
      <p class="text-muted-foreground">
        Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>

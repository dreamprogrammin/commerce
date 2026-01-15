<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

interface Props {
  slides?: SlideRow[] | null
  isLoading?: boolean
  error?: Error | null
}

const props = defineProps<Props>()

const { getImageUrl } = useSupabaseStorage()

const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
const containerClass = carouselContainerVariants({ contained: 'always' })

// ✅ Динамический импорт Autoplay только на клиенте
const Autoplay = ref<any>(null)
const autoplayPlugin = ref<any>(null)

onMounted(async () => {
  if (process.client) {
    const AutoplayModule = await import('embla-carousel-autoplay')
    Autoplay.value = AutoplayModule.default
    autoplayPlugin.value = Autoplay.value({
      delay: 4000,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    })
  }
})

const emblaApi = ref<CarouselApi>()

const processedSlides = computed(() => {
  if (!props.slides || !Array.isArray(props.slides))
    return []

  return props.slides.map(slide => ({
    ...slide,
    desktopUrl: getSlideUrl(slide.image_url),
    mobileUrl: slide.image_url_mobile ? getSlideUrlMobile(slide.image_url_mobile) : null,
  }))
})

const showSkeleton = computed(() => props.isLoading && processedSlides.value.length === 0)

function onInit(api: CarouselApi) {
  emblaApi.value = api
}

function stopAutoplay() {
  emblaApi.value?.plugins()?.autoplay?.stop()
}

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
</script>

<template>
  <div class="w-full">
    <!-- ❌ ОШИБКА ЗАГРУЗКИ -->
    <div
      v-if="props.error"
      :class="`${containerClass} w-full aspect-21/9 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center p-4 text-center`"
    >
      <h3 class="mt-4 text-lg font-semibold">
        ⚠️ Не удалось загрузить слайдер
      </h3>
      <p class="text-sm">
        {{ props.error.message }}
      </p>
    </div>

    <!-- 🎨 СКЕЛЕТОН -->
    <div v-else-if="showSkeleton" :class="carouselContainerClass">
      <div class="py-4">
        <div class="flex gap-3 md:gap-4 overflow-hidden ml-0 md:-ml-5">
          <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
            <div class="p-1">
              <div class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9 bg-muted animate-pulse" />
            </div>
          </div>
          <div class="shrink-0 pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4">
            <div class="p-1">
              <div class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9 bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 🎬 КАРУСЕЛЬ -->
    <template v-else-if="processedSlides.length > 0">
      <Carousel
        :class="carouselContainerClass"
        :plugins="autoplayPlugin ? [autoplayPlugin] : []"
        :opts="{ align: 'start', loop: true }"
        @init-api="onInit"
        @mouseenter="stopAutoplay"
        @mouseleave="playAutoplay"
      >
        <CarouselContent class="ml-0 md:-ml-5">
          <CarouselItem
            v-for="slide in processedSlides"
            :key="slide.id"
            class="pl-3 basis-4/5 md:basis-5/6 lg:pl-4 md:pl-4"
          >
            <div class="p-1">
              <Card class="overflow-hidden border-none rounded-2xl group py-0">
                <NuxtLink
                  :to="slide.cta_link || ''"
                  :external="!!slide.cta_link?.startsWith('http')"
                  class="block"
                >
                  <CardContent class="relative flex items-center justify-center p-0 overflow-hidden aspect-3/2 md:aspect-19/6 lg:aspect-21/9">
                    <ProgressiveImage
                      v-if="slide.desktopUrl"
                      :src="slide.mobileUrl || slide.desktopUrl"
                      :blur-data-url="slide.blur_placeholder || undefined"
                      :alt="slide.title || 'Слайд'"
                      object-fit="cover"
                      :placeholder-type="slide.blur_placeholder ? 'lqip' : 'shimmer'"
                      aspect-ratio="21/9"
                      class="w-full h-full"
                      :eager="true"
                    />
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

        <!-- ✅ Кнопки только на клиенте -->
        <ClientOnly>
          <CarouselPrevious class="absolute left-4 hidden sm:inline-flex" />
          <CarouselNext class="absolute right-4 hidden sm:inline-flex" />
        </ClientOnly>
      </Carousel>
    </template>

    <!-- 📭 ПУСТОЕ СОСТОЯНИЕ -->
    <div
      v-else-if="!showSkeleton && processedSlides.length === 0"
      :class="`${containerClass} w-full aspect-21/9 bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed`"
    >
      <p class="text-muted-foreground">
        📭 Нет активных слайдов для отображения.
      </p>
    </div>
  </div>
</template>
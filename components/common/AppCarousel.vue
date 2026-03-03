<script setup lang="ts">
import type { CarouselApi } from '../ui/carousel'
import type { SlideRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_SLIDES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

interface Props {
  slides?: SlideRow[] | null
  isLoading?: boolean
  error?: Error | null
}

const props = defineProps<Props>()

const { getVariantUrlWide } = useSupabaseStorage()

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

function buildSrcset(imageUrl: string | null): string | undefined {
  if (!imageUrl || imageUrl.startsWith('http'))
    return undefined
  const sm = getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, 'sm')
  const md = getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, 'md')
  const lg = getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, 'lg')
  const parts: string[] = []
  if (sm)
    parts.push(`${sm} 640w`)
  if (md)
    parts.push(`${md} 1280w`)
  if (lg)
    parts.push(`${lg} 1920w`)
  return parts.length > 0 ? parts.join(', ') : undefined
}

const processedSlides = computed(() => {
  if (!props.slides || !Array.isArray(props.slides))
    return []

  return props.slides.map((slide) => {
    const dUrl = getSlideUrl(slide.image_url)
    const mUrl = slide.image_url_mobile
      ? getSlideUrlMobile(slide.image_url_mobile)
      : null

    return {
      ...slide,
      desktopUrl: dUrl,
      desktopSrcset: buildSrcset(slide.image_url),
      mobileUrl: mUrl || dUrl,
      mobileSrcset: buildSrcset(slide.image_url_mobile || slide.image_url),
      _loaded: false,
    }
  })
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
  return getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, 'lg')
}

function getSlideUrlMobile(imageUrl: string | null): string | null {
  if (!imageUrl || imageUrl.startsWith('http'))
    return imageUrl
  return getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, 'sm')
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
        <div class="p-1">
          <div class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9 bg-muted animate-pulse" />
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
                    <template v-if="slide.desktopUrl">
                      <!-- LQIP placeholder overlay -->
                      <div
                        v-if="!slide._loaded && slide.blur_placeholder"
                        class="absolute inset-0 z-10 overflow-hidden"
                      >
                        <img
                          :src="slide.blur_placeholder"
                          alt=""
                          class="w-full h-full object-cover blur-2xl scale-110"
                        >
                      </div>

                      <!-- Art Direction picture -->
                      <picture>
                        <!-- Mobile: < 768px -->
                        <source
                          v-if="slide.mobileSrcset"
                          media="(max-width: 767px)"
                          :srcset="slide.mobileSrcset"
                          sizes="100vw"
                        >
                        <!-- Desktop (default) -->
                        <img
                          :src="slide.desktopUrl"
                          :srcset="slide.desktopSrcset"
                          sizes="(max-width: 1024px) 85vw, 80vw"
                          :alt="slide.title || 'Слайд'"
                          class="w-full h-full object-cover"
                          fetchpriority="high"
                          @load="slide._loaded = true"
                          @error="slide._loaded = true"
                        >
                      </picture>
                    </template>
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

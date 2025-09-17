<script setup lang="ts">
import type { CarouselApi } from '@/components/ui/carousel'
import type { ProductImageRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

defineProps<{
  images: ProductImageRow[]
}>()

const { getPublicUrl } = useSupabaseStorage()

const emblaMainApi = ref<CarouselApi>()
const emblaThumbApi = ref<CarouselApi>()

const selectedIndex = ref(0)

// events
const onInitMain = (api: CarouselApi) => emblaMainApi.value = api
const onInitThumb = (api: CarouselApi) => emblaThumbApi.value = api

function onThumbClick(index: number) {
  if (!emblaMainApi.value || !emblaThumbApi.value)
    return
  emblaMainApi.value.scrollTo(index)
}

function onSelect() {
  if (!emblaMainApi.value || !emblaThumbApi.value)
    return
  selectedIndex.value = emblaMainApi.value.selectedScrollSnap()
  emblaThumbApi.value.scrollTo(selectedIndex.value)
}

onMounted(() => {
  if (!emblaMainApi.value)
    return
  emblaMainApi.value.on('select', onSelect)
  emblaMainApi.value.on('reInit', onSelect)
})
</script>

<template>
  <!--
    Основной контейнер теперь использует Flexbox.
    `flex-col-reverse` на маленьких экранах (до `md`) разместит миниатюры СНИЗУ.
    `md:flex-row` на средних и больших экранах разместит их СЛЕВА.
  -->
  <div class="flex flex-col-reverse md:flex-row gap-4">
    <!-- 1. Карусель миниатюр (Вертикальная) -->
    <div v-if="images && images.length > 1">
      <Carousel
        class="w-full md:w-20"
        orientation="vertical"
        :opts="{ align: 'start', containScroll: 'keepSnaps' }"
        @init-api="onInitThumb"
      >
        <CarouselContent class="-mt-2 h-96 md:h-[500px]">
          <CarouselItem
            v-for="(image, index) in images"
            :key="image.id"
            class="pt-2 basis-1/4 md:basis-auto"
            @click="onThumbClick(index)"
          >
            <div
              class="aspect-square bg-muted rounded-md overflow-hidden border cursor-pointer transition-all"
              :class="{ 'opacity-100 ring-2 ring-primary': index === selectedIndex, 'opacity-60 hover:opacity-100': index !== selectedIndex }"
            >
              <NuxtImg
                :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                alt="Миниатюра товара"
                width="200" height="200" fit="cover" format="webp" quality="80"
                placeholder
                class="w-full h-full object-cover"
              />
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>

    <!-- 2. Основная карусель (большие изображения) -->
    <!-- `flex-grow` заставит ее занять все оставшееся пространство -->
    <div class="flex-grow">
      <Carousel
        class="w-full"
        @init-api="onInitMain"
      >
        <CarouselContent>
          <CarouselItem v-for="image in images" :key="image.id">
            <div class="aspect-square bg-muted rounded-lg overflow-hidden border">
              <NuxtImg
                :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                :alt="image.alt_text || 'Изображение товара'"
                width="800" height="800" fit="contain" format="webp" quality="85"
                placeholder
                class="w-full h-full object-cover"
              />
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  </div>
</template>

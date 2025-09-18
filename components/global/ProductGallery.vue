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
  <div class-="flex flex-col md:flex-row gap-4">
    <div v-if="images && images.length > 1" class="hidden md:block">
      <Carousel
        class="w-20"
        orientation="vertical"
        :opts="{ align: 'start', containScroll: 'keepSnaps' }"
        @init-api="onInitThumb"
      >
        <CarouselContent class="-mt-2 h-[500px]">
          <CarouselItem
            v-for="(image, index) in images"
            :key="image.id"
            class="pt-2"
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

    <div class="flex-1">
      <Carousel
        class="w-full"
        :opts="{
          loop: true,
        }"
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

        <div v-if="images && images.length > 1" class="absolute bottom-4 left-0 right-0 flex justify-center gap-2 md:hidden">
          <button
            v-for="(image, index) in images"
            :key="`dot-${image.id}`"
            class="w-2 h-2 rounded-full transition-all duration-300"
            :class="index === selectedIndex ? 'bg-primary scale-125' : 'bg-muted-foreground/50'"
            @click="onThumbClick(index)"
          />
        </div>
      </Carousel>
    </div>
  </div>
</template>

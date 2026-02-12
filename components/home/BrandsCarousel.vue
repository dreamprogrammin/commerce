<script setup lang="ts">
import type { Brand } from '@/types'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { carouselContainerVariants } from '@/lib/variants'

const { getImageUrl } = useSupabaseStorage()

interface Props {
  brands: Brand[]
}

const props = defineProps<Props>()

const headerContainerClass = carouselContainerVariants({ contained: 'always' })
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })

// Получить URL логотипа бренда
function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl) return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}
</script>

<template>
  <section v-if="brands && brands.length > 0" class="py-8 md:py-12 bg-linear-to-b from-background to-muted/10">
    <!-- Заголовок с кнопкой -->
    <div :class="headerContainerClass">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl md:text-3xl font-bold">
          Популярные бренды
        </h2>
        <NuxtLink
          to="/brands"
          class="text-sm md:text-base text-primary hover:underline flex items-center gap-1"
        >
          Смотреть все
          <Icon name="lucide:arrow-right" class="w-4 h-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- Карусель брендов (стиль Instagram Stories) -->
    <div class="overflow-hidden">
      <div class="pl-0 -mr-2 sm:-mr-6 lg:mx-auto">
        <Carousel
          class="w-full"
          :class="carouselContainerClass"
          :opts="{
            align: 'start',
          }"
        >
          <CarouselContent class="-ml-1">
            <CarouselItem
              v-for="brand in brands"
              :key="brand.id"
              class="pl-2 md:pl-0
                basis-[22%]
                sm:basis-[18%]
                md:basis-[15%]
                lg:basis-[12%]
                xl:basis-[10%]"
            >
              <NuxtLink
                :to="`/brand/${brand.slug}`"
                class="flex flex-col items-center gap-2 group"
              >
                <!-- Круглый аватар с градиентной рамкой (как в Instagram) -->
                <div class="relative">
                  <!-- Градиентная рамка -->
                  <div class="w-16 h-16 md:w-36 md:h-36 rounded-full bg-linear-to-tr from-purple-600 via-pink-600 to-orange-500 p-0.5 group-hover:p-0.75 transition-all duration-300">
                    <!-- Белый фон -->
                    <div class="w-full h-full rounded-full bg-background p-0.75">
                      <!-- Логотип бренда -->
                      <div class="w-full h-full rounded-full bg-muted/50 flex items-center justify-center overflow-hidden">
                        <ProgressiveImage
                          v-if="brand.logo_url"
                          :src="getBrandLogoUrl(brand.logo_url) || ''"
                          :alt="brand.name"
                          aspect-ratio="square"
                          object-fit="contain"
                          placeholder-type="shimmer"
                          class="w-full h-full p-2"
                        />
                        <Icon
                          v-else
                          name="lucide:package"
                          class="w-8 h-8 md:w-10 md:h-10 text-muted-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Индикатор активности (опционально) -->
                  <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <!-- Название бренда -->
                <span class="text-xs md:text-sm font-medium text-center line-clamp-1 max-w-20 md:max-w-25 group-hover:text-primary transition-colors">
                  {{ brand.name }}
                </span>
              </NuxtLink>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  </section>
</template>

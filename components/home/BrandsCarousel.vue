<script setup lang="ts">
import type { Brand } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

const { getVariantUrl } = useSupabaseStorage()

interface Props {
  brands: Brand[]
}

const props = defineProps<Props>()

const headerContainerClass = carouselContainerVariants({ contained: 'always' })

// Получить URL логотипа бренда
function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl) return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
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
      <div class="pl-2 -mr-2 sm:pl-6 sm:-mr-6 lg:pl-0 lg:mr-0 lg:mx-auto">
        <Carousel
          class="w-full"
          :opts="{
            align: 'start',
          }"
        >
          <CarouselContent class="-ml-1">
            <CarouselItem
              v-for="brand in brands"
              :key="brand.id"
              class="pl-2 md:pl-0
                basis-[28%]
                sm:basis-[22%]
                md:basis-[18%]
                lg:basis-[14%]
                xl:basis-[12%]"
            >
              <NuxtLink
                :to="`/brand/${brand.slug}`"
                class="flex flex-col items-center gap-2 group"
              >
                <!-- Круглый аватар с градиентной рамкой (как в Instagram) -->
                <div class="relative">
                  <!-- Градиентная рамка -->
                  <div class="w-20 h-20 md:w-28 md:h-28 rounded-full bg-linear-to-tr from-purple-600 via-pink-600 to-orange-500 p-0.5 group-hover:p-0.75 transition-all duration-300">
                    <!-- Белый фон -->
                    <div class="w-full h-full rounded-full bg-background p-0.5">
                      <!-- Логотип бренда -->
                      <div class="relative w-full h-full rounded-full bg-muted/50 overflow-hidden flex items-center justify-center">
                        <div v-if="brand.logo_url" class="absolute inset-0 p-1 flex items-center justify-center">
                          <ProgressiveImage
                            :src="getBrandLogoUrl(brand.logo_url) || ''"
                            :blur-data-url="brand.blur_placeholder"
                            :alt="brand.name"
                            object-fit="contain"
                            :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
                            class="w-full h-full"
                          />
                        </div>
                        <Icon
                          v-else
                          name="lucide:package"
                          class="w-9 h-9 md:w-11 md:h-11 text-muted-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Индикатор активности (опционально) -->
                  <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <!-- Название бренда -->
                <span class="text-xs md:text-sm font-medium text-center line-clamp-1 max-w-24 md:max-w-28 group-hover:text-primary transition-colors">
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

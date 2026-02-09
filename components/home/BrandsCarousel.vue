<script setup lang="ts">
import type { Brand } from '@/types'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { carouselContainerVariants } from '@/lib/variants'

const { getImageUrl } = useSupabaseStorage()
const containerClass = carouselContainerVariants({ contained: 'desktop' })

interface Props {
  brands: Brand[]
}

const props = defineProps<Props>()

// Получить URL логотипа бренда
function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl) return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}
</script>

<template>
  <section class="py-8 md:py-12 bg-linear-to-b from-background to-muted/10">
    <div :class="`${containerClass} mx-auto px-4`">
      <!-- Заголовок с кнопкой -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl md:text-3xl font-bold">
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

      <!-- Карусель брендов (стиль Instagram Stories) -->
      <div class="relative">
        <!-- Градиенты для краёв -->
        <div class="absolute left-0 top-0 bottom-0 w-12 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
        <div class="absolute right-0 top-0 bottom-0 w-12 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />

        <!-- Скроллящийся контейнер -->
        <div class="overflow-x-auto scrollbar-hide -mx-2">
          <div class="flex gap-4 md:gap-6 px-2 py-2">
            <NuxtLink
              v-for="brand in brands"
              :key="brand.id"
              :to="`/brand/${brand.slug}`"
              class="flex flex-col items-center gap-2 min-w-20 md:min-w-25 group"
            >
              <!-- Круглый аватар с градиентной рамкой (как в Instagram) -->
              <div class="relative">
                <!-- Градиентная рамка -->
                <div class="w-16 h-16 md:w-20 md:h-20 rounded-full bg-linear-to-tr from-purple-600 via-pink-600 to-orange-500 p-[2px] group-hover:p-[3px] transition-all duration-300">
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
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Скрываем скроллбар */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

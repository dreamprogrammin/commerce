<script setup lang="ts">
import type { BrandForFilter } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'

const props = defineProps<{
  brands: BrandForFilter[]
}>()

const { getImageUrl } = useSupabaseStorage()

// Получить URL логотипа бренда с оптимизацией
function getBrandLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}
</script>

<template>
  <div v-if="brands.length > 0" class="mt-12 pt-8 border-t">
    <div>
      <h2 class="text-2xl md:text-3xl font-bold mb-2">
        Популярные бренды
      </h2>
      <p class="text-muted-foreground mb-6">
        Выберите бренд для просмотра товаров
      </p>
    </div>

    <!-- Сетка брендов -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
      <NuxtLink
        v-for="brand in brands"
        :key="brand.id"
        :to="`/brand/${brand.slug}`"
        class="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 w-[100px] h-[140px] sm:w-[110px] sm:h-[145px] md:w-[120px] md:h-[150px] lg:w-[130px] lg:h-[155px]"
      >
        <!-- Логотип бренда -->
        <div class="flex-1 w-full rounded-lg overflow-hidden border border-border/50 group-hover:border-primary/30 transition-colors flex items-center justify-center bg-background">
          <ProgressiveImage
            v-if="brand.logo_url"
            :src="getBrandLogoUrl(brand.logo_url)"
            :alt="brand.name"
            object-fit="contain"
            placeholder-type="shimmer"
            class="w-full h-full p-1"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-muted-foreground"
          >
            <Icon name="lucide:image" class="w-8 h-8 md:w-10 md:h-10 opacity-30" />
          </div>
        </div>

        <!-- Название бренда -->
        <div class="text-center w-full">
          <div class="font-semibold text-xs md:text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {{ brand.name }}
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

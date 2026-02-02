<script setup lang="ts">
import type { BrandForFilter, ProductLine } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'

const props = defineProps<{
  productLines: ProductLine[]
  brands: BrandForFilter[]
}>()

const { getImageUrl } = useSupabaseStorage()

// Получить URL логотипа линейки с оптимизацией
function getProductLineLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getImageUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}

// Получить бренд для линейки
function getBrandSlug(brandId: string): string {
  return props.brands.find(b => b.id === brandId)?.slug || ''
}

function getBrandName(brandId: string): string {
  return props.brands.find(b => b.id === brandId)?.name || ''
}
</script>

<template>
  <div v-if="productLines.length > 0" class="mt-12 pt-8 border-t">
    <div>
      <h2 class="text-2xl md:text-3xl font-bold mb-2">
        Линейки продуктов
      </h2>
      <p class="text-muted-foreground mb-6">
        Коллекции и серии товаров от известных брендов
      </p>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
      <NuxtLink
        v-for="line in productLines.slice(0, 18)"
        :key="line.id"
        :to="`/brand/${getBrandSlug(line.brand_id)}/${line.slug}`"
        class="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 w-[100px] h-[160px] sm:w-[110px] sm:h-[165px] md:w-[120px] md:h-[170px] lg:w-[130px] lg:h-[175px]"
      >
        <!-- Логотип линейки -->
        <div class="flex-1 w-full rounded-lg overflow-hidden border border-border/50 group-hover:border-primary/30 transition-colors flex items-center justify-center bg-background">
          <ProgressiveImage
            v-if="line.logo_url"
            :src="getProductLineLogoUrl(line.logo_url)"
            :alt="line.name"
            object-fit="contain"
            placeholder-type="shimmer"
            class="w-full h-full p-1"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-muted-foreground"
          >
            <Icon name="lucide:sparkles" class="w-8 h-8 md:w-10 md:h-10 opacity-30" />
          </div>
        </div>

        <!-- Название линейки -->
        <div class="text-center w-full flex-shrink-0">
          <div class="font-semibold text-xs md:text-sm line-clamp-2 mb-0.5 group-hover:text-primary transition-colors">
            {{ line.name }}
          </div>
          <div class="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
            {{ getBrandName(line.brand_id) }}
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

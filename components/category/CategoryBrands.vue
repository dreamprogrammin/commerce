<script setup lang="ts">
import type { BrandForFilter, ProductLine } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'

const props = defineProps<{
  brands: BrandForFilter[]
  productLines: ProductLine[]
}>()

const { getImageUrl } = useSupabaseStorage()

// Получить URL логотипа бренда с оптимизацией
function getBrandLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}

// Группируем линейки по брендам
const linesByBrand = computed(() => {
  const map = new Map<string, ProductLine[]>()
  props.productLines.forEach((line) => {
    const brandId = line.brand_id
    if (!map.has(brandId)) {
      map.set(brandId, [])
    }
    map.get(brandId)?.push(line)
  })
  return map
})

// Получаем логотип бренда для линейки
function getBrandForLine(lineId: string) {
  const line = props.productLines.find(l => l.id === lineId)
  if (!line) return null
  return props.brands.find(b => b.id === line.brand_id)
}
</script>

<template>
  <div v-if="brands.length > 0" class="mt-12 pt-8 border-t">
    <div class="space-y-8">
      <!-- Заголовок брендов -->
      <div>
        <h2 class="text-2xl md:text-3xl font-bold mb-2">
          Популярные бренды
        </h2>
        <p class="text-muted-foreground">
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

      <!-- Линейки продуктов (если есть) -->
      <div v-if="productLines.length > 0" class="pt-8 border-t">
        <div class="mb-6">
          <h2 class="text-2xl md:text-3xl font-bold mb-2">
            Линейки продуктов
          </h2>
          <p class="text-muted-foreground">
            Коллекции и серии товаров от известных брендов
          </p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          <NuxtLink
            v-for="line in productLines.slice(0, 18)"
            :key="line.id"
            :to="`/brand/${brands.find(b => b.id === line.brand_id)?.slug}/${line.slug}`"
            class="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 w-[100px] h-[160px] sm:w-[110px] sm:h-[165px] md:w-[120px] md:h-[170px] lg:w-[130px] lg:h-[175px]"
          >
            <!-- Логотип бренда линейки -->
            <div class="flex-1 w-full rounded-lg overflow-hidden border border-border/50 group-hover:border-primary/30 transition-colors flex items-center justify-center bg-background">
              <ProgressiveImage
                v-if="brands.find(b => b.id === line.brand_id)?.logo_url"
                :src="getBrandLogoUrl(brands.find(b => b.id === line.brand_id)?.logo_url || null)"
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
                {{ brands.find(b => b.id === line.brand_id)?.name || '' }}
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

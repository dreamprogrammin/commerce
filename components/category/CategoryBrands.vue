<script setup lang="ts">
import type { BrandForFilter } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'

const props = defineProps<{
  brands: BrandForFilter[]
  categorySlug?: string
  categoryName?: string
  activeBrandSlug?: string | null
}>()

const route = useRoute()
const { getVariantUrl } = useSupabaseStorage()

function getBrandLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
}

function getBrandLink(brand: BrandForFilter): string {
  if (props.categorySlug) {
    return `${route.path}?brand=${brand.slug}`
  }
  return `/brand/${brand.slug}`
}

function isBrandActive(brand: BrandForFilter): boolean {
  return props.activeBrandSlug === brand.slug
}

// Определяем режим отображения: навигационный (сверху) или подвальный (снизу)
const isNavigationMode = computed(() => !props.activeBrandSlug)
</script>

<template>
  <div v-if="brands.length > 0">
    <!-- ═══════════════════════════════════════════ -->
    <!-- Навигационный режим (перед товарами)        -->
    <!-- Горизонтальный скролл, компактные плитки    -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-if="isNavigationMode" class="mb-6 lg:mb-8">
      <h2 class="text-lg md:text-xl font-bold mb-3">
        Бренды
      </h2>

      <!-- Горизонтальный скролл на мобильных, сетка на десктопе -->
      <div class="flex gap-2.5 md:gap-3 overflow-x-auto pb-2 scrollbar-hide md:flex-wrap md:overflow-visible">
        <NuxtLink
          v-for="brand in brands"
          :key="brand.id"
          :to="getBrandLink(brand)"
          class="group flex items-center gap-2.5 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border bg-card transition-all duration-200 shrink-0 hover:shadow-md hover:scale-[1.02] active:scale-95"
          :class="[
            isBrandActive(brand)
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
              : 'border-border hover:border-primary/40',
          ]"
        >
          <!-- Мини-логотип -->
          <div class="w-8 h-8 md:w-10 md:h-10 rounded-lg overflow-hidden border border-border/50 bg-background flex items-center justify-center shrink-0">
            <ProgressiveImage
              v-if="brand.logo_url"
              :src="getBrandLogoUrl(brand.logo_url)"
              :blur-data-url="brand.blur_placeholder"
              :alt="brand.name"
              object-fit="contain"
              :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
              class="w-full h-full p-0.5"
            />
            <Icon v-else name="lucide:box" class="w-4 h-4 opacity-30" />
          </div>

          <!-- Название + кол-во -->
          <div class="min-w-0">
            <div
              class="font-semibold text-xs md:text-sm whitespace-nowrap group-hover:text-primary transition-colors"
              :class="{ 'text-primary': isBrandActive(brand) }"
            >
              {{ brand.name }}
            </div>
            <div v-if="brand.products_count" class="text-[10px] md:text-xs text-muted-foreground whitespace-nowrap">
              {{ brand.products_count }} товаров
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!-- Подвальный режим (после товаров)            -->
    <!-- Полная сетка с крупными карточками           -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-else class="mt-12 pt-8 border-t">
      <div>
        <h2 class="text-2xl md:text-3xl font-bold mb-2">
          {{ categoryName ? `Другие бренды в «${categoryName}»` : 'Все бренды' }}
        </h2>
        <p class="text-muted-foreground mb-6">
          Выберите другой бренд для просмотра товаров
        </p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
        <NuxtLink
          v-for="brand in brands"
          :key="brand.id"
          :to="getBrandLink(brand)"
          class="group flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:shadow-lg transition-all duration-200"
          :class="[
            isBrandActive(brand)
              ? 'border-primary ring-2 ring-primary/20 shadow-lg'
              : 'border-border hover:border-primary/50',
          ]"
        >
          <!-- Логотип бренда -->
          <div class="w-full aspect-square rounded-lg overflow-hidden border border-border/50 group-hover:border-primary/30 transition-colors flex items-center justify-center bg-background">
            <ProgressiveImage
              v-if="brand.logo_url"
              :src="getBrandLogoUrl(brand.logo_url)"
              :blur-data-url="brand.blur_placeholder"
              :alt="brand.name"
              object-fit="contain"
              :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
              class="w-full h-full p-2"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
              <Icon name="lucide:image" class="w-8 h-8 md:w-10 md:h-10 opacity-30" />
            </div>
          </div>

          <!-- Название бренда -->
          <div class="text-center w-full">
            <div
              class="font-semibold text-xs md:text-sm line-clamp-2 group-hover:text-primary transition-colors"
              :class="{ 'text-primary': isBrandActive(brand) }"
            >
              {{ brand.name }}
            </div>
            <div v-if="brand.products_count" class="text-[10px] text-muted-foreground mt-0.5">
              {{ brand.products_count }} товаров
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>

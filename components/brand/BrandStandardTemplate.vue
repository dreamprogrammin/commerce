<script setup lang="ts">
import type { Brand, IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { ArrowLeft, ChevronDown, Package, TrendingUp } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'

const props = defineProps<{
  brand: Brand
  products: ProductWithGallery[]
  productLines: ProductLine[]
  isLoading: boolean
  sortBy: 'newest' | 'price_asc' | 'price_desc' | 'popularity'
  breadcrumbs: IBreadcrumbItem[]
}>()

const emit = defineEmits<{
  (e: 'update:sortBy', value: 'newest' | 'price_asc' | 'price_desc' | 'popularity'): void
}>()

const { getVariantUrl } = useSupabaseStorage()

const isSeoExpanded = ref(false)
const seoContentRef = ref<HTMLElement | null>(null)
const seoContentHeight = ref(0)

function toggleSeoExpanded() {
  if (!isSeoExpanded.value && seoContentRef.value) {
    seoContentHeight.value = seoContentRef.value.scrollHeight
  }
  isSeoExpanded.value = !isSeoExpanded.value
}

const brandLogoUrl = computed(() => {
  if (!props.brand.logo_url)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, props.brand.logo_url, 'sm')
})

const localSortBy = computed({
  get: () => props.sortBy,
  set: val => emit('update:sortBy', val),
})
</script>

<template>
  <div class="space-y-4 md:space-y-8">
    <!-- Breadcrumbs -->
    <Breadcrumbs :items="breadcrumbs" />

    <!-- Hero section с градиентом -->
    <div class="relative overflow-hidden bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12 border border-primary/10">
      <div class="hidden md:block absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl z-0" />
      <div class="hidden md:block absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl z-0" />

      <div class="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <!-- Логотип бренда -->
        <div class="shrink-0 w-20 h-20 md:w-40 md:h-40 bg-white rounded-xl md:rounded-2xl shadow-lg overflow-hidden">
          <ProgressiveImage
            v-if="brand.logo_url"
            :src="brandLogoUrl"
            :alt="brand.name"
            :bucket-name="BUCKET_NAME_BRANDS"
            :file-path="brand.logo_url"
            aspect-ratio="square"
            object-fit="contain"
            placeholder-type="shimmer"
            eager
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <span class="text-2xl md:text-4xl font-bold text-primary/60">
              {{ brand.name.charAt(0).toUpperCase() }}
            </span>
          </div>
        </div>

        <!-- Информация о бренде -->
        <div class="flex-1 text-center md:text-left">
          <h1 class="text-2xl md:text-5xl font-bold mb-3 md:mb-6 bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            {{ brand.name }}
          </h1>

          <div class="flex flex-wrap gap-2 md:gap-4 justify-center md:justify-start">
            <div class="bg-white/80 backdrop-blur rounded-lg md:rounded-xl px-3 py-2 md:px-6 md:py-4 shadow-sm border border-primary/10">
              <div class="flex items-center gap-2 md:gap-3">
                <div class="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package class="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
                <div class="text-left">
                  <div class="text-lg md:text-2xl font-bold text-gray-900">
                    {{ products.length }}
                  </div>
                  <div class="text-[10px] md:text-xs text-muted-foreground">
                    {{ products.length === 1 ? 'Товар' : products.length < 5 ? 'Товара' : 'Товаров' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur rounded-lg md:rounded-xl px-3 py-2 md:px-6 md:py-4 shadow-sm border border-primary/10">
              <div class="flex items-center gap-2 md:gap-3">
                <div class="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp class="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                </div>
                <div class="text-left">
                  <div class="text-xs md:text-sm font-semibold text-gray-900">
                    Оригинал
                  </div>
                  <div class="text-[10px] md:text-xs text-muted-foreground">
                    Гарантия
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Линейки бренда -->
    <BrandProductLinesGrid
      v-if="productLines.length > 0"
      :product-lines="productLines"
      :brand-id="brand.id"
    />

    <!-- Фильтры и сортировка -->
    <div class="flex flex-row justify-between items-center gap-2">
      <h2 class="text-xl md:text-3xl font-bold">
        Каталог товаров
      </h2>
      <CatalogHeader v-model:sort-by="localSortBy" />
    </div>

    <!-- Сетка с товарами -->
    <main>
      <ProductGridSkeleton v-if="isLoading" />

      <ProductGrid v-else-if="products.length > 0" :products="products" />

      <Card v-else class="border-2 border-dashed">
        <CardContent class="flex flex-col items-center justify-center py-10 md:py-16 text-center px-4">
          <div class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center mb-3 md:mb-4">
            <Package class="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
          </div>
          <h3 class="text-lg md:text-xl font-semibold mb-2">
            Товаров пока нет
          </h3>
          <p class="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 max-w-sm">
            К сожалению, товары бренда {{ brand.name }} временно отсутствуют в продаже.
          </p>
          <NuxtLink to="/catalog/all">
            <Button variant="outline">
              <ArrowLeft class="w-4 h-4 mr-2" />
              Вернуться в каталог
            </Button>
          </NuxtLink>
        </CardContent>
      </Card>
    </main>

    <!-- Описание бренда -->
    <div v-if="brand.description" class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
      <div class="space-y-3 md:space-y-4">
        <button
          class="flex items-center gap-2 text-left w-full group"
          @click="toggleSeoExpanded"
        >
          <h3 class="text-base md:text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
            О бренде {{ brand.name }}
          </h3>
          <ChevronDown
            class="w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300"
            :class="{ 'rotate-180': isSeoExpanded }"
          />
        </button>

        <div
          ref="seoContentRef"
          class="overflow-hidden transition-all duration-300 ease-in-out"
          :style="{ maxHeight: isSeoExpanded ? `${seoContentHeight}px` : undefined }"
          :class="isSeoExpanded ? 'opacity-100' : 'max-h-20 md:max-h-24 opacity-70'"
        >
          <BrandDescription :brand="brand" />

          <div v-if="brand.seo_keywords?.length" class="flex flex-wrap gap-1.5 md:gap-2 mt-3 md:mt-4">
            <Badge
              v-for="keyword in brand.seo_keywords"
              :key="keyword"
              variant="secondary"
              class="text-[10px] md:text-xs"
            >
              {{ keyword }}
            </Badge>
          </div>
        </div>

        <button
          v-if="brand.description && brand.description.length > 150"
          class="text-xs md:text-sm text-primary hover:underline"
          @click="toggleSeoExpanded"
        >
          {{ isSeoExpanded ? 'Свернуть' : 'Читать далее' }}
        </button>
      </div>
    </div>
  </div>
</template>

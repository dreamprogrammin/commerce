<script setup lang="ts">
import type { Brand, BrandPageLayout, IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { ArrowLeft, Package } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BANNERS, BUCKET_NAME_BRANDS } from '@/constants'

const props = defineProps<{
  brand: Brand
  products: ProductWithGallery[]
  productLines: ProductLine[]
  featuredProductLines: ProductLine[]
  isLoading: boolean
  sortBy: 'newest' | 'price_asc' | 'price_desc' | 'popularity'
  breadcrumbs: IBreadcrumbItem[]
}>()

const emit = defineEmits<{
  (e: 'update:sortBy', value: 'newest' | 'price_asc' | 'price_desc' | 'popularity'): void
}>()

const { getVariantUrl, getVariantUrlWide } = useSupabaseStorage()

const pageLayout = computed(() => props.brand.page_layout as BrandPageLayout | null)

const localSortBy = computed({
  get: () => props.sortBy,
  set: val => emit('update:sortBy', val),
})

const brandLogoUrl = computed(() => {
  if (!props.brand.logo_url)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, props.brand.logo_url, 'sm')
})

// Баннеры — широкий формат (640/1280/1920px), используем getVariantUrlWide
const heroBannerSm = computed(() => {
  if (!pageLayout.value?.heroBanner)
    return null
  return getVariantUrlWide(BUCKET_NAME_BANNERS, pageLayout.value.heroBanner, 'sm')
})

const heroBannerMd = computed(() => {
  if (!pageLayout.value?.heroBanner)
    return null
  return getVariantUrlWide(BUCKET_NAME_BANNERS, pageLayout.value.heroBanner, 'md')
})

const heroBannerLg = computed(() => {
  if (!pageLayout.value?.heroBanner)
    return null
  return getVariantUrlWide(BUCKET_NAME_BANNERS, pageLayout.value.heroBanner, 'lg')
})

const displayH1 = computed(() => {
  return props.brand.seo_h1 || props.brand.name
})

// Линейки, не входящие в featured
const otherProductLines = computed(() => {
  const featuredIds = new Set(props.featuredProductLines.map(line => line.id))
  return props.productLines.filter(line => !featuredIds.has(line.id))
})
</script>

<template>
  <div class="space-y-6 md:space-y-10">
    <!-- Breadcrumbs -->
    <Breadcrumbs :items="breadcrumbs" />

    <!-- Full-width Hero Banner -->
    <div v-if="pageLayout?.heroBanner">
      <!-- Баннер + логотип, вылезающий снизу -->
      <div class="relative pb-10 md:pb-14">
        <!-- Баннер (overflow-hidden только на нём) -->
        <div class="relative overflow-hidden rounded-2xl md:rounded-3xl">
          <ProgressiveImage
            :src="heroBannerSm"
            :src-sm="heroBannerSm"
            :src-md="heroBannerMd"
            :src-lg="heroBannerLg"
            sizes="100vw"
            :blur-data-url="pageLayout.heroBannerBlur"
            :alt="brand.name"
            object-fit="cover"
            placeholder-type="lqip"
            fetchpriority="high"
            eager
            class="w-full h-48 sm:h-64 md:h-80 lg:h-[400px]"
          />
        </div>

        <!-- Логотип — вылезает снизу баннера -->
        <div
          v-if="brand.logo_url"
          class="absolute bottom-0 left-4 md:left-8 w-20 h-20 md:w-28 md:h-28 bg-white rounded-2xl shadow-xl border border-border p-2 flex items-center justify-center"
        >
          <ProgressiveImage
            :src="brandLogoUrl"
            :alt="brand.name"
            :bucket-name="BUCKET_NAME_BRANDS"
            :file-path="brand.logo_url"
            aspect-ratio="square"
            object-fit="contain"
            placeholder-type="shimmer"
            eager
          />
        </div>
      </div>

      <!-- H1 — с отступом, чтобы не налезать на логотип -->
      <h1
        class="text-2xl md:text-4xl lg:text-5xl font-bold"
        :class="brand.logo_url ? 'pl-28 md:pl-44' : ''"
      >
        {{ displayH1 }}
      </h1>
    </div>

    <!-- Fallback hero без баннера -->
    <div v-else class="relative overflow-hidden bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12 border border-primary/10">
      <div class="flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <div v-if="brand.logo_url" class="shrink-0 w-20 h-20 md:w-40 md:h-40 bg-white rounded-xl md:rounded-2xl shadow-lg overflow-hidden p-2">
          <ProgressiveImage
            :src="brandLogoUrl"
            :alt="brand.name"
            :bucket-name="BUCKET_NAME_BRANDS"
            :file-path="brand.logo_url"
            aspect-ratio="square"
            object-fit="contain"
            placeholder-type="shimmer"
            eager
          />
        </div>
        <h1 class="text-2xl md:text-5xl font-bold bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
          {{ displayH1 }}
        </h1>
      </div>
    </div>

    <!-- Featured Product Lines (крупные карточки) -->
    <div v-if="featuredProductLines.length > 0">
      <h2 class="text-xl md:text-3xl font-bold mb-4 md:mb-6">
        Популярные коллекции
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <NuxtLink
          v-for="line in featuredProductLines"
          :key="line.id"
          :to="`/catalog/all?brands=${brand.id}&lines=${line.id}`"
          class="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getVariantUrl('product-line-logos', line.logo_url, 'sm')"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-4 md:px-6 md:py-5">
              <span class="text-white text-base md:text-xl font-bold">
                {{ line.name }}
              </span>
              <p v-if="line.description" class="text-white/70 text-xs md:text-sm mt-1 line-clamp-2">
                {{ line.description }}
              </p>
            </div>
          </template>

          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 flex flex-col items-center justify-center p-6 group-hover:scale-105 transition-transform duration-500"
          >
            <span class="text-white text-lg md:text-2xl font-bold text-center">
              {{ line.name }}
            </span>
            <p v-if="line.description" class="text-white/70 text-sm mt-2 text-center line-clamp-2">
              {{ line.description }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Остальные линейки -->
    <BrandProductLinesGrid
      v-if="otherProductLines.length > 0"
      :product-lines="otherProductLines"
      :brand-id="brand.id"
    />

    <!-- Каталог товаров -->
    <div class="flex flex-row justify-between items-center gap-2">
      <h2 class="text-xl md:text-3xl font-bold">
        Каталог товаров
      </h2>
      <CatalogHeader v-model:sort-by="localSortBy" />
    </div>

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

    <!-- SEO текст -->
    <div v-if="brand.seo_text" class="mt-6 md:mt-12 border-t pt-6 md:pt-10">
      <div class="brand-description text-foreground">
        <div
          class="text-sm md:text-base leading-relaxed"
          v-html="brand.seo_text"
        />
      </div>
    </div>

    <!-- Fallback на обычное описание если нет seo_text -->
    <div v-else-if="brand.description" class="mt-6 md:mt-12 border-t pt-6 md:pt-10">
      <BrandDescription :brand="brand" />
    </div>
  </div>
</template>

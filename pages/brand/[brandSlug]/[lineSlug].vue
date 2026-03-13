<script setup lang="ts">
import type { Brand, IBreadcrumbItem, ProductLine } from '@/types'
import { ArrowLeft, ChevronDown, Package, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBrandPageFilters } from '@/composables/useBrandPageFilters'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

const route = useRoute()
const supabase = useSupabaseClient()
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const containerClass = carouselContainerVariants({ contained: 'always' })

const brandSlug = route.params.brandSlug as string
const lineSlug = route.params.lineSlug as string

const isSeoExpanded = ref(false)

// 1. Загрузка бренда
const { data: brand, pending: brandPending } = await useAsyncData(
  `brand-${brandSlug}`,
  async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', brandSlug)
      .single()

    if (error) {
      console.error('Error fetching brand:', error)
      return null
    }
    return data as Brand
  },
)

// 2. Загрузка линейки продуктов
const { data: productLine, pending: linePending } = await useAsyncData(
  `product-line-${brandSlug}-${lineSlug}`,
  async () => {
    if (!brand.value) {
      return null
    }

    const { data, error } = await supabase
      .from('product_lines')
      .select('*')
      .eq('brand_id', brand.value.id)
      .eq('slug', lineSlug)
      .single()

    if (error) {
      console.error('Error fetching product line:', error)
      return null
    }
    return data as ProductLine
  },
  { watch: [brand] },
)

// 3. Smart Sidebar: composable для фильтрации (context: 'line')
const brandId = computed(() => brand.value?.id)
const productLineId = computed(() => productLine.value?.id)
const filterState = useBrandPageFilters({
  brandId,
  productLineId,
  context: 'line',
})

// Загружаем статистику линейки (отзывы на товары этой линейки)
const lineStats = ref<{ average_rating: number, total_reviews_count: number } | null>(null)

async function loadLineStats() {
  if (!brand.value)
    return
  try {
    const { data, error } = await supabase.rpc('get_brand_stats', {
      p_brand_id: brand.value.id,
    })
    if (!error && data) {
      const stats = data as { average_rating: number, total_reviews_count: number }
      if (stats.total_reviews_count > 0) {
        lineStats.value = stats
      }
    }
  }
  catch {
    // Функция может не существовать до миграции
  }
}

// Загружаем товары при монтировании
watchEffect(() => {
  if (productLine.value && brand.value) {
    filterState.loadProducts()
    filterState.loadFilterData()
    loadLineStats()
  }
})

// 4. Breadcrumbs
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brand/all' },
  ]
  if (brand.value) {
    crumbs.push({
      id: brand.value.id,
      name: brand.value.name,
      href: `/brand/${brand.value.slug}`,
    })
  }
  if (productLine.value) {
    crumbs.push({
      id: productLine.value.id,
      name: productLine.value.name,
      href: `/brand/${brandSlug}/${lineSlug}`,
    })
  }
  return crumbs
})

// URL логотипа бренда
const brandLogoUrl = computed(() => {
  if (!brand.value?.logo_url) {
    return null
  }
  return getVariantUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, 'sm')
})

// URL логотипа линейки
const lineLogoUrl = computed(() => {
  if (!productLine.value?.logo_url) {
    return null
  }
  return getVariantUrl(BUCKET_NAME_PRODUCT_LINES, productLine.value.logo_url, 'sm')
})

// ========================================
// SEO META TAGS + STRUCTURED DATA
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const pageUrl = computed(() => `${siteUrl}/brand/${brandSlug}/${lineSlug}`)

// Meta Title: автогенерация из названия линейки и бренда
const metaTitle = computed(() => {
  if (!productLine.value || !brand.value) {
    return 'Линейка не найдена'
  }

  return `${productLine.value.name} от ${brand.value.name} - Купить в Алматы | ${siteName}`
})

// SEO описание: приоритет seo_description > description > автогенерация
const metaDescription = computed(() => {
  if (!productLine.value || !brand.value) {
    return `Товары линейки в ${siteName}`
  }

  // Приоритет: seo_description > description > автогенерация
  if (productLine.value.seo_description) {
    return productLine.value.seo_description
  }

  if (productLine.value.description) {
    return `${productLine.value.description.substring(0, 140)}. Доставка по Казахстану.`
  }

  return `Каталог товаров ${productLine.value.name} от бренда ${brand.value.name} в интернет-магазине ${siteName}. Оригинальная продукция с гарантией качества. Доставка по Казахстану.`
})

// Ключевые слова
const metaKeywords = computed(() => {
  if (productLine.value?.seo_keywords?.length) {
    return productLine.value.seo_keywords.join(', ')
  }
  return `${productLine.value?.name || 'линейка'}, ${brand.value?.name || 'бренд'}, товары, оригинальная продукция, Алматы, Казахстан`
})

const ogImageSrc = computed(() => lineLogoUrl.value || brandLogoUrl.value || `${siteUrl}/og-brand.jpeg`)

defineOgImage({
  url: ogImageSrc.value,
  width: 1200,
  height: 630,
  alt: computed(() => productLine.value?.name || 'Линейка'),
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogImage: ogImageSrc,
  ogUrl: pageUrl,
  ogSiteName: siteName,
  ogLocale: 'ru_RU',
  twitterCard: 'summary',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  twitterImage: ogImageSrc,
  robots: 'index, follow',
})

useHead({
  meta: [
    {
      name: 'keywords',
      content: () => metaKeywords.value || '',
    },
  ],
  link: [
    { rel: 'canonical', href: pageUrl.value },
  ],
  script: [
    // BreadcrumbList Schema
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Главная',
            'item': siteUrl,
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Бренды',
            'item': `${siteUrl}/brand/all`,
          },
          ...(brand.value
            ? [{
                '@type': 'ListItem',
                'position': 3,
                'name': brand.value.name,
                'item': `${siteUrl}/brand/${brand.value.slug}`,
              }]
            : []),
          ...(productLine.value
            ? [{
                '@type': 'ListItem',
                'position': 4,
                'name': productLine.value.name,
                'item': pageUrl.value,
              }]
            : []),
        ],
      }),
    },
    // Brand Schema для линейки (суб-бренд)
    {
      type: 'application/ld+json',
      innerHTML: () => productLine.value && brand.value
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Brand',
            '@id': `${pageUrl.value}#brand`,
            'name': metaTitle.value,
            'description': metaDescription.value,
            'url': pageUrl.value,
            ...(lineLogoUrl.value && {
              logo: lineLogoUrl.value,
              image: lineLogoUrl.value,
            }),
            // Связь с родительским брендом
            'parentOrganization': {
              '@type': 'Brand',
              '@id': `${siteUrl}/brand/${brand.value.slug}#brand`,
              'name': brand.value.name,
              'url': `${siteUrl}/brand/${brand.value.slug}`,
              ...(brandLogoUrl.value && { logo: brandLogoUrl.value }),
            },
            // Агрегированный рейтинг
            ...(lineStats.value && lineStats.value.total_reviews_count > 0 && {
              aggregateRating: {
                '@type': 'AggregateRating',
                'ratingValue': lineStats.value.average_rating,
                'reviewCount': lineStats.value.total_reviews_count,
                'bestRating': 5,
                'worstRating': 1,
              },
            }),
            // Ключевые слова
            ...(productLine.value.seo_keywords?.length && {
              keywords: productLine.value.seo_keywords.join(', '),
            }),
          })
        : '{}',
    },
    // CollectionPage Schema
    {
      type: 'application/ld+json',
      innerHTML: () => productLine.value && brand.value
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            'name': metaTitle.value,
            'description': metaDescription.value,
            'url': pageUrl.value,
            ...(lineLogoUrl.value && { image: lineLogoUrl.value }),
            ...(metaKeywords.value && {
              keywords: metaKeywords.value,
            }),
            ...(filterState.products.value.length > 0 && {
              numberOfItems: filterState.products.value.length,
            }),
            ...(filterState.products.value.length > 0 && {
              offers: {
                '@type': 'AggregateOffer',
                'lowPrice': Math.min(...filterState.products.value.map(p => Number(p.price))),
                'highPrice': Math.max(...filterState.products.value.map(p => Number(p.price))),
                'priceCurrency': 'KZT',
                'offerCount': filterState.products.value.length,
              },
            }),
            'isPartOf': {
              '@type': 'WebSite',
              'name': siteName,
              'url': siteUrl,
            },
            'about': {
              '@id': `${pageUrl.value}#brand`,
            },
            'mainEntity': {
              '@type': 'ItemList',
              'name': `Товары ${productLine.value.name} от ${brand.value.name}`,
              'numberOfItems': filterState.products.value.length,
              'itemListElement': filterState.products.value.map((product, index) => ({
                '@type': 'ListItem',
                'position': index + 1,
                'item': {
                  '@type': 'Product',
                  'name': product.name,
                  'url': `${siteUrl}/catalog/products/${product.slug}`,
                  ...(product.description && {
                    description: product.description.substring(0, 200),
                  }),
                  ...(product.product_images?.[0]?.image_url && {
                    image: getImageUrl(BUCKET_NAME_PRODUCT, product.product_images[0].image_url),
                  }),
                  'sku': product.slug,
                  'brand': {
                    '@type': 'Brand',
                    '@id': `${pageUrl.value}#brand`,
                    'name': brand.value.name,
                  },
                  'offers': {
                    '@type': 'Offer',
                    'price': product.final_price ?? product.price,
                    'priceCurrency': 'KZT',
                    'availability': product.stock_quantity > 0
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                    'url': `${siteUrl}/catalog/products/${product.slug}`,
                  },
                  ...(product.avg_rating && product.review_count && product.review_count > 0 && {
                    aggregateRating: {
                      '@type': 'AggregateRating',
                      'ratingValue': product.avg_rating,
                      'reviewCount': product.review_count,
                      'bestRating': 5,
                      'worstRating': 1,
                    },
                  }),
                },
              })),
            },
          })
        : '{}',
    },
  ],
})

// Robots правило
useRobotsRule({
  index: true,
  follow: true,
})
</script>

<template>
  <div>
    <!-- Skeleton загрузки -->
    <div v-if="brandPending || linePending" :class="`${containerClass} py-4 md:py-8`">
      <div class="space-y-4 md:space-y-6">
        <!-- Breadcrumbs skeleton -->
        <div class="flex gap-2">
          <Skeleton class="h-4 md:h-5 w-20 md:w-24" />
          <Skeleton class="h-4 md:h-5 w-3 md:w-4" />
          <Skeleton class="h-4 md:h-5 w-24 md:w-32" />
          <Skeleton class="h-4 md:h-5 w-3 md:w-4" />
          <Skeleton class="h-4 md:h-5 w-24 md:w-32" />
        </div>

        <!-- Hero skeleton -->
        <div class="rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background p-5 md:p-10 lg:p-12">
          <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
            <Skeleton class="w-20 h-20 md:w-32 md:h-32 rounded-2xl" />
            <div class="flex-1 space-y-3 text-center md:text-left w-full">
              <Skeleton class="h-8 md:h-12 w-40 md:w-56 mx-auto md:mx-0" />
              <Skeleton class="h-5 w-24 md:w-32 mx-auto md:mx-0" />
              <div class="flex gap-2 justify-center md:justify-start">
                <Skeleton class="h-7 w-28 rounded-full" />
                <Skeleton class="h-7 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Бренд не найден -->
    <div v-else-if="!brand" :class="`${containerClass} py-12 md:py-20`">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/10 mb-4 md:mb-6">
          <Package class="w-8 h-8 md:w-10 md:h-10 text-destructive" />
        </div>
        <h1 class="text-2xl md:text-4xl font-bold mb-2 md:mb-3">
          Бренд не найден
        </h1>
        <p class="text-sm md:text-base text-muted-foreground mb-6 md:mb-8 max-w-md mx-auto px-4">
          К сожалению, бренд с таким названием не существует или был удален.
        </p>
        <NuxtLink to="/brand/all">
          <Button>
            <ArrowLeft class="w-4 h-4 mr-2" />
            Все бренды
          </Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Линейка не найдена -->
    <div v-else-if="!productLine" :class="`${containerClass} py-12 md:py-20`">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/10 mb-4 md:mb-6">
          <Sparkles class="w-8 h-8 md:w-10 md:h-10 text-destructive" />
        </div>
        <h1 class="text-2xl md:text-4xl font-bold mb-2 md:mb-3">
          Линейка не найдена
        </h1>
        <p class="text-sm md:text-base text-muted-foreground mb-6 md:mb-8 max-w-md mx-auto px-4">
          К сожалению, линейка "{{ lineSlug }}" не существует у бренда {{ brand.name }}.
        </p>
        <NuxtLink :to="`/brand/${brand.slug}`">
          <Button>
            <ArrowLeft class="w-4 h-4 mr-2" />
            К бренду {{ brand.name }}
          </Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Контент линейки -->
    <div v-else :class="`${containerClass} py-4 md:py-8 space-y-4 md:space-y-8`">
      <!-- Breadcrumbs -->
      <Breadcrumbs :items="breadcrumbs" />

      <!-- Hero section -->
      <div class="relative overflow-hidden rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.06),transparent)]" />

        <div class="relative p-5 md:p-10 lg:p-12">
          <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
            <!-- Логотип линейки (или бренда если нет) -->
            <div class="shrink-0">
              <div class="w-20 h-20 md:w-32 md:h-32 rounded-2xl bg-white shadow-md ring-1 ring-border overflow-hidden">
                <ProgressiveImage
                  v-if="lineLogoUrl"
                  :src="lineLogoUrl"
                  :alt="productLine.name"
                  aspect-ratio="square"
                  object-fit="contain"
                  placeholder-type="shimmer"
                  :use-transform="false"
                  eager
                />
                <ProgressiveImage
                  v-else-if="brandLogoUrl"
                  :src="brandLogoUrl"
                  :alt="brand.name"
                  aspect-ratio="square"
                  object-fit="contain"
                  placeholder-type="shimmer"
                  :use-transform="false"
                  eager
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-muted/30">
                  <Sparkles class="w-8 h-8 md:w-10 md:h-10 text-primary/40" />
                </div>
              </div>
            </div>

            <!-- Информация о линейке -->
            <div class="flex-1 text-center md:text-left space-y-2.5 md:space-y-3">
              <h1 class="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                {{ productLine.name }}
              </h1>

              <!-- Ссылка на бренд -->
              <NuxtLink
                :to="`/brand/${brand.slug}`"
                class="inline-flex items-center gap-2 px-2.5 py-1 -ml-2.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
              >
                <ProgressiveImage
                  v-if="brandLogoUrl"
                  :src="brandLogoUrl"
                  :alt="brand.name"
                  object-fit="contain"
                  placeholder-type="shimmer"
                  :use-transform="false"
                  class="w-5 h-5 flex-shrink-0 rounded"
                />
                <span class="text-sm md:text-base font-medium">{{ brand.name }}</span>
              </NuxtLink>

              <!-- Статистика -->
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs md:text-sm font-medium">
                  <Package class="w-3.5 h-3.5" />
                  {{ filterState.products.value.length }} {{ filterState.products.value.length === 1 ? 'товар' : filterState.products.value.length < 5 ? 'товара' : 'товаров' }}
                </span>
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs md:text-sm font-medium">
                  <ShieldCheck class="w-3.5 h-3.5" />
                  Оригинал
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Catalog header + Filter trigger -->
      <div class="flex flex-row justify-between items-center gap-2">
        <h2 class="text-xl md:text-3xl font-bold">
          Товары {{ productLine.name }}
        </h2>
        <div class="flex items-center gap-2">
          <!-- Mobile filter button -->
          <Button
            variant="outline"
            size="sm"
            class="lg:hidden relative"
            @click="filterState.mobileFiltersOpen.value = true"
          >
            <SlidersHorizontal class="w-4 h-4" />
            <span class="sr-only">Фильтры</span>
            <span
              v-if="filterState.activeFiltersCount.value > 0"
              class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center"
            >
              {{ filterState.activeFiltersCount.value }}
            </span>
          </Button>
          <CatalogHeader v-model:sort-by="filterState.sortBy.value" />
        </div>
      </div>

      <!-- Sidebar + Products grid -->
      <div class="flex gap-6">
        <!-- Desktop Sidebar -->
        <aside class="hidden lg:block w-64 shrink-0">
          <BrandFilterSidebar :state="filterState" />
        </aside>

        <!-- Products -->
        <main class="flex-1 min-w-0">
          <ProductGridSkeleton v-if="filterState.isLoading.value" />

          <ProductGrid v-else-if="filterState.products.value.length > 0" :products="filterState.products.value" />

          <Card v-else class="border-2 border-dashed">
            <CardContent class="flex flex-col items-center justify-center py-10 md:py-16 text-center px-4">
              <div class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center mb-3 md:mb-4">
                <Sparkles class="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
              </div>
              <h3 class="text-lg md:text-xl font-semibold mb-2">
                Товаров пока нет
              </h3>
              <p class="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 max-w-sm">
                К сожалению, товары линейки {{ productLine.name }} временно отсутствуют в продаже.
              </p>
              <NuxtLink :to="`/brand/${brand.slug}`">
                <Button variant="outline">
                  <ArrowLeft class="w-4 h-4 mr-2" />
                  Все товары {{ brand.name }}
                </Button>
              </NuxtLink>
            </CardContent>
          </Card>
        </main>
      </div>

      <!-- Mobile filter drawer -->
      <BrandFilterMobile :state="filterState" />

      <!-- Отзывы о бренде -->
      <div class="border-t pt-4 md:pt-8">
        <BrandReviewsList
          :brand-id="brand.id"
          :brand-name="brand.name"
        />
      </div>

      <!-- Описание линейки (внизу страницы, разворачивается) -->
      <div v-if="productLine.description || productLine.seo_description" class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
        <div class="space-y-3 md:space-y-4">
          <!-- Заголовок с кнопкой разворачивания -->
          <button
            class="flex items-center gap-2 text-left w-full group"
            @click="isSeoExpanded = !isSeoExpanded"
          >
            <h3 class="text-base md:text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
              О линейке {{ productLine.name }}
            </h3>
            <ChevronDown
              class="w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300"
              :class="{ 'rotate-180': isSeoExpanded }"
            />
          </button>

          <!-- Контент (сворачивается/разворачивается) -->
          <div
            class="overflow-hidden transition-all duration-300 ease-in-out"
            :class="isSeoExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-20 md:max-h-24 opacity-70'"
          >
            <ProductLineDescription :product-line="productLine" />

            <!-- Ключевые слова как теги -->
            <div v-if="productLine.seo_keywords?.length" class="flex flex-wrap gap-1.5 md:gap-2 mt-3 md:mt-4">
              <Badge
                v-for="keyword in productLine.seo_keywords"
                :key="keyword"
                variant="secondary"
                class="text-[10px] md:text-xs"
              >
                {{ keyword }}
              </Badge>
            </div>
          </div>

          <!-- Кнопка "Читать далее" / "Свернуть" -->
          <button
            v-if="((productLine.seo_description && productLine.seo_description.length > 150) || (productLine.description && productLine.description.length > 150))"
            class="text-xs md:text-sm text-primary hover:underline"
            @click="isSeoExpanded = !isSeoExpanded"
          >
            {{ isSeoExpanded ? 'Свернуть' : 'Читать далее' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

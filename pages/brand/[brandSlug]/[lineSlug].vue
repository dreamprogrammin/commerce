<script setup lang="ts">
import type { Brand, IBreadcrumbItem, ProductImageRow, ProductLine, ProductWithGallery, SimpleBrand } from '@/types'
import { ArrowLeft, ChevronDown, Package, Sparkles, TrendingUp } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

const route = useRoute()
const supabase = useSupabaseClient()
const { getImageUrl } = useSupabaseStorage()
const containerClass = carouselContainerVariants({ contained: 'always' })

const brandSlug = route.params.brandSlug as string
const lineSlug = route.params.lineSlug as string

// -- Локальное состояние страницы --
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true)
const sortBy = ref<'newest' | 'price_asc' | 'price_desc' | 'popularity'>('newest')
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

// 3. Загружаем товары этой линейки
async function loadProducts() {
  if (!productLine.value) {
    return
  }

  isLoading.value = true
  products.value = []

  try {
    // Строим запрос с сортировкой
    let query = supabase
      .from('products')
      .select(`
        *,
        product_images(id, image_url, blur_placeholder, display_order, alt_text),
        brands(id, name, slug),
        categories(name, slug)
      `)
      .eq('product_line_id', productLine.value.id)
      .eq('is_active', true)

    // Применяем сортировку
    switch (sortBy.value) {
      case 'newest':
        query = query.order('created_at', { ascending: false })
        break
      case 'price_asc':
        query = query.order('price', { ascending: true })
        break
      case 'price_desc':
        query = query.order('price', { ascending: false })
        break
      case 'popularity':
        query = query.order('sales_count', { ascending: false })
        break
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    products.value = (data || []).map(product => ({
      ...product,
      product_images: Array.isArray(product.product_images)
        ? (product.product_images as ProductImageRow[]).sort((a, b) => a.display_order - b.display_order)
        : [],
      brands: product.brands as SimpleBrand | null,
    })) as unknown as ProductWithGallery[]
  }
  catch (error) {
    console.error('Error loading products:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Загружаем товары при монтировании и при изменении сортировки
watchEffect(() => {
  if (productLine.value) {
    loadProducts()
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
  return getImageUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, IMAGE_SIZES.BRAND_LOGO)
})

// URL логотипа линейки
const lineLogoUrl = computed(() => {
  if (!productLine.value?.logo_url) {
    return null
  }
  return getImageUrl(BUCKET_NAME_PRODUCT_LINES, productLine.value.logo_url, IMAGE_SIZES.PRODUCT_LINE_LOGO)
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
            ...(products.value.length > 0 && {
              numberOfItems: products.value.length,
            }),
            ...(products.value.length > 0 && {
              offers: {
                '@type': 'AggregateOffer',
                'lowPrice': Math.min(...products.value.map(p => Number(p.price))),
                'highPrice': Math.max(...products.value.map(p => Number(p.price))),
                'priceCurrency': 'KZT',
                'offerCount': products.value.length,
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
              'numberOfItems': products.value.length,
              'itemListElement': products.value.slice(0, 10).map((product, index) => ({
                '@type': 'ListItem',
                'position': index + 1,
                'item': {
                  '@type': 'Product',
                  'name': product.name,
                  'url': `${siteUrl}/catalog/products/${product.slug}`,
                  ...(product.product_images?.[0]?.image_url && {
                    image: getImageUrl(BUCKET_NAME_PRODUCT, product.product_images[0].image_url),
                  }),
                  'offers': {
                    '@type': 'Offer',
                    'price': product.price,
                    'priceCurrency': 'KZT',
                    'availability': product.stock_quantity > 0
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                  },
                  'brand': {
                    '@id': `${pageUrl.value}#brand`,
                  },
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
        <div class="bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12">
          <div class="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <Skeleton class="w-20 h-20 md:w-32 md:h-32 rounded-xl md:rounded-2xl" />
            <div class="flex-1 space-y-3 md:space-y-4 text-center md:text-left w-full">
              <Skeleton class="h-7 md:h-10 w-32 md:w-48 mx-auto md:mx-0" />
              <Skeleton class="h-4 md:h-5 w-24 md:w-32 mx-auto md:mx-0" />
              <div class="flex gap-2 md:gap-4 justify-center md:justify-start">
                <Skeleton class="h-12 md:h-16 w-20 md:w-24 rounded-lg" />
                <Skeleton class="h-12 md:h-16 w-20 md:w-24 rounded-lg" />
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

      <!-- Hero section с градиентом -->
      <div class="relative overflow-hidden bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12 border border-primary/10">
        <!-- Декоративные элементы -->
        <div class="hidden md:block absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl z-0" />
        <div class="hidden md:block absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl z-0" />

        <div class="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-8">
          <!-- Логотип линейки (или бренда если нет) -->
          <div
            class="shrink-0 w-20 h-20 md:w-40 md:h-40 bg-white rounded-xl md:rounded-2xl shadow-lg overflow-hidden"
          >
            <ProgressiveImage
              v-if="lineLogoUrl"
              :src="lineLogoUrl"
              :alt="productLine.name"
              :bucket-name="BUCKET_NAME_PRODUCT_LINES"
              :file-path="productLine.logo_url ?? undefined"
              aspect-ratio="square"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
            />
            <ProgressiveImage
              v-else-if="brandLogoUrl"
              :src="brandLogoUrl"
              :alt="brand.name"
              :bucket-name="BUCKET_NAME_BRANDS"
              :file-path="brand.logo_url ?? undefined"
              aspect-ratio="square"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
            />
            <!-- Плейсхолдер если нет логотипа -->
            <div v-else class="w-full h-full flex items-center justify-center">
              <Sparkles class="w-8 h-8 md:w-12 md:h-12 text-primary/60" />
            </div>
          </div>

          <!-- Информация о линейке -->
          <div class="flex-1 text-center md:text-left">
            <h1 class="text-2xl md:text-5xl font-bold mb-2 md:mb-4 bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              {{ productLine.name }}
            </h1>
            <!-- Бренд -->
            <NuxtLink
              :to="`/brand/${brand.slug}`"
              class="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-3 md:mb-6"
            >
              <img
                v-if="brandLogoUrl"
                :src="brandLogoUrl"
                :alt="brand.name"
                class="w-5 h-5 object-contain"
              >
              <span class="text-sm md:text-base">{{ brand.name }}</span>
            </NuxtLink>

            <!-- Статистика -->
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

      <!-- Фильтры и сортировка -->
      <div class="flex flex-row justify-between items-center gap-2">
        <h2 class="text-xl md:text-3xl font-bold">
          Товары {{ productLine.name }}
        </h2>

        <CatalogHeader v-model:sort-by="sortBy" />
      </div>

      <!-- Сетка с товарами -->
      <main>
        <!-- Skeleton загрузки товаров -->
        <ProductGridSkeleton v-if="isLoading" />

        <!-- Товары -->
        <ProductGrid v-else-if="products.length > 0" :products="products" />

        <!-- Пустое состояние -->
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

<script setup lang="ts">
import type { BrandPageLayout, IBreadcrumbItem, ProductLine } from '@/types'
import { ArrowLeft, Package } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBrandPageFilters } from '@/composables/useBrandPageFilters'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const supabase = useSupabaseClient()
const productsStore = useProductsStore()
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const brandSlug = route.params.slug as string
const containerClass = carouselContainerVariants({ contained: 'always' })

// 1. Умная загрузка информации о бренде
const { data: brand, pending: brandPending } = await useAsyncData(
  `brand-${brandSlug}`,
  async () => {
    let foundBrand = productsStore.brands.find(b => b.slug === brandSlug)

    if (!foundBrand) {
      if (productsStore.brands.length === 0) {
        await productsStore.fetchAllBrands()
        foundBrand = productsStore.brands.find(b => b.slug === brandSlug)
      }
    }
    return foundBrand || null
  },
)

// Загружаем линейки бренда
const brandProductLines = ref<ProductLine[]>([])

async function loadProductLines() {
  if (!brand.value)
    return

  try {
    const { data, error } = await supabase
      .from('product_lines')
      .select('*')
      .eq('brand_id', brand.value.id)
      .order('name', { ascending: true })

    if (!error && data) {
      brandProductLines.value = data as ProductLine[]
    }
  }
  catch (err) {
    console.error('Error loading product lines:', err)
  }
}

// Загружаем агрегированную статистику бренда (рейтинг + кол-во отзывов)
const brandStats = ref<{ average_rating: number, total_reviews_count: number } | null>(null)

async function loadBrandStats() {
  if (!brand.value)
    return

  try {
    const { data, error } = await supabase.rpc('get_brand_stats', {
      p_brand_id: brand.value.id,
    })
    if (!error && data) {
      const stats = data as { average_rating: number, total_reviews_count: number }
      if (stats.total_reviews_count > 0) {
        brandStats.value = stats
      }
    }
  }
  catch {
    // Функция может не существовать до миграции
  }
}

// Smart Sidebar: composable для фильтрации
const brandId = computed(() => brand.value?.id)
const filterState = useBrandPageFilters({
  brandId,
  context: 'brand',
  brandProductLines,
})

// Загружаем данные при монтировании
watchEffect(() => {
  if (brand.value) {
    loadProductLines()
    loadBrandStats()
    filterState.loadProducts()
    filterState.loadFilterData()
  }
})

// 3. Собираем "хлебные крошки"
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brand/all' },
  ]
  if (brand.value) {
    crumbs.push({ id: brand.value.id, name: brand.value.name, href: `/brand/${brand.value.slug}` })
  }
  return crumbs
})

// Кастомная страница
const isCustomPage = computed(() => !!(brand.value as any)?.is_custom_page)
const pageLayout = computed(() => (brand.value as any)?.page_layout as BrandPageLayout | null)

// Featured product lines (из page_layout.featuredLineIds)
const featuredProductLines = computed(() => {
  if (!pageLayout.value?.featuredLineIds?.length)
    return []
  const ids = new Set(pageLayout.value.featuredLineIds)
  return brandProductLines.value.filter(l => ids.has(l.id))
})

// Оптимизированный URL логотипа бренда (для SEO meta tags)
const brandLogoUrl = computed(() => {
  if (!brand.value?.logo_url)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, 'sm')
})

// ========================================
// SEO META TAGS + STRUCTURED DATA
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const brandUrl = computed(() => `${siteUrl}/brand/${brandSlug}`)

const metaTitle = computed(() => {
  if (!brand.value)
    return 'Бренд не найден'

  if (brand.value.meta_title) {
    return brand.value.meta_title
  }
  if (brand.value.seo_title) {
    return brand.value.seo_title
  }

  return `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}`
})

const metaDescription = computed(() => {
  if (!brand.value)
    return `Товары бренда в ${siteName}`

  if (brand.value.meta_description) {
    return brand.value.meta_description
  }

  if (brand.value.seo_description) {
    return brand.value.seo_description
  }

  if (brand.value.description) {
    return `${brand.value.description.substring(0, 140)}. Доставка по Казахстану.`
  }

  return `Каталог товаров бренда ${brand.value.name} в интернет-магазине ${siteName}. Оригинальная продукция с гарантией качества. Доставка по Казахстану.`
})

const metaKeywords = computed(() => {
  if (brand.value?.meta_keywords?.length) {
    return brand.value.meta_keywords.join(', ')
  }
  if (brand.value?.seo_keywords?.length) {
    return brand.value.seo_keywords.join(', ')
  }
  return `${brand.value?.name || 'бренд'}, товары бренда, оригинальная продукция, Алматы, Казахстан`
})

const ogImageSrc = computed(() => brandLogoUrl.value || `${siteUrl}/og-brand.jpeg`)

defineOgImage({
  url: ogImageSrc.value,
  width: 1200,
  height: 630,
  alt: computed(() => brand.value?.name || 'Бренд'),
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogImage: ogImageSrc,
  ogUrl: brandUrl,
  ogSiteName: siteName,
  ogLocale: 'ru_RU',
  twitterCard: 'summary',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  twitterImage: ogImageSrc,
  robots: 'index, follow',
})

// BreadcrumbList JSON-LD
useBreadcrumbSchema(computed(() => [
  { name: 'Бренды', path: '/brand/all' },
  ...(brand.value ? [{ name: brand.value.name }] : []),
]))

useHead({
  meta: [
    {
      name: 'keywords',
      content: () => metaKeywords.value || '',
    },
  ],
  link: [
    { rel: 'canonical', href: brandUrl.value },
  ],
  script: [
    // Brand Schema с линейками как subOrganization
    {
      type: 'application/ld+json',
      innerHTML: () => brand.value
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Brand',
            '@id': `${brandUrl.value}#brand`,
            'name': metaTitle.value,
            'description': metaDescription.value,
            'url': brandUrl.value,
            'logo': brandLogoUrl.value || `${siteUrl}/og-brand.jpeg`,
            'image': brandLogoUrl.value || `${siteUrl}/og-brand.jpeg`,
            ...(brandStats.value && brandStats.value.total_reviews_count > 0 && {
              aggregateRating: {
                '@type': 'AggregateRating',
                'ratingValue': brandStats.value.average_rating,
                'reviewCount': brandStats.value.total_reviews_count,
                'bestRating': 5,
                'worstRating': 1,
              },
            }),
            ...(brand.value.seo_keywords?.length && {
              keywords: brand.value.seo_keywords.join(', '),
            }),
            ...(brandProductLines.value.length > 0 && {
              subOrganization: brandProductLines.value.map(line => ({
                '@type': 'Brand',
                '@id': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}#brand`,
                'name': line.name,
                'url': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}`,
                ...(line.logo_url && {
                  logo: getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'sm'),
                }),
                ...(line.description && { description: line.description }),
              })),
            }),
          })
        : '{}',
    },
    // CollectionPage Schema with aggregateRating
    {
      type: 'application/ld+json',
      innerHTML: () => brand.value
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            'name': `Товары бренда ${brand.value.name}`,
            'description': metaDescription.value,
            'url': brandUrl.value,
            'isPartOf': {
              '@type': 'WebSite',
              'name': siteName,
              'url': siteUrl,
            },
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
            ...(brandStats.value && brandStats.value.total_reviews_count > 0 && {
              aggregateRating: {
                '@type': 'AggregateRating',
                'ratingValue': brandStats.value.average_rating,
                'reviewCount': brandStats.value.total_reviews_count,
                'bestRating': 5,
                'worstRating': 1,
              },
            }),
          })
        : '{}',
    },
    // ItemList Schema — все товары бренда в порядке текущей сортировки
    {
      type: 'application/ld+json',
      innerHTML: () => brand.value && filterState.products.value.length > 0
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            'name': `Товары бренда ${brand.value.name}`,
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
                  '@id': `${brandUrl.value}#brand`,
                  'name': brand.value!.name,
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
    <!-- Skeleton загрузки бренда -->
    <div v-if="brandPending" :class="`${containerClass} py-4 md:py-8`">
      <div class="space-y-4 md:space-y-6">
        <div class="flex gap-2">
          <Skeleton class="h-4 md:h-5 w-20 md:w-24" />
          <Skeleton class="h-4 md:h-5 w-3 md:w-4" />
          <Skeleton class="h-4 md:h-5 w-24 md:w-32" />
        </div>

        <div class="rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background p-5 md:p-10 lg:p-12">
          <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
            <Skeleton class="w-20 h-20 md:w-32 md:h-32 rounded-2xl" />
            <div class="flex-1 space-y-3 text-center md:text-left w-full">
              <Skeleton class="h-8 md:h-12 w-40 md:w-56 mx-auto md:mx-0" />
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

    <!-- Кастомный шаблон -->
    <div v-else-if="isCustomPage" :class="`${containerClass} py-4 md:py-8`">
      <BrandCustomTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :featured-product-lines="featuredProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
      />
    </div>

    <!-- Стандартный шаблон -->
    <div v-else :class="`${containerClass} py-4 md:py-8`">
      <BrandStandardTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
      />
    </div>
  </div>
</template>

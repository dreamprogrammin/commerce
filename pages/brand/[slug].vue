<script setup lang="ts">
import type { BrandPageLayout, IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { ArrowLeft, Package } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const supabase = useSupabaseClient()
const productsStore = useProductsStore()
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const brandSlug = route.params.slug as string
const containerClass = carouselContainerVariants({ contained: 'always' })

// -- Локальное состояние страницы --
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true)
const sortBy = ref<'newest' | 'price_asc' | 'price_desc' | 'popularity'>('newest')

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

// 2. Загружаем товары, принадлежащие этому бренду
async function loadProducts() {
  if (!brand.value)
    return

  isLoading.value = true
  products.value = []

  const result = await productsStore.fetchProducts({
    categorySlug: 'all',
    brandIds: [brand.value.id],
    sortBy: sortBy.value,
  })

  products.value = result.products
  isLoading.value = false
}

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

// Загружаем агрегированный рейтинг бренда
const aggregateRating = ref<{ avg_rating: number, total_reviews: number } | null>(null)

async function loadAggregateRating() {
  if (!brand.value)
    return

  try {
    const { data, error } = await supabase.rpc('get_brand_aggregate_rating', {
      p_brand_id: brand.value.id,
    })
    if (!error && data) {
      const rating = data as { avg_rating: number, total_reviews: number }
      if (rating.total_reviews > 0) {
        aggregateRating.value = rating
      }
    }
  }
  catch {
    // Функция может не существовать до миграции
  }
}

// Загружаем данные при монтировании и при изменении сортировки
watchEffect(() => {
  if (brand.value) {
    loadProducts()
    loadProductLines()
    loadAggregateRating()
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
                'item': brandUrl.value,
              }]
            : []),
        ],
      }),
    },
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
            ...(aggregateRating.value && aggregateRating.value.total_reviews > 0 && {
              aggregateRating: {
                '@type': 'AggregateRating',
                'ratingValue': aggregateRating.value.avg_rating,
                'reviewCount': aggregateRating.value.total_reviews,
                'bestRating': 5,
                'worstRating': 1,
              },
            }),
          })
        : '{}',
    },
    // ItemList Schema
    {
      type: 'application/ld+json',
      innerHTML: () => brand.value && products.value.length > 0
        ? JSON.stringify({
            '@context': 'https://schema.org',
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
                'brand': {
                  '@type': 'Brand',
                  '@id': `${brandUrl.value}#brand`,
                  'name': brand.value!.name,
                },
                'offers': {
                  '@type': 'Offer',
                  'price': product.price,
                  'priceCurrency': 'KZT',
                  'availability': product.stock_quantity > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                },
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

        <div class="bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12">
          <div class="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <Skeleton class="w-20 h-20 md:w-32 md:h-32 rounded-xl md:rounded-2xl" />
            <div class="flex-1 space-y-3 md:space-y-4 text-center md:text-left w-full">
              <Skeleton class="h-7 md:h-10 w-32 md:w-48 mx-auto md:mx-0" />
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

    <!-- Кастомный шаблон -->
    <div v-else-if="isCustomPage" :class="`${containerClass} py-4 md:py-8`">
      <BrandCustomTemplate
        :brand="brand"
        :products="products"
        :product-lines="brandProductLines"
        :featured-product-lines="featuredProductLines"
        :is-loading="isLoading"
        :sort-by="sortBy"
        :breadcrumbs="breadcrumbs"
        @update:sort-by="sortBy = $event"
      />
    </div>

    <!-- Стандартный шаблон -->
    <div v-else :class="`${containerClass} py-4 md:py-8`">
      <BrandStandardTemplate
        :brand="brand"
        :products="products"
        :product-lines="brandProductLines"
        :is-loading="isLoading"
        :sort-by="sortBy"
        :breadcrumbs="breadcrumbs"
        @update:sort-by="sortBy = $event"
      />
    </div>
  </div>
</template>

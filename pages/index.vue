<script setup lang="ts">
import type { Brand, CategoryRow, ProductLine, ProductWithGallery, RecommendedProduct } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useSlides } from '@/composables/slides/useSlides'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()
const productsStore = useProductsStore()
const wishlistStore = useWishlistStore()
const popularCategoriesStore = usePopularCategoriesStore()
const { slides, isLoading: isLoadingSlides, error: slidesError } = useSlides()

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

definePageMeta({
  layout: 'home',
})

const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })
const desktopContainedClass = carouselContainerVariants({ contained: 'desktop' })

// 🔧 Упрощенный тип для TanStack Query (избегаем глубокой инстанциации)
type HomePersonalData = {
  recommended: RecommendedProduct[]
  wishlist: ProductWithGallery[]
}

// ✅ SSR prefetch для рекомендаций
const { data: recommendationsSsrData } = await useAsyncData(
  'home-recommendations-ssr',
  async () => {
    const recommended = await recommendationsStore.fetchRecommendations()
    return {
      recommended: recommended || [],
      wishlist: [] as ProductWithGallery[], // Wishlist только на клиенте (требует auth)
    }
  },
  { server: true, lazy: false },
)

// TanStack Query с SSR данными
// @ts-expect-error - Type instantiation depth issue with TanStack Query + Supabase complex types. Functionally correct.
const { data: mainPersonalData, isLoading: isLoadingRecommendations, isFetching: isFetchingRecommendations } = useQuery<HomePersonalData>({
  queryKey: ['home-recommendations', user.value?.id, personalizationTrigger.value, isLoggedIn.value],
  queryFn: async (): Promise<HomePersonalData> => {
    const recommended = await recommendationsStore.fetchRecommendations()
    let wishlist: ProductWithGallery[] = []

    if (isLoggedIn.value) {
      await wishlistStore.fetchWishlistProducts()
      wishlist = wishlistStore.wishlistProducts as ProductWithGallery[]
    }

    return {
      recommended: recommended || [],
      wishlist: wishlist || [],
    }
  },
  staleTime: 5 * 60 * 1000, // 5 минут (было 3)
  gcTime: 15 * 60 * 1000, // 15 минут (было 10)
  initialData: recommendationsSsrData.value || undefined, // Используем SSR данные
  refetchOnMount: false, // ⚡ Не перезагружать при каждом монтировании
  refetchOnWindowFocus: false, // ⚡ Не перезагружать при фокусе
})

const recommendedProducts = computed<RecommendedProduct[]>(() => mainPersonalData.value?.recommended || [])
const wishlistProducts = computed<ProductWithGallery[]>(() => mainPersonalData.value?.wishlist || [])

const showRecommendationsSkeleton = computed(() =>
  (isLoadingRecommendations.value || isFetchingRecommendations.value)
  && (!mainPersonalData.value || (mainPersonalData.value.recommended.length === 0 && mainPersonalData.value.wishlist.length === 0)),
)

// ✅ SSR prefetch для популярных товаров
const { data: popularSsrData } = await useAsyncData(
  'home-popular-ssr',
  () => productsStore.fetchPopularProducts(10),
  { server: true, lazy: false },
)

const popularQuery = useQuery<ProductWithGallery[]>({
  queryKey: ['home-popular'],
  queryFn: () => productsStore.fetchPopularProducts(10),
  staleTime: 5 * 60 * 1000, // 5 минут (было 3)
  gcTime: 15 * 60 * 1000, // 15 минут (было 10)
  initialData: popularSsrData.value || undefined, // Используем SSR данные
  refetchOnMount: false, // ⚡ Не перезагружать при каждом монтировании
  refetchOnWindowFocus: false, // ⚡ Не перезагружать при фокусе
})

const popularProductsData = popularQuery.data
const isLoadingPopular = popularQuery.isLoading
const isFetchingPopular = popularQuery.isFetching

const popularProducts = computed<ProductWithGallery[]>(() => popularProductsData.value || [])

// ✅ SSR prefetch для новинок
const { data: newestSsrData } = await useAsyncData(
  'home-newest-ssr',
  () => productsStore.fetchNewestProducts(10),
  { server: true, lazy: false },
)

const { data: newestProductsData, isLoading: isLoadingNewest, isFetching: isFetchingNewest } = useQuery<ProductWithGallery[]>({
  queryKey: ['home-newest'],
  queryFn: () => productsStore.fetchNewestProducts(10),
  staleTime: 5 * 60 * 1000, // 5 минут (было 3)
  gcTime: 15 * 60 * 1000, // 15 минут (было 10)
  initialData: newestSsrData.value || undefined, // Используем SSR данные
  refetchOnMount: false, // ⚡ Не перезагружать при каждом монтировании
  refetchOnWindowFocus: false, // ⚡ Не перезагружать при фокусе
})

const newestProducts = computed<ProductWithGallery[]>(() => newestProductsData.value || [])

const showPopularSkeleton = computed(() =>
  (isLoadingPopular.value || isFetchingPopular.value) && !popularProductsData.value,
)

const showNewestSkeleton = computed(() =>
  (isLoadingNewest.value || isFetchingNewest.value) && !newestProductsData.value,
)

const isLoadingMainBlock = computed(() => showRecommendationsSkeleton.value || showPopularSkeleton.value)

// ✅ SSR prefetch для категорий (SEO schema)
const { data: categoriesSsrData } = await useAsyncData(
  'home-categories-schema-ssr',
  async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return popularCategoriesStore.popularCategories
  },
  { server: true, lazy: false },
)

// Загрузка категорий для SEO schema с SSR данными
const { data: categoriesData } = useQuery<CategoryRow[]>({
  queryKey: ['home-categories-schema'],
  queryFn: async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return popularCategoriesStore.popularCategories
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  initialData: categoriesSsrData.value || undefined,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const popularCategoriesForSchema = computed(() => categoriesData.value || [])

// ✅ SSR prefetch для брендов (SEO schema)
const supabase = useSupabaseClient()
const { data: brandsSchemaSsrData } = await useAsyncData(
  'home-brands-schema-ssr',
  async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('id, name, slug, logo_url, description, seo_description, seo_keywords')
      .order('name', { ascending: true })
      .limit(20)

    if (error) {
      console.error('Error fetching brands for schema:', error)
      return []
    }
    return data || []
  },
  { server: true, lazy: false },
)

// Загрузка брендов для SEO schema с SSR данными
const { data: brandsData } = useQuery<Brand[]>({
  queryKey: ['home-brands-schema'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('id, name, slug, logo_url, description, seo_description, seo_keywords')
      .order('name', { ascending: true })
      .limit(20)

    if (error)
      throw error
    return data || []
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  initialData: brandsSchemaSsrData.value || undefined,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const brandsForSchema = computed(() => brandsData.value || [])

// Загрузка популярных брендов для карусели (SSR prefetch)
const { data: brandsSsrData } = await useAsyncData('home-top-brands-ssr', async () => {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('name')
    .limit(15)

  if (error) {
    console.error('Error fetching brands:', error)
    return []
  }

  return data
}, { server: true, lazy: false })

// Загрузка брендов с TanStack Query для кеширования
const { data: topBrands } = useQuery({
  queryKey: ['home-top-brands'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('name')
      .limit(15)

    if (error) {
      console.error('Error fetching brands:', error)
      return []
    }

    return data
  },
  staleTime: 5 * 60 * 1000, // 5 минут
  gcTime: 15 * 60 * 1000, // 15 минут
  initialData: brandsSsrData.value || undefined,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

// ✅ SSR prefetch для товарных линеек (SEO schema)
const { data: productLinesSsrData } = await useAsyncData(
  'home-product-lines-schema-ssr',
  async () => {
    const { data, error } = await supabase
      .from('product_lines')
      .select('id, name, slug, logo_url, description, brand_id')
      .order('name', { ascending: true })
      .limit(30)

    if (error) {
      console.error('Error fetching product lines for schema:', error)
      return []
    }
    return data || []
  },
  { server: true, lazy: false },
)

// Загрузка товарных линеек для SEO schema с SSR данными
const { data: productLinesData } = useQuery<ProductLine[]>({
  queryKey: ['home-product-lines-schema'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('product_lines')
      .select('id, name, slug, logo_url, description, brand_id')
      .order('name', { ascending: true })
      .limit(30)

    if (error)
      throw error
    return data || []
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  initialData: productLinesSsrData.value || undefined,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const productLinesForSchema = computed(() => productLinesData.value || [])

// SEO
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const metaTitle = `Купить детские игрушки в Алматы | ${siteName}`
const metaDescription = `Интернет-магазин детских игрушек ${siteName} в Алматы ⭐ Развивающие игры, конструкторы, куклы, машинки ✓ Официальные бренды ✓ Доставка по Алматы ✓ Бонусная программа ✓ Гарантия качества`

// Динамические keywords с брендами
const keywords = computed(() => {
  const baseKeywords = [
    'детские игрушки Алматы',
    'купить игрушки Алматы',
    'интернет магазин игрушек',
    'игрушки для детей',
    'развивающие игрушки',
    'конструкторы для детей',
    'куклы',
    'машинки',
    'мягкие игрушки',
    'настольные игры',
  ]

  // Добавляем топ-5 брендов в keywords
  const topBrands = brandsForSchema.value.slice(0, 5).map(b => b.name)

  return [...baseKeywords, ...topBrands].join(', ')
})

const ogImageUrl = `${siteUrl}/og-home-toys.jpeg`

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogUrl: siteUrl,
  ogType: 'website',
  ogSiteName: siteName,
  ogLocale: 'ru_RU',
  ogLocaleAlternate: 'kk_KZ',
  ogImage: ogImageUrl,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogImageAlt: `${siteName} - Детские игрушки`,
  twitterCard: 'summary_large_image',
  twitterSite: '@uhtikz',
  twitterCreator: '@uhtikz',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  twitterImage: ogImageUrl,
  twitterImageAlt: `${siteName} - Детские игрушки`,
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
})

// Computed schema для динамических данных
const organizationSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  'name': siteName,
  'alternateName': 'Uhti.kz',
  'url': siteUrl,
  'logo': {
    '@type': 'ImageObject',
    'url': `${siteUrl}/logo.png`,
    'width': 250,
    'height': 60,
  },
  'image': ogImageUrl,
  'description': metaDescription,
  'telephone': '+7-702-537-94-73',
  'email': 'info@uhti.kz',
  'address': {
    '@type': 'PostalAddress',
    'addressCountry': 'KZ',
    'addressLocality': 'Алматы',
    'addressRegion': 'Алматы',
  },
  'geo': {
    '@type': 'GeoCoordinates',
    'latitude': 43.2220,
    'longitude': 76.8512,
  },
  'areaServed': {
    '@type': 'City',
    'name': 'Алматы',
    'containedInPlace': {
      '@type': 'Country',
      'name': 'Kazakhstan',
    },
  },
  'sameAs': [
    'https://www.instagram.com/uhtikz',
    'https://twitter.com/uhtikz',
  ],
}))

const webSiteSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  'name': siteName,
  'alternateName': 'Uhti.kz',
  'url': siteUrl,
  'description': metaDescription,
  'inLanguage': 'ru-KZ',
  'publisher': { '@id': `${siteUrl}/#organization` },
  'potentialAction': {
    '@type': 'SearchAction',
    'target': {
      '@type': 'EntryPoint',
      'urlTemplate': `${siteUrl}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}))

const storeSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'Store',
  '@id': `${siteUrl}/#store`,
  'name': `${siteName} - Магазин детских игрушек`,
  'url': siteUrl,
  'image': ogImageUrl,
  'description': metaDescription,
  'telephone': '+7-702-537-94-73',
  'priceRange': '₸₸',
  'paymentAccepted': ['Наличные', 'Карты', 'Каспи'],
  'currenciesAccepted': 'KZT',
  'openingHours': 'Mo-Su 09:00-21:00',
  'address': {
    '@type': 'PostalAddress',
    'addressCountry': 'KZ',
    'addressLocality': 'Алматы',
  },
  'geo': {
    '@type': 'GeoCoordinates',
    'latitude': 43.2220,
    'longitude': 76.8512,
  },
  'areaServed': {
    '@type': 'City',
    'name': 'Алматы',
    'containedInPlace': {
      '@type': 'Country',
      'name': 'Kazakhstan',
    },
  },
  'hasOfferCatalog': popularCategoriesForSchema.value.length > 0
    ? {
        '@type': 'OfferCatalog',
        'name': 'Каталог детских игрушек',
        'itemListElement': popularCategoriesForSchema.value.map((cat, index) => ({
          '@type': 'OfferCatalog',
          'name': cat.name,
          'url': `${siteUrl}${cat.href}`,
          'position': index + 1,
        })),
      }
    : undefined,
}))

const categoriesListSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  'name': 'Популярные категории игрушек',
  'description': 'Основные категории детских игрушек в магазине Ухтышка',
  'numberOfItems': popularCategoriesForSchema.value.length,
  'itemListElement': popularCategoriesForSchema.value.map((cat, index) => ({
    '@type': 'ListItem',
    'position': index + 1,
    'item': {
      '@type': 'Thing',
      'additionalType': 'ProductCategory',
      '@id': `${siteUrl}${cat.href}`,
      'name': cat.name,
      'url': `${siteUrl}${cat.href}`,
      'description': cat.description || cat.seo_title || `Купить ${cat.name.toLowerCase()} в интернет-магазине Ухтышка. Широкий выбор, доставка по Казахстану.`,
    },
  })),
}))

const breadcrumbSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  '@id': `${siteUrl}/#breadcrumb`,
  'itemListElement': [
    { '@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': siteUrl },
  ],
}))

// Collection Page schema для главной страницы с товарами
const collectionPageSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${siteUrl}/#collectionpage`,
  'url': siteUrl,
  'name': metaTitle,
  'description': metaDescription,
  'isPartOf': { '@id': `${siteUrl}/#website` },
  'about': {
    '@type': 'ItemList',
    'name': 'Категории детских игрушек',
    'numberOfItems': popularCategoriesForSchema.value.length,
  },
  'mainEntity': {
    '@type': 'ItemList',
    'numberOfItems': popularCategoriesForSchema.value.length,
    'itemListElement': popularCategoriesForSchema.value.map((cat, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'Thing',
        'additionalType': 'ProductCategory',
        '@id': `${siteUrl}${cat.href}`,
        'name': cat.name,
        'url': `${siteUrl}${cat.href}`,
      },
    })),
  },
}))

// ItemList schema для брендов
const brandsListSchema = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  'name': 'Бренды детских игрушек в магазине Ухтышка',
  'description': 'Официальные бренды игрушек с гарантией качества и доставкой по Алматы',
  'numberOfItems': brandsForSchema.value.length,
  'itemListElement': brandsForSchema.value.map((brand, index) => ({
    '@type': 'ListItem',
    'position': index + 1,
    'item': {
      '@type': 'Brand',
      '@id': `${siteUrl}/brand/${brand.slug}#brand`,
      'name': brand.name,
      'url': `${siteUrl}/brand/${brand.slug}`,
      'description': brand.seo_description || brand.description || `Товары бренда ${brand.name} в интернет-магазине Ухтышка`,
      ...(brand.logo_url && {
        logo: `${siteUrl}/storage/brand-logos/${brand.logo_url}`,
      }),
    },
  })),
}))

// ItemList schema для товарных линеек
const productLinesListSchema = computed(() => {
  // Группируем линейки по брендам для лучшей структуры
  const linesByBrand = productLinesForSchema.value.reduce((acc, line) => {
    const brandId = line.brand_id
    if (!acc[brandId]) {
      acc[brandId] = []
    }
    acc[brandId].push(line)
    return acc
  }, {} as Record<string, typeof productLinesForSchema.value>)

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Товарные линейки брендов',
    'description': 'Коллекции и серии игрушек от ведущих производителей',
    'numberOfItems': productLinesForSchema.value.length,
    'itemListElement': productLinesForSchema.value.map((line, index) => {
      const brand = brandsForSchema.value.find(b => b.id === line.brand_id)
      return {
        '@type': 'ListItem',
        'position': index + 1,
        'item': {
          '@type': 'ProductCollection',
          '@id': `${siteUrl}/brand/${brand?.slug || 'unknown'}/${line.slug}#collection`,
          'name': line.name,
          'url': `${siteUrl}/brand/${brand?.slug || 'unknown'}/${line.slug}`,
          'description': line.description || `Коллекция ${line.name} от бренда ${brand?.name || 'Unknown'}`,
          ...(brand && {
            brand: {
              '@type': 'Brand',
              '@id': `${siteUrl}/brand/${brand.slug}#brand`,
              'name': brand.name,
            },
          }),
        },
      }
    }),
  }
})

useHead(() => ({
  meta: [
    {
      name: 'keywords',
      content: keywords.value || '',
    },
  ],
  link: [{ rel: 'canonical', href: siteUrl }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(organizationSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(webSiteSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(storeSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(categoriesListSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(brandsListSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(productLinesListSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(collectionPageSchema.value),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(breadcrumbSchema.value),
    },
  ],
}))

useSchemaOrg([
  {
    '@type': 'WebPage',
    '@id': `${siteUrl}/#webpage`,
    'url': siteUrl,
    'name': metaTitle,
    'description': metaDescription,
    'inLanguage': 'ru-KZ',
    'isPartOf': { '@id': `${siteUrl}/#website` },
    'about': { '@id': `${siteUrl}/#organization` },
    'primaryImageOfPage': { '@type': 'ImageObject', 'url': ogImageUrl },
    'breadcrumb': { '@id': `${siteUrl}/#breadcrumb` },
    'speakable': {
      '@type': 'SpeakableSpecification',
      'cssSelector': ['h1', 'h2', '.prose'],
    },
  },
])

useRobotsRule({ index: true, follow: true })
</script>

<template>
  <div>
    <!-- ✅ Скрытый SEO-текст - строго одна строка без переносов -->
    <div class="sr-only">
      <h1>{{ siteName }} - Интернет-магазин детских игрушек в Казахстане</h1>
      <p>Купить детские игрушки в Алматы и по всему Казахстану. Развивающие игрушки, конструкторы, куклы, машинки, настольные игры и многое другое. Быстрая доставка, бонусная программа, гарантия качества.</p>
    </div>

    <!-- Статус активного заказа -->
    <div :class="alwaysContainedClass" class="py-4">
      <ClientOnly>
        <div v-if="isLoggedIn">
          <div v-if="isAdmin" class="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <NuxtLink to="/admin" class="font-semibold text-primary hover:underline">
              Перейти в панель администратора
            </NuxtLink>
          </div>
          <HomeActiveOrderStatus v-else />
        </div>
        <template #fallback>
          <!-- Пустой div той же высоты для предотвращения layout shift -->
          <div class="h-0" />
        </template>
      </ClientOnly>
    </div>

    <!-- ✅ Слайдер в ClientOnly -->
    <ClientOnly>
      <CommonAppCarousel
        :is-loading="isLoadingSlides"
        :error="slidesError"
        :slides="slides || []"
      />
      <template #fallback>
        <!-- Простой скелетон без условной логики -->
        <div :class="carouselContainerVariants({ contained: 'desktop' })">
          <div class="py-4">
            <div class="p-1">
              <div class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9 bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- Карусель брендов (стиль Instagram Stories) -->
    <HomeBrandsCarousel v-if="topBrands && topBrands.length > 0" :brands="topBrands" />

    <!-- Баннеры -->
    <div :class="alwaysContainedClass">
      <HomeBanners />
    </div>

    <!-- Популярные категории - без ClientOnly -->
    <div :class="desktopContainedClass">
      <HomePopularCategories />
    </div>

    <!-- Карточки бонусов -->
    <div :class="alwaysContainedClass" class="py-8 md:py-12">
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight text-start mb-8">
        Акции и бонусы
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        <HomeBonusProgramCard />
        <HomeFeaturedProduct />
      </div>
    </div>

    <!-- Карусели товаров -->
    <ClientOnly>
      <div v-if="isLoadingMainBlock" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>
      <template v-else>
        <HomeProductsCarousel
          v-if="isLoggedIn && wishlistProducts.length > 0"
          :is-loading="isFetchingRecommendations"
          :products="wishlistProducts"
          title="Ваше избранное"
          see-all-link="/profile/wishlist"
          class="mt-16 pt-8 border-t"
        />
        <HomeProductsCarousel
          v-if="recommendedProducts && recommendedProducts.length > 0"
          :is-loading="isFetchingRecommendations"
          :products="recommendedProducts"
          title="Вам может понравиться"
          see-all-link="/catalog/all?recommended=true"
          :class="{ 'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0 }"
        />
        <HomeProductsCarousel
          v-else
          :is-loading="isFetchingPopular"
          :products="popularProducts"
          title="Популярные товары"
          see-all-link="/catalog/all?sort_by=popularity"
          class="mt-16 pt-8 border-t"
        />
      </template>
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Новые поступления -->
    <ClientOnly>
      <div v-if="showNewestSkeleton" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>
      <HomeProductsCarousel
        v-else-if="newestProducts && newestProducts.length > 0"
        :is-loading="isFetchingNewest"
        :products="newestProducts"
        title="Новые поступления"
        see-all-link="/catalog/all?sort_by=newest"
        class="pt-4 border-t"
      />
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- ✅ SEO-блок - весь текст в одну строку без переносов -->
    <div :class="alwaysContainedClass" class="py-12 md:py-16 border-t">
      <div class="prose prose-lg max-w-none">
        <h2 class="text-2xl md:text-3xl font-bold mb-6">
          Интернет-магазин детских игрушек {{ siteName }} в Алматы
        </h2>
        <div class="grid md:grid-cols-2 gap-8 text-muted-foreground">
          <div>
            <h3 class="text-xl font-semibold text-foreground mb-3">
              Широкий ассортимент игрушек
            </h3>
            <p class="mb-4">
              В нашем интернет-магазине в Алматы вы найдете огромный выбор детских игрушек для детей всех возрастов: от развивающих игрушек для малышей до конструкторов и настольных игр для школьников.
            </p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Развивающие игрушки и игры</li>
              <li>Конструкторы и пазлы</li>
              <li>Куклы и машинки</li>
              <li>Мягкие игрушки</li>
              <li>Настольные игры</li>
            </ul>
          </div>
          <div>
            <h3 class="text-xl font-semibold text-foreground mb-3">
              Официальные бренды
            </h3>
            <p class="mb-4">
              Мы работаем с ведущими производителями детских игрушек. В нашем каталоге представлены только оригинальные товары от проверенных брендов с гарантией качества.
            </p>
            <ClientOnly>
              <div v-if="brandsForSchema.length > 0" class="flex flex-wrap gap-2 mb-4">
                <NuxtLink
                  v-for="brand in brandsForSchema.slice(0, 8)"
                  :key="brand.id"
                  :to="`/brand/${brand.slug}`"
                  class="text-sm px-3 py-1 bg-primary/5 hover:bg-primary/10 rounded-full transition-colors"
                >
                  {{ brand.name }}
                </NuxtLink>
              </div>
            </ClientOnly>
          </div>
        </div>
        <div class="mt-8 pt-8 border-t">
          <h3 class="text-xl font-semibold text-foreground mb-3">
            Преимущества покупки в {{ siteName }}
          </h3>
          <ul class="grid md:grid-cols-2 gap-3">
            <li class="flex items-start gap-2">
              <Icon name="lucide:map-pin" class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span><strong>Доставка по Алматы</strong> - быстрая и удобная</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon name="lucide:gift" class="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <span><strong>Бонусная программа</strong> - накапливайте баллы за покупки</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon name="lucide:shield-check" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <span><strong>Гарантия качества</strong> - только сертифицированные товары</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon name="lucide:headphones" class="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <span><strong>Поддержка 24/7</strong> - всегда рады помочь</span>
            </li>
          </ul>
          <div class="mt-6 pt-6 border-t">
            <div class="flex items-center gap-3">
              <Icon name="lucide:phone" class="w-6 h-6 text-primary flex-shrink-0" />
              <div>
                <p class="text-sm text-muted-foreground">Свяжитесь с нами:</p>
                <a href="tel:+77771243843" class="text-lg font-semibold text-foreground hover:text-primary transition-colors">
                  +7 (777) 124-38-43
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Промо регистрации -->
    <ClientOnly>
      <HomeGuestRegistrationPromo />
      <template #fallback>
        <!-- Пустой div для предотвращения layout shift -->
        <div class="h-0" />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type {
  ProductWithGallery,
  RecommendedProduct,
} from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import { useSlides } from '@/composables/slides/useSlides'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

// Lazy load non-critical components
const LazyBanners = defineAsyncComponent(() => import('@/components/home/Banners.vue'))
const LazyBonusCard = defineAsyncComponent(() => import('@/components/home/BonusProgramCard.vue'))
const LazyFeaturedProduct = defineAsyncComponent(() => import('@/components/home/FeaturedProduct.vue'))
const LazyGuestPromo = defineAsyncComponent(() => import('@/components/home/GuestRegistrationPromo.vue'))
const LazyProductsCarousel = defineAsyncComponent(() => import('@/components/home/ProductsCarousel.vue'))

// Detect mobile for conditional loading — useMediaQuery кешируется, не дёргает DOM при рендере
const isMobile = useMediaQuery('(max-width: 767px)')

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

const nuxtApp = useNuxtApp()
function getCachedData(key: string) {
  return nuxtApp.payload.data[key] || nuxtApp.static.data[key]
}

const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })
const desktopContainedClass = carouselContainerVariants({
  contained: 'desktop',
})

interface HomePersonalData {
  recommended: RecommendedProduct[]
  wishlist: ProductWithGallery[]
}

// ✅ SSR prefetch — LAZY для небл окирующего рендера
useAsyncData(
  'home-ssr-critical',
  async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return {
      categories: popularCategoriesStore.popularCategories || [],
    }
  },
  { server: true, lazy: true, getCachedData },
)

// TanStack Query — рекомендации
const recommendationsQueryKey = computed(() => [
  'home-recommendations',
  user.value?.id,
  personalizationTrigger.value,
  isLoggedIn.value,
])

// @ts-expect-error - Type instantiation depth issue with TanStack Query + Supabase complex types.
const {
  data: mainPersonalData,
  isLoading: isLoadingRecommendations,
  isFetching: isFetchingRecommendations,
} = useQuery<HomePersonalData>({
  queryKey: recommendationsQueryKey,
  queryFn: async (): Promise<HomePersonalData> => {
    const [recommended, wishlist] = await Promise.all([
      recommendationsStore.fetchRecommendations(),
      isLoggedIn.value
        ? wishlistStore.fetchWishlistProducts().then(() => wishlistStore.wishlistProducts)
        : Promise.resolve([]),
    ])

    return {
      recommended: recommended || [],
      wishlist: wishlist || [],
    }
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const recommendedProducts = computed<RecommendedProduct[]>(
  () => mainPersonalData.value?.recommended || [],
)
const wishlistProducts = computed<ProductWithGallery[]>(
  () => mainPersonalData.value?.wishlist || [],
)

const showRecommendationsSkeleton = computed(
  () =>
    (isLoadingRecommendations.value || isFetchingRecommendations.value)
    && (!mainPersonalData.value
      || (mainPersonalData.value.recommended.length === 0
        && mainPersonalData.value.wishlist.length === 0)),
)

// TanStack Query — популярные товары
const popularQuery = useQuery<ProductWithGallery[]>({
  queryKey: ['home-popular'],
  queryFn: () => productsStore.fetchPopularProducts(10),
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const popularProductsData = popularQuery.data
const isLoadingPopular = popularQuery.isLoading
const isFetchingPopular = popularQuery.isFetching

const popularProducts = computed<ProductWithGallery[]>(
  () => popularProductsData.value || [],
)

// TanStack Query — новинки
const {
  data: newestProductsData,
  isLoading: isLoadingNewest,
  isFetching: isFetchingNewest,
} = useQuery<ProductWithGallery[]>({
  queryKey: ['home-newest'],
  queryFn: () => productsStore.fetchNewestProducts(10),
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const newestProducts = computed<ProductWithGallery[]>(
  () => newestProductsData.value || [],
)

const showPopularSkeleton = computed(
  () =>
    (isLoadingPopular.value || isFetchingPopular.value)
    && !popularProductsData.value,
)

const showNewestSkeleton = computed(
  () =>
    (isLoadingNewest.value || isFetchingNewest.value)
    && !newestProductsData.value,
)
const isLoadingMainBlock = computed(
  () => showRecommendationsSkeleton.value || showPopularSkeleton.value,
)

// --- Progressive Loading ---
const shouldRenderSecondaryBlocks = ref(false)
const shouldRenderLowerBlocks = ref(false)

onMounted(() => {
  // Загружаем основные блоки чуть позже
  requestIdleCallback(() => {
    shouldRenderSecondaryBlocks.value = true
  })

  // Загружаем нижние блоки ещё позже
  setTimeout(() => {
    shouldRenderLowerBlocks.value = true
  }, 1000)
})

// ---------------------------------------------------------------------------
// Вычисляемые флаги для условного рендера карусельных блоков.
// ...

// ВАЖНО: v-if снаружи LazyHydration — компонент либо есть в DOM (и будет
// гидрирован по стратегии), либо его нет вовсе. Это корректно.
// ---------------------------------------------------------------------------
const showWishlistCarousel = computed(
  () => isLoggedIn.value && wishlistProducts.value.length > 0,
)
const showRecommendedCarousel = computed(
  () => recommendedProducts.value && recommendedProducts.value.length > 0,
)
const showPopularFallbackCarousel = computed(
  () =>
    !showRecommendedCarousel.value
    && popularProducts.value
    && popularProducts.value.length > 0,
)
const showNewestCarousel = computed(
  () => newestProducts.value && newestProducts.value.length > 0,
)

// ---------------------------------------------------------------------------
// Скелетоны для карусельных блоков.
// ИСПРАВЛЕНО: вместо ClientOnly + template#fallback используем серверный рендер
// скелетона через v-if/v-else прямо в шаблоне. Скелетон виден на SSR и во
// время загрузки данных, LazyHydration-карусель появляется когда данные готовы.
// ---------------------------------------------------------------------------

// SEO
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const metaTitle = `Купить детские игрушки в Алматы | ${siteName}`
const metaDescription = `Интернет-магазин детских игрушек ${siteName} в Алматы ⭐ Развивающие игры, конструкторы, куклы, машинки ✓ Официальные бренды ✓ Доставка по Алматы ✓ Бонусная программа ✓ Гарантия качества`

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
  return baseKeywords.join(', ')
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
  robots:
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
})

// Simplified static schemas (no reactive dependencies)
const storeSchema = {
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
    'streetAddress': 'мкр. Шапагат, ул. Амангельды',
    'postalCode': '050058',
  },
  'geo': {
    '@type': 'GeoCoordinates',
    'latitude': 43.222,
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
}

const collectionPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${siteUrl}/#collectionpage`,
  'url': siteUrl,
  'name': metaTitle,
  'description': metaDescription,
  'isPartOf': { '@id': `${siteUrl}/#website` },
}

useHead({
  meta: [
    {
      name: 'keywords',
      content: keywords.value || '',
    },
  ],
  link: [
    { rel: 'canonical', href: siteUrl },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com', crossorigin: 'anonymous' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    { rel: 'dns-prefetch', href: 'https://gvsdevsvzgcivpphcuai.supabase.co' },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(storeSchema),
      tagPosition: 'bodyClose',
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(collectionPageSchema),
      tagPosition: 'bodyClose',
    },
  ],
})

useSchemaOrg([
  {
    '@type': 'BreadcrumbList',
    '@id': `${siteUrl}/#breadcrumb`,
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'Главная',
        'item': siteUrl,
      },
    ],
  },
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
    <!-- ✅ Скрытый SEO-текст -->
    <div v-once class="sr-only">
      <h1>{{ siteName }} - Интернет-магазин детских игрушек в Казахстане</h1>
      <p>
        Купить детские игрушки в Алматы и по всему Казахстану. Развивающие
        игрушки, конструкторы, куклы, машинки, настольные игры и многое другое.
        Быстрая доставка, бонусная программа, гарантия качества.
      </p>
    </div>

    <!-- Статус активного заказа -->
    <div :class="alwaysContainedClass" class="py-4">
      <ClientOnly>
        <!--
          ClientOnly здесь оправдан: блок зависит от auth-стора,
          который не доступен на SSR, и не является LazyHydration-компонентом.
        -->
        <div v-if="isLoggedIn">
          <div
            v-if="isAdmin"
            v-once
            class="p-4 bg-blue-50 border border-blue-200 rounded-md"
          >
            <NuxtLink
              to="/admin"
              class="font-semibold text-primary hover:underline"
            >
              Перейти в панель администратора
            </NuxtLink>
          </div>
          <HomeActiveOrderStatus v-else />
        </div>
        <template #fallback>
          <div class="h-0" />
        </template>
      </ClientOnly>
    </div>

    <!-- ✅ Слайдер в ClientOnly (нет SSR-данных, нужна клиентская логика) -->
    <ClientOnly>
      <template v-if="!isMobile || slides?.length">
        <CommonAppCarousel
          :is-loading="isLoadingSlides"
          :error="slidesError"
          :slides="slides || []"
        />
      </template>
      <template #fallback>
        <div :class="carouselContainerVariants({ contained: 'desktop' })">
          <div class="py-4">
            <div class="p-1">
              <div
                class="w-full h-auto rounded-2xl aspect-3/2 md:aspect-19/6 lg:aspect-21/9 bg-muted animate-pulse"
              />
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- ✅ Баннеры (без изменений — уже было корректно) -->
    <div :class="alwaysContainedClass">
      <LazyBanners />
    </div>

    <!-- Бренды в коллапсе -->
    <div :class="alwaysContainedClass" class="py-6">
      <ClientOnly>
        <HomeBrandsCollapsible v-if="shouldRenderSecondaryBlocks" />
      </ClientOnly>
    </div>

    <!-- Популярные категории -->
    <div :class="desktopContainedClass">
      <HomePopularCategories v-if="shouldRenderSecondaryBlocks" />
    </div>

    <!-- Карточки бонусов (без изменений — уже было корректно) -->
    <div :class="alwaysContainedClass" class="py-8 md:py-12">
      <h2 v-once class="text-2xl md:text-3xl font-bold tracking-tight text-start mb-8">
        Акции и бонусы
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        <LazyBonusCard />
        <LazyFeaturedProduct />
      </div>
    </div>

    <!--
      ✅ Карусели товаров — ClientOnly + обычные (не LazyHydration) компоненты.
    -->
    <div :class="alwaysContainedClass" class="py-8 md:py-12">
      <ClientOnly>
        <template v-if="isLoadingMainBlock || !shouldRenderLowerBlocks">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </template>
        <template v-else>
          <!-- Избранное (только для залогиненных) -->
          <LazyProductsCarousel
            v-if="showWishlistCarousel"
            :is-loading="isFetchingRecommendations"
            :products="wishlistProducts"
            title="Ваше избранное"
            see-all-link="/profile/wishlist"
            class="mt-16 pt-8 border-t"
          />

          <!-- Рекомендации ИЛИ Популярные товары -->
          <LazyProductsCarousel
            v-if="showRecommendedCarousel"
            :is-loading="isFetchingRecommendations"
            :products="recommendedProducts"
            title="Вам может понравиться"
            see-all-link="/catalog/all?recommended=true"
            :class="{
              'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0,
            }"
          />
          <LazyProductsCarousel
            v-else-if="showPopularFallbackCarousel"
            :is-loading="isFetchingPopular"
            :products="popularProducts"
            title="Популярные товары"
            see-all-link="/catalog/all?sort_by=popularity"
            :class="{
              'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0,
            }"
          />
        </template>
        <!-- SSR fallback: статичный скелетон, не участвует в гидрации -->
        <template #fallback>
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!--
      ✅ Новые поступления — та же логика: данные client-only → ClientOnly-обёртка.
    -->
    <div :class="alwaysContainedClass" class="py-8 md:py-12">
      <ClientOnly>
        <template v-if="showNewestSkeleton || !shouldRenderLowerBlocks">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </template>
        <LazyProductsCarousel
          v-else-if="showNewestCarousel"
          :is-loading="isFetchingNewest"
          :products="newestProducts"
          title="Новые поступления"
          see-all-link="/catalog/all?sort_by=newest"
          class="pt-4 border-t"
        />
        <template #fallback>
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!-- SEO-блок -->
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
              В нашем интернет-магазине в Алматы вы найдете огромный выбор
              детских игрушек для детей всех возрастов: от развивающих игрушек
              для малышей до конструкторов и настольных игр для школьников.
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
              Мы работаем с ведущими производителями детских игрушек. В нашем
              каталоге представлены только оригинальные товары от проверенных
              брендов с гарантией качества.
            </p>
          </div>
        </div>
        <div class="mt-8 pt-8 border-t">
          <h3 class="text-xl font-semibold text-foreground mb-3">
            Преимущества покупки в {{ siteName }}
          </h3>
          <ul class="grid md:grid-cols-2 gap-3">
            <li class="flex items-start gap-2">
              <Icon
                name="lucide:map-pin"
                class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
              />
              <span><strong>Доставка по Алматы</strong> - быстрая и удобная</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon
                name="lucide:gift"
                class="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
              />
              <span><strong>Бонусная программа</strong> - накапливайте баллы за покупки</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon
                name="lucide:shield-check"
                class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
              />
              <span><strong>Гарантия качества</strong> - только сертифицированные товары</span>
            </li>
            <li class="flex items-start gap-2">
              <Icon
                name="lucide:headphones"
                class="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5"
              />
              <span><strong>Поддержка 24/7</strong> - всегда рады помочь</span>
            </li>
          </ul>
          <div class="mt-6 pt-6 border-t">
            <div class="flex items-center gap-3">
              <Icon
                name="lucide:phone"
                class="w-6 h-6 text-primary flex-shrink-0"
              />
              <div>
                <p class="text-sm text-muted-foreground">
                  Свяжитесь с нами:
                </p>
                <a
                  href="tel:+77771243843"
                  class="text-lg font-semibold text-foreground hover:text-primary transition-colors"
                >
                  +7 (777) 124-38-43
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
      ✅ Промо регистрации
      ИСПРАВЛЕНО: убрана ClientOnly-обёртка.
      Компонент рендерится на SSR → гидрируется при входе во вьюпорт.
      Если компонент использует auth-данные внутри, он обработает это сам
      через onMounted или watch после гидрации.
    -->
    <LazyGuestPromo />
  </div>
</template>

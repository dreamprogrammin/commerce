<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { useSlides } from '@/composables/slides/useSlides'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()
const productsStore = useProductsStore()
const wishlistStore = useWishlistStore()
const { slides, isLoading: isLoadingSlides, error: slidesError } = useSlides()

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

definePageMeta({
  layout: 'home',
})

const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })
const desktopContainedClass = carouselContainerVariants({ contained: 'desktop' })

// TanStack Query
const { data: mainPersonalData, isLoading: isLoadingRecommendations, isFetching: isFetchingRecommendations } = useQuery({
  queryKey: ['home-recommendations', user.value?.id, personalizationTrigger.value, isLoggedIn.value],
  queryFn: async () => {
    const [recommended, wishlist] = await Promise.all([
      recommendationsStore.fetchRecommendations(),
      isLoggedIn.value ? wishlistStore.fetchWishlistProducts() : [],
    ])
    return {
      recommended: recommended || [],
      wishlist: Array.isArray(wishlist) ? wishlist : [],
    }
  },
  staleTime: 3 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
})

const recommendedProducts = computed(() => mainPersonalData.value?.recommended || [])
const wishlistProducts = computed(() => mainPersonalData.value?.wishlist || [])

const showRecommendationsSkeleton = computed(() =>
  (isLoadingRecommendations.value || isFetchingRecommendations.value)
  && (!mainPersonalData.value || (mainPersonalData.value.recommended.length === 0 && mainPersonalData.value.wishlist.length === 0)),
)

const { data: popularProductsData, isLoading: isLoadingPopular, isFetching: isFetchingPopular } = useQuery({
  queryKey: ['home-popular'],
  queryFn: () => productsStore.fetchPopularProducts(10),
  staleTime: 3 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
})

const popularProducts = computed(() => popularProductsData.value || [])

const { data: newestProductsData, isLoading: isLoadingNewest, isFetching: isFetchingNewest } = useQuery({
  queryKey: ['home-newest'],
  queryFn: () => productsStore.fetchNewestProducts(10),
  staleTime: 3 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
})

const newestProducts = computed(() => newestProductsData.value || [])

const showPopularSkeleton = computed(() =>
  (isLoadingPopular.value || isFetchingPopular.value) && !popularProductsData.value,
)

const showNewestSkeleton = computed(() =>
  (isLoadingNewest.value || isFetchingNewest.value) && !newestProductsData.value,
)

const isLoadingMainBlock = computed(() => showRecommendationsSkeleton.value || showPopularSkeleton.value)

// SEO
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const metaTitle = `Купить детские игрушки в Алматы и Казахстане | ${siteName}`
const metaDescription = `Интернет-магазин детских игрушек ${siteName} ⭐ Развивающие игры, конструкторы, куклы, машинки для детей всех возрастов ✓ Быстрая доставка по Казахстану ✓ Бонусная программа ✓ Гарантия качества`
const keywords = [
  'детские игрушки',
  'игрушки для детей',
  'купить игрушки',
  'интернет магазин игрушек',
  'игрушки Алматы',
  'детские товары Казахстан',
  'развивающие игрушки',
  'конструкторы для детей',
  'куклы',
  'машинки',
  'мягкие игрушки',
  'настольные игры',
  'пазлы',
].join(', ')
const ogImageUrl = `${siteUrl}/og-home-toys.jpeg`

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  keywords,
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

useHead({
  link: [{ rel: 'canonical', href: siteUrl }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
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
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
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
        'areaServed': { '@type': 'Country', 'name': 'Kazakhstan' },
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': siteUrl },
        ],
      }),
    },
  ],
})

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
          Интернет-магазин детских игрушек {{ siteName }}
        </h2>
        <div class="grid md:grid-cols-2 gap-8 text-muted-foreground">
          <div>
            <h3 class="text-xl font-semibold text-foreground mb-3">
              Широкий ассортимент игрушек
            </h3>
            <p class="mb-4">
              В нашем интернет-магазине вы найдете огромный выбор детских игрушек для детей всех возрастов: от развивающих игрушек для малышей до конструкторов и настольных игр для школьников.
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
              Преимущества покупки у нас
            </h3>
            <ul class="space-y-3">
              <li class="flex items-start gap-2">
                <Icon name="lucide:check-circle" class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span><strong>Быстрая доставка</strong> по Алматы и всему Казахстану</span>
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

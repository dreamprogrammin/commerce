<script setup lang="ts">
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

const { data: mainPersonalData, pending: isLoadingRecommendations } = useAsyncData(
  'home-recommendations',
  async () => {
    const [recommended, wishlist] = await Promise.all([
      recommendationsStore.fetchRecommendations(),
      isLoggedIn.value ? wishlistStore.fetchWishlistProducts() : [],
    ])

    return {
      recommended: recommended || [],
      wishlist: Array.isArray(wishlist) ? wishlist : [],
    }
  },
  {
    watch: [user, personalizationTrigger, isLoggedIn],
    lazy: true,
    default: () => ({ recommended: [], wishlist: [] }),
  },
)

const recommendedProducts = computed(() => mainPersonalData.value.recommended)
const wishlistProducts = computed(() => mainPersonalData.value.wishlist)

const { data: popularProducts, pending: isLoadingPopular } = useAsyncData(
  'home-popular',
  () => productsStore.fetchPopularProducts(10),
  { lazy: true, default: () => [] },
)

const { data: newestProducts, pending: isLoadingNewest } = useAsyncData(
  'home-newest',
  () => productsStore.fetchNewestProducts(10),
  { lazy: true, default: () => [] },
)

const isLoadingMainBlock = computed(() => isLoadingRecommendations.value || isLoadingPopular.value)

// SEO для главной страницы
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const metaTitle = `Интернет-магазин детских товаров | ${siteName} - Широкий ассортимент`
const metaDescription = 'Купить детские товары в Казахстане ✓ Бонусная программа ✓ Быстрая доставка по Алматы и всему Казахстану ✓ Гарантия качества'

// Open Graph изображение
const ogImageUrl = `${siteUrl}/og-home-toys.jpeg`

useHead({
  title: metaTitle,
  meta: [
    // Basic meta
    { name: 'description', content: metaDescription },
    { name: 'keywords', content: 'детские товары, интернет магазин Казахстан, Алматы' },

    // Open Graph (для соцсетей)
    { property: 'og:title', content: metaTitle },
    { property: 'og:description', content: metaDescription },
    { property: 'og:url', content: siteUrl },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: siteName },
    { property: 'og:locale', content: 'ru_RU' },
    { property: 'og:image', content: ogImageUrl },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: siteName },

    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: metaTitle },
    { name: 'twitter:description', content: metaDescription },
    { name: 'twitter:image', content: ogImageUrl },

    // Дополнительно
    { name: 'robots', content: 'index, follow' },
    { name: 'author', content: siteName },
  ],
  link: [
    { rel: 'canonical', href: siteUrl },
  ],
  script: [
    // 🔥 Schema.org для сайта
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'name': siteName,
        'url': siteUrl,
        'potentialAction': {
          '@type': 'SearchAction',
          'target': `${siteUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }),
    },
    // 🔥 Schema.org для магазина
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Store',
        'name': siteName,
        'url': siteUrl,
        'logo': `${siteUrl}/logo.png`,
        'description': metaDescription,
        'address': {
          '@type': 'PostalAddress',
          'addressCountry': 'KZ',
          'addressLocality': 'Алматы',
        },
        'priceRange': '₸₸',
        'telephone': '+7-702-537-94-73', // Замени на свой
      }),
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
    <!-- Блок приветствия/авторизации -->
    <div :class="alwaysContainedClass" class="py-4">
      <ClientOnly>
        <div v-if="isLoggedIn" class="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <NuxtLink v-if="isAdmin" to="/admin" class="font-semibold text-primary hover:underline">
            Перейти в панель администратора
          </NuxtLink>
          <NuxtLink v-else to="/profile" class="font-semibold text-primary hover:underline">
            Перейти в личный кабинет
          </NuxtLink>
        </div>
        <div v-else class="p-4 bg-gray-100 border rounded-md">
          <NuxtLink to="/profile" class="font-semibold text-primary hover:underline">
            Пожалуйста, авторизуйтесь, чтобы получать бонусы!
          </NuxtLink>
        </div>
        <template #fallback>
          <div class="p-4 bg-gray-100 border rounded-md animate-pulse">
            <div class="h-5 w-1/3 bg-gray-200 rounded" />
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Слайдер -->
    <CommonAppCarousel
      :is-loading="isLoadingSlides"
      :error="slidesError"
      :slides="slides || []"
    />

    <!-- 🆕 Баннеры (сразу после слайдера) -->
    <div :class="alwaysContainedClass">
      <HomeBanners />
    </div>

    <!-- Популярные категории -->
    <div :class="desktopContainedClass">
      <HomePopularCategories />
    </div>

    <!-- Карточки бонусов и избранного -->
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
      <!-- Скелетон -->
      <div v-if="isLoadingMainBlock" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <template v-else>
        <!-- Избранное -->
        <HomeProductsCarousel
          v-if="isLoggedIn && wishlistProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="wishlistProducts"
          title="Ваше избранное"
          see-all-link="/profile/wishlist"
          class="mt-16 pt-8 border-t"
        />

        <!-- Рекомендации -->
        <HomeProductsCarousel
          v-if="recommendedProducts && recommendedProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="recommendedProducts"
          title="Вам может понравиться"
          see-all-link="/catalog/all?recommended=true"
          :class="{ 'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0 }"
        />

        <!-- Популярные товары (fallback) -->
        <HomeProductsCarousel
          v-else
          :is-loading="isLoadingPopular"
          :products="popularProducts"
          title="Популярные товары"
          see-all-link="/catalog/all?sort_by=popularity"
          class="mt-16 pt-8 border-t"
        />
      </template>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Новые поступления -->
    <ClientOnly>
      <HomeProductsCarousel
        v-if="newestProducts && newestProducts.length > 0"
        :is-loading="isLoadingNewest"
        :products="newestProducts"
        title="Новые поступления"
        see-all-link="/catalog/all?sort_by=newest"
        class="pt-4 border-t"
      />

      <!-- Скелетон для новинок -->
      <div v-else-if="isLoadingNewest" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

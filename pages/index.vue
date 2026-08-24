<script setup lang="ts">
import type {
  ProductWithGallery,
  RecommendedProduct,
} from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useSlides } from '@/composables/slides/useSlides'
import {
  HOME_CHIPS_CATEGORY_LIMIT,
  HOME_STATIC_CHIPS,
} from '@/constants/homePlaceholders'
import { carouselContainerVariants, sectionSpacingVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

// Ленивая загрузка некритичных блоков
const LazyProductsCarousel = defineAsyncComponent(() => import('@/components/home/ProductsCarousel.vue'))

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()
const productsStore = useProductsStore()
const wishlistStore = useWishlistStore()
const categoriesStore = useCategoriesStore()
const { slides, isLoading: isLoadingSlides, error: slidesError, suspense: slidesSuspense } = useSlides()

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

interface HomePersonalData {
  recommended: RecommendedProduct[]
  wishlist: ProductWithGallery[]
}

// ✅ SSR prefetch — прогреваем дерево категорий для секции «Популярные категории»
useAsyncData(
  'home-ssr-critical',
  async () => {
    await categoriesStore.fetchCategoryData()
    return { ok: true }
  },
  { server: true, lazy: true, getCachedData },
)

/*
 * Слайды героя ждём на сервере — намеренно НЕ lazy, в отличие от блока выше.
 *
 * `useSlides()` это обычный useQuery без ожидания. Из-за этого Hero рисовался
 * тем состоянием, которое успевало сложиться к его очереди: на холодном
 * соединении с базой ответ не поспевал и в HTML уходил скелетон, на прогретом
 * — настоящий герой. При этом payload сериализуется позже рендера и слайды в
 * нём уже были. Клиент поднимал их из payload, рисовал герой поверх
 * закешированного скелетона — отсюда «Hydration completed but contains
 * mismatches» на `/` и мигание скелетоном.
 *
 * Бьёт это не по одному посетителю: у `/` стоит `swr: 600`, и случайно
 * снятый скелетон раздавался всем следующие десять минут.
 *
 * Замерено: закешированный ответ давал несовпадение 5 раз из 5, а свежий
 * рендер (`/?nocache=…`, мимо кеша) — 0 из 5.
 */
useAsyncData('home-slides-ssr', async () => {
  await slidesSuspense()
  return true
}, { server: true, getCachedData })

// TanStack Query — рекомендации (лента «Подобрали для вас»)
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

// TanStack Query — популярные товары (fallback ленты для гостей)
const popularQuery = useQuery<ProductWithGallery[]>({
  queryKey: ['home-popular'],
  queryFn: () => productsStore.fetchPopularProducts(10),
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

const popularProductsData = popularQuery.data
const isFetchingPopular = popularQuery.isFetching

const popularProducts = computed<ProductWithGallery[]>(
  () => popularProductsData.value || [],
)

const showPopularSkeleton = computed(
  () =>
    (popularQuery.isLoading.value || popularQuery.isFetching.value)
    && !popularProductsData.value,
)

const isLoadingMainBlock = computed(
  () => showRecommendationsSkeleton.value || showPopularSkeleton.value,
)

// Скелетон главной ленты держится, пока карусель не смонтируется по-настоящему.
// Сами карусели ленивые: между снятием скелетона и появлением их разметки
// проходит время загрузки чанка, и раньше в этот зазор блок схлопывался.
const isMainCarouselMounted = ref(false)
function onMainCarouselMounted() {
  isMainCarouselMounted.value = true
}

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

/** Есть ли вообще что показывать в главной ленте. */
const hasMainCarousel = computed(
  () =>
    showWishlistCarousel.value
    || showRecommendedCarousel.value
    || showPopularFallbackCarousel.value,
)

// --- Быстрые чипы: статические ссылки + корневые категории из menuTree ---
const chipItems = computed(() => {
  const roots = (categoriesStore.menuTree ?? [])
    .slice(0, HOME_CHIPS_CATEGORY_LIMIT)
    .map(r => ({
      id: r.slug,
      label: r.name,
      to: r.href || `/catalog/${r.slug}`,
      icon: r.icon_name || null,
    }))
  return [
    ...HOME_STATIC_CHIPS.map(c => ({ ...c, icon: null as string | null })),
    ...roots,
  ]
})

// --- Progressive Loading ---
const shouldRenderSecondaryBlocks = ref(false)
const shouldRenderLowerBlocks = ref(false)

onMounted(() => {
  requestIdleCallback(() => {
    shouldRenderSecondaryBlocks.value = true
  })
  setTimeout(() => {
    shouldRenderLowerBlocks.value = true
  }, 1000)
})

/**
 * Скелетон главной ленты. Снимается ровно в двух случаях:
 *  • карусель смонтировалась — место занято настоящей разметкой;
 *  • данные догрузились и показывать нечего — тогда блока и не должно быть.
 * Во всех остальных состояниях он держит высоту, чтобы не двигать соседей.
 *
 * Объявлено здесь, а не рядом с остальными флагами, потому что зависит от
 * shouldRenderLowerBlocks выше.
 */
const showMainCarouselSkeleton = computed(
  () =>
    !isMainCarouselMounted.value
    && (isLoadingMainBlock.value
      || !shouldRenderLowerBlocks.value
      || hasMainCarousel.value),
)

// --- «Перейти к покупкам» → скролл к ленте товаров ---
const shopSectionRef = ref<HTMLElement | null>(null)
function scrollToShop() {
  const el = shopSectionRef.value
  if (!el)
    return
  const top = el.getBoundingClientRect().top + window.scrollY - 80
  window.scrollTo({ top, behavior: 'smooth' })
}

// ==========================================================================
// SEO — сохранено без изменений при редизайне
// ==========================================================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
/*
 * В заголовке НАМЕРЕННО оба написания названия.
 *
 * Search Console 17 августа: по запросу «uhti» (латиницей) Google показывал
 * три страницы сайта, и правовые собирали больше показов, чем главная —
 * /terms на 3-й позиции и /privacy-policy на 7-й против главной на 1.5,
 * при нуле кликов на всех. Причина в заголовках: «uhti» встречалось в title
 * только у правовых страниц, а у главной — лишь в адресах и canonical.
 * Теперь по этому запросу главная выигрывает по совпадению в заголовке.
 */
const metaTitle = `Купить детские игрушки в Алматы | ${siteName} (uhti.kz)`
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
  robots: useRobotsContent(
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ),
})

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

// Через useIndexableRobotsRule, а не напрямую: на превью правило должно
// становиться noindex по флагу site.indexable, см. composables/useRobotsContent.ts
useIndexableRobotsRule({ index: true, follow: true })
</script>

<template>
  <div>
    <!-- ✅ Скрытый SEO-текст: единственный h1 страницы -->
    <div class="sr-only">
      <h1>{{ siteName }} - Интернет-магазин детских игрушек в Казахстане</h1>
      <p>
        Купить детские игрушки в Алматы и по всему Казахстану. Развивающие
        игрушки, конструкторы, куклы, машинки, настольные игры и многое другое.
        Быстрая доставка, бонусная программа, гарантия качества.
      </p>
    </div>

    <!-- ============ HERO (full-bleed) ============ -->
    <HomeHero
      :slides="slides || []"
      :is-loading="isLoadingSlides"
      :error="slidesError"
    />

    <!-- Мобильная распорка под фиксированным героем -->
    <div class="home-hero-spacer" />

    <!-- ============ БЕЛЫЙ ЛИСТ КОНТЕНТА ============ -->
    <div class="home-content">
      <!-- Десктопная «таблетка» перехода к покупкам -->
      <div class="hidden lg:block home-shop-tab-wrap">
        <button type="button" class="home-shop-tab" @click="scrollToShop">
          Перейти к покупкам
          <Icon name="lucide:chevron-down" class="size-4" />
        </button>
      </div>

      <!-- Мобильная липкая строка поиска -->
      <div class="lg:hidden">
        <HomeStickySearchRow />
      </div>

      <!-- Статус активного заказа -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <ClientOnly>
          <div v-if="isLoggedIn">
            <div
              v-if="isAdmin"
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

      <!-- Быстрые чипы -->
      <section ref="shopSectionRef" :class="alwaysContainedClass" class="pt-2 pb-1 scroll-mt-20">
        <div class="rail-bleed">
          <HomeCategoryChips :items="chipItems" />
        </div>
      </section>

      <!-- Подобрали для вас.
           Карусели сами задают себе ширину (заголовок — контейнер 'always',
           лента — контейнер 'desktop' + отступ внутри ленты), поэтому внешнего
           контейнера здесь быть НЕ должно: он давал двойной padding.
           ProductCarouselSectionSkeleton повторяет их отступы 1-в-1. -->
      <ClientOnly>
        <!-- Скелетон снимается не по таймеру, а по факту монтирования карусели.
             Раньше его убирал `!shouldRenderLowerBlocks` — а это setTimeout на
             1000 мс, не состояние загрузки. Компоненты ниже ленивые, и в момент
             снятия скелетона их чанк ещё грузился: блок схлопывался и через
             ~800 мс разворачивался обратно. Замер на превью (390px, Slow 4G,
             CPU ×4) показывал ровно это: заголовок «Популярные категории»
             уезжал с y=1213 на 707 и возвращался на 1225. Два сдвига по ~0.12
             и составляли почти весь CLS главной — 0.244 при пороге 0.1. -->
        <ProductCarouselSectionSkeleton v-if="showMainCarouselSkeleton" />

        <template v-if="shouldRenderLowerBlocks && !isLoadingMainBlock">
          <LazyProductsCarousel
            v-if="showWishlistCarousel"
            :is-loading="isFetchingRecommendations"
            :products="wishlistProducts"
            title="Ваше избранное"
            see-all-link="/profile/wishlist"
            @vue:mounted="onMainCarouselMounted"
          />
          <LazyProductsCarousel
            v-if="showRecommendedCarousel"
            :is-loading="isFetchingRecommendations"
            :products="recommendedProducts"
            title="Подобрали для вас"
            see-all-link="/catalog/all?recommended=true"
            @vue:mounted="onMainCarouselMounted"
          />
          <LazyProductsCarousel
            v-else-if="showPopularFallbackCarousel"
            :is-loading="isFetchingPopular"
            :products="popularProducts"
            title="Подобрали для вас"
            see-all-link="/catalog/all?sort_by=popularity"
            @vue:mounted="onMainCarouselMounted"
          />
        </template>
        <template #fallback>
          <ProductCarouselSectionSkeleton />
        </template>
      </ClientOnly>

      <!-- Популярные категории.
           Без гейта: данные (menuTree) уже приезжают в SSR-payload, а выбор
           раскладки переехал с useIsMobile на медиазапрос — рисовать можно
           прямо на сервере. LQIP-подложки плиток по-прежнему догружаются
           на клиенте, они необязательные. -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <HomePopularCategories />
      </div>

      <!-- Популярные бренды -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <ClientOnly>
          <HomeBrandsRail v-if="shouldRenderSecondaryBlocks" />
        </ClientOnly>
      </div>

      <!-- Акции и бонусы -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'md' })]">
        <div class="flex items-baseline justify-between gap-3 mb-5">
          <h2 class="m-0 font-bold tracking-tight text-[clamp(22px,3vw,32px)]">
            Акции и бонусы
          </h2>
          <span class="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Icon name="lucide:sparkles" class="size-4 text-[color:var(--color-orange-600)]" />
            Выгода каждый день
          </span>
        </div>
        <ClientOnly>
          <template v-if="shouldRenderLowerBlocks">
            <HomeLoyaltyBanner class="mb-4" />
            <div class="home-promo-grid">
              <HomeDealOfTheDayCard />
              <HomePromoBenefitTiles />
            </div>
          </template>
          <template #fallback>
            <Skeleton class="h-64 w-full rounded-3xl" />
          </template>
        </ClientOnly>
      </div>

      <!-- Хиты продаж.
           Ни ClientOnly, ни таймера: первая страница товаров приезжает из SSR
           (почему — в комментарии внутри BestsellersGrid.vue). Прятать нечего,
           а скелетон здесь только удлинял путь до контента. -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <HomeBestsellersGrid />
      </div>

      <!-- SEO-блок (сохранён).
           Нижнего отступа здесь быть НЕ должно: блок последний в `.home-content`,
           и его padding-bottom давал белую полосу между листом и футером.
           Поэтому вместо sectionSpacingVariants({ size: 'lg' }) — только верхний
           отступ, теми же значениями (py-12 md:py-16 → pt-12 md:pt-16). -->
      <div :class="alwaysContainedClass" class="border-t pt-12 md:pt-16">
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
    </div>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  /* Мобильная распорка = высота фиксированного героя; на десктопе героя нет
     поверх, лист наезжает отрицательным margin'ом (см. .home-content). */
  .home-hero-spacer {
    height: min(62vh, 540px);
    background: #dfe7ee;
  }

  .home-content {
    position: relative;
    z-index: 6;
    margin-top: -18px;
    background: #fff;
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -12px 28px rgb(15 23 42 / 0.18);
    min-height: 70vh;
  }

  .home-shop-tab-wrap {
    position: relative;
    height: 0;
  }

  .home-shop-tab {
    position: absolute;
    top: -19px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 7;
    height: 38px;
    padding: 0 22px;
    border-radius: 999px;
    background: #fff;
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .home-promo-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  /* Edge-bleed рельсов на мобильном (как .rail-bleed в прототипе).
     Отступ обязан браться из --page-gutter — иначе рельс вылезает за контейнер
     и даёт горизонтальный скролл всей страницы. */
  .rail-bleed {
    margin-inline: 0;
  }

  @media (max-width: 767px) {
    .rail-bleed {
      margin-inline: calc(-1 * var(--page-gutter));
      padding-inline: var(--page-gutter);
    }
  }

  @media (min-width: 1024px) {
    .home-hero-spacer {
      display: none;
    }

    .home-content {
      margin-top: clamp(-60px, -4vw, -36px);
      border-radius: 28px 28px 0 0;
      box-shadow: 0 -10px 30px rgb(0 0 0 / 0.07);
      min-height: 0;
    }

    .home-promo-grid {
      grid-template-columns: 1.5fr 1fr;
      gap: 20px;
      align-items: stretch;
    }
  }
}
</style>

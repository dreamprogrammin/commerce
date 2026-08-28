<script setup lang="ts">
import type {
  ProductWithGallery,
  RecommendedProduct,
} from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { homeReserveInlineScript, useHomeReserve } from '@/composables/home/useHomeReserve'
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

/*
 * Лента для гостя — НОВИНКИ, и берётся она на сервере.
 *
 * Было: fallback ленты показывал популярные товары тем же самым запросом
 * (categorySlug 'all', sortBy 'popularity'), что и «Хиты продаж» ниже по
 * странице. Хиты — первые 8 той же выдачи, то есть строгое подмножество
 * ленты. Проверено на uhti.kz 24 августа: 8 совпадений из 8. Гость
 * пролистывал десять игрушек в ленте и ниже видел восемь тех же самых.
 *
 * Теперь секции разведены по смыслу: вверху «что нового», ниже «что берут».
 * Побочно это и разблокировало SSR ленты: дублировать в разметке 70 КБ
 * почти одинаковых карточек смысла не было.
 */
const GUEST_FEED_SIZE = 10

const { data: guestFeedProducts } = await useAsyncData(
  'home-guest-feed',
  async () => {
    const { products } = await productsStore.fetchProducts(
      { categorySlug: 'all', sortBy: 'newest' },
      1,
      GUEST_FEED_SIZE,
    )
    return products
  },
  { default: () => [] as ProductWithGallery[] },
)

/*
 * Персональные рекомендации подменяют серверную ленту только ПОСЛЕ
 * монтирования.
 *
 * Без этого флага клиент на гидрации мог бы нарисовать не то, что уехало с
 * сервера: ответ рекомендаций иногда успевает попасть в дегидрированный
 * payload TanStack Query до его сериализации — та же гонка, что описана выше
 * про слайды.
 */
const hasMounted = ref(false)
onMounted(() => {
  hasMounted.value = true
})

const reserve = useHomeReserve()

const isLoadingMainBlock = computed(() => showRecommendationsSkeleton.value)

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

/*
 * Резерв места под «Ваше избранное».
 *
 * Секция целиком клиентская и приезжает поздно: на стенде (390px, Slow 4G,
 * CPU ×4) она вставлялась на 11095 мс и уводила «Подобрали для вас» с y=839 на
 * 1357, а «Популярные категории» — с 1337 на 1855; страница росла с 7392 до
 * 7910px. В CLS этого не видно вовсе — вставка происходит ниже экрана, а сдвиги
 * за пределами вьюпорта в метрику не попадают. Видно только глазами при скролле,
 * ровно как и описал владелец.
 *
 * Резерв ставится по прошлому визиту, а пока данные едут, место занимает
 * ProductCarouselSectionSkeleton — он специально подогнан под готовую секцию по
 * отступам и геометрии ленты.
 */
const wishlistEl = ref<HTMLElement | null>(null)
const hasWishlistHint = ref(false)

/** Заглушка держит зарезервированное место, пока избранное едет. */
const showWishlistSkeleton = computed(
  () => hasWishlistHint.value && !showWishlistCarousel.value,
)

onMounted(() => {
  hasWishlistHint.value = reserve.has('wishlist')
})

/*
 * Высота снимается наблюдателем, а не разово на nextTick: карусель ленивая, и в
 * момент, когда showWishlistCarousel становится true, её чанк ещё грузится —
 * offsetHeight равен нулю, и подсказка молча не записывалась (поймано замером).
 * Наблюдатель висит на внутренней обёртке, а не на слоте: у слота есть
 * min-height, и измерять его значило бы каждый раз переписывать подсказку самой
 * же подсказкой.
 */
let wishlistSizeObserver: ResizeObserver | null = null

watch(showWishlistCarousel, (visible) => {
  wishlistSizeObserver?.disconnect()
  wishlistSizeObserver = null

  if (!visible || !wishlistEl.value)
    return

  wishlistSizeObserver = new ResizeObserver(() => {
    const px = wishlistEl.value?.offsetHeight ?? 0
    if (px > 0) {
      reserve.save('wishlist', px)
      hasWishlistHint.value = true
    }
  })
  wishlistSizeObserver.observe(wishlistEl.value)
})

onBeforeUnmount(() => wishlistSizeObserver?.disconnect())

// Избранное опустело — резерв надо снять, иначе на главной останется пустая
// полоса, и не только в этот визит, но и в следующие. Момент ловится по приходу
// данных, а не по showWishlistCarousel: тот и так всё время false, watch по нему
// в этом случае не сработает ни разу.
watch(mainPersonalData, (data) => {
  if (!data || data.wishlist.length > 0)
    return
  reserve.drop('wishlist')
  hasWishlistHint.value = false
})

const showRecommendedCarousel = computed(
  () => hasMounted.value && recommendedProducts.value.length > 0,
)

/*
 * Резерв места под баннер лояльности.
 *
 * Баннер показывается всем — и гостю, и залогиненному, — поэтому снимать этот
 * резерв не нужно никогда: случая «секции не оказалось» тут просто нет. Но
 * высота зависит и от ширины экрана, и от состояния входа, так что её
 * приходится мерить, а не зашивать.
 */
const loyaltyEl = ref<HTMLElement | null>(null)
let loyaltySizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!loyaltyEl.value)
    return
  loyaltySizeObserver = new ResizeObserver(() => {
    const px = loyaltyEl.value?.offsetHeight ?? 0
    if (px > 0)
      reserve.save('loyalty', px)
  })
  loyaltySizeObserver.observe(loyaltyEl.value)
})

onBeforeUnmount(() => loyaltySizeObserver?.disconnect())

/*
 * Уборка резерва места под персональные секции.
 *
 * Подсказки о высоте ставит инлайн-скрипт в <head> (см. useHead ниже), а снимают
 * их обычно те, кто их и записал: HomeActiveOrderStatus — когда активного заказа
 * не нашлось, страница — когда избранное оказалось пустым. Но у гостя и у админа
 * персональных секций нет вовсе (у первого нет isLoggedIn, у второго на месте
 * карточки заказа плашка админки), и снять подсказки там некому. Без этой уборки
 * после логаута на главной остались бы две пустые полосы.
 */
watch([isLoggedIn, isAdmin], ([loggedIn, admin]) => {
  // Только на клиенте: на сервере ни localStorage, ни document нет, а с
  // immediate этот обработчик отрабатывает уже в setup.
  if (import.meta.server || (loggedIn && !admin))
    return
  reserve.dropPersonal()
  hasWishlistHint.value = false
}, { immediate: true })

/*
 * Персональная лента подменяет серверную только пока пользователь до неё не
 * долистал.
 *
 * Обе секции называются «Подобрали для вас» и стоят на одном месте: у гостя там
 * новинки из SSR, у залогиненного — рекомендации, которые приезжают отдельным
 * запросом уже после гидрации. На медленной связи это секунды, и подмена
 * заставала владельца прямо на этой секции: десять карточек менялись разом под
 * рукой. Высоту секция при этом не меняет, то есть в CLS это не видно вовсе —
 * только глазами.
 *
 * Решение — не трогать ровно то, на что человек смотрит прямо сейчас: подмена
 * запрещается, только если он уже листал страницу И лента в этот момент на
 * экране. Пока он не тронул страницу (обычный случай: рекомендации приезжают
 * раньше первого скролла) или лента ещё ниже экрана / уже выше него — меняем
 * как раньше. Правило намеренно узкое: рекомендации это деньги, и отменять их
 * показ шире, чем нужно, нельзя.
 */
const feedSectionRef = ref<HTMLElement | null>(null)
const isFeedSwapAllowed = ref(true)

watch(showRecommendedCarousel, (canSwap) => {
  if (!canSwap || !feedSectionRef.value)
    return

  // flush 'sync': решение принимается по разметке ДО подмены, то есть по
  // положению серверной ленты, которую человек и видит.
  const { top, bottom } = feedSectionRef.value.getBoundingClientRect()
  const onScreen = bottom > 0 && top < window.innerHeight
  isFeedSwapAllowed.value = window.scrollY === 0 || !onScreen
}, { flush: 'sync' })

const showRecommendedFeed = computed(
  () => showRecommendedCarousel.value && isFeedSwapAllowed.value,
)

/** Серверная лента новинок. Уступает место персональным рекомендациям. */
const showGuestFeedCarousel = computed(
  () => !showRecommendedFeed.value && guestFeedProducts.value.length > 0,
)

/** Есть ли вообще что показывать в главной ленте. */
const hasMainCarousel = computed(
  () =>
    showWishlistCarousel.value
    || showRecommendedFeed.value
    || showGuestFeedCarousel.value,
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

/*
 * --- Progressive Loading ---
 *
 * Убран целиком.
 *
 * Было два флага-таймера. `shouldRenderSecondaryBlocks` (по
 * requestIdleCallback) ушёл вместе с переездом «Популярных категорий» и
 * «Популярных брендов» в SSR. Теперь уходит и `shouldRenderLowerBlocks` —
 * `setTimeout(…, 1000)`, за которым стояли «Акции и бонусы» и главная лента.
 *
 * Это был таймер, а не состояние загрузки, и держал он не только отрисовку:
 * DealOfTheDayCard, PromoBenefitTiles и LoyaltyBanner грузят данные из
 * onMounted, то есть их запросы не могли уйти раньше, чем через секунду после
 * гидрации. Замер прода 24 августа (390px, CPU ×4, Slow 4G): вторая волна
 * запросов уходила на 5618–5768 мс, ровно на секунду позже первой.
 *
 * Высоту ленты по-прежнему держит скелетон ниже — он снимается по факту
 * монтирования карусели, а не по таймеру.
 */

/**
 * Скелетон главной ленты. Снимается ровно в двух случаях:
 *  • карусель смонтировалась — место занято настоящей разметкой;
 *  • данные догрузились и показывать нечего — тогда блока и не должно быть.
 * Во всех остальных состояниях он держит высоту, чтобы не двигать соседей.
 *
 * Третьим условием тут был `!shouldRenderLowerBlocks` — «первую секунду
 * показывать скелетон всегда». Флаг убран, а с ним и это условие: оно ничего
 * не добавляло к двум случаям выше, только удлиняло путь до контента.
 */
const showMainCarouselSkeleton = computed(
  () =>
    !showGuestFeedCarousel.value
    && !isMainCarouselMounted.value
    && (isLoadingMainBlock.value || hasMainCarousel.value),
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
    /*
     * Резерв места под персональные секции — ДО гидрации.
     * Зачем именно так и какие были замеры — в useHomeReserve.
     */
    {
      innerHTML: homeReserveInlineScript(),
    },
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

      <!-- Статус активного заказа.
           active-order-slot держит высоту прошлой карточки (переменную ставит
           инлайн-скрипт в useHead выше), чтобы блок не вырастал из нуля после
           гидрации. -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <div class="active-order-slot">
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
      <!-- Серверная лента новинок. Вне ClientOnly: она есть в разметке сразу,
           без ожидания гидрации и запроса. Уступает место персональным
           рекомендациям, когда те приезжают (только после монтирования). -->
      <div ref="feedSectionRef">
        <HomeProductsCarousel
          v-if="showGuestFeedCarousel"
          :products="guestFeedProducts"
          :is-loading="false"
          title="Подобрали для вас"
          see-all-link="/catalog/all?sort_by=newest"
        />

        <ClientOnly>
          <!-- Скелетон снимается не по таймеру, а по факту монтирования карусели.
             Когда-то его убирал флаг `shouldRenderLowerBlocks` (уже удалён)
             — а это был setTimeout на 1000 мс, не состояние загрузки. Компоненты ниже ленивые, и в момент
             снятия скелетона их чанк ещё грузился: блок схлопывался и через
             ~800 мс разворачивался обратно. Замер на превью (390px, Slow 4G,
             CPU ×4) показывал ровно это: заголовок «Популярные категории»
             уезжал с y=1213 на 707 и возвращался на 1225. Два сдвига по ~0.12
             и составляли почти весь CLS главной — 0.244 при пороге 0.1. -->
          <ProductCarouselSectionSkeleton v-if="showMainCarouselSkeleton" />

          <template v-if="!isLoadingMainBlock">
            <LazyProductsCarousel
              v-if="showRecommendedFeed"
              :is-loading="isFetchingRecommendations"
              :products="recommendedProducts"
              title="Подобрали для вас"
              see-all-link="/catalog/all?recommended=true"
              @vue:mounted="onMainCarouselMounted"
            />
          </template>
          <template #fallback>
            <!-- Скелетон нужен только если серверной ленты нет: иначе он встанет
                 прямо под ней вторым блоком. -->
            <ProductCarouselSectionSkeleton v-if="!showGuestFeedCarousel" />
          </template>
        </ClientOnly>
      </div>

      <!-- Популярные категории.
           Без гейта: данные (menuTree) уже приезжают в SSR-payload, а выбор
           раскладки переехал с useIsMobile на медиазапрос — рисовать можно
           прямо на сервере. LQIP-подложки плиток по-прежнему догружаются
           на клиенте, они необязательные. -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <HomePopularCategories />
      </div>

      <!-- Популярные бренды: данные берутся на сервере, гейт не нужен -->
      <div :class="[alwaysContainedClass, sectionSpacingVariants({ size: 'xs' })]">
        <HomeBrandsRail />
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
        <!-- Баннер лояльности — единственное персональное в блоке (кнопка входа и
             число бонусов), поэтому он остаётся клиентским. Слот держит его высоту
             по подсказке прошлого визита: у гостя баннер 644px, у залогиненного 586
             (на 390px кнопки у гостя переносятся на вторую строку), так что одной
             цифрой это не зашить — только замером.

             Раньше здесь на весь блок стоял `Skeleton h-64`, то есть 256px там, где
             содержимое занимает 922. Блок рос с 373 до 1039, а затем до 1285px и
             двигал вниз всё, что ниже, — включая «Ваше избранное» и «Хиты продаж».
             Замер на стенде 390px / Slow 4G / CPU ×4. -->
        <div class="loyalty-slot mb-4">
          <div ref="loyaltyEl">
            <ClientOnly>
              <HomeLoyaltyBanner />
            </ClientOnly>
          </div>
        </div>

        <!-- Карточка дня и плитки: данные публичные, персонального в них нет —
             рисуются на сервере и в разметке есть сразу. -->
        <div class="home-promo-grid">
          <HomeDealOfTheDayCard />
          <HomePromoBenefitTiles />
        </div>
      </div>

      <!-- Ваше избранное.
           Место выбрано владельцем: секция стоит перед «Хитами продаж». Заодно
           это лучшее место и по механике — секция целиком клиентская и приезжает
           поздно (на стенде около 9-й секунды), а её точка вставки лежит глубоко
           за первым экраном. Пока подсказки о высоте нет (самый первый визит),
           сдвиг происходит там, где его никто не видит. Когда секция стояла над
           лентой, он приходился ровно на нижнюю кромку экрана и стоил 0.041 CLS.

           Слот свой: он есть в SSR-разметке всегда и держит высоту по подсказке
           прошлого визита (переменную ставит инлайн-скрипт в useHead), иначе при
           скролле секция выталкивала бы вниз всё, что под ней, на 518px. -->
      <div class="wishlist-slot">
        <div ref="wishlistEl">
          <ClientOnly>
            <LazyProductsCarousel
              v-if="showWishlistCarousel"
              :is-loading="isFetchingRecommendations"
              :products="wishlistProducts"
              title="Ваше избранное"
              see-all-link="/profile/wishlist"
              @vue:mounted="onMainCarouselMounted"
            />
            <ProductCarouselSectionSkeleton
              v-else-if="showWishlistSkeleton"
              title="Ваше избранное"
            />
          </ClientOnly>
        </div>
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
@layer components {
  /* Резерв места под карточку активного заказа. Значение ставит инлайн-скрипт
     из useHead по подсказке прошлого визита; по умолчанию 0 — у гостя и у того,
     у кого активного заказа нет, никакой полосы не появляется. */
  .active-order-slot {
    min-height: var(--active-order-reserve, 0px);
  }

  /* То же самое для секции «Ваше избранное». */
  .wishlist-slot {
    min-height: var(--wishlist-reserve, 0px);
  }

  /* И для баннера лояльности внутри «Акций и бонусов». */
  .loyalty-slot {
    min-height: var(--loyalty-reserve, 0px);
  }
}

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

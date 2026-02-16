<script setup lang="ts">
import type { IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { ArrowLeft, ChevronDown, Package, TrendingUp } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import BrandDescription from '@/components/brand/BrandDescription.vue'

const route = useRoute()
const supabase = useSupabaseClient()
const productsStore = useProductsStore()
const { getImageUrl } = useSupabaseStorage()
const brandSlug = route.params.slug as string
const containerClass = carouselContainerVariants({ contained: 'always' })

// -- Локальное состояние страницы --
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true)
const sortBy = ref<'newest' | 'price_asc' | 'price_desc' | 'popularity'>('newest')
const isSeoExpanded = ref(false)
const seoContentRef = ref<HTMLElement | null>(null)
const seoContentHeight = ref(0)

function toggleSeoExpanded() {
  if (!isSeoExpanded.value && seoContentRef.value) {
    seoContentHeight.value = seoContentRef.value.scrollHeight
  }
  isSeoExpanded.value = !isSeoExpanded.value
}

// 1. Умная загрузка информации о бренде
const { data: brand, pending: brandPending } = await useAsyncData(
  `brand-${brandSlug}`,
  async () => {
    // Сначала ищем бренд в сторе
    let foundBrand = productsStore.brands.find(b => b.slug === brandSlug)

    // Если в сторе нет, делаем запрос к API
    if (!foundBrand) {
      // Убедимся, что список брендов загружен, если он пуст
      if (productsStore.brands.length === 0) {
        await productsStore.fetchAllBrands()
        // Повторяем поиск после загрузки
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

// Загружаем линейки бренда для Schema
const brandProductLines = ref<ProductLine[]>([])

async function loadProductLines() {
  if (!brand.value) {
    return
  }

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

// Загружаем товары и линейки при монтировании и при изменении сортировки
watchEffect(() => {
  if (brand.value) {
    loadProducts()
    loadProductLines()
  }
})

// 3. Собираем "хлебные крошки" (Breadcrumbs)
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brand/all' },
  ]
  if (brand.value) {
    crumbs.push({ id: brand.value.id, name: brand.value.name, href: `/brand/${brand.value.slug}` })
  }
  return crumbs
})

// Оптимизированный URL логотипа бренда (для SEO meta tags)
const brandLogoUrl = computed(() => {
  if (!brand.value?.logo_url)
    return null

  return getImageUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, IMAGE_SIZES.BRAND_LOGO)
})

// ========================================
// SEO META TAGS + STRUCTURED DATA
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const brandUrl = computed(() => `${siteUrl}/brand/${brandSlug}`)

// Meta Title: приоритет meta_title > seo_title > автогенерация
const metaTitle = computed(() => {
  if (!brand.value)
    return 'Бренд не найден'

  // Приоритет: meta_title > seo_title > автогенерация
  if (brand.value.meta_title) {
    return brand.value.meta_title
  }
  if (brand.value.seo_title) {
    return brand.value.seo_title
  }

  return `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}`
})

// SEO описание: приоритет meta_description > seo_description > description > fallback
const metaDescription = computed(() => {
  if (!brand.value)
    return `Товары бренда в ${siteName}`

  // Приоритет: meta_description > seo_description > description > автогенерация
  if (brand.value.meta_description) {
    return brand.value.meta_description
  }

  if (brand.value.seo_description) {
    return brand.value.seo_description
  }

  // Используем description если есть
  if (brand.value.description) {
    return `${brand.value.description.substring(0, 140)}. Доставка по Казахстану.`
  }

  // Fallback
  return `Каталог товаров бренда ${brand.value.name} в интернет-магазине ${siteName}. Оригинальная продукция с гарантией качества. Доставка по Казахстану.`
})

// Ключевые слова: приоритет meta_keywords > seo_keywords
const metaKeywords = computed(() => {
  // Приоритет meta_keywords
  if (brand.value?.meta_keywords?.length) {
    return brand.value.meta_keywords.join(', ')
  }
  // Fallback на seo_keywords
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
            // Ключевые слова
            ...(brand.value.seo_keywords?.length && {
              keywords: brand.value.seo_keywords.join(', '),
            }),
            // Линейки как суб-бренды
            ...(brandProductLines.value.length > 0 && {
              subOrganization: brandProductLines.value.map(line => ({
                '@type': 'Brand',
                '@id': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}#brand`,
                'name': line.name,
                'url': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}`,
                ...(line.logo_url && {
                  logo: getImageUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, IMAGE_SIZES.PRODUCT_LINE_LOGO),
                }),
                ...(line.description && { description: line.description }),
              })),
            }),
          })
        : '{}',
    },
    // CollectionPage Schema
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
          })
        : '{}',
    },
    // ItemList Schema (товары бренда)
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
        <!-- Breadcrumbs skeleton -->
        <div class="flex gap-2">
          <Skeleton class="h-4 md:h-5 w-20 md:w-24" />
          <Skeleton class="h-4 md:h-5 w-3 md:w-4" />
          <Skeleton class="h-4 md:h-5 w-24 md:w-32" />
        </div>

        <!-- Hero skeleton -->
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

    <!-- Контент бренда -->
    <div v-else :class="`${containerClass} py-4 md:py-8 space-y-4 md:space-y-8`">
      <!-- Breadcrumbs -->
      <Breadcrumbs :items="breadcrumbs" />

      <!-- Hero section с градиентом -->
      <div class="relative overflow-hidden bg-linear-to-br from-primary/5 via-purple-50 to-pink-50 rounded-2xl md:rounded-3xl p-4 md:p-12 border border-primary/10">
        <!-- Декоративные элементы (скрыты на мобилке для производительности) -->
        <div class="hidden md:block absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl z-0" />
        <div class="hidden md:block absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl z-0" />

        <div class="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-8">
          <!-- Логотип бренда -->
          <div
            class="shrink-0 w-20 h-20 md:w-40 md:h-40 bg-white rounded-xl md:rounded-2xl shadow-lg overflow-hidden"
          >
            <ProgressiveImage
              v-if="brand.logo_url"
              :src="brandLogoUrl"
              :alt="brand.name"
              :bucket-name="BUCKET_NAME_BRANDS"
              :file-path="brand.logo_url"
              aspect-ratio="square"
              object-fit="contain"
              placeholder-type="shimmer"
              eager
            />
            <!-- Плейсхолдер если нет логотипа -->
            <div v-else class="w-full h-full flex items-center justify-center">
              <span class="text-2xl md:text-4xl font-bold text-primary/60">
                {{ brand.name.charAt(0).toUpperCase() }}
              </span>
            </div>
          </div>

          <!-- Информация о бренде -->
          <div class="flex-1 text-center md:text-left">
            <h1 class="text-2xl md:text-5xl font-bold mb-3 md:mb-6 bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              {{ brand.name }}
            </h1>

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
          Каталог товаров
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
              <Package class="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
            </div>
            <h3 class="text-lg md:text-xl font-semibold mb-2">
              Товаров пока нет
            </h3>
            <p class="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 max-w-sm">
              К сожалению, товары бренда {{ brand.name }} временно отсутствуют в продаже.
            </p>
            <NuxtLink to="/catalog/all">
              <Button variant="outline">
                <ArrowLeft class="w-4 h-4 mr-2" />
                Вернуться в каталог
              </Button>
            </NuxtLink>
          </CardContent>
        </Card>
      </main>

      <!-- Описание бренда (внизу страницы, разворачивается) -->
      <div v-if="brand.description" class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
        <div class="space-y-3 md:space-y-4">
          <!-- Заголовок с кнопкой разворачивания -->
          <button
            class="flex items-center gap-2 text-left w-full group"
            @click="toggleSeoExpanded"
          >
            <h3 class="text-base md:text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
              О бренде {{ brand.name }}
            </h3>
            <ChevronDown
              class="w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300"
              :class="{ 'rotate-180': isSeoExpanded }"
            />
          </button>

          <!-- Контент (сворачивается/разворачивается) -->
          <div
            ref="seoContentRef"
            class="overflow-hidden transition-all duration-300 ease-in-out"
            :style="{ maxHeight: isSeoExpanded ? `${seoContentHeight}px` : undefined }"
            :class="isSeoExpanded ? 'opacity-100' : 'max-h-20 md:max-h-24 opacity-70'"
          >
            <BrandDescription :brand="brand" />

            <!-- Ключевые слова как теги -->
            <div v-if="brand.seo_keywords?.length" class="flex flex-wrap gap-1.5 md:gap-2 mt-3 md:mt-4">
              <Badge
                v-for="keyword in brand.seo_keywords"
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
            v-if="brand.description && brand.description.length > 150"
            class="text-xs md:text-sm text-primary hover:underline"
            @click="toggleSeoExpanded"
          >
            {{ isSeoExpanded ? 'Свернуть' : 'Читать далее' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

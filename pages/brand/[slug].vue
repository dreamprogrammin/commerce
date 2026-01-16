<script setup lang="ts">
import type { IBreadcrumbItem, ProductWithGallery } from '@/types'
import { ArrowLeft, Package, TrendingUp } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const { getOptimizedUrl } = useSupabaseStorage()
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

// Загружаем товары при монтировании и при изменении сортировки
watchEffect(() => {
  if (brand.value) {
    loadProducts()
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

// Оптимизированный URL логотипа бренда
const brandLogoUrl = computed(() => {
  if (!brand.value?.logo_url)
    return null

  return getOptimizedUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, {
    width: 300,
    height: 150,
    quality: 90,
    format: 'webp',
    resize: 'contain',
  })
})

// Опции сортировки
const sortOptions = [
  { value: 'newest', label: 'Новинки' },
  { value: 'popularity', label: 'Популярные' },
  { value: 'price_asc', label: 'Цена: по возрастанию' },
  { value: 'price_desc', label: 'Цена: по убыванию' },
]

// ========================================
// SEO META TAGS + STRUCTURED DATA
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const brandUrl = computed(() => `${siteUrl}/brand/${brandSlug}`)
const metaTitle = computed(() => brand.value ? `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}` : 'Бренд не найден')

// SEO описание: приоритет у seo_description, потом description, потом fallback
const metaDescription = computed(() => {
  if (!brand.value)
    return `Товары бренда в ${siteName}`

  // Используем seo_description если заполнено
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

// Ключевые слова: приоритет у seo_keywords
const metaKeywords = computed(() => {
  if (brand.value?.seo_keywords?.length) {
    return brand.value.seo_keywords.join(', ')
  }
  return `${brand.value?.name || 'бренд'}, товары бренда, оригинальная продукция, Алматы, Казахстан`
})

useHead({
  title: metaTitle,
  link: [
    { rel: 'canonical', href: brandUrl.value },
  ],
  meta: [
    { name: 'description', content: metaDescription },
    { name: 'keywords', content: metaKeywords },

    // Open Graph
    { property: 'og:title', content: metaTitle },
    { property: 'og:description', content: metaDescription },
    { property: 'og:url', content: brandUrl.value },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: siteName },
    { property: 'og:locale', content: 'ru_RU' },
    { property: 'og:image', content: () => brandLogoUrl.value || `${siteUrl}/og-brand.jpeg` },

    // Twitter Card
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: metaTitle },
    { name: 'twitter:description', content: metaDescription },
    { name: 'twitter:image', content: () => brandLogoUrl.value || `${siteUrl}/og-brand.jpeg` },

    // Robots
    { name: 'robots', content: 'index, follow' },
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
    // Brand Schema
    {
      type: 'application/ld+json',
      innerHTML: () => brand.value
        ? JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Brand',
            'name': brand.value.name,
            'description': brand.value.seo_description || brand.value.description || undefined,
            'url': brandUrl.value,
            ...(brandLogoUrl.value && {
              logo: brandLogoUrl.value,
              image: brandLogoUrl.value,
            }),
            // Ключевые слова
            ...(brand.value.seo_keywords?.length && {
              keywords: brand.value.seo_keywords.join(', '),
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
    <div v-if="brandPending" :class="`${containerClass} py-8`">
      <div class="space-y-6">
        <!-- Breadcrumbs skeleton -->
        <div class="flex gap-2">
          <Skeleton class="h-5 w-24" />
          <Skeleton class="h-5 w-4" />
          <Skeleton class="h-5 w-32" />
        </div>

        <!-- Hero skeleton -->
        <div class="bg-gradient-to-br from-primary/5 via-purple-50 to-pink-50 rounded-3xl p-8 md:p-12">
          <div class="flex flex-col md:flex-row items-center gap-8">
            <Skeleton class="w-32 h-32 rounded-2xl" />
            <div class="flex-1 space-y-4 text-center md:text-left">
              <Skeleton class="h-10 w-48 mx-auto md:mx-0" />
              <Skeleton class="h-4 w-full max-w-2xl mx-auto md:mx-0" />
              <div class="flex gap-4 justify-center md:justify-start">
                <Skeleton class="h-16 w-24" />
                <Skeleton class="h-16 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Бренд не найден -->
    <div v-else-if="!brand" :class="`${containerClass} py-20`">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mb-6">
          <Package class="w-10 h-10 text-destructive" />
        </div>
        <h1 class="text-3xl md:text-4xl font-bold mb-3">
          Бренд не найден
        </h1>
        <p class="text-muted-foreground mb-8 max-w-md mx-auto">
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
    <div v-else :class="`${containerClass} py-8 space-y-8`">
      <!-- Breadcrumbs -->
      <Breadcrumbs :items="breadcrumbs" />

      <!-- Hero section с градиентом -->
      <div class="relative overflow-hidden bg-gradient-to-br from-primary/5 via-purple-50 to-pink-50 rounded-3xl p-8 md:p-12 border border-primary/10">
        <!-- Декоративные элементы -->
        <div class="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-0" />
        <div class="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-0" />

        <div class="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <!-- Логотип бренда -->
          <div
            v-if="brandLogoUrl"
            class="flex-shrink-0 w-32 h-32 md:w-40 md:h-40 bg-white rounded-2xl shadow-lg p-6 flex items-center justify-center"
          >
            <img
              :src="brandLogoUrl"
              :alt="brand.name"
              class="w-full h-full object-contain"
              loading="eager"
            >
          </div>

          <!-- Информация о бренде -->
          <div class="flex-1 text-center md:text-left">
            <h1 class="text-3xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              {{ brand.name }}
            </h1>
            <p v-if="brand.description" class="text-lg text-muted-foreground mb-6 max-w-2xl">
              {{ brand.description }}
            </p>

            <!-- Статистика -->
            <div class="flex flex-wrap gap-4 justify-center md:justify-start">
              <div class="bg-white/80 backdrop-blur rounded-xl px-6 py-4 shadow-sm border border-primary/10">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package class="w-5 h-5 text-primary" />
                  </div>
                  <div class="text-left">
                    <div class="text-2xl font-bold text-gray-900">
                      {{ products.length }}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {{ products.length === 1 ? 'Товар' : products.length < 5 ? 'Товара' : 'Товаров' }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-white/80 backdrop-blur rounded-xl px-6 py-4 shadow-sm border border-primary/10">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <TrendingUp class="w-5 h-5 text-green-600" />
                  </div>
                  <div class="text-left">
                    <div class="text-sm font-semibold text-gray-900">
                      Оригинал
                    </div>
                    <div class="text-xs text-muted-foreground">
                      Гарантия качества
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Фильтры и сортировка -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 class="text-2xl md:text-3xl font-bold">
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
          <CardContent class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Package class="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 class="text-xl font-semibold mb-2">
              Товаров пока нет
            </h3>
            <p class="text-muted-foreground mb-6 max-w-sm">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IBreadcrumbItem, ProductWithGallery } from '@/types'
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
watchEffect(async () => {
  if (brand.value) {
    isLoading.value = true
    products.value = []

    const result = await productsStore.fetchProducts({
      categorySlug: 'all',
      brandIds: [brand.value.id],
    })

    products.value = result.products
    isLoading.value = false
  }
})

// 3. Собираем "хлебные крошки" (Breadcrumbs)
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brands' },
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

// ========================================
// SEO META TAGS + STRUCTURED DATA
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const brandUrl = computed(() => `${siteUrl}/brand/${brandSlug}`)
const metaTitle = computed(() => brand.value ? `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}` : 'Бренд не найден')
const metaDescription = computed(() => brand.value ? `Каталог товаров бренда ${brand.value.name} в интернет-магазине ${siteName} ⭐ Оригинальная продукция ✓ Гарантия качества ✓ Доставка по Казахстану ✓ Бонусная программа` : `Товары бренда в ${siteName}`)

useHead({
  title: metaTitle,
  link: [
    { rel: 'canonical', href: brandUrl.value },
  ],
  meta: [
    { name: 'description', content: metaDescription },
    { name: 'keywords', content: () => `${brand.value?.name || 'бренд'}, товары бренда, оригинальная продукция, Алматы, Казахстан` },

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
      children: () => JSON.stringify({
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
            'item': `${siteUrl}/brands`,
          },
          ...(brand.value ? [{
            '@type': 'ListItem',
            'position': 3,
            'name': brand.value.name,
            'item': brandUrl.value,
          }] : []),
        ],
      }),
    },
    // Brand Schema
    {
      type: 'application/ld+json',
      children: () => brand.value ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Brand',
        'name': brand.value.name,
        'url': brandUrl.value,
        ...(brandLogoUrl.value && {
          logo: brandLogoUrl.value,
          image: brandLogoUrl.value,
        }),
      }) : '{}',
    },
    // CollectionPage Schema
    {
      type: 'application/ld+json',
      children: () => brand.value ? JSON.stringify({
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
      }) : '{}',
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
  <div :class="`${containerClass} py-8`">
    <!-- Хлебные крошки -->
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />

    <!-- Шапка с информацией о бренде -->
    <div v-if="brandPending" class="text-center py-20">
      Загрузка...
    </div>
    <div v-else-if="brand" class="mb-12 text-center border-b pb-8">
      <img
        v-if="brandLogoUrl"
        :src="brandLogoUrl"
        :alt="brand.name"
        class="h-24 mx-auto mb-4 object-contain"
        loading="eager"
      >
      <h1 class="text-4xl font-bold">
        {{ brand.name }}
      </h1>
      <p v-if="brand.description" class="text-muted-foreground mt-2 max-w-2xl mx-auto">
        {{ brand.description }}
      </p>
    </div>
    <div v-else class="text-center py-20">
      <h1 class="text-4xl font-bold">
        Бренд не найден
      </h1>
      <p class="text-muted-foreground mt-2">
        Возможно, вы перешли по неверной ссылке.
      </p>
    </div>

    <!-- Сетка с товарами -->
    <main v-if="brand">
      <h2 class="text-2xl font-bold mb-6">
        Товары бренда
      </h2>

      <ProductGridSkeleton v-if="isLoading" />
      <ProductGrid v-else-if="products.length > 0" :products="products" />
      <div v-else class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
        <h3 class="text-xl font-semibold">
          Товаров этого бренда пока нет в наличии
        </h3>
      </div>
    </main>
  </div>
</template>

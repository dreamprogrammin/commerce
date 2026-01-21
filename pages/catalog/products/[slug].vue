<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import Breadcrumbs from '@/components/global/Breadcrumbs.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { formatPrice } from '@/utils/formatPrice'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const queryClient = useQueryClient()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl } = useSupabaseStorage()

const slug = computed(() => route.params.slug as string)

// Selected accessories for adding to cart together with main product
const selectedAccessoryIds = ref<string[]>([])

const similarProductsRef = ref<HTMLElement | null>(null)
const showStickyPanel = ref(true)
const isDescriptionExpanded = ref(false)

// 🔥 КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Загружаем категории и продукт на сервере
if (import.meta.server) {
  // Загружаем категории сначала
  if (!categoriesStore.allCategories.length) {
    await categoriesStore.fetchCategoryData()
  }

  // Загружаем продукт и добавляем в QueryClient для гидратации
  const initialProduct = await productsStore.fetchProductBySlug(slug.value)
  if (!initialProduct) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Товар не найден',
      fatal: true,
    })
  }

  // 🔥 Предзаполняем кеш для useQuery
  queryClient.setQueryData(['product', slug.value], initialProduct)
}

// ✅ useQuery будет использовать данные из кеша на сервере
const {
  data: product,
  isLoading: isProductLoading,
  isError: isProductError,
} = useQuery({
  queryKey: ['product', slug],
  queryFn: async () => {
    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)
    if (!fetchedProduct) {
      throw new Error('Товар не найден')
    }
    return fetchedProduct
  },
  // ✅ Stale-While-Revalidate подход с принудительной проверкой при перезагрузке
  staleTime: 2 * 60 * 1000, // 2 минуты - баланс между свежестью и производительностью
  gcTime: 10 * 60 * 1000, // 10 минут в памяти
  retry: 1,
  refetchOnMount: 'always', // ВСЕГДА проверять при перезагрузке (даже если SSR кеш свежий)
  refetchOnWindowFocus: true, // Проверить при возврате на вкладку (если > staleTime)
  // 🔥 На сервере данные уже в кеше, не делаем повторный запрос
  initialData: import.meta.server
    ? queryClient.getQueryData(['product', slug.value])
    : undefined,
})

// ✅ Обработка ошибки 404
watch([isProductError, product], ([error, prod]) => {
  if (error || (!isProductLoading.value && !prod)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Товар не найден',
      fatal: true,
    })
  }
})

// ✅ 3. Аксессуары - загружаются после основного продукта
const { data: accessories, isLoading: accessoriesLoading } = useQuery({
  queryKey: ['product-accessories', computed(() => product.value?.id)],
  queryFn: async () => {
    if (!product.value?.accessory_ids?.length)
      return []
    return await productsStore.fetchProductsByIds(product.value.accessory_ids)
  },
  enabled: computed(() => !!product.value?.accessory_ids?.length),
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
})

// ✅ 4. Похожие товары
const { data: similarProducts, isLoading: similarProductsLoading } = useQuery({
  queryKey: ['similar-products', computed(() => product.value?.category_id)],
  queryFn: async () => {
    if (!product.value?.category_id)
      return []
    return await productsStore.fetchSimilarProducts(
      product.value.category_id,
      [product.value.id, ...(product.value.accessory_ids || [])],
    )
  },
  enabled: computed(() => !!product.value?.category_id),
  staleTime: 15 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
})

const digitColumns = ref<HTMLElement[]>([])
const isLoading = computed(() => isProductLoading.value)

const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (!product.value) {
    return []
  }

  let crumbs: IBreadcrumbItem[] = []

  if (product.value.categories?.slug) {
    crumbs = categoriesStore.getBreadcrumbs(product.value.categories.slug)
  }

  crumbs.push({
    id: product.value.id,
    name: product.value.name,
  })

  return crumbs
})

const totalPrice = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.price)
  const selected = (accessories.value || []).filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.price)
  }
  return total
})

const totalBonuses = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.bonus_points_award || 0)
  const selected = (accessories.value || []).filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.bonus_points_award || 0)
  }
  return total
})

const mainItemInCart = computed(() => {
  if (!product.value)
    return undefined
  return cartStore.items.find(item => item.product.id === product.value?.id)
})

const quantityInCart = computed(() => {
  return mainItemInCart.value ? mainItemInCart.value.quantity : 0
})

function addToCart() {
  if (!product.value)
    return

  if (!mainItemInCart.value) {
    cartStore.addItem(product.value, 1)
  }

  // Add selected accessories to cart
  const selectedAccessories = (accessories.value || []).filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selectedAccessories) {
    const accInCart = cartStore.items.find(item => item.product.id === acc.id)
    if (!accInCart) {
      cartStore.addItem(acc, 1)
    }
  }

  const itemsCount = 1 + selectedAccessories.length
  toast.success(itemsCount > 1 ? `${itemsCount} товара добавлено в корзину` : 'Товар добавлен в корзину')
}

useFlipCounter(totalPrice, digitColumns)

onMounted(() => {
  if (!similarProductsRef.value)
    return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        showStickyPanel.value = !entry.isIntersecting
      })
    },
    {
      rootMargin: '-64px 0px 0px 0px',
      threshold: 0,
    },
  )

  observer.observe(similarProductsRef.value)

  onUnmounted(() => {
    observer.disconnect()
  })
})

const quantity = ref(1)

watch(() => product.value?.id, () => {
  quantity.value = 1
  selectedAccessoryIds.value = []
  digitColumns.value = []
}, { immediate: true })

function prefetchProduct(productSlug: string) {
  queryClient.prefetchQuery({
    queryKey: ['product', productSlug],
    queryFn: () => productsStore.fetchProductBySlug(productSlug),
    staleTime: 5 * 60 * 1000,
  })
}

// 🔥 SEO & OG IMAGE - теперь данные доступны на сервере
const canonicalUrl = computed(() => {
  if (!product.value)
    return ''
  return `https://uhti.kz/catalog/products/${product.value.slug}`
})

const metaTitle = computed(() => {
  if (!product.value)
    return 'Товар | Ухтышка'
  return `${product.value.name} - Купить в интернет-магазине | Ухтышка`
})

// Хелперы для возраста и пола
const ageRangeText = computed(() => {
  if (!product.value)
    return null

  const minAge = product.value.min_age_years
  const maxAge = product.value.max_age_years

  if (minAge !== null && maxAge !== null) {
    if (minAge === maxAge)
      return `${minAge} лет`
    return `от ${minAge} до ${maxAge} лет`
  }
  if (minAge !== null)
    return `от ${minAge} лет`
  if (maxAge !== null)
    return `до ${maxAge} лет`
  return null
})

const genderText = computed(() => {
  if (!product.value?.gender)
    return null

  switch (product.value.gender) {
    case 'female': return 'для девочек'
    case 'male': return 'для мальчиков'
    default: return null
  }
})

const audienceText = computed(() => {
  const parts: string[] = []
  if (genderText.value)
    parts.push(genderText.value)
  if (ageRangeText.value)
    parts.push(ageRangeText.value)
  return parts.length > 0 ? parts.join(' ') : null
})

const metaDescription = computed(() => {
  if (!product.value)
    return ''

  // Приоритет: seo_description > автогенерация
  if (product.value.seo_description) {
    return product.value.seo_description
  }

  // Автогенерация с учетом возраста и пола
  const parts: string[] = []

  // Название + аудитория
  if (audienceText.value) {
    parts.push(`${product.value.name} ${audienceText.value}`)
  }
  else {
    parts.push(product.value.name)
  }

  // Цена и наличие
  parts.push(`Цена: ${formatPrice(product.value.price)} ₸`)
  parts.push(product.value.stock_quantity > 0 ? 'В наличии' : 'Под заказ')
  parts.push('Доставка по Казахстану')

  return `${parts.join('. ')}.`
})

const categoryName = computed(() => product.value?.categories?.name)
const categorySlug = computed(() => product.value?.categories?.slug)
const brandName = computed(() => product.value?.brands?.name)
const brandSlug = computed(() => product.value?.brands?.slug)

const metaKeywords = computed(() => {
  const keywords: string[] = []

  // Пользовательские ключевые слова
  if (product.value?.seo_keywords?.length) {
    keywords.push(...product.value.seo_keywords)
  }

  // Автоматические ключевые слова на основе данных товара
  if (product.value) {
    keywords.push(product.value.name)

    // Добавляем возраст в ключевые слова
    if (product.value.min_age_years !== null) {
      keywords.push(`игрушки от ${product.value.min_age_years} лет`)
      keywords.push(`${product.value.min_age_years} года`)
    }

    // Добавляем пол
    if (product.value.gender === 'female') {
      keywords.push('игрушки для девочек', 'подарок девочке')
    }
    else if (product.value.gender === 'male') {
      keywords.push('игрушки для мальчиков', 'подарок мальчику')
    }

    // Бренд
    if (brandName.value) {
      keywords.push(brandName.value)
    }

    // Категория
    if (categoryName.value) {
      keywords.push(categoryName.value)
    }

    keywords.push('купить в Алматы', 'доставка Казахстан')
  }

  return keywords.length > 0 ? [...new Set(keywords)].join(', ') : null
})

// URL логотипа бренда
const brandLogoUrl = computed(() => {
  const logoUrl = (product.value?.brands as any)?.logo_url
  if (!logoUrl)
    return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
})

// Ссылки для SEO блока "Ещё товары"
const brandLink = computed(() => {
  if (!brandSlug.value)
    return null
  return `/brand/${brandSlug.value}`
})

const categoryLink = computed(() => {
  if (!categorySlug.value)
    return null
  return `/catalog/${categorySlug.value}`
})

const robotsRule = computed(() => {
  if (!product.value) {
    return { noindex: true, nofollow: true }
  }

  if (!product.value.description && product.value.stock_quantity === 0) {
    return { noindex: true, follow: true }
  }

  return { index: true, follow: true }
})

useRobotsRule(robotsRule)

const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url) {
    return 'https://uhti.kz/og-default.jpg'
  }

  const imageUrl = product.value.product_images[0].image_url
  return `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/${BUCKET_NAME_PRODUCT}/${imageUrl}`
})

// Массив всех изображений для JSON-LD (Google рекомендует несколько)
const productImages = computed(() => {
  if (!product.value?.product_images?.length) {
    return ['https://uhti.kz/og-default.jpg']
  }

  return product.value.product_images.map(img =>
    `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/${BUCKET_NAME_PRODUCT}/${img.image_url}`,
  )
})

defineOgImage({
  url: ogImageUrl.value,
  width: 1200,
  height: 630,
  alt: computed(() => product.value?.name || 'Товар'),
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  keywords: metaKeywords,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogImage: ogImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: computed(() => product.value?.name || 'Товар'),
  ogUrl: canonicalUrl,
  ogSiteName: 'Ухтышка',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  twitterImage: ogImageUrl,
  robots: computed(() => robotsRule.value.noindex ? 'noindex, follow' : 'index, follow'),
})

useHead(() => ({
  meta: [
    { property: 'og:type', content: 'product' },
    { property: 'product:price:amount', content: String(product.value?.price || 0) },
    { property: 'product:price:currency', content: 'KZT' },
    { property: 'product:availability', content: (product.value?.stock_quantity || 0) > 0 ? 'in stock' : 'out of stock' },
    { property: 'product:brand', content: brandName.value || '' },
    { property: 'product:category', content: categoryName.value || '' },
  ],
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
  ],
  script: [
    // 1. BreadcrumbList Schema (хлебные крошки для sitelinks)
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': breadcrumbs.value.map((crumb, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': crumb.name,
          'item': crumb.href ? `https://uhti.kz${crumb.href}` : undefined,
        })),
      }),
    },
    // 2. Product Schema
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': product.value?.name,
        'description': product.value?.seo_description || product.value?.description,
        'image': productImages.value,
        'sku': product.value?.sku || undefined,
        'brand': {
          '@type': 'Brand',
          'name': brandName.value || 'Ухтышка',
          // 🔥 URL страницы бренда для SEO
          ...(brandLink.value && {
            url: `https://uhti.kz${brandLink.value}`,
          }),
        },
        'offers': {
          '@type': 'Offer',
          'price': String(Math.round(product.value?.price || 0)),
          'priceCurrency': 'KZT',
          'availability': (product.value?.stock_quantity || 0) > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          'url': canonicalUrl.value,
          'seller': {
            '@type': 'Organization',
            'name': 'Ухтышка',
            'url': 'https://uhti.kz',
          },
        },
        // Категория товара с URL
        ...(categoryName.value && {
          category: categoryName.value,
        }),
        // 🔥 Связь с категорией для SEO
        ...(categoryLink.value && {
          isRelatedTo: {
            '@type': 'CollectionPage',
            'name': categoryName.value,
            'url': `https://uhti.kz${categoryLink.value}`,
          },
        }),
        // Рекомендуемый возраст (Schema.org suggestedAge)
        ...((product.value?.min_age_years !== null || product.value?.max_age_years !== null) && {
          audience: {
            '@type': 'PeopleAudience',
            ...(product.value?.min_age_years !== null && {
              suggestedMinAge: product.value?.min_age_years,
            }),
            ...(product.value?.max_age_years !== null && {
              suggestedMaxAge: product.value?.max_age_years,
            }),
            // Пол аудитории
            ...(product.value?.gender && product.value?.gender !== 'unisex' && {
              suggestedGender: product.value?.gender === 'female' ? 'female' : 'male',
            }),
          },
        }),
        // Ключевые слова для поиска
        ...(metaKeywords.value && {
          keywords: metaKeywords.value,
        }),
      }),
    },
  ],
}))
</script>

<template>
  <div class="bg-background">
    <div :class="`${containerClass} py-4 lg:py-6`">
      <ClientOnly>
        <ProductDetailSkeleton v-if="isLoading" />

        <div v-else-if="product">
          <!-- Breadcrumbs с кнопкой избранного -->
          <div class="flex items-center justify-between mb-4">
            <Breadcrumbs :items="breadcrumbs" compact class="flex-1" />
            <ProductWishlistButton :product-id="product.id" :product-name="product.name" class="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg border bg-white hover:bg-muted transition-colors" />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <!-- Левая колонка: Галерея -->
            <div class="lg:col-span-7">
              <div class="bg-white rounded-xl lg:p-4 lg:shadow-sm lg:border">
                <ProductGallery
                  v-if="product.product_images && product.product_images.length > 0"
                  :images="product.product_images"
                />
                <div v-else class="bg-muted rounded-lg flex items-center justify-center h-64 lg:h-96">
                  <p class="text-muted-foreground">
                    Изображения отсутствуют
                  </p>
                </div>
              </div>
            </div>

            <!-- Правая колонка: Информация о товаре -->
            <div class="lg:col-span-5">
              <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border sticky top-4">
                <h1 class="text-xl lg:text-2xl font-bold mb-2 leading-tight">
                  {{ product.name }}
                </h1>

                <!-- 🔥 Бренд товара (как у detmir.kz) -->
                <NuxtLink
                  v-if="brandName && brandLink"
                  :to="brandLink"
                  class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-4 group"
                >
                  <!-- Логотип бренда или fallback иконка -->
                  <div class="w-6 h-6 rounded bg-white border overflow-hidden flex items-center justify-center flex-shrink-0">
                    <ProgressiveImage
                      v-if="product.brands?.logo_url"
                      :src="brandLogoUrl"
                      :alt="brandName || 'Бренд'"
                      :bucket-name="BUCKET_NAME_BRANDS"
                      :file-path="product.brands.logo_url"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full"
                    />
                    <Icon v-else name="lucide:building-2" class="w-4 h-4" />
                  </div>
                  <span class="group-hover:underline">{{ brandName }}</span>
                  <Icon name="lucide:chevron-right" class="w-3 h-3 opacity-50" />
                </NuxtLink>

                <div class="mb-6 lg:mb-8">
                  <div class="flex items-baseline gap-3 mb-2">
                    <p class="text-3xl lg:text-4xl font-bold text-primary transition-all duration-300">
                      {{ formatPrice(totalPrice) }} ₸
                    </p>
                  </div>

                  <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-sm font-medium">
                    <Icon name="lucide:gift" class="w-4 h-4" />
                    <span>+{{ totalBonuses }} бонусов</span>
                  </div>
                </div>

                <div class="mb-6 pb-6 border-b">
                  <div class="flex items-center gap-2 text-sm">
                    <Icon
                      :name="product.stock_quantity > 0 ? 'lucide:check-circle' : 'lucide:x-circle'"
                      :class="product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'"
                      class="w-5 h-5"
                    />
                    <span :class="product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'" class="font-medium">
                      {{ product.stock_quantity > 0 ? 'В наличии' : 'Нет в наличии' }}
                    </span>
                    <span v-if="product.stock_quantity > 0" class="text-muted-foreground">
                      ({{ product.stock_quantity }} шт.)
                    </span>
                  </div>
                </div>

                <ClientOnly>
                  <div class="hidden lg:block space-y-3 mb-6">
                    <template v-if="product.stock_quantity > 0">
                      <Button
                        v-if="!mainItemInCart"
                        size="lg"
                        class="w-full h-12 text-base font-semibold"
                        @click="addToCart"
                      >
                        <Icon name="lucide:shopping-cart" class="w-5 h-5 mr-2" />
                        Добавить в корзину
                      </Button>

                      <div v-else class="flex items-center gap-3">
                        <Button
                          size="lg"
                          class="flex-grow h-12 text-base font-semibold"
                          @click="router.push('/cart')"
                        >
                          <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
                          Перейти в корзину
                        </Button>

                        <QuantitySelector
                          :product="product"
                          :quantity="quantityInCart"
                          class="w-auto"
                        />
                      </div>
                    </template>

                    <Button v-else size="lg" class="w-full h-12" disabled>
                      Нет в наличии
                    </Button>

                    <Button size="lg" variant="outline" class="w-full h-12 text-base">
                      <Icon name="mdi:heart-outline" class="w-5 h-5 mr-2" />
                      В избранное
                    </Button>
                  </div>
                </ClientOnly>
              </div>

              <!-- Аксессуары (батарейки и подарочная упаковка) -->
              <AccessoriesBlock
                v-model:selected-ids="selectedAccessoryIds"
                :accessories="accessories || []"
                :loading="accessoriesLoading"
              />
            </div>
          </div>

          <!-- О товаре (в стиле detmir.kz) -->
          <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8">
            <h2 class="text-xl font-bold mb-4">
              О товаре
            </h2>

            <!-- Название товара -->
            <h3 class="font-semibold text-base mb-3">
              {{ product.name }}
            </h3>

            <!-- Краткое описание с возможностью раскрытия -->
            <div v-if="product.description" class="mb-4">
              <div
                class="text-sm text-muted-foreground overflow-hidden transition-all duration-300" :class="[
                  !isDescriptionExpanded && 'line-clamp-2',
                ]"
              >
                {{ product.description.replace(/<[^>]*>/g, '').substring(0, 200) }}{{ product.description.length > 200 && !isDescriptionExpanded ? '...' : '' }}
              </div>
              <button
                v-if="product.description.length > 200"
                class="text-primary text-sm font-medium mt-1 hover:underline"
                @click="isDescriptionExpanded = !isDescriptionExpanded"
              >
                {{ isDescriptionExpanded ? 'Скрыть' : 'Показать полностью' }}
              </button>
            </div>

            <!-- Таблица характеристик с пунктирными линиями -->
            <dl class="space-y-0">
              <!-- Бренд -->
              <div v-if="brandName" class="product-spec-row">
                <dt class="product-spec-label">
                  Бренд
                </dt>
                <dd class="product-spec-value">
                  <NuxtLink
                    v-if="brandLink"
                    :to="brandLink"
                    class="text-primary hover:underline"
                  >
                    {{ brandName }}
                  </NuxtLink>
                  <span v-else>{{ brandName }}</span>
                </dd>
              </div>

              <!-- Категория -->
              <div v-if="categoryName" class="product-spec-row">
                <dt class="product-spec-label">
                  Категория
                </dt>
                <dd class="product-spec-value">
                  <NuxtLink
                    v-if="categoryLink"
                    :to="categoryLink"
                    class="text-primary hover:underline"
                  >
                    {{ categoryName }}
                  </NuxtLink>
                  <span v-else>{{ categoryName }}</span>
                </dd>
              </div>

              <!-- Возраст -->
              <div v-if="ageRangeText" class="product-spec-row">
                <dt class="product-spec-label">
                  Рекомендованный возраст
                </dt>
                <dd class="product-spec-value">
                  {{ ageRangeText }}
                </dd>
              </div>

              <!-- Материал -->
              <div v-if="product.materials?.name" class="product-spec-row">
                <dt class="product-spec-label">
                  Материал
                </dt>
                <dd class="product-spec-value">
                  {{ product.materials.name }}
                </dd>
              </div>

              <!-- Страна -->
              <div v-if="product.countries?.name" class="product-spec-row">
                <dt class="product-spec-label">
                  Страна производитель
                </dt>
                <dd class="product-spec-value">
                  {{ product.countries.name }}
                </dd>
              </div>

              <!-- Артикул / Код товара -->
              <div v-if="product.sku" class="product-spec-row">
                <dt class="product-spec-label">
                  Код товара
                </dt>
                <dd class="product-spec-value">
                  {{ product.sku }}
                </dd>
              </div>

              <!-- Штрихкод -->
              <div v-if="product.barcode" class="product-spec-row">
                <dt class="product-spec-label">
                  Штрихкод
                </dt>
                <dd class="product-spec-value">
                  {{ product.barcode }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- Секция "Ещё товары" -->
          <div
            v-if="brandName || categoryName || breadcrumbs.length > 1"
            class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8"
          >
            <h3 class="font-bold text-xl mb-4">
              Ещё товары
            </h3>

            <div class="space-y-0 divide-y divide-border">
              <!-- Товары бренда -->
              <NuxtLink
                v-if="brandName && brandLink"
                :to="brandLink"
                class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
              >
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden flex-shrink-0">
                  <ProgressiveImage
                    v-if="product.brands?.logo_url"
                    :src="brandLogoUrl"
                    :alt="brandName || 'Бренд'"
                    :bucket-name="BUCKET_NAME_BRANDS"
                    :file-path="product.brands.logo_url"
                    aspect-ratio="square"
                    object-fit="contain"
                    placeholder-type="shimmer"
                    class="w-full h-full p-1.5"
                  />
                  <Icon v-else name="lucide:building-2" class="w-6 h-6 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-base leading-tight">
                    {{ brandName }}
                  </p>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    Бренд
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary flex-shrink-0" />
              </NuxtLink>

              <!-- Товары категории -->
              <NuxtLink
                v-if="categoryName && categoryLink"
                :to="categoryLink"
                class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
              >
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border flex-shrink-0">
                  <Icon name="lucide:box" class="w-6 h-6 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-base leading-tight">
                    {{ categoryName }}
                  </p>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    Категория
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary flex-shrink-0" />
              </NuxtLink>

              <!-- Родительские категории из breadcrumbs -->
              <template v-for="crumb in breadcrumbs.slice(0, -1)" :key="crumb.id">
                <NuxtLink
                  v-if="crumb.href && crumb.name !== categoryName"
                  :to="crumb.href"
                  class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
                >
                  <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border flex-shrink-0">
                    <Icon name="lucide:layers" class="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-base leading-tight">
                      {{ crumb.name }}
                    </p>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Категория
                    </p>
                  </div>
                  <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary flex-shrink-0" />
                </NuxtLink>
              </template>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-20">
          <h1 class="text-2xl font-bold">
            Товар не найден
          </h1>
          <p class="text-muted-foreground mt-2">
            Возможно, товар был удален или ссылка неверна.
          </p>
          <NuxtLink to="/catalog" class="inline-block mt-4 text-primary hover:underline">
            ← Вернуться в каталог
          </NuxtLink>
        </div>

        <template #fallback>
          <ProductDetailSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!-- Стики панель для мобильных -->
    <ClientOnly>
      <Transition
        enter-active-class="transition-transform duration-300 ease-out"
        enter-from-class="translate-y-full"
        enter-to-class="translate-y-0"
        leave-active-class="transition-transform duration-300 ease-in"
        leave-from-class="translate-y-0"
        leave-to-class="translate-y-full"
      >
        <div
          v-if="product && showStickyPanel"
          class="lg:hidden sticky bottom-16 left-0 right-0 bg-white border-t shadow-lg z-40"
        >
          <div class="px-4 py-3">
            <div class="flex items-center gap-3 justify-between">
              <div v-if="!mainItemInCart" class="flex-shrink-0">
                <p class="text-xs text-muted-foreground mb-0.5">
                  Цена
                </p>
                <p class="text-xl font-bold text-primary">
                  {{ formatPrice(totalPrice) }} ₸
                </p>
              </div>

              <template v-if="product.stock_quantity > 0">
                <Button
                  v-if="!mainItemInCart"
                  size="lg"
                  class="h-11 text-base font-semibold"
                  @click="addToCart"
                >
                  <Icon name="lucide:shopping-cart" class="w-5 h-5 mr-2" />
                  В корзину
                </Button>

                <div v-else class="flex justify-between items-center gap-3 flex-grow">
                  <Button
                    size="lg"
                    class="h-11 text-base font-semibold"
                    @click="router.push('/cart')"
                  >
                    <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
                    В корзине
                  </Button>

                  <QuantitySelector
                    :product="product"
                    :quantity="quantityInCart"
                    class="w-auto"
                  />
                </div>
              </template>

              <Button v-else size="lg" class="flex-grow h-11" disabled>
                Нет в наличии
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </ClientOnly>

    <!-- ✅ Похожие товары с независимой загрузкой -->
    <div
      v-if="similarProductsLoading || (similarProducts && similarProducts.length > 0)"
      ref="similarProductsRef"
      class="bg-gray-50 py-8 lg:py-12 mt-8 lg:mt-12"
    >
      <!-- Скелетон для похожих товаров -->
      <div v-if="similarProductsLoading" :class="`${containerClass}`">
        <h2 class="text-2xl lg:text-3xl font-bold mb-6">
          Похожие товары
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="i in 4" :key="i" class="bg-white rounded-xl p-4 animate-pulse">
            <div class="aspect-square bg-muted rounded-lg mb-3" />
            <div class="h-4 bg-muted rounded w-3/4 mb-2" />
            <div class="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
      </div>

      <!-- Карусель похожих товаров с prefetch -->
      <ProductCarousel
        v-else
        :products="similarProducts || []"
        @mouseenter-product="prefetchProduct"
      >
        <template #header>
          <h2 class="text-2xl lg:text-3xl font-bold mb-6">
            Похожие товары
          </h2>
        </template>
      </ProductCarousel>
    </div>
  </div>
</template>

<style scoped>
/* Стили для таблицы характеристик в стиле detmir.kz */
.product-spec-row {
  display: flex;
  align-items: baseline;
  padding: 0.625rem 0;
}

.product-spec-row::after {
  content: '';
  flex-grow: 1;
  border-bottom: 1px dotted hsl(var(--border));
  margin: 0 0.5rem;
  min-width: 2rem;
  order: 1;
}

.product-spec-label {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  order: 0;
}

.product-spec-value {
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: right;
  order: 2;
}

.digit-column {
  height: 2.25rem; /* text-3xl = 1.875rem, but we need line height */
  line-height: 2.25rem;
  overflow: hidden;
  position: relative;
  width: 1.25rem;
  text-align: center;
  border-radius: 0.25rem;
  transition: background-color 0.3s ease;
}

@media (min-width: 1024px) {
  .digit-column {
    height: 2.75rem; /* text-4xl = 2.25rem */
    line-height: 2.75rem;
    width: 1.5rem;
  }
}

.digit-ribbon {
  position: relative;
  will-change: transform;
}

.digit-item {
  height: 2.25rem;
  line-height: 2.25rem;
}

@media (min-width: 1024px) {
  .digit-item {
    height: 2.75rem;
    line-height: 2.75rem;
  }
}
</style>

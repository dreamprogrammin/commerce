<script setup lang="ts">
import type {
  AttributeWithValue,
  IBreadcrumbItem,
  ProductImageRow,
  ProductWithImages,
} from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import Breadcrumbs from '@/components/global/Breadcrumbs.vue'
import ProductDescription from '@/components/product/ProductDescription.vue'
import StockAlertButton from '@/components/product/StockAlertButton.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBreadcrumbSchema } from '@/composables/useBreadcrumbSchema'
import { useFlipCounter } from '@/composables/useFlipCounter'
import {
  BUCKET_NAME_BRANDS,
  BUCKET_NAME_CATEGORY,
  BUCKET_NAME_PRODUCT,
  BUCKET_NAME_PRODUCT_LINES,
} from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductQuestionsStore } from '@/stores/publicStore/productQuestionsStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useReviewsStore } from '@/stores/publicStore/reviewsStore'
import { formatPrice } from '@/utils/formatPrice'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const questionsStore = useProductQuestionsStore()
const reviewsStore = useReviewsStore()
const queryClient = useQueryClient()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getVariantUrl } = useSupabaseStorage()

const priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0]

const slug = computed(() => route.params.slug as string)

const selectedAccessoryIds = ref<string[]>([])
const isDescriptionExpanded = ref(false)

// 🔥 SSR: загружаем категории, продукт и отзывы ПАРАЛЛЕЛЬНО
if (import.meta.server) {
  let initialProduct = null
  let initialReviews = null
  let ssrFetchFailed = false

  try {
    const [_categories, product] = await Promise.all([
      !categoriesStore.allCategories.length
        ? categoriesStore.fetchCategoryData().catch(() => null)
        : Promise.resolve(null),
      productsStore.fetchProductBySlug(slug.value),
    ])
    initialProduct = product

    // Загружаем отзывы для Schema.org
    if (initialProduct?.id) {
      initialReviews = await reviewsStore
        .fetchReviews(initialProduct.id)
        .catch(() => [])
    }
  }
  catch {
    ssrFetchFailed = true
  }

  if (!initialProduct && !ssrFetchFailed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Товар не найден',
      fatal: true,
    })
  }

  if (initialProduct) {
    queryClient.setQueryData(['product', slug.value], initialProduct)
  }

  if (initialReviews) {
    queryClient.setQueryData(
      ['product-reviews', initialProduct.id],
      initialReviews,
    )
  }
}

const {
  data: product,
  isLoading: isProductLoading,
  isError: isProductError,
} = useQuery({
  queryKey: ['product', slug],
  queryFn: async () => {
    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)
    if (!fetchedProduct)
      throw new Error('Товар не найден')
    return fetchedProduct
  },
  staleTime: 2 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  retry: 2,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  initialData: import.meta.server
    ? queryClient.getQueryData(['product', slug.value])
    : undefined,
})

watch([isProductError, product], ([error, prod]) => {
  if (error || (!isProductLoading.value && !prod)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Товар не найден',
      fatal: true,
    })
  }
})

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

const { data: similarProducts, isLoading: similarProductsLoading } = useQuery({
  queryKey: ['similar-products', computed(() => product.value?.category_id)],
  queryFn: async () => {
    if (!product.value?.category_id)
      return []
    return await productsStore.fetchSimilarProducts(product.value.category_id, [
      product.value.id,
      ...(product.value.accessory_ids || []),
    ])
  },
  enabled: computed(() => !!product.value?.category_id),
  staleTime: 15 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
})

const { data: productQuestions } = await useAsyncData(
  `product-questions-${route.params.slug}`,
  async () => {
    if (!product.value?.id)
      return []
    return await questionsStore.fetchQuestions(product.value.id)
  },
  {
    watch: [() => product.value?.id],
    server: true,
  },
)

const { data: productReviews } = useQuery({
  queryKey: ['product-reviews', computed(() => product.value?.id)],
  queryFn: async () => {
    if (!product.value?.id)
      return []
    return await reviewsStore.fetchReviews(product.value.id)
  },
  enabled: computed(() => !!product.value?.id),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

const faqSchemaItems = computed(() => {
  if (!productQuestions.value)
    return []
  return productQuestions.value
    .filter(q => q.answer_text)
    .map((q) => {
      // Очищаем HTML для Гугла, сохраняя визуальные списки
      const cleanText = q.answer_text
        .replace(/<strong>/g, '')
        .replace(/<\/strong>/g, '')
        .replace(/<ul>/g, '\n')
        .replace(/<\/ul>/g, '')
        .replace(/<li>/g, '• ')
        .replace(/<\/li>/g, '\n')
        .replace(/<a[^>]*>/g, '')
        .replace(/<\/a>/g, '')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim()

      return {
        '@type': 'Question',
        'name': q.question_text,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': cleanText,
        },
      }
    })
})

const digitColumns = ref<HTMLElement[]>([])
const isLoading = computed(() => isProductLoading.value)

const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (!product.value)
    return []
  let crumbs: IBreadcrumbItem[] = []
  if (product.value.categories?.slug)
    crumbs = categoriesStore.getBreadcrumbs(product.value.categories.slug)
  crumbs.push({ id: product.value.id, name: product.value.name })
  return crumbs
})

const mainProductPrice = computed(() => {
  if (!product.value)
    return { final: 0, original: 0, hasDiscount: false }
  // 🔥 Используем final_price из базы данных
  const finalPrice = product.value.final_price || product.value.price
  return {
    final: finalPrice,
    original: Number(product.value.price),
    hasDiscount:
      !!product.value.discount_percentage
      && product.value.discount_percentage > 0,
  }
})

const totalPrice = computed(() => {
  if (!product.value)
    return 0
  let total = mainProductPrice.value.final
  const selected = (accessories.value || []).filter((acc: ProductWithImages) =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selected) {
    // 🔥 Используем final_price из базы данных
    const accFinalPrice = acc.final_price || acc.price
    total += accFinalPrice
  }
  return total
})

const totalBonuses = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.bonus_points_award || 0)
  const selected = (accessories.value || []).filter((acc: ProductWithImages) =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selected) total += Number(acc.bonus_points_award || 0)
  return total
})

const priceChars = computed(() => {
  const formatted = formatPrice(totalPrice.value)
  let digitIndex = 0
  return formatted.split('').map((char) => {
    const isDigit = !Number.isNaN(Number(char)) && char !== ' '
    const result = { char, isDigit, digitIndex: isDigit ? digitIndex : -1 }
    if (isDigit)
      digitIndex++
    return result
  })
})

const selectedAccessoriesData = computed(() =>
  (accessories.value || []).filter((acc: ProductWithImages) =>
    selectedAccessoryIds.value.includes(acc.id),
  ),
)

const hasAccessoriesSelected = computed(
  () => selectedAccessoriesData.value.length > 0,
)

watch(accessories, (newAccessories) => {
  if (!newAccessories?.length)
    return
  const cartProductIds = new Set(cartStore.items.map(i => i.product.id))
  const preSelected = newAccessories
    .filter((acc: ProductWithImages) => cartProductIds.has(acc.id))
    .map((acc: ProductWithImages) => acc.id)
  if (preSelected.length > 0) {
    selectedAccessoryIds.value = [
      ...new Set([...selectedAccessoryIds.value, ...preSelected]),
    ]
  }
})

const mainItemInCart = computed(() => {
  if (!product.value)
    return undefined
  return cartStore.items.find(item => item.product.id === product.value?.id)
})

const quantityInCart = computed(() =>
  mainItemInCart.value ? mainItemInCart.value.quantity : 0,
)

async function addToCart() {
  if (!product.value)
    return
  let addedCount = 0
  if (!mainItemInCart.value) {
    await cartStore.addItem(product.value, 1)
    addedCount++
  }
  const selectedAccessories = (accessories.value || []).filter(
    (acc: ProductWithImages) => selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selectedAccessories) {
    if (!cartStore.items.find(item => item.product.id === acc.id)) {
      await cartStore.addItem(acc, 1)
      addedCount++
    }
  }
  if (addedCount > 0) {
    toast.success(
      addedCount === 1
        ? 'Товар добавлен в корзину'
        : `${addedCount} товара добавлено в корзину`,
    )
  }
  else if (selectedAccessories.length > 0) {
    toast.info('Выбранные товары уже в корзине')
  }
}

useFlipCounter(totalPrice, digitColumns)

const isNavVisible = ref(true)
let stickyLastScrollY = 0

function handleStickyScroll() {
  const y = window.scrollY
  if (y < 60)
    isNavVisible.value = true
  else if (y > stickyLastScrollY)
    isNavVisible.value = false
  else isNavVisible.value = true
  stickyLastScrollY = y
}

onMounted(() =>
  window.addEventListener('scroll', handleStickyScroll, { passive: true }),
)
onUnmounted(() => window.removeEventListener('scroll', handleStickyScroll))

const quantity = ref(1)

watch(
  () => product.value?.id,
  () => {
    quantity.value = 1
    selectedAccessoryIds.value = []
    digitColumns.value = []
  },
  { immediate: true },
)

function prefetchProduct(productSlug: string) {
  queryClient.prefetchQuery({
    queryKey: ['product', productSlug],
    queryFn: () => productsStore.fetchProductBySlug(productSlug),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── SEO computed ───────────────────────────────────────────────────────────

const productSku = computed(() => {
  if (!product.value)
    return undefined
  if (product.value.sku)
    return product.value.sku
  return product.value.id
    ? product.value.id.replace(/-/g, '').substring(0, 10).toUpperCase()
    : undefined
})

const canonicalUrl = computed(() =>
  product.value ? `https://uhti.kz/catalog/products/${product.value.slug}` : '',
)

const metaTitle = computed(() => {
  if (!product.value)
    return 'Товар | Ухтышка'
  if (product.value.meta_title)
    return product.value.meta_title
  if (product.value.seo_title)
    return product.value.seo_title
  return `${product.value.name} - Купить в интернет-магазине | Ухтышка`
})

const ageRangeText = computed(() => {
  if (!product.value)
    return null
  const { min_age_years: min, max_age_years: max } = product.value
  if (min !== null && max !== null)
    return min === max ? `${min} лет` : `от ${min} до ${max} лет`
  if (min !== null)
    return `от ${min} лет`
  if (max !== null)
    return `до ${max} лет`
  return null
})

const genderText = computed(() => {
  switch (product.value?.gender) {
    case 'female':
      return 'для девочек'
    case 'male':
      return 'для мальчиков'
    default:
      return null
  }
})

const audienceText = computed(() => {
  const parts = [genderText.value, ageRangeText.value].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
})

const metaDescription = computed(() => {
  if (!product.value)
    return ''
  if (product.value.meta_description)
    return product.value.meta_description
  if (product.value.seo_description)
    return product.value.seo_description
  const parts = [
    audienceText.value
      ? `${product.value.name} ${audienceText.value}`
      : product.value.name,
    `Цена: ${formatPrice(product.value.price)} ₸`,
    product.value.stock_quantity > 0 ? 'В наличии' : 'Под заказ',
    'Доставка по Казахстану',
  ]
  return `${parts.join('. ')}.`
})

const categoryName = computed(() => product.value?.categories?.name)
const categorySlug = computed(() => product.value?.categories?.slug)

const fullCategory = computed(() => {
  if (!categorySlug.value || !categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(
    c => c.slug === categorySlug.value,
  )
})

const parentCategories = computed(() => {
  if (!categoriesStore.allCategories.length)
    return []
  return breadcrumbs.value
    .slice(0, -1)
    .filter(crumb => crumb.href && crumb.name !== categoryName.value)
    .map(crumb => ({
      crumb,
      category: categoriesStore.allCategories.find(
        c => c.slug === crumb.href?.split('/').pop(),
      ),
    }))
    .filter(item => item.category)
})

const categoryAttributes = ref<AttributeWithValue[]>([])
watch(
  () => categorySlug.value,
  async (newSlug) => {
    if (newSlug) {
      categoryAttributes.value
        = await productsStore.fetchAttributesForCategory(newSlug)
    }
  },
  { immediate: true },
)

const hasPieceCountAttribute = computed(() =>
  categoryAttributes.value.some(attr => attr.display_type === 'number_range'),
)

interface ProductWithProductLine {
  product_lines?: { name: string, slug: string } | null
}

const brandName = computed(() => product.value?.brands?.name)
const brandSlug = computed(() => product.value?.brands?.slug)
const productLineName = computed(
  () => (product.value as ProductWithProductLine | null)?.product_lines?.name,
)
const productLineSlug = computed(
  () => (product.value as ProductWithProductLine | null)?.product_lines?.slug,
)

const productLineLink = computed(() => {
  if (!productLineSlug.value || !brandSlug.value)
    return null
  return `/brand/${brandSlug.value}/${productLineSlug.value}`
})

const metaKeywords = computed(() => {
  const keywords: string[] = []
  if (product.value?.meta_keywords?.length)
    keywords.push(...product.value.meta_keywords)
  else if (product.value?.seo_keywords?.length)
    keywords.push(...product.value.seo_keywords)
  if (product.value) {
    keywords.push(product.value.name)
    if (product.value.min_age_years !== null) {
      keywords.push(
        `игрушки от ${product.value.min_age_years} лет`,
        `${product.value.min_age_years} года`,
      )
    }
    if (product.value.gender === 'female')
      keywords.push('игрушки для девочек', 'подарок девочке')
    else if (product.value.gender === 'male')
      keywords.push('игрушки для мальчиков', 'подарок мальчику')
    if (brandName.value)
      keywords.push(brandName.value)
    if (productLineName.value) {
      keywords.push(productLineName.value)
      if (brandName.value)
        keywords.push(`${brandName.value} ${productLineName.value}`)
    }
    if (categoryName.value)
      keywords.push(categoryName.value)
    keywords.push('купить в Алматы', 'доставка Казахстан')
  }
  return keywords.length > 0 ? [...new Set(keywords)].join(', ') : null
})

const brandLogoUrl = computed(() => {
  const logoUrl = product.value?.brands?.logo_url
  return logoUrl ? getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm') : null
})

const productLineLogoUrl = computed(() => {
  const logoUrl = product.value?.product_lines?.logo_url
  return logoUrl
    ? getVariantUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, 'sm')
    : null
})

const brandLink = computed(() =>
  brandSlug.value ? `/brand/${brandSlug.value}` : null,
)
const categoryLink = computed(() =>
  categorySlug.value ? `/catalog/${categorySlug.value}` : null,
)

const schemaAdditionalProperties = computed(() => {
  const pavs = product.value?.product_attribute_values
  if (!pavs?.length)
    return []
  const grouped = new Map<string, string[]>()
  for (const pav of pavs) {
    const attrName = pav.attributes?.name
    if (!attrName)
      continue
    const option = pav.attributes?.attribute_options?.find(
      o => o.id === pav.option_id,
    )
    if (!option?.value)
      continue
    if (!grouped.has(attrName))
      grouped.set(attrName, [])
    grouped.get(attrName)!.push(String(option.value))
  }
  return Array.from(grouped.entries()).map(([name, values]) => ({
    '@type': 'PropertyValue',
    'name': name,
    'value': values.join(', '),
  }))
})

const robotsRule = computed(() => {
  if (!product.value)
    return { noindex: true, nofollow: true }

  // 🔥 ТИКЕТ 2: Убираем noindex при stock_quantity === 0
  // Товар не в наличии должен индексироваться, чтобы люди переходили
  // и видели "Сообщить о поступлении" или покупали аналоги.
  // noindex ставим ТОЛЬКО если товар явно отключен админом
  if (product.value.is_active === false)
    return { noindex: true, follow: true }

  return { index: true, follow: true }
})

useRobotsRule(robotsRule)

const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url)
    return 'https://uhti.kz/og-default.jpg'
  return `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/${BUCKET_NAME_PRODUCT}/${product.value.product_images[0].image_url}`
})

const productImages = computed(() => {
  if (!product.value?.product_images?.length)
    return ['https://uhti.kz/og-default.jpg']
  return product.value.product_images.map(
    (img: ProductImageRow) =>
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
  robots: computed(() =>
    robotsRule.value.noindex ? 'noindex, follow' : 'index, follow',
  ),
})

// BreadcrumbList JSON-LD
useBreadcrumbSchema(
  computed(() =>
    breadcrumbs.value.map(crumb => ({
      name: crumb.name,
      ...(crumb.href ? { path: crumb.href } : {}),
    })),
  ),
)

// ─── useHead: только meta + canonical, без JSON-LD ──────────────────────────
useHead(() => {
  if (!product.value)
    return {}
  return {
    meta: [
      { name: 'keywords', content: metaKeywords.value || '' },
      { property: 'og:type', content: 'product' },
      {
        property: 'product:price:amount',
        content: String(product.value.price),
      },
      { property: 'product:price:currency', content: 'KZT' },
      {
        property: 'product:availability',
        content: product.value.stock_quantity > 0 ? 'in stock' : 'out of stock',
      },
      { property: 'product:brand', content: brandName.value || '' },
      ...(productLineName.value
        ? [{ property: 'product:product_line', content: productLineName.value }]
        : []),
      { property: 'product:category', content: categoryName.value || '' },
    ],
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
  }
})

// ─── useSchemaOrg: гарантированный SSR-рендер Product ───────────────────────
// Вызывается в корне <script setup> — вне условий, хуков и ClientOnly
useSchemaOrg([
  defineProduct({
    // 🔥 Отдаем чистое название товара для робота (без "Купить в Ухтышка")
    name: computed(() => product.value?.name || ''),
    description: metaDescription,
    image: productImages,

    // ✅ 1. Артикул (есть всегда)
    sku: productSku,
    mpn: productSku,

    // ✅ 3. Штрихкод (только если существует)
    gtin: computed(() => product.value?.barcode || undefined),

    brand: computed(() => {
      if (productLineName.value) {
        return {
          '@type': 'Brand' as const,
          'name': productLineName.value,
          ...(productLineLink.value && {
            url: `https://uhti.kz${productLineLink.value}`,
          }),
          'parentOrganization': {
            '@type': 'Brand' as const,
            'name': brandName.value || 'Ухтышка',
            ...(brandLink.value && {
              url: `https://uhti.kz${brandLink.value}`,
            }),
          },
        }
      }
      return {
        '@type': 'Brand' as const,
        'name': brandName.value || 'Ухтышка',
        ...(brandLink.value && { url: `https://uhti.kz${brandLink.value}` }),
      }
    }),

    offers: computed(() => {
      if (!product.value)
        return undefined
      const p = product.value
      // 🔥 Используем final_price из базы данных (с психологическим округлением)
      const finalPrice = p.final_price || Math.round(Number(p.price))
      const originalPrice = Math.round(Number(p.price))

      return {
        '@type': 'Offer' as const,
        'price': finalPrice,
        'priceCurrency': 'KZT',
        'availability':
          p.stock_quantity > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        'url': canonicalUrl.value,
        'priceValidUntil': priceValidUntil,
        'itemCondition': 'https://schema.org/NewCondition',
        'seller': {
          '@type': 'Organization' as const,
          'name': 'Ухтышка',
          'url': 'https://uhti.kz',
        },

        // 🔥 ТИКЕТ 4: Показываем Google, что у нас скидка
        ...(p.discount_percentage > 0
          ? {
              priceSpecification: {
                '@type': 'UnitPriceSpecification',
                'priceType': 'https://schema.org/SalePrice',
                'price': finalPrice,
                'priceCurrency': 'KZT',
              },
            }
          : {}),

        'hasMerchantReturnPolicy': {
          '@type': 'MerchantReturnPolicy' as const,
          'applicableCountry': 'KZ',
          'returnPolicyCategory':
            'https://schema.org/MerchantReturnFiniteReturnWindow',
          'merchantReturnDays': 14,
          'returnMethod': 'https://schema.org/ReturnByMail',
          'returnFees': 'https://schema.org/FreeReturn',
        },
        'shippingDetails': {
          '@type': 'OfferShippingDetails' as const,
          'shippingRate': {
            '@type': 'MonetaryAmount' as const,
            'value': 0,
            'currency': 'KZT',
          },
          'shippingDestination': {
            '@type': 'DefinedRegion' as const,
            'addressCountry': 'KZ',
          },
          'deliveryTime': {
            '@type': 'ShippingDeliveryTime' as const,
            'handlingTime': {
              '@type': 'QuantitativeValue' as const,
              'minValue': 0,
              'maxValue': 1,
              'unitCode': 'DAY',
            },
            'transitTime': {
              '@type': 'QuantitativeValue' as const,
              'minValue': 1,
              'maxValue': 3,
              'unitCode': 'DAY',
            },
          },
        },
      }
    }),

    aggregateRating: computed(() => {
      if (!product.value?.review_count || product.value.review_count === 0)
        return undefined
      return {
        '@type': 'AggregateRating' as const,
        'ratingValue': String(product.value.avg_rating || 0),
        'reviewCount': String(product.value.review_count),
        'bestRating': '5',
        'worstRating': '1',
      }
    }),

    review: computed(() => {
      if (!productReviews.value?.length)
        return undefined
      return productReviews.value.slice(0, 5).map(r => ({
        '@type': 'Review' as const,
        'author': {
          '@type': 'Person' as const,
          'name':
            [r.profiles?.first_name, r.profiles?.last_name]
              .filter(Boolean)
              .join(' ') || 'Покупатель',
        },
        'datePublished': r.created_at.split('T')[0],
        ...(r.text && { reviewBody: r.text }),
        'reviewRating': {
          '@type': 'Rating' as const,
          'ratingValue': String(r.rating),
          'bestRating': '5',
          'worstRating': '1',
        },
      }))
    }),

    // 🔥 ТИКЕТ 1: Связывание товаров для Deep Crawling
    isAccessoryOrSparePartFor: computed(() => {
      if (!accessories.value?.length)
        return undefined
      return accessories.value.map(acc => ({
        '@type': 'Product' as const,
        'name': acc.name,
        'url': `https://uhti.kz/catalog/products/${acc.slug}`,
      }))
    }),

    isSimilarTo: computed(() => {
      if (!similarProducts.value?.length)
        return undefined
      return similarProducts.value.slice(0, 5).map(sim => ({
        '@type': 'Product' as const,
        'name': sim.name,
        'url': `https://uhti.kz/catalog/products/${sim.slug}`,
      }))
    }),
  }),
])

// FAQPage — отдельно, тоже через useSchemaOrg
// computed гарантирует реактивность, watchEffect обновляет при появлении данных
watchEffect(() => {
  if (!faqSchemaItems.value.length)
    return
  useSchemaOrg([
    {
      '@type': 'FAQPage',
      'mainEntity': faqSchemaItems.value,
    },
  ])
})
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
            <ProductWishlistButton
              :product-id="product.id"
              :product-name="product.name"
              class="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg border bg-white hover:bg-muted transition-colors"
            />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <!-- Галерея -->
            <div class="lg:col-span-7">
              <div class="bg-white rounded-xl lg:p-4 lg:shadow-sm lg:border">
                <ProductGallery
                  v-if="
                    product.product_images && product.product_images.length > 0
                  "
                  :images="product.product_images"
                />
                <div
                  v-else
                  class="bg-muted rounded-lg flex items-center justify-center h-64 lg:h-96"
                >
                  <p class="text-muted-foreground">
                    Изображения отсутствуют
                  </p>
                </div>
              </div>
            </div>

            <!-- Правая колонка: Информация о товаре -->
            <div
              class="lg:col-span-5 lg:row-span-4 lg:row-start-1 lg:col-start-8"
            >
              <div
                class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border lg:sticky lg:top-4"
              >
                <h1
                  class="text-xl lg:text-2xl font-bold mb-2 leading-tight flex flex-col gap-1"
                >
                  <span>{{ product.name }}</span>
                  <!-- 🔥 ТИКЕТ 3: SEO-хвост для H1 (визуально выглядит как подзаголовок) -->
                  <span
                    v-if="audienceText || brandName"
                    class="text-sm font-medium text-muted-foreground/70"
                  >
                    Игрушка {{ audienceText }}
                    <template v-if="brandName">от {{ brandName }}</template>
                  </span>
                </h1>

                <!-- Бренд и линейка товара -->
                <div
                  v-if="brandName || productLineName"
                  class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4"
                >
                  <!-- Бренд -->
                  <NuxtLink
                    v-if="brandName && brandLink"
                    :to="brandLink"
                    class="inline-flex items-center gap-1.5 hover:text-primary transition-colors group"
                  >
                    <div
                      class="w-8 h-8 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0"
                    >
                      <ProgressiveImage
                        v-if="product.brands?.logo_url"
                        :src="brandLogoUrl"
                        :alt="brandName || 'Бренд'"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon v-else name="lucide:building-2" class="w-4 h-4" />
                    </div>
                    <span class="group-hover:underline">{{ brandName }}</span>
                  </NuxtLink>

                  <!-- Разделитель между брендом и линейкой -->
                  <span
                    v-if="brandName && productLineName"
                    class="text-muted-foreground/50"
                  >/</span>

                  <!-- Линейка -->
                  <NuxtLink
                    v-if="productLineName && productLineLink"
                    :to="productLineLink"
                    class="inline-flex items-center gap-1.5 hover:text-primary transition-colors group"
                  >
                    <div
                      class="w-8 h-8 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0"
                    >
                      <ProgressiveImage
                        v-if="product.product_lines?.logo_url"
                        :src="productLineLogoUrl"
                        :alt="productLineName || 'Линейка'"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon
                        v-else
                        name="lucide:sparkles"
                        class="w-4 h-4 text-primary/70"
                      />
                    </div>
                    <span class="group-hover:underline font-medium">{{
                      productLineName
                    }}</span>
                  </NuxtLink>
                  <span
                    v-else-if="productLineName"
                    class="inline-flex items-center gap-1.5"
                  >
                    <div
                      class="w-8 h-8 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0"
                    >
                      <ProgressiveImage
                        v-if="product.product_lines?.logo_url"
                        :src="productLineLogoUrl"
                        :alt="productLineName || 'Линейка'"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon
                        v-else
                        name="lucide:sparkles"
                        class="w-4 h-4 text-primary/70"
                      />
                    </div>
                    <span class="font-medium">{{ productLineName }}</span>
                  </span>
                </div>

                <div class="mb-6 lg:mb-8">
                  <!-- Лейбл: Цена / Итого за комплект -->
                  <p
                    class="text-xs font-medium text-muted-foreground mb-1 transition-all"
                  >
                    {{ hasAccessoriesSelected ? "Итого за комплект" : "Цена" }}
                  </p>

                  <!-- Старая цена (зачеркнутая) если есть скидка и нет аксессуаров -->
                  <div
                    v-if="
                      mainProductPrice.hasDiscount && !hasAccessoriesSelected
                    "
                    class="flex items-center gap-2 mb-1"
                  >
                    <span class="text-lg text-muted-foreground line-through">
                      {{ formatPrice(mainProductPrice.original) }} ₸
                    </span>
                    <Badge variant="destructive" class="text-xs">
                      -{{ product.discount_percentage }}%
                    </Badge>
                  </div>

                  <!-- Flip Counter Price Animation -->
                  <div class="flex items-baseline gap-1 mb-2">
                    <div
                      class="flex text-3xl lg:text-4xl font-bold text-primary"
                    >
                      <template
                        v-for="(item, index) in priceChars"
                        :key="index"
                      >
                        <!-- Space separator -->
                        <span v-if="item.char === ' '" class="w-2" />
                        <!-- Digit with flip animation -->
                        <div
                          v-else-if="item.isDigit"
                          :ref="
                            (el) => {
                              if (el)
                                digitColumns[item.digitIndex]
                                  = el as HTMLElement;
                            }
                          "
                          class="digit-column"
                        >
                          <div class="digit-ribbon">
                            <div v-for="d in 10" :key="d" class="digit-item">
                              {{ d - 1 }}
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>
                    <span
                      class="text-3xl lg:text-4xl font-bold text-primary ml-1"
                    >₸</span>
                  </div>

                  <div
                    class="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-sm font-medium"
                  >
                    <Icon name="lucide:gift" class="w-4 h-4" />
                    <span>+{{ totalBonuses }} бонусов</span>
                  </div>

                  <!-- Плашка-расшифровка комплекта -->
                  <div
                    v-if="hasAccessoriesSelected"
                    class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                  >
                    <span
                      class="text-muted-foreground font-medium truncate max-w-[180px]"
                    >{{ product.name }}</span>
                    <template
                      v-for="acc in selectedAccessoriesData"
                      :key="acc.id"
                    >
                      <span class="text-muted-foreground">+</span>
                      <span class="text-muted-foreground font-medium">{{
                        acc.name
                      }}</span>
                    </template>
                  </div>
                </div>

                <div class="mb-6 pb-6 border-b">
                  <div class="flex items-center gap-2 text-sm">
                    <Icon
                      :name="
                        product.stock_quantity > 0
                          ? 'lucide:check-circle'
                          : 'lucide:x-circle'
                      "
                      :class="
                        product.stock_quantity > 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      "
                      class="w-5 h-5"
                    />
                    <span
                      :class="
                        product.stock_quantity > 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      "
                      class="font-medium"
                    >
                      {{
                        product.stock_quantity > 0
                          ? "В наличии"
                          : "Нет в наличии"
                      }}
                    </span>
                    <span
                      v-if="product.stock_quantity > 0"
                      class="text-muted-foreground"
                    >
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
                        <Icon
                          name="lucide:shopping-cart"
                          class="w-5 h-5 mr-2"
                        />
                        Добавить в корзину
                      </Button>

                      <div v-else class="flex items-center gap-3">
                        <Button
                          size="lg"
                          class="grow h-12 text-base font-semibold"
                          @click="router.push('/cart')"
                        >
                          <Icon
                            name="lucide:shopping-bag"
                            class="w-5 h-5 mr-2"
                          />
                          Перейти в корзину
                        </Button>

                        <QuantitySelector
                          :product="product"
                          :quantity="quantityInCart"
                          class="w-auto"
                        />
                      </div>
                    </template>

                    <template v-else>
                      <StockAlertButton :product-id="product.id" />
                      <p class="text-sm text-muted-foreground text-center">
                        Нет в наличии
                      </p>
                    </template>

                    <Button
                      size="lg"
                      variant="outline"
                      class="w-full h-12 text-base"
                    >
                      <Icon name="mdi:heart-outline" class="w-5 h-5 mr-2" />
                      В избранное
                    </Button>
                  </div>
                </ClientOnly>

                <!-- Аксессуары (батарейки и подарочная упаковка) -->
                <AccessoriesBlock
                  v-model:selected-ids="selectedAccessoryIds"
                  :accessories="accessories || []"
                  :loading="accessoriesLoading"
                />
              </div>
            </div>

            <!-- О товаре (в стиле detmir.kz) -->
            <div
              class="lg:col-span-7 bg-white rounded-xl p-4 lg:p-6 shadow-sm border"
            >
              <h2 class="text-xl font-bold mb-4">
                О товаре
              </h2>

              <!-- Название товара -->
              <h3 class="font-semibold text-base mb-3">
                {{ product.name }}
              </h3>

              <!-- Краткое описание с возможностью раскрытия -->
              <ProductDescription
                :product="product"
                :is-expanded="isDescriptionExpanded"
                @toggle-expand="isDescriptionExpanded = !isDescriptionExpanded"
              />

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

                <!-- Линейка -->
                <div v-if="productLineName" class="product-spec-row">
                  <dt class="product-spec-label">
                    Линейка
                  </dt>
                  <dd class="product-spec-value">
                    <NuxtLink
                      v-if="productLineLink"
                      :to="productLineLink"
                      class="text-primary hover:underline"
                    >
                      {{ productLineName }}
                    </NuxtLink>
                    <span v-else>{{ productLineName }}</span>
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

                <!-- Количество деталей (только для категорий с атрибутом number_range) -->
                <div
                  v-if="hasPieceCountAttribute && product.piece_count"
                  class="product-spec-row"
                >
                  <dt class="product-spec-label">
                    Количество деталей
                  </dt>
                  <dd class="product-spec-value">
                    {{ product.piece_count }} шт
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
              class="lg:col-span-7 bg-white rounded-xl p-4 lg:p-6 shadow-sm border"
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
                  <div
                    class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0"
                  >
                    <ProgressiveImage
                      v-if="product.brands?.logo_url"
                      :src="brandLogoUrl"
                      :alt="brandName || 'Бренд'"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full p-1.5"
                    />
                    <Icon
                      v-else
                      name="lucide:building-2"
                      class="w-6 h-6 text-muted-foreground"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-base leading-tight">
                      {{ brandName }}
                    </p>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Бренд
                    </p>
                  </div>
                  <Icon
                    name="lucide:chevron-right"
                    class="w-5 h-5 text-primary shrink-0"
                  />
                </NuxtLink>

                <!-- Товары линейки -->
                <NuxtLink
                  v-if="productLineName && productLineLink"
                  :to="productLineLink"
                  class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
                >
                  <div
                    class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0"
                  >
                    <ProgressiveImage
                      v-if="product.product_lines?.logo_url"
                      :src="productLineLogoUrl"
                      :alt="productLineName || 'Линейка'"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full p-1.5"
                    />
                    <Icon
                      v-else
                      name="lucide:sparkles"
                      class="w-6 h-6 text-primary"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-base leading-tight">
                      {{ productLineName }}
                    </p>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Линейка {{ brandName }}
                    </p>
                  </div>
                  <Icon
                    name="lucide:chevron-right"
                    class="w-5 h-5 text-primary shrink-0"
                  />
                </NuxtLink>

                <!-- Товары категории -->
                <NuxtLink
                  v-if="categoryName && categoryLink"
                  :to="categoryLink"
                  class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
                >
                  <div
                    class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0"
                  >
                    <ProgressiveImage
                      v-if="fullCategory?.image_url"
                      :src="
                        getVariantUrl(
                          BUCKET_NAME_CATEGORY,
                          fullCategory.image_url,
                          'sm',
                        )
                      "
                      :alt="categoryName || 'Категория'"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full p-1.5"
                    />
                    <Icon
                      v-else
                      name="lucide:box"
                      class="w-6 h-6 text-muted-foreground"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-base leading-tight">
                      {{ categoryName }}
                    </p>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Категория
                    </p>
                  </div>
                  <Icon
                    name="lucide:chevron-right"
                    class="w-5 h-5 text-primary shrink-0"
                  />
                </NuxtLink>

                <!-- Родительские категории из breadcrumbs -->
                <NuxtLink
                  v-for="item in parentCategories"
                  :key="item.crumb.id"
                  :to="item.crumb.href!"
                  class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
                >
                  <div
                    class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0"
                  >
                    <ProgressiveImage
                      v-if="item.category?.image_url"
                      :src="
                        getVariantUrl(
                          BUCKET_NAME_CATEGORY,
                          item.category.image_url,
                          'sm',
                        )
                      "
                      :alt="item.crumb.name"
                      aspect-ratio="square"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="w-full h-full p-1.5"
                    />
                    <Icon
                      v-else
                      name="lucide:layers"
                      class="w-6 h-6 text-muted-foreground"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-base leading-tight">
                      {{ item.crumb.name }}
                    </p>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Категория
                    </p>
                  </div>
                  <Icon
                    name="lucide:chevron-right"
                    class="w-5 h-5 text-primary shrink-0"
                  />
                </NuxtLink>
              </div>
            </div>
            <!-- Отзывы -->
            <div class="lg:col-span-7">
              <ProductReviews
                v-if="product.id"
                :product-id="product.id"
                :avg-rating="product.avg_rating ?? 0"
                :review-count="product.review_count ?? 0"
              />
            </div>
            <!-- Вопросы и ответы -->
            <div class="lg:col-span-7">
              <ProductQuestions v-if="product.id" :product-id="product.id" />
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
          <NuxtLink
            to="/catalog"
            class="inline-block mt-4 text-primary hover:underline"
          >
            ← Вернуться в каталог
          </NuxtLink>
        </div>

        <template #fallback>
          <ProductDetailSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!-- 🎯 Sticky панель для мобильных -->
    <ClientOnly>
      <div
        v-if="product"
        class="lg:hidden fixed left-4 right-4 z-40 product-sticky-bar"
        :class="isNavVisible ? 'sticky-above-nav' : 'sticky-at-bottom'"
      >
        <!-- Если товар НЕ в корзине - показываем цену + кнопку -->
        <div v-if="!mainItemInCart" class="px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col gap-0.5">
              <div
                v-if="mainProductPrice.hasDiscount && !hasAccessoriesSelected"
                class="flex items-center gap-1.5"
              >
                <span class="text-xs text-muted-foreground line-through">
                  {{ formatPrice(mainProductPrice.original) }} ₸
                </span>
                <Badge variant="destructive" class="text-[10px] px-1 py-0 h-4">
                  -{{ product.discount_percentage }}%
                </Badge>
              </div>
              <span
                v-if="hasAccessoriesSelected"
                class="text-[10px] text-muted-foreground leading-none"
              >Итого за комплект</span>
              <div class="flex items-baseline gap-0.5">
                <span class="text-2xl font-bold leading-none">
                  {{ formatPrice(totalPrice) }}
                </span>
                <span class="text-xl font-bold">₸</span>
              </div>
            </div>

            <Button
              v-if="product.stock_quantity > 0"
              size="sm"
              class="h-9 text-sm font-semibold px-4"
              @click="addToCart"
            >
              <Icon name="lucide:shopping-cart" class="w-4 h-4 mr-1.5" />
              В корзину
            </Button>

            <Button v-else size="sm" class="h-9 text-sm px-4" disabled>
              Нет в наличии
            </Button>
          </div>
        </div>

        <!-- Если товар УЖЕ в корзине - показываем кнопку перехода + селектор количества -->
        <div v-else class="px-4 py-3">
          <div class="flex items-center gap-3">
            <Button
              size="sm"
              class="h-9 text-sm font-semibold px-4"
              @click="router.push('/cart')"
            >
              <Icon name="lucide:shopping-bag" class="w-4 h-4 mr-1.5" />
              В корзине ({{ quantityInCart }})
            </Button>
            <QuantitySelector
              :product="product"
              :quantity="quantityInCart"
              class="shrink-0"
            />
          </div>
        </div>
      </div>
    </ClientOnly>

    <!-- ✅ Похожие товары с независимой загрузкой -->
    <div
      v-if="
        similarProductsLoading
          || (similarProducts && similarProducts.length > 0)
      "
      class="bg-gray-50 py-8 lg:py-12 mt-8 lg:mt-12"
    >
      <!-- Скелетон для похожих товаров -->
      <div v-if="similarProductsLoading" :class="`${containerClass}`">
        <h2 class="text-2xl lg:text-3xl font-bold mb-6">
          Похожие товары
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="i in 4"
            :key="i"
            class="bg-white rounded-xl p-4 animate-pulse"
          >
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

/* Sticky panel: glass card */
.product-sticky-bar {
  /* Базовая позиция — у нижнего края (когда навбар скрыт) */
  bottom: calc(16px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  /* transform анимируется плавно (GPU) в отличие от bottom+env() */
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

/* Навбар виден — поднимаем панель на высоту навбара (84px - 16px = 68px) */
.sticky-above-nav {
  transform: translateY(-68px);
}

/* Навбар скрылся — панель на базовой позиции */
.sticky-at-bottom {
  transform: translateY(0);
}
</style>

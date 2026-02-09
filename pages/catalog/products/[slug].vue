<script setup lang="ts">
import type { AttributeWithValue, IBreadcrumbItem, ProductImageRow, ProductWithImages } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import Breadcrumbs from '@/components/global/Breadcrumbs.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductQuestionsStore } from '@/stores/publicStore/productQuestionsStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { formatPrice, formatPriceWithDiscount } from '@/utils/formatPrice'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const questionsStore = useProductQuestionsStore()
const queryClient = useQueryClient()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl } = useSupabaseStorage()

const slug = computed(() => route.params.slug as string)

// Selected accessories for adding to cart together with main product
const selectedAccessoryIds = ref<string[]>([])

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

// ✅ 5. Вопросы и ответы
const { data: productQuestions } = useQuery({
  queryKey: ['product-questions', computed(() => product.value?.id)],
  queryFn: async () => {
    if (!product.value?.id)
      return []
    return await questionsStore.fetchQuestions(product.value.id)
  },
  enabled: computed(() => !!product.value?.id),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

// FAQPage schema — только вопросы с ответами
const faqSchemaItems = computed(() => {
  if (!productQuestions.value)
    return []
  return productQuestions.value
    .filter(q => q.answer_text)
    .map(q => ({
      '@type': 'Question',
      'name': q.question_text,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': q.answer_text,
      },
    }))
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

// Финальная цена основного товара с учетом скидки
const mainProductPrice = computed(() => {
  if (!product.value)
    return { final: 0, original: 0, hasDiscount: false }
  const priceData = formatPriceWithDiscount(
    Number(product.value.price),
    product.value.discount_percentage,
  )
  return {
    final: priceData.finalNumber,
    original: Number(product.value.price),
    hasDiscount: priceData.hasDiscount,
  }
})

const totalPrice = computed(() => {
  if (!product.value)
    return 0
  // Используем финальную цену со скидкой для основного товара
  let total = mainProductPrice.value.final

  // Добавляем цены выбранных аксессуаров с учетом их скидок
  const selected = (accessories.value || []).filter((acc: ProductWithImages) => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    const accPrice = formatPriceWithDiscount(
      Number(acc.price),
      acc.discount_percentage,
    )
    total += accPrice.finalNumber
  }
  return total
})

const totalBonuses = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.bonus_points_award || 0)
  const selected = (accessories.value || []).filter((acc: ProductWithImages) => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.bonus_points_award || 0)
  }
  return total
})

// For flip animation: map formatted price chars to digit indices
const priceChars = computed(() => {
  const formatted = formatPrice(totalPrice.value)
  let digitIndex = 0
  return formatted.split('').map((char) => {
    const isDigit = !Number.isNaN(Number(char)) && char !== ' '
    const result = {
      char,
      isDigit,
      digitIndex: isDigit ? digitIndex : -1,
    }
    if (isDigit)
      digitIndex++
    return result
  })
})

const mainItemInCart = computed(() => {
  if (!product.value)
    return undefined
  return cartStore.items.find(item => item.product.id === product.value?.id)
})

const quantityInCart = computed(() => {
  return mainItemInCart.value ? mainItemInCart.value.quantity : 0
})

async function addToCart() {
  if (!product.value)
    return

  let addedCount = 0

  // Add main product if not in cart
  if (!mainItemInCart.value) {
    await cartStore.addItem(product.value, 1)
    addedCount++
  }

  // Add selected accessories to cart
  const selectedAccessories = (accessories.value || []).filter((acc: ProductWithImages) =>
    selectedAccessoryIds.value.includes(acc.id),
  )

  for (const acc of selectedAccessories) {
    const accInCart = cartStore.items.find(item => item.product.id === acc.id)
    if (!accInCart) {
      await cartStore.addItem(acc, 1)
      addedCount++
    }
  }

  // Show success message only if we added something
  if (addedCount > 0) {
    if (addedCount === 1) {
      toast.success('Товар добавлен в корзину')
    }
    else {
      toast.success(`${addedCount} товара добавлено в корзину`)
    }
  }
  else if (selectedAccessories.length > 0) {
    // If we selected accessories but they were already in cart
    toast.info('Выбранные товары уже в корзине')
  }
}

useFlipCounter(totalPrice, digitColumns)

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

  // Приоритет: meta_title > seo_title > автогенерация
  if (product.value.meta_title) {
    return product.value.meta_title
  }
  if (product.value.seo_title) {
    return product.value.seo_title
  }

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

  // Приоритет: meta_description > seo_description > автогенерация
  if (product.value.meta_description) {
    return product.value.meta_description
  }
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

// Получаем полные данные категории из store (как в catalog/[...slug].vue)
const fullCategory = computed(() => {
  if (!categorySlug.value || !categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(c => c.slug === categorySlug.value)
})

// Получаем родительские категории с полными данными из store
const parentCategories = computed(() => {
  if (!categoriesStore.allCategories.length)
    return []

  return breadcrumbs.value
    .slice(0, -1) // Убираем последний элемент (товар)
    .filter(crumb => crumb.href && crumb.name !== categoryName.value) // Убираем текущую категорию
    .map(crumb => {
      // Берем только последнюю часть пути (slug категории)
      // Например: /catalog/boys/mashinki -> mashinki
      const slug = crumb.href?.split('/').pop()
      const category = categoriesStore.allCategories.find(c => c.slug === slug)

      return {
        crumb,
        category,
      }
    })
    .filter(item => item.category) // Оставляем только найденные категории
})

// Загружаем атрибуты категории чтобы проверить есть ли number_range
const categoryAttributes = ref<AttributeWithValue[]>([])

watch(() => categorySlug.value, async (newSlug) => {
  if (newSlug) {
    categoryAttributes.value = await productsStore.fetchAttributesForCategory(newSlug)
  }
}, { immediate: true })

// Проверяем есть ли у категории товара атрибут "Количество деталей" (number_range)
const hasPieceCountAttribute = computed(() => {
  return categoryAttributes.value.some(attr => attr.display_type === 'number_range')
})

// Типизация для product_lines (расширяем базовый тип)
interface ProductWithProductLine {
  product_lines?: { name: string, slug: string } | null
}

const brandName = computed(() => product.value?.brands?.name)
const brandSlug = computed(() => product.value?.brands?.slug)
const productLineName = computed(() => (product.value as ProductWithProductLine | null)?.product_lines?.name)
const productLineSlug = computed(() => (product.value as ProductWithProductLine | null)?.product_lines?.slug)

// Ссылка на страницу линейки (если будет создана)
const productLineLink = computed(() => {
  if (!productLineSlug.value || !brandSlug.value)
    return null
  return `/brand/${brandSlug.value}/${productLineSlug.value}`
})

const metaKeywords = computed(() => {
  const keywords: string[] = []

  // Пользовательские ключевые слова (приоритет: meta_keywords > seo_keywords)
  if (product.value?.meta_keywords?.length) {
    keywords.push(...product.value.meta_keywords)
  }
  else if (product.value?.seo_keywords?.length) {
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

    // Линейка продуктов (Barbie, Hot Wheels и т.д.)
    if (productLineName.value) {
      keywords.push(productLineName.value)
      // Комбинация бренд + линейка для поиска
      if (brandName.value) {
        keywords.push(`${brandName.value} ${productLineName.value}`)
      }
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
  const logoUrl = product.value?.brands?.logo_url
  if (!logoUrl)
    return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
})

// URL логотипа линейки
const productLineLogoUrl = computed(() => {
  const logoUrl = product.value?.product_lines?.logo_url
  if (!logoUrl)
    return null
  return getImageUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, IMAGE_SIZES.PRODUCT_LINE_LOGO)
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

// Динамические атрибуты товара для Schema.org additionalProperty
const schemaAdditionalProperties = computed(() => {
  const pavs = product.value?.product_attribute_values
  if (!pavs?.length)
    return []

  const grouped = new Map<string, string[]>()

  for (const pav of pavs) {
    const attrName = pav.attributes?.name
    if (!attrName)
      continue

    const option = pav.attributes?.attribute_options?.find(o => o.id === pav.option_id)
    const optionValue = option?.value
    if (!optionValue)
      continue

    if (!grouped.has(attrName)) {
      grouped.set(attrName, [])
    }
    grouped.get(attrName)!.push(String(optionValue))
  }

  return Array.from(grouped.entries()).map(([name, values]) => ({
    '@type': 'PropertyValue',
    'name': name,
    'value': values.join(', '),
  }))
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

  return product.value.product_images.map((img: ProductImageRow) =>
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
  robots: computed(() => robotsRule.value.noindex ? 'noindex, follow' : 'index, follow'),
})

useHead(() => ({
  meta: [
    { name: 'keywords', content: metaKeywords.value || '' },
    { property: 'og:type', content: 'product' },
    { property: 'product:price:amount', content: String(product.value?.price || 0) },
    { property: 'product:price:currency', content: 'KZT' },
    { property: 'product:availability', content: (product.value?.stock_quantity || 0) > 0 ? 'in stock' : 'out of stock' },
    { property: 'product:brand', content: brandName.value || '' },
    // Линейка продуктов (Barbie, Hot Wheels)
    ...(productLineName.value ? [{ property: 'product:product_line', content: productLineName.value }] : []),
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
          // Для последнего элемента используем canonicalUrl, для остальных - crumb.href
          'item': crumb.href ? `https://uhti.kz${crumb.href}` : canonicalUrl.value,
        })),
      }),
    },
    // 2. FAQPage Schema (вопросы с ответами)
    ...(faqSchemaItems.value.length > 0
      ? [{
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': faqSchemaItems.value,
          }),
        }]
      : []),
    // 3. Product Schema
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': metaTitle.value,
        'description': metaDescription.value,
        'image': productImages.value,
        'sku': product.value?.sku || undefined,
        // TODO: Добавить GTIN (штрих-код) когда появится в БД
        // 'gtin13': product.value?.gtin || undefined,
        // TODO: Добавить MPN (номер производителя) когда появится
        // 'mpn': product.value?.mpn || undefined,
        // 🔥 Если есть линейка - показываем её как бренд с parentOrganization
        // Это позволяет Google понять иерархию: Mattel → Barbie → Товар
        'brand': productLineName.value
          ? {
              '@type': 'Brand',
              '@id': `https://uhti.kz${productLineLink.value}#brand`,
              'name': productLineName.value,
              'url': `https://uhti.kz${productLineLink.value}`,
              // Родительский бренд (Mattel для Barbie)
              'parentOrganization': {
                '@type': 'Brand',
                '@id': `https://uhti.kz${brandLink.value}#brand`,
                'name': brandName.value,
                ...(brandLink.value && {
                  url: `https://uhti.kz${brandLink.value}`,
                }),
              },
            }
          : {
              '@type': 'Brand',
              'name': brandName.value || 'Ухтышка',
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
          'priceValidUntil': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +30 дней
          'itemCondition': 'https://schema.org/NewCondition',
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
        // Динамические атрибуты (размер, цвет и т.д.)
        ...(schemaAdditionalProperties.value.length > 0 && {
          additionalProperty: schemaAdditionalProperties.value,
        }),
        // TODO: Добавить когда появится система отзывов
        // 'aggregateRating': {
        //   '@type': 'AggregateRating',
        //   'ratingValue': '4.5',
        //   'reviewCount': '24',
        //   'bestRating': '5',
        //   'worstRating': '1',
        // },
        // 'review': [
        //   {
        //     '@type': 'Review',
        //     'author': { '@type': 'Person', 'name': 'Имя автора' },
        //     'datePublished': '2026-01-15',
        //     'reviewBody': 'Текст отзыва...',
        //     'reviewRating': {
        //       '@type': 'Rating',
        //       'ratingValue': '5',
        //       'bestRating': '5',
        //       'worstRating': '1',
        //     },
        //   },
        // ],
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
              <div
                class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border lg:sticky lg:top-4"
              >
                <h1 class="text-xl lg:text-2xl font-bold mb-2 leading-tight">
                  {{ product.name }}
                </h1>

                <!-- 🔥 Бренд и линейка товара -->
                <div v-if="brandName || productLineName" class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4">
                  <!-- Бренд -->
                  <NuxtLink
                    v-if="brandName && brandLink"
                    :to="brandLink"
                    class="inline-flex items-center gap-1.5 hover:text-primary transition-colors group"
                  >
                    <div class="w-5 h-5 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0">
                      <ProgressiveImage
                        v-if="product.brands?.logo_url"
                        :src="brandLogoUrl"
                        :alt="brandName || 'Бренд'"
                        :bucket-name="BUCKET_NAME_BRANDS"
                        :file-path="product.brands.logo_url || undefined"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon v-else name="lucide:building-2" class="w-3 h-3" />
                    </div>
                    <span class="group-hover:underline">{{ brandName }}</span>
                  </NuxtLink>

                  <!-- Разделитель между брендом и линейкой -->
                  <span v-if="brandName && productLineName" class="text-muted-foreground/50">/</span>

                  <!-- Линейка -->
                  <NuxtLink
                    v-if="productLineName && productLineLink"
                    :to="productLineLink"
                    class="inline-flex items-center gap-1.5 hover:text-primary transition-colors group"
                  >
                    <div class="w-5 h-5 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0">
                      <ProgressiveImage
                        v-if="product.product_lines?.logo_url"
                        :src="productLineLogoUrl"
                        :alt="productLineName || 'Линейка'"
                        :bucket-name="BUCKET_NAME_PRODUCT_LINES"
                        :file-path="product.product_lines!.logo_url || undefined"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon v-else name="lucide:sparkles" class="w-3 h-3 text-primary/70" />
                    </div>
                    <span class="group-hover:underline font-medium">{{ productLineName }}</span>
                  </NuxtLink>
                  <span v-else-if="productLineName" class="inline-flex items-center gap-1.5">
                    <div class="w-5 h-5 rounded bg-white border overflow-hidden flex items-center justify-center shrink-0">
                      <ProgressiveImage
                        v-if="product.product_lines?.logo_url"
                        :src="productLineLogoUrl"
                        :alt="productLineName || 'Линейка'"
                        :bucket-name="BUCKET_NAME_PRODUCT_LINES"
                        :file-path="product.product_lines!.logo_url || undefined"
                        aspect-ratio="square"
                        object-fit="contain"
                        placeholder-type="shimmer"
                        class="w-full h-full"
                      />
                      <Icon v-else name="lucide:sparkles" class="w-3 h-3 text-primary/70" />
                    </div>
                    <span class="font-medium">{{ productLineName }}</span>
                  </span>
                </div>

                <div class="mb-6 lg:mb-8">
                  <!-- Старая цена (зачеркнутая) если есть скидка -->
                  <div v-if="mainProductPrice.hasDiscount" class="flex items-center gap-2 mb-1">
                    <span class="text-lg text-muted-foreground line-through">
                      {{ formatPrice(mainProductPrice.original) }} ₸
                    </span>
                    <Badge variant="destructive" class="text-xs">
                      -{{ product.discount_percentage }}%
                    </Badge>
                  </div>

                  <!-- Flip Counter Price Animation -->
                  <div class="flex items-baseline gap-1 mb-2">
                    <div class="flex text-3xl lg:text-4xl font-bold text-primary">
                      <template v-for="(item, index) in priceChars" :key="index">
                        <!-- Space separator -->
                        <span v-if="item.char === ' '" class="w-2" />
                        <!-- Digit with flip animation -->
                        <div
                          v-else-if="item.isDigit"
                          :ref="el => { if (el) digitColumns[item.digitIndex] = el as HTMLElement }"
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
                    <span class="text-3xl lg:text-4xl font-bold text-primary ml-1">₸</span>
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
                          class="grow h-12 text-base font-semibold"
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

                <!-- Аксессуары (батарейки и подарочная упаковка) -->
                <AccessoriesBlock
                  v-model:selected-ids="selectedAccessoryIds"
                  :accessories="accessories || []"
                  :loading="accessoriesLoading"
                />
              </div>
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
                {{ isDescriptionExpanded ? product.description.replace(/<[^>]*>/g, '') : product.description.replace(/<[^>]*>/g, '').substring(0, 200) + (product.description.length > 200 ? '...' : '') }}
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
              <div v-if="hasPieceCountAttribute && product.piece_count" class="product-spec-row">
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
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0">
                  <ProgressiveImage
                    v-if="product.brands?.logo_url"
                    :src="brandLogoUrl"
                    :alt="brandName || 'Бренд'"
                    :bucket-name="BUCKET_NAME_BRANDS"
                    :file-path="product.brands.logo_url || undefined"
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
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary shrink-0" />
              </NuxtLink>

              <!-- Товары линейки -->
              <NuxtLink
                v-if="productLineName && productLineLink"
                :to="productLineLink"
                class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
              >
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0">
                  <ProgressiveImage
                    v-if="product.product_lines?.logo_url"
                    :src="productLineLogoUrl"
                    :alt="productLineName || 'Линейка'"
                    :bucket-name="BUCKET_NAME_PRODUCT_LINES"
                    :file-path="product.product_lines!.logo_url || undefined"
                    aspect-ratio="square"
                    object-fit="contain"
                    placeholder-type="shimmer"
                    class="w-full h-full p-1.5"
                  />
                  <Icon v-else name="lucide:sparkles" class="w-6 h-6 text-primary" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-base leading-tight">
                    {{ productLineName }}
                  </p>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    Линейка {{ brandName }}
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary shrink-0" />
              </NuxtLink>

              <!-- Товары категории -->
              <NuxtLink
                v-if="categoryName && categoryLink"
                :to="categoryLink"
                class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
              >
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0">
                  <ProgressiveImage
                    v-if="fullCategory?.image_url"
                    :src="getImageUrl(BUCKET_NAME_CATEGORY, fullCategory.image_url, IMAGE_SIZES.CATEGORY_IMAGE)"
                    :alt="categoryName || 'Категория'"
                    :bucket-name="BUCKET_NAME_CATEGORY"
                    :file-path="fullCategory.image_url || undefined"
                    aspect-ratio="square"
                    object-fit="contain"
                    placeholder-type="shimmer"
                    class="w-full h-full p-1.5"
                  />
                  <Icon v-else name="lucide:box" class="w-6 h-6 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-base leading-tight">
                    {{ categoryName }}
                  </p>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    Категория
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary shrink-0" />
              </NuxtLink>

              <!-- Родительские категории из breadcrumbs -->
              <NuxtLink
                v-for="item in parentCategories"
                :key="item.crumb.id"
                :to="item.crumb.href!"
                class="flex items-center gap-3 py-4 hover:bg-muted/20 transition-colors group px-2 -mx-2 rounded-lg"
              >
                <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0">
                  <ProgressiveImage
                    v-if="item.category?.image_url"
                    :src="getImageUrl(BUCKET_NAME_CATEGORY, item.category.image_url, IMAGE_SIZES.CATEGORY_IMAGE)"
                    :alt="item.crumb.name"
                    :bucket-name="BUCKET_NAME_CATEGORY"
                    :file-path="item.category.image_url || undefined"
                    aspect-ratio="square"
                    object-fit="contain"
                    placeholder-type="shimmer"
                    class="w-full h-full p-1.5"
                  />
                  <Icon v-else name="lucide:layers" class="w-6 h-6 text-muted-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-base leading-tight">
                    {{ item.crumb.name }}
                  </p>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    Категория
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-primary shrink-0" />
              </NuxtLink>
            </div>
          </div>
          <!-- Вопросы и ответы -->
          <ProductQuestions v-if="product.id" :product-id="product.id" />
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

    <!-- 🎯 Sticky панель для мобильных (компактная версия) -->
    <ClientOnly>
      <div
        v-if="product"
        class="lg:hidden fixed bottom-16 left-0 right-0 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.1)] z-40"
      >
        <!-- Если товар НЕ в корзине - показываем цену + кнопку -->
        <div v-if="!mainItemInCart" class="px-3 py-2">
          <div class="flex items-center justify-between gap-3">
            <!-- Блок цены -->
            <div class="flex flex-col gap-0.5">
              <!-- Старая цена + скидка (если есть) -->
              <div v-if="mainProductPrice.hasDiscount" class="flex items-center gap-1.5">
                <span class="text-xs text-muted-foreground line-through">
                  {{ formatPrice(mainProductPrice.original) }} ₸
                </span>
                <Badge variant="destructive" class="text-[10px] px-1 py-0 h-4">
                  -{{ product.discount_percentage }}%
                </Badge>
              </div>

              <!-- Текущая цена (компактно) -->
              <div class="flex items-baseline gap-0.5">
                <span class="text-2xl font-bold leading-none">
                  {{ formatPrice(mainProductPrice.final) }}
                </span>
                <span class="text-xl font-bold">₸</span>
              </div>
            </div>

            <!-- Кнопка в корзину -->
            <Button
              v-if="product.stock_quantity > 0"
              size="sm"
              class="h-9 text-sm font-semibold px-4"
              @click="addToCart"
            >
              <Icon name="lucide:shopping-cart" class="w-4 h-4 mr-1.5" />
              В корзину
            </Button>

            <Button
              v-else
              size="sm"
              class="h-9 text-sm px-4"
              disabled
            >
              Нет в наличии
            </Button>
          </div>
        </div>

        <!-- Если товар УЖЕ в корзине - показываем кнопку перехода + селектор количества -->
        <div v-else class="px-3 py-2">
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
      v-if="similarProductsLoading || (similarProducts && similarProducts.length > 0)"
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

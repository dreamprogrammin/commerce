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
import SEOContentRenderer from '@/components/product/SEOContentRenderer.vue'
import StockAlertButton from '@/components/product/StockAlertButton.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBreadcrumbSchema } from '@/composables/useBreadcrumbSchema'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { useSeoAltText } from '@/composables/useSeoAltText'
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
import { parseHTMLToBlocks } from '@/utils/parseSEOContent'

definePageMeta({ layout: 'product-detail' })

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const questionsStore = useProductQuestionsStore()
const reviewsStore = useReviewsStore()
const queryClient = useQueryClient()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getVariantUrl } = useSupabaseStorage()
const { trackViewItem } = useEcommerceTracking()
const { generateBrandLogoAlt } = useSeoAltText()

const priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0]

const slug = computed(() => route.params.slug as string)

const selectedAccessoryIds = ref<string[]>([])
const isDescriptionExpanded = ref(false)

// 🔥 SSR: загружаем категории и продукт через useAsyncData
await useAsyncData('product-categories', async () => {
  if (!categoriesStore.allCategories.length) {
    await categoriesStore.fetchCategoryData()
  }
  return true
})

const { data: product } = await useAsyncData(`product-${slug.value}`, async () => {
  const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)
  if (!fetchedProduct) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Товар не найден',
      fatal: true,
    })
  }
  return fetchedProduct
})

const isProductLoading = ref(false)

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

// 🎨 Color variants
const { data: colorVariants } = await useAsyncData(
  `color-variants-${slug.value}`,
  async () => {
    if (!product.value?.model_group_id)
      return []

    const supabase = useSupabaseClient()
    const { data } = await supabase
      .from('products')
      .select(`
        slug,
        stock_quantity,
        id,
        product_images!inner(image_url, blur_placeholder, display_order)
      `)
      .eq('model_group_id', product.value.model_group_id)
      .eq('is_active', true)
      .not('id', 'eq', product.value.id)
      .order('display_order', { referencedTable: 'product_images', ascending: true })

    // Оставляем только первое изображение для каждого товара
    return data?.map(item => ({
      id: item.id,
      slug: item.slug,
      stock_quantity: item.stock_quantity,
      image_url: item.product_images[0]?.image_url || null,
      blur_placeholder: item.product_images[0]?.blur_placeholder || null,
    })) || []
  },
  {
    watch: [() => product.value?.model_group_id],
    server: true,
  },
)

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

/**
 * Разбор отформатированной цены на «барабаны» для флип-счётчика:
 * цифры получают сквозной индекс (по нему useFlipCounter находит колонку),
 * пробелы-разделители тысяч рендерятся отдельным распоркой.
 */
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

function incQuantity() {
  if (!product.value)
    return
  const next = quantityInCart.value + 1
  if (product.value.stock_quantity && next > product.value.stock_quantity)
    return
  cartStore.updateQuantity(product.value.id, next)
}

function decQuantity() {
  if (!product.value)
    return
  // updateQuantity сам удаляет позицию из корзины при quantity <= 0
  cartStore.updateQuantity(product.value.id, quantityInCart.value - 1)
}

useFlipCounter(totalPrice, digitColumns)

// Панель покупки «едет» вниз ровно тогда, когда прячется MobileBottomNav,
// поэтому пороги здесь обязаны совпадать с его собственными
// (components/global/MobileBottomNav.vue) — иначе панель зависает в воздухе.
const isNavVisible = ref(true)
let stickyLastScrollY = 0
let stickyTicking = false

function applyStickyScroll() {
  stickyTicking = false
  const y = window.scrollY
  const dy = y - stickyLastScrollY
  if (dy > 6 && y > 280)
    isNavVisible.value = false
  else if (dy < -6 || y < 120)
    isNavVisible.value = true
  stickyLastScrollY = y
}

function handleStickyScroll() {
  if (!stickyTicking) {
    stickyTicking = true
    requestAnimationFrame(applyStickyScroll)
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleStickyScroll, { passive: true })

  if (product.value) {
    trackViewItem({
      id: product.value.id,
      name: product.value.name,
      price: mainProductPrice.value.final,
      category: product.value.categories?.name,
    })
  }
})
onUnmounted(() => window.removeEventListener('scroll', handleStickyScroll))

watch(
  () => product.value?.id,
  () => {
    selectedAccessoryIds.value = []
    // Колонки флип-счётчика пересобираются под новую цену — иначе в массиве
    // останутся отвязанные узлы от прошлого товара
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

const { isWishlisted, toggleWishlist } = useProductWishlist(
  () => product.value?.id,
  () => product.value?.name,
)

const mainThumbUrl = computed(() => {
  const image = product.value?.product_images?.[0]
  return image ? getVariantUrl(BUCKET_NAME_PRODUCT, image.image_url, 'sm') : null
})

const questionsCount = computed(() => productQuestions.value?.length ?? 0)

function pluralize(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return few
  return many
}

const reviewCountLabel = computed(() => {
  const count = product.value?.review_count ?? 0
  return `${count} ${pluralize(count, 'отзыв', 'отзыва', 'отзывов')}`
})

const questionsCountLabel = computed(() =>
  pluralize(questionsCount.value, 'вопрос', 'вопроса', 'вопросов'),
)

/** Способы получения и преимущества — статика магазина, единая для всех товаров. */
const PICKUP_ROWS = [
  { icon: 'lucide:store', title: 'Забрать в магазине', sub: 'Алматы — сегодня, бесплатно' },
  { icon: 'lucide:truck', title: 'Курьером по Алматы', sub: '1–2 дня, при заказе до 14:00 — отправка в тот же день' },
  { icon: 'lucide:package', title: 'По Казахстану', sub: '3–7 дней, Kazpost или CDEK' },
]

const PERKS = [
  { icon: 'lucide:truck', text: 'Доставка 1–2 дня по Алматы' },
  { icon: 'lucide:shield-check', text: 'Гарантия и возврат 14 дней' },
  { icon: 'lucide:wallet', text: 'Оплата при получении' },
  { icon: 'lucide:coins', text: 'Кэшбэк бонусами до 10%' },
]

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

  // Если есть ручной meta_title — используем его
  if (product.value.meta_title)
    return product.value.meta_title
  if (product.value.seo_title)
    return product.value.seo_title

  // Генерируем умный title: [Товар] [свойство] — от [цена] ₸ | Uhti.kz
  const parts = []

  // 1. Название товара
  let name = product.value.name

  // 2. Добавляем ключевое свойство (материал)
  if (product.value.materials?.name) {
    name += ` ${product.value.materials.name.toLowerCase()}`
  }

  parts.push(name)

  // 3. Цена
  const price = product.value.final_price || product.value.price
  parts.push(`от ${formatPrice(price)} ₸`)

  // 4. Бренд
  parts.push('Uhti.kz')

  return parts.join(' — ')
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

  // Если есть ручной meta_description — используем его
  if (product.value.meta_description)
    return product.value.meta_description
  if (product.value.seo_description)
    return product.value.seo_description

  // Генерируем умное description: [Товар] [польза]. [Преимущество]. ⭐ [рейтинг]. [Доставка]. От [цена] ₸
  const parts = []

  // 1. Название + аудитория
  if (audienceText.value) {
    parts.push(`${product.value.name} ${audienceText.value}`)
  }
  else {
    parts.push(product.value.name)
  }

  // 2. Социальное доказательство (рейтинг)
  if (product.value.review_count > 0) {
    parts.push(`⭐ ${product.value.avg_rating?.toFixed(1)} (${product.value.review_count} ${product.value.review_count === 1 ? 'отзыв' : product.value.review_count < 5 ? 'отзыва' : 'отзывов'})`)
  }

  // 3. Наличие
  if (product.value.stock_quantity > 0) {
    parts.push('В наличии')
  }

  // 4. Доставка
  parts.push('Доставка по Алматы за 1 день')

  // 5. Цена
  const price = product.value.final_price || product.value.price
  parts.push(`От ${formatPrice(price)} ₸`)

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

/**
 * «Ещё в этих категориях» — бренд, линейка, категория товара и её родители
 * одним однородным списком строк-ссылок (в макете это один список карточек,
 * а не четыре отдельных блока, как было раньше).
 */
const moreCategories = computed(() => {
  const rows: Array<{
    key: string
    to: string
    title: string
    subtitle: string
    image: string | null
    icon: string
  }> = []

  if (brandName.value && brandLink.value) {
    rows.push({
      key: `brand-${brandSlug.value}`,
      to: brandLink.value,
      title: brandName.value,
      subtitle: 'Все товары бренда',
      image: brandLogoUrl.value,
      icon: 'lucide:building-2',
    })
  }

  if (productLineName.value && productLineLink.value) {
    rows.push({
      key: `line-${productLineSlug.value}`,
      to: productLineLink.value,
      title: productLineName.value,
      subtitle: brandName.value ? `Линейка ${brandName.value}` : 'Линейка',
      image: productLineLogoUrl.value,
      icon: 'lucide:sparkles',
    })
  }

  if (categoryName.value && categoryLink.value) {
    rows.push({
      key: `category-${categorySlug.value}`,
      to: categoryLink.value,
      title: categoryName.value,
      subtitle: 'Категория',
      image: fullCategory.value?.image_url
        ? getVariantUrl(BUCKET_NAME_CATEGORY, fullCategory.value.image_url, 'sm')
        : null,
      icon: 'lucide:box',
    })
  }

  for (const item of parentCategories.value) {
    rows.push({
      key: `parent-${item.crumb.id}`,
      to: item.crumb.href!,
      title: item.crumb.name,
      subtitle: 'Категория',
      image: item.category?.image_url
        ? getVariantUrl(BUCKET_NAME_CATEGORY, item.category.image_url, 'sm')
        : null,
      icon: 'lucide:layers',
    })
  }

  return rows
})

/**
 * «Похожие товары» — сетка, а не карусель (как в макете).
 * 12 штук, чтобы сетка заполнялась целыми рядами на 2 (моб.) / 4 (lg) / 6 (2xl)
 * колонок; на xl (5 колонок) последний ряд остаётся неполным — это нормально.
 */
const similarGridProducts = computed(() =>
  (similarProducts.value || []).slice(0, 12),
)

const schemaAdditionalProperties = computed(() => {
  const properties: Array<{ '@type': 'PropertyValue', 'name': string, 'value': string }> = []

  const pavs = product.value?.product_attribute_values
  if (pavs?.length) {
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
    for (const [name, values] of grouped.entries()) {
      properties.push({ '@type': 'PropertyValue', 'name': name, 'value': values.join(', ') })
    }
  }

  // Бонусные баллы программы лояльности — реальный, не выдуманный сигнал
  // (см. SEO-аудит, находка S-5): additionalProperty вместо MemberProgram,
  // т.к. поддержка MemberProgram у Google для нерозничных программ лояльности
  // всё ещё непоследовательна.
  const bonusPoints = Number(product.value?.bonus_points_award || 0)
  if (bonusPoints > 0) {
    properties.push({
      '@type': 'PropertyValue',
      'name': 'bonusPoints',
      'value': String(bonusPoints),
    })
  }

  return properties
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

const seoBlocks = computed(() => {
  // Приоритет: seo_content, затем description
  const content = product.value?.seo_content || product.value?.description
  if (!content)
    return []
  return parseHTMLToBlocks(content)
})

// Извлекаем текст из seo_content для Schema.org description
const seoContentText = computed(() => {
  if (!seoBlocks.value.length)
    return metaDescription.value

  return seoBlocks.value
    .map((block) => {
      if (block.type === 'ul') {
        return block.items.map(item => item.text).join(' ')
      }
      return block.text
    })
    .filter(Boolean)
    .join(' ')
    .substring(0, 500) // Google рекомендует до 500 символов
})

useRobotsRule(robotsRule)

const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url)
    return 'https://uhti.kz/og-default.jpg'
  return (
    getVariantUrl(BUCKET_NAME_PRODUCT, product.value.product_images[0].image_url, 'lg')
    || 'https://uhti.kz/og-default.jpg'
  )
})

const productImages = computed(() => {
  if (!product.value?.product_images?.length)
    return ['https://uhti.kz/og-default.jpg']
  return product.value.product_images.map(
    (img: ProductImageRow) =>
      getVariantUrl(BUCKET_NAME_PRODUCT, img.image_url, 'lg')
      || `https://uhti.kz/og-default.jpg`,
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
    description: seoContentText,
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

    // 🔥 Дополнительные свойства товара (атрибуты) для Google Merchant
    additionalProperty: schemaAdditionalProperties,
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
  <div class="pdp-page">
    <ClientOnly>
      <ProductDetailSkeleton v-if="isLoading" />

      <div v-else-if="product">
        <!-- Мобильная шапка-пилюля: назад · миниатюра · название · шаринг · избранное -->
        <ProductMobileHeader
          :product-id="product.id"
          :product-name="product.name"
          :thumb-url="mainThumbUrl"
          :back-to="categoryLink ?? '/catalog'"
        />

        <div :class="`${containerClass} pt-[18px]`">
          <!-- Хлебные крошки — только десктоп (на мобильных их роль играет шапка-пилюля) -->
          <Breadcrumbs :items="breadcrumbs" compact class="hidden lg:block" />

          <div class="pdp-top">
            <!-- ГАЛЕРЕЯ -->
            <div class="pdp-col-main">
              <ProductGallery
                v-if="product.product_images && product.product_images.length > 0"
                :images="product.product_images"
                :product-name="product.name"
                :brand-name="product.brands?.name"
                :line-name="product.product_lines?.name"
                :discount-percentage="
                  mainProductPrice.hasDiscount ? product.discount_percentage : null
                "
              />
              <div
                v-else
                class="pdp-card flex h-64 items-center justify-center lg:h-96"
              >
                <p class="text-muted-foreground">
                  Изображения отсутствуют
                </p>
              </div>
            </div>

            <!--
              БЛОК ПОКУПКИ. Один и тот же элемент играет две роли: на мобильных
              это инфо-карточка под галереей, на десктопе — липкая колонка справа.
              Дублировать разметку нельзя — в DOM появился бы второй <h1>.
            -->
            <div class="pdp-buybox-wrap">
              <div class="pdp-card pdp-buybox">
                <h1 class="pdp-title">
                  {{ product.name }}
                </h1>

                <p
                  v-if="audienceText || brandName"
                  class="mb-3 hidden text-[13.5px] font-medium text-muted-foreground lg:block"
                >
                  Игрушка {{ audienceText }}
                  <template v-if="brandName">
                    от {{ brandName }}
                  </template>
                </p>

                <!-- Бренд -->
                <NuxtLink
                  v-if="brandName && brandLink"
                  :to="brandLink"
                  class="pdp-brand-pill mb-4 hidden lg:inline-flex"
                >
                  <span class="pdp-brand-logo">
                    <ProgressiveImage
                      v-if="product.brands?.logo_url"
                      :src="brandLogoUrl"
                      :alt="generateBrandLogoAlt(brandName || 'Бренд')"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="size-[18px]"
                    />
                    <Icon v-else name="lucide:building-2" class="size-4" />
                  </span>
                  <span class="text-[13px] font-bold text-foreground">{{ brandName }}</span>
                </NuxtLink>

                <!-- Цена -->
                <p v-if="hasAccessoriesSelected" class="mb-1 text-xs font-medium text-muted-foreground">
                  Итого за комплект
                </p>
                <div class="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <!-- Флип-счётчик: каждая цифра — барабан 0…9, useFlipCounter
                       крутит .digit-ribbon при изменении итоговой суммы.
                       В барабанах лежат все цифры 0-9, поэтому для скринридеров
                       они скрыты, а цена дублируется обычным текстом. -->
                  <span class="pdp-price">
                    <span class="sr-only">{{ formatPrice(totalPrice) }} ₸</span>
                    <span class="pdp-price-reels" aria-hidden="true">
                      <template v-for="(item, index) in priceChars" :key="index">
                        <span v-if="item.char === ' '" class="pdp-digit-gap" />
                        <span
                          v-else-if="item.isDigit"
                          :ref="(el) => { if (el) digitColumns[item.digitIndex] = el as HTMLElement }"
                          class="digit-column"
                        >
                          <span class="digit-ribbon">
                            <span v-for="d in 10" :key="d" class="digit-item">{{ d - 1 }}</span>
                          </span>
                        </span>
                      </template>
                      <span class="pdp-currency">₸</span>
                    </span>
                  </span>
                  <template v-if="mainProductPrice.hasDiscount && !hasAccessoriesSelected">
                    <span class="pdp-price-old">{{ formatPrice(mainProductPrice.original) }} ₸</span>
                    <span class="pdp-discount">−{{ product.discount_percentage }}%</span>
                  </template>
                </div>

                <!-- Расшифровка комплекта -->
                <div
                  v-if="hasAccessoriesSelected"
                  class="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground"
                >
                  <span class="max-w-[180px] truncate font-medium">{{ product.name }}</span>
                  <template v-for="acc in selectedAccessoriesData" :key="acc.id">
                    <span>+</span>
                    <span class="font-medium">{{ acc.name }}</span>
                  </template>
                </div>

                <span v-if="totalBonuses > 0" class="pdp-bonus">
                  <Icon name="lucide:gift" class="size-[15px] text-orange-500" />
                  <span class="pdp-bonus-text">+{{ totalBonuses }} бонусов на счёт</span>
                </span>

                <!-- Рейтинг и вопросы — плитки только на мобильных -->
                <div class="mt-3.5 grid grid-cols-2 gap-2.5 lg:hidden">
                  <a href="#reviews" class="pdp-tile">
                    <Icon name="gravity-ui:star-fill" class="size-[22px] shrink-0 text-rating" />
                    <span class="min-w-0">
                      <span class="block text-base font-extrabold">
                        {{ (product.avg_rating ?? 0).toFixed(1) }}
                      </span>
                      <span class="block text-xs font-semibold text-primary">{{ reviewCountLabel }}</span>
                    </span>
                  </a>
                  <a href="#questions" class="pdp-tile">
                    <Icon name="lucide:message-circle" class="size-[22px] shrink-0 text-primary" />
                    <span class="min-w-0">
                      <span class="block text-base font-extrabold">{{ questionsCount }}</span>
                      <span class="block text-xs font-semibold text-primary">{{ questionsCountLabel }}</span>
                    </span>
                  </a>
                </div>

                <!-- Цветовые варианты -->
                <div v-if="colorVariants && colorVariants.length > 0" class="mt-4">
                  <span class="mb-2 block text-[13px] font-semibold text-muted-foreground">
                    Другие варианты:
                  </span>
                  <div class="flex flex-wrap gap-2.5">
                    <span
                      v-if="product.product_images?.[0]"
                      class="pdp-variant pdp-variant--active"
                      aria-current="true"
                    >
                      <ProgressiveImage
                        :src="getVariantUrl(BUCKET_NAME_PRODUCT, product.product_images[0].image_url, 'sm')"
                        :blur-data-url="product.product_images[0].blur_placeholder"
                        :alt="product.name"
                        object-fit="cover"
                        placeholder-type="lqip"
                        class="size-full rounded-[9px]"
                      />
                    </span>

                    <NuxtLink
                      v-for="variant in colorVariants"
                      :key="variant.id"
                      :to="`/catalog/products/${variant.slug}`"
                      class="pdp-variant"
                      :class="{ 'pdp-variant--out': variant.stock_quantity <= 0 }"
                      :aria-label="`Вариант ${variant.slug}`"
                    >
                      <ProgressiveImage
                        v-if="variant.image_url"
                        :src="getVariantUrl(BUCKET_NAME_PRODUCT, variant.image_url, 'sm')"
                        :blur-data-url="variant.blur_placeholder"
                        :alt="`Вариант ${variant.slug}`"
                        object-fit="cover"
                        placeholder-type="lqip"
                        class="size-full rounded-[9px]"
                      />
                      <span v-if="variant.stock_quantity <= 0" class="pdp-variant-strike" />
                    </NuxtLink>
                  </div>
                </div>

                <!-- Наличие -->
                <div class="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <template v-if="product.stock_quantity > 0">
                    <Icon name="lucide:circle-check-big" class="size-[18px] text-success" />
                    <span class="text-success">В наличии</span>
                    <span class="text-[13px] font-medium text-muted-foreground">
                      · осталось {{ product.stock_quantity }} шт.
                    </span>
                  </template>
                  <template v-else>
                    <Icon name="lucide:circle-x" class="size-[18px] text-destructive" />
                    <span class="text-destructive">Нет в наличии</span>
                  </template>
                </div>

                <!-- Покупка. На мобильных её роль играет фиксированная панель внизу -->
                <div class="mt-[18px] hidden lg:block">
                  <template v-if="product.stock_quantity > 0">
                    <div v-if="mainItemInCart" class="pdp-stepper mb-2.5">
                      <button
                        type="button"
                        class="pdp-stepper-btn"
                        aria-label="Уменьшить количество"
                        @click="decQuantity"
                      >
                        <Icon name="lucide:minus" class="size-[19px]" />
                      </button>
                      <span class="flex-1 text-center text-base font-extrabold text-white">
                        {{ quantityInCart }} шт
                      </span>
                      <button
                        type="button"
                        class="pdp-stepper-btn"
                        aria-label="Увеличить количество"
                        @click="incQuantity"
                      >
                        <Icon name="lucide:plus" class="size-[19px]" />
                      </button>
                    </div>
                    <button v-else type="button" class="pdp-cta mb-2.5" @click="addToCart">
                      <Icon name="solar:cart-3-bold" class="size-[22px]" />
                      Добавить в корзину
                    </button>
                  </template>

                  <div v-else class="mb-2.5">
                    <StockAlertButton :product-id="product.id" />
                  </div>

                  <button
                    type="button"
                    class="pdp-glass-btn"
                    :class="{ 'pdp-glass-btn--wished': isWishlisted }"
                    :aria-pressed="isWishlisted"
                    @click="toggleWishlist"
                  >
                    <Icon
                      :name="isWishlisted ? 'line-md:heart-filled' : 'line-md:heart'"
                      class="size-[21px]"
                    />
                    {{ isWishlisted ? 'В избранном' : 'В избранное' }}
                  </button>
                </div>

                <!-- Аксессуары (батарейки и подарочная упаковка) -->
                <AccessoriesBlock
                  v-model:selected-ids="selectedAccessoryIds"
                  :accessories="accessories || []"
                  :loading="accessoriesLoading"
                  flat
                />

                <!-- Преимущества магазина -->
                <div class="mt-3.5 hidden grid-cols-2 gap-2.5 lg:grid">
                  <div v-for="perk in PERKS" :key="perk.text" class="pdp-perk">
                    <Icon :name="perk.icon" class="size-5 shrink-0 text-primary" />
                    <span class="text-[12.5px] font-semibold leading-tight">{{ perk.text }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Способы получения — на десктопе их заменяет блок преимуществ -->
            <div class="pdp-col-main pdp-card lg:hidden">
              <h2 class="pdp-card-title mb-1.5">
                Способы получения
              </h2>
              <div v-for="row in PICKUP_ROWS" :key="row.title" class="pdp-pickup-row">
                <span class="pdp-pickup-icon">
                  <Icon :name="row.icon" class="size-5 text-primary" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-bold text-foreground">{{ row.title }}</span>
                  <span class="block text-[12.5px] font-medium text-muted-foreground">{{ row.sub }}</span>
                </span>
              </div>
            </div>

            <!-- О ТОВАРЕ -->
            <div class="pdp-col-main pdp-card">
              <h2 class="pdp-card-title mb-3">
                О товаре
              </h2>

              <div v-if="seoBlocks.length > 0" class="relative">
                <div :class="isDescriptionExpanded ? '' : 'max-h-[150px] overflow-hidden'">
                  <SEOContentRenderer :blocks="seoBlocks" />
                </div>
                <div v-if="!isDescriptionExpanded" class="pdp-desc-fade" />
                <button
                  type="button"
                  class="pdp-desc-toggle"
                  @click="isDescriptionExpanded = !isDescriptionExpanded"
                >
                  {{ isDescriptionExpanded ? 'Свернуть' : 'Показать полностью' }}
                  <Icon
                    :name="isDescriptionExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                    class="size-4"
                  />
                </button>
              </div>

              <!-- Характеристики -->
              <dl class="mt-5 border-t border-border pt-1.5">
                <div v-if="brandName" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Бренд
                  </dt>
                  <dd class="pdp-spec-value">
                    <NuxtLink v-if="brandLink" :to="brandLink" class="text-primary hover:underline">
                      {{ brandName }}
                    </NuxtLink>
                    <span v-else>{{ brandName }}</span>
                  </dd>
                </div>

                <div v-if="productLineName" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Линейка
                  </dt>
                  <dd class="pdp-spec-value">
                    <NuxtLink v-if="productLineLink" :to="productLineLink" class="text-primary hover:underline">
                      {{ productLineName }}
                    </NuxtLink>
                    <span v-else>{{ productLineName }}</span>
                  </dd>
                </div>

                <div v-if="categoryName" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Категория
                  </dt>
                  <dd class="pdp-spec-value">
                    <NuxtLink v-if="categoryLink" :to="categoryLink" class="text-primary hover:underline">
                      {{ categoryName }}
                    </NuxtLink>
                    <span v-else>{{ categoryName }}</span>
                  </dd>
                </div>

                <div v-if="ageRangeText" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Рекомендованный возраст
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ ageRangeText }}
                  </dd>
                </div>

                <div v-if="product.materials?.name" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Материал
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ product.materials.name }}
                  </dd>
                </div>

                <div v-if="product.countries?.name" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Страна производитель
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ product.countries.name }}
                  </dd>
                </div>

                <div v-if="hasPieceCountAttribute && product.piece_count" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Количество деталей
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ product.piece_count }} шт
                  </dd>
                </div>

                <div v-if="product.sku" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Код товара
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ product.sku }}
                  </dd>
                </div>

                <div v-if="product.barcode" class="pdp-spec-row">
                  <dt class="pdp-spec-label">
                    Штрихкод
                  </dt>
                  <dd class="pdp-spec-value">
                    {{ product.barcode }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- ЕЩЁ В ЭТИХ КАТЕГОРИЯХ -->
            <div v-if="moreCategories.length" class="pdp-col-main pdp-card">
              <h2 class="pdp-card-title mb-3.5">
                Ещё в этих категориях
              </h2>
              <div class="flex flex-col gap-2">
                <NuxtLink
                  v-for="row in moreCategories"
                  :key="row.key"
                  :to="row.to"
                  class="pdp-more-row"
                >
                  <span class="pdp-more-icon">
                    <ProgressiveImage
                      v-if="row.image"
                      :src="row.image"
                      :alt="row.title"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="size-[38px]"
                    />
                    <Icon v-else :name="row.icon" class="size-5 text-muted-foreground" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[14.5px] font-bold text-foreground">{{ row.title }}</span>
                    <span class="block text-[12.5px] font-medium text-muted-foreground">{{ row.subtitle }}</span>
                  </span>
                  <Icon name="lucide:chevron-right" class="size-[18px] text-muted-foreground" />
                </NuxtLink>
              </div>
            </div>

            <!-- ОТЗЫВЫ -->
            <div class="pdp-col-main">
              <ProductReviews
                v-if="product.id"
                :product-id="product.id"
                :avg-rating="product.avg_rating ?? 0"
                :review-count="product.review_count ?? 0"
              />
            </div>

            <!-- ВОПРОСЫ -->
            <div class="pdp-col-main">
              <ProductQuestions v-if="product.id" :product-id="product.id" />
            </div>
          </div>

          <!-- ПОХОЖИЕ ТОВАРЫ -->
          <div v-if="similarProductsLoading || similarGridProducts.length" class="mt-9">
            <div class="mb-[18px] flex items-baseline gap-3">
              <h2 class="text-[22px] font-extrabold tracking-tight lg:text-3xl">
                Похожие товары
              </h2>
              <NuxtLink v-if="categoryLink" :to="categoryLink" class="text-sm font-semibold text-primary">
                Смотреть все
              </NuxtLink>
            </div>

            <div v-if="similarProductsLoading" class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-[18px] xl:grid-cols-5 2xl:grid-cols-6">
              <div v-for="i in 6" :key="i" class="pdp-card animate-pulse">
                <div class="mb-3 aspect-square rounded-lg bg-muted" />
                <div class="mb-2 h-4 w-3/4 rounded bg-muted" />
                <div class="h-4 w-1/2 rounded bg-muted" />
              </div>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-[18px] xl:grid-cols-5 2xl:grid-cols-6">
              <div
                v-for="similar in similarGridProducts"
                :key="similar.id"
                @mouseenter="prefetchProduct(similar.slug)"
              >
                <ProductCard :product="similar" />
              </div>
            </div>
          </div>
        </div>

        <!-- Фиксированная панель покупки (мобильные) -->
        <div
          class="pdp-buybar flex items-center gap-3 lg:hidden"
          :class="{ 'pdp-buybar--down': !isNavVisible }"
        >
          <span class="flex flex-none flex-col">
            <span
              v-if="mainProductPrice.hasDiscount && !hasAccessoriesSelected"
              class="whitespace-nowrap text-xs font-medium text-price-old line-through"
            >
              {{ formatPrice(mainProductPrice.original) }} ₸
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="whitespace-nowrap text-[19px] font-extrabold tracking-tight text-primary">
                {{ formatPrice(totalPrice) }} ₸
              </span>
              <span
                v-if="mainProductPrice.hasDiscount && !hasAccessoriesSelected"
                class="pdp-discount pdp-discount--sm"
              >
                −{{ product.discount_percentage }}%
              </span>
            </span>
          </span>

          <template v-if="product.stock_quantity > 0">
            <div v-if="mainItemInCart" class="pdp-stepper pdp-stepper--pill flex-1">
              <button
                type="button"
                class="pdp-stepper-btn pdp-stepper-btn--round"
                aria-label="Уменьшить количество"
                @click="decQuantity"
              >
                <Icon name="lucide:minus" class="size-[18px]" />
              </button>
              <span class="text-[15px] font-extrabold text-white">{{ quantityInCart }} шт</span>
              <button
                type="button"
                class="pdp-stepper-btn pdp-stepper-btn--round"
                aria-label="Увеличить количество"
                @click="incQuantity"
              >
                <Icon name="lucide:plus" class="size-[18px]" />
              </button>
            </div>
            <button v-else type="button" class="pdp-cta pdp-cta--pill flex-1" @click="addToCart">
              <Icon name="solar:cart-3-bold" class="size-5" />
              В корзину
            </button>
          </template>

          <div v-else class="flex-1">
            <StockAlertButton :product-id="product.id" />
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
  .pdp-page {
    background: var(--page-surface);
    /* На мобильных снизу висит панель покупки (~70px) поверх контента —
       резервируем под неё место дополнительно к отступу под навбар из лейаута */
    padding-bottom: 96px;
  }

  @media (width >= 64rem) {
    .pdp-page {
      padding-bottom: 48px;
    }
  }

  /* ── Раскладка верхнего экрана ──────────────────────────────────────────────
     Один поток на мобильных (галерея → блок покупки → способы получения → …);
     на десктопе блок покупки уезжает во вторую колонку и залипает. Row-span
     с запасом — колонка обязана перекрыть все карточки слева, иначе sticky
     «закончится» на первой же из них. */
  .pdp-top {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  @media (width >= 64rem) {
    .pdp-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 384px;
      column-gap: 26px;
      row-gap: 18px;
      align-items: start;
    }

    .pdp-col-main {
      grid-column: 1;
    }

    .pdp-buybox-wrap {
      grid-column: 2;
      grid-row: 1 / span 8;
      position: sticky;
      top: 90px;
    }
  }

  /* ── Карточка ─────────────────────────────────────────────────────────────── */
  .pdp-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 18px 16px;
    box-shadow: var(--elevation-card);
  }

  .pdp-card-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  @media (width >= 64rem) {
    .pdp-card {
      padding: 24px 26px;
    }

    .pdp-buybox {
      padding: 26px;
    }
  }

  /* ── Блок покупки ─────────────────────────────────────────────────────────── */
  .pdp-title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.4;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  @media (width >= 64rem) {
    .pdp-title {
      font-size: clamp(19px, 2.2vw, 22px);
      line-height: 1.3;
      letter-spacing: -0.015em;
    }
  }

  .pdp-brand-pill {
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 7px;
    border-radius: 999px;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.95), rgba(224, 233, 247, 0.55));
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow:
      inset 0 1px 0 #fff,
      0 3px 10px rgba(15, 23, 42, 0.07);
    align-self: flex-start;
    width: fit-content;
    transition: box-shadow 0.15s ease;
  }

  .pdp-brand-pill:hover {
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 14px rgba(15, 23, 42, 0.12);
  }

  .pdp-brand-logo {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #fff;
    box-shadow: inset 0 0 0 1px var(--border);
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  /* Цена — контейнер флип-счётчика: цифры это барабаны фиксированной ширины,
     поэтому flex, а не текст. Перенос запрещён: разряды и ₸ всегда в одну строку. */
  .pdp-price {
    font-size: 27px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--price);
    white-space: nowrap;
  }

  .pdp-price-reels {
    display: inline-flex;
    align-items: baseline;
    flex-wrap: nowrap;
  }

  .pdp-digit-gap {
    flex-shrink: 0;
    width: 8px;
  }

  .pdp-currency {
    margin-left: 7px;
  }

  /* Барабан одной цифры. clientHeight колонки = шаг прокрутки ленты,
     поэтому высота колонки и высота .digit-item обязаны совпадать. */
  /* flex-shrink: 0 обязателен: .pdp-price-reels — inline-flex, а у колонки
     overflow: hidden, и при сжатии цифры подрезало бы по бокам. */
  .digit-column {
    position: relative;
    flex-shrink: 0;
    height: 34px;
    line-height: 34px;
    width: 17px;
    overflow: hidden;
    text-align: center;
    border-radius: 4px;
    transition: background-color 0.3s ease;
  }

  .digit-ribbon {
    position: relative;
    display: block;
    will-change: transform;
  }

  .digit-item {
    display: block;
    height: 34px;
    line-height: 34px;
  }

  @media (width >= 64rem) {
    .pdp-digit-gap {
      width: 10px;
    }

    .pdp-currency {
      margin-left: 9px;
    }

    .digit-column {
      height: 42px;
      line-height: 42px;
      width: 21px;
    }

    .digit-item {
      height: 42px;
      line-height: 42px;
    }
  }

  @media (width >= 64rem) {
    .pdp-price {
      font-size: 34px;
    }
  }

  .pdp-price-old {
    font-size: 14px;
    font-weight: 500;
    color: var(--price-old);
    text-decoration: line-through;
    white-space: nowrap;
  }

  @media (width >= 64rem) {
    .pdp-price-old {
      font-size: 17px;
    }
  }

  .pdp-discount {
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-size: 12.5px;
    font-weight: 800;
    line-height: 1.2;
  }

  .pdp-discount--sm {
    padding: 1px 7px;
    font-size: 11px;
  }

  .pdp-bonus {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border-radius: 11px;
    background: linear-gradient(100deg, var(--bonus-surface), var(--bonus-border));
    padding: 8px 13px;
    font-size: 13.5px;
    font-weight: 700;
  }

  .pdp-bonus-text {
    color: var(--bonus);
  }

  .pdp-tile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 13px;
    border-radius: 16px;
    background: var(--muted);
  }

  .pdp-variant {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 14px;
    padding: 5px;
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    display: grid;
    place-items: center;
    overflow: hidden;
    transition: box-shadow 0.15s ease;
  }

  .pdp-variant--active {
    border: 2px solid var(--primary);
    box-shadow: 0 5px 14px rgb(43 127 255 / 0.26);
  }

  .pdp-variant--out {
    opacity: 0.5;
  }

  .pdp-variant-strike {
    position: absolute;
    left: 8%;
    right: 8%;
    height: 2px;
    background: rgba(255, 255, 255, 0.85);
    transform: rotate(45deg);
  }

  /* ── Кнопки ───────────────────────────────────────────────────────────────── */
  .pdp-cta {
    width: 100%;
    height: 56px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: linear-gradient(150deg, rgba(77, 148, 255, 0.96), rgba(23, 101, 235, 0.9));
    backdrop-filter: blur(12px) saturate(1.7);
    -webkit-backdrop-filter: blur(12px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -3px 10px rgba(6, 53, 138, 0.3),
      0 10px 24px rgba(43, 127, 255, 0.34);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition:
      box-shadow 0.18s ease,
      transform 0.12s ease;
  }

  .pdp-cta:hover {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.6),
      inset 0 -3px 10px rgba(6, 53, 138, 0.34),
      0 14px 30px rgba(43, 127, 255, 0.44);
  }

  .pdp-cta:active {
    transform: scale(0.985);
  }

  .pdp-cta--pill {
    width: auto;
    height: 52px;
    border-radius: 999px;
    font-size: 15.5px;
    gap: 9px;
  }

  .pdp-glass-btn {
    width: 100%;
    height: 52px;
    border-radius: 16px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.98), rgba(224, 233, 247, 0.6));
    backdrop-filter: blur(10px) saturate(1.6);
    -webkit-backdrop-filter: blur(10px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 #fff,
      0 5px 14px rgba(15, 23, 42, 0.08);
    color: var(--foreground);
    transition: box-shadow 0.18s ease;
  }

  .pdp-glass-btn:hover {
    box-shadow:
      inset 0 1px 0 #fff,
      0 8px 20px rgba(15, 23, 42, 0.14);
  }

  .pdp-glass-btn--wished {
    border-color: rgba(244, 63, 94, 0.35);
    background: linear-gradient(150deg, rgba(255, 241, 244, 0.98), rgba(255, 224, 231, 0.7));
    color: var(--destructive);
  }

  .pdp-stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    border-radius: 16px;
    background: linear-gradient(150deg, rgba(77, 148, 255, 0.96), rgba(23, 101, 235, 0.9));
    border: 1px solid rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(12px) saturate(1.7);
    -webkit-backdrop-filter: blur(12px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -2px 8px rgba(6, 53, 138, 0.28),
      0 10px 24px rgba(43, 127, 255, 0.32);
    padding: 0 8px;
  }

  .pdp-stepper--pill {
    height: 52px;
    border-radius: 999px;
    padding: 0 6px;
  }

  .pdp-stepper-btn {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    border: none;
    background: rgba(255, 255, 255, 0.26);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
    color: #fff;
    cursor: pointer;
    display: grid;
    place-content: center;
    transition: background 0.15s ease;
  }

  .pdp-stepper-btn:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  .pdp-stepper-btn--round {
    border-radius: 999px;
  }

  /* ── Способы получения ────────────────────────────────────────────────────── */
  .pdp-pickup-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px dashed var(--border);
  }

  .pdp-pickup-row:last-child {
    border-bottom: none;
  }

  .pdp-pickup-icon {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 12px;
    background: var(--brand-surface);
    display: grid;
    place-content: center;
  }

  /* ── Описание ─────────────────────────────────────────────────────────────── */
  .pdp-desc-fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 44px;
    height: 64px;
    background: linear-gradient(180deg, transparent, var(--card));
    pointer-events: none;
  }

  .pdp-desc-toggle {
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: transparent;
    color: var(--primary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .pdp-desc-toggle:hover {
    color: var(--brand-active);
  }

  /* ── Характеристики ───────────────────────────────────────────────────────── */
  .pdp-spec-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    padding: 11px 0;
    border-bottom: 1px dashed var(--border);
  }

  .pdp-spec-row:last-child {
    border-bottom: none;
  }

  .pdp-spec-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  .pdp-spec-value {
    font-size: 14px;
    font-weight: 600;
    text-align: right;
  }

  /* ── Ещё в этих категориях ────────────────────────────────────────────────── */
  .pdp-more-row {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 10px 13px;
    border-radius: 16px;
    background: linear-gradient(165deg, color-mix(in oklch, var(--muted) 45%, var(--card)), var(--muted));
    border: 1px solid rgba(255, 255, 255, 0.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 2px 8px rgba(15, 23, 42, 0.04);
    transition: box-shadow 0.15s ease;
  }

  .pdp-more-row:hover {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 6px 16px rgba(15, 23, 42, 0.09);
  }

  .pdp-more-icon {
    width: 48px;
    height: 48px;
    flex: none;
    border-radius: 12px;
    background: var(--card);
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px var(--border);
    overflow: hidden;
  }

  .pdp-perk {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 12px;
    border-radius: 14px;
    background: var(--muted);
  }

  /* ── Фиксированная панель покупки (мобильные) ─────────────────────────────── */
  .pdp-buybar {
    position: fixed;
    left: 10px;
    right: 10px;
    /* MobileBottomNav: bottom 12px + высота 50px + запас 10px */
    bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
    z-index: 45;
    /* display/align/gap намеренно живут утилитами на самом элементе:
       scoped-селектор [data-v-*] бьёт `lg:hidden` по специфичности, и панель
       осталась бы видимой на десктопе. */
    padding: 9px 14px;
    border-radius: 20px;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.48));
    backdrop-filter: blur(24px) saturate(1.9);
    -webkit-backdrop-filter: blur(24px) saturate(1.9);
    border: 1px solid rgba(255, 255, 255, 0.75);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 12px 32px rgba(15, 23, 42, 0.18);
    transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Навбар уехал вниз — панель занимает его место */
  .pdp-buybar--down {
    transform: translateY(62px);
  }
}
</style>

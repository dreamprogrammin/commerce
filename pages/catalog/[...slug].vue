<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type { AttributeFilter, AttributeWithValue, BrandForFilter, Country, IBreadcrumbItem, IProductFilters, Material, NumericAttributeFilter, ProductLine, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CategoryBrands from '@/components/category/CategoryBrands.vue'
import CategoryProductLines from '@/components/category/CategoryProductLines.vue'
import CategoryQuestions from '@/components/category/CategoryQuestions.vue'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import DynamicFiltersMobile from '@/components/global/DynamicFiltersMobile.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCatalogQuery } from '@/composables/useCatalogQuery'
import { useSafeHtml } from '@/composables/useSafeHtml'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants' // Проверь правильность пути
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useCategoryQuestionsStore } from '@/stores/publicStore/categoryQuestionsStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация ---
const route = useRoute()
const router = useRouter()
const categoriesStore = useCategoriesStore()
const categoryQuestionsStore = useCategoryQuestionsStore()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl } = useSupabaseStorage()
const { sanitizeHtml } = useSafeHtml()

// 🆕 Отмена запросов при размонтировании
const abortController = ref<AbortController | null>(null)

onUnmounted(() => {
  // Отменяем все активные запросы при уходе со страницы
  if (abortController.value) {
    abortController.value.abort()
  }
})

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
// Локальные интерфейсы для избежания циклической зависимости типов
interface FilterAttribute {
  id: number
  name: string
  slug: string
  display_type: string
  unit: string | null
  attribute_options: {
    id: number
    attribute_id: number
    value: string
    meta: any
  }[]
}

interface CatalogProductImage {
  id: string
  image_url: string
  display_order: number
  alt_text: string | null
}

interface CatalogProduct {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  discount_percentage: number | null
  stock_quantity: number
  product_images: CatalogProductImage[]
  brands: { id: string, name: string, slug: string } | null
}

const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<FilterAttribute[]>([])
const availableBrands = ref<BrandForFilter[]>([])
const availableProductLines = ref<ProductLine[]>([])
const availableMaterials = ref<Material[]>([])
const availableCountries = ref<Country[]>([])
const isLoadingFilters = ref(true)

// Фильтруем атрибуты - number_range заменён на слайдер piece_count, numeric обрабатывается отдельно
const displayableFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(f => f.display_type !== 'number_range' && f.display_type !== 'numeric')
})

// Числовые атрибуты
const numericFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(f => f.display_type === 'numeric')
})

// Диапазоны числовых атрибутов
const numericAttributeRanges = ref<Record<number, { min: number, max: number }>>({})
const accumulatedProducts = ref<CatalogProduct[]>([])
const isMobileFiltersOpen = ref(false)
const isSubcategoriesDrawerOpen = ref(false)

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
  pieceCount: [number, number] | null
  brandIds: string[]
  productLineIds: string[]
  materialIds: string[]
  countryIds: string[]
  attributes: Record<string, (string | number)[]>
  numericAttributes: Record<number, [number, number]>
}

const activeFilters = ref<ActiveFilters>({
  sortBy: getSortByFromQuery(route.query.sort_by),
  subCategoryIds: getArrayFromQuery(route.query.subcategories),
  price: [0, 50000],
  pieceCount: null,
  brandIds: getArrayFromQuery(route.query.brands),
  productLineIds: getArrayFromQuery(route.query.lines),
  materialIds: getArrayFromQuery(route.query.materials),
  countryIds: getArrayFromQuery(route.query.countries),
  attributes: {},
  numericAttributes: {},
})

// --- 3. Вычисляемые свойства ---
const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? 'all')

const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (currentCategorySlug.value === 'all') {
    return [{ id: 'all', name: 'Все товары', href: '/catalog/all' }]
  }
  return categoriesStore.getBreadcrumbs(currentCategorySlug.value)
})
const currentCategory = computed(() => {
  if (!categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(c => c.slug === currentCategorySlug.value)
})

const categoryOgImageUrl = computed(() => {
  const imageFilename = currentCategory.value?.image_url

  if (!imageFilename)
    return undefined

  // Используем пресет OG_IMAGE для Open Graph (1200x630)
  return getImageUrl(BUCKET_NAME_CATEGORY, imageFilename, IMAGE_SIZES.OG_IMAGE)
})

// Название категории (для breadcrumbs и fallback)
const categoryName = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }
  const path = breadcrumbs.value
  if (path && path.length > 0)
    return path[path.length - 1]?.name
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

// H1 заголовок (приоритет: seo_h1 > name)
const title = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }
  return currentCategory.value?.seo_h1 || categoryName.value
})

const priceRange = ref({ min: 0, max: 50000 })
const pieceCountRange = ref<{ min: number, max: number } | null>(null)

// Получаем подкатегории из store
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))

const activeSubcategoryLabel = computed(() => {
  const count = activeFilters.value.subCategoryIds.length
  if (count === 0)
    return 'Все категории'

  const firstId = activeFilters.value.subCategoryIds[0]
  const category = subcategories.value.find(c => c.id === firstId)

  if (!category)
    return 'Выбрано'

  if (count > 1) {
    return `${category.name} (+${count - 1})`
  }

  return category.name
})

const activeFiltersCount = computed(() => {
  let count = 0
  count += activeFilters.value.subCategoryIds.length
  count += activeFilters.value.brandIds.length
  count += activeFilters.value.productLineIds.length
  count += activeFilters.value.materialIds.length
  count += activeFilters.value.countryIds.length

  Object.values(activeFilters.value.attributes).forEach((values) => {
    count += values.length
  })

  if (activeFilters.value.price[0] !== priceRange.value.min
    || activeFilters.value.price[1] !== priceRange.value.max) {
    count += 1
  }

  // Фильтр по количеству деталей
  if (pieceCountRange.value && activeFilters.value.pieceCount) {
    if (activeFilters.value.pieceCount[0] !== pieceCountRange.value.min
      || activeFilters.value.pieceCount[1] !== pieceCountRange.value.max) {
      count += 1
    }
  }

  // Числовые атрибуты
  Object.entries(activeFilters.value.numericAttributes).forEach(([attrId, range]) => {
    const attrRange = numericAttributeRanges.value[Number(attrId)]
    if (attrRange && (range[0] !== attrRange.min || range[1] !== attrRange.max)) {
      count += 1
    }
  })

  return count
})
const canonicalUrl = computed(() => {
  const baseUrl = 'https://uhti.kz'
  // Приоритет: canonical_url из БД > href категории > текущий path
  if (currentCategory.value?.canonical_url) {
    return `${baseUrl}${currentCategory.value.canonical_url}`
  }
  if (currentCategory.value?.href) {
    return `${baseUrl}${currentCategory.value.href}`
  }
  return `${baseUrl}${route.path}`
})

const catalogFilters = computed<IProductFilters>(() => {
  const attributeFilters: AttributeFilter[] = Object.entries(activeFilters.value.attributes)
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  // Преобразуем числовые атрибуты в формат для API
  const numericAttributeFilters: NumericAttributeFilter[] = Object.entries(activeFilters.value.numericAttributes)
    .filter(([attrId, range]) => {
      const attrRange = numericAttributeRanges.value[Number(attrId)]
      // Отправляем только если диапазон отличается от полного
      return attrRange && (range[0] !== attrRange.min || range[1] !== attrRange.max)
    })
    .map(([attrId, range]) => ({
      attributeId: Number(attrId),
      minValue: range[0],
      maxValue: range[1],
    }))

  return {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    brandIds: activeFilters.value.brandIds.length > 0 ? activeFilters.value.brandIds : undefined,
    productLineIds: activeFilters.value.productLineIds.length > 0 ? activeFilters.value.productLineIds : undefined,
    materialIds: activeFilters.value.materialIds.length > 0 ? activeFilters.value.materialIds : undefined,
    countryIds: activeFilters.value.countryIds.length > 0 ? activeFilters.value.countryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
    pieceCountMin: activeFilters.value.pieceCount?.[0],
    pieceCountMax: activeFilters.value.pieceCount?.[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
    numericAttributes: numericAttributeFilters.length > 0 ? numericAttributeFilters : undefined,
  }
})

const {
  products: currentPageProducts,
  hasMore,
  isLoading: isLoadingProducts,
  isFetching,
} = useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE)

const displayedProducts = computed<CatalogProduct[]>(() => {
  if (currentPage.value === 1) {
    return currentPageProducts.value as CatalogProduct[]
  }
  return accumulatedProducts.value
})

// --- 4. Функции-обработчики ---

function getArrayFromQuery(queryValue: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (!queryValue)
    return []
  if (Array.isArray(queryValue))
    return queryValue.filter(Boolean) as string[]
  return queryValue ? [queryValue] : []
}

function getSortByFromQuery(queryValue: LocationQueryValue | LocationQueryValue[] | undefined): SortByType {
  if (!queryValue)
    return 'popularity'
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue
  if (value === 'popularity' || value === 'newest' || value === 'price_asc' || value === 'price_desc') {
    return value
  }
  return 'popularity'
}

// 🆕 Оптимизированная загрузка фильтров с отменой
async function loadFilterData(slug: string) {
  // Отменяем предыдущий запрос
  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()
  isLoadingFilters.value = true

  try {
    const productsStore = useProductsStore()

    // 🆕 Используем Promise.allSettled для продолжения при частичных ошибках
    const results = await Promise.allSettled([
      productsStore.fetchBrandsForCategory(slug),
      productsStore.fetchProductLinesForCategory(slug),
      productsStore.fetchAttributesForCategory(slug),
      productsStore.fetchAllMaterials(),
      productsStore.fetchAllCountries(),
      productsStore.fetchPriceRangeForCategory(slug),
      productsStore.fetchPieceCountRangeForCategory(slug),
    ])

    // Обрабатываем успешные результаты
    const [brandsResult, productLinesResult, attributesResult, materialsResult, countriesResult, priceRangeResult, pieceCountRangeResult] = results

    availableBrands.value = brandsResult.status === 'fulfilled' ? brandsResult.value : []
    availableProductLines.value = productLinesResult.status === 'fulfilled' ? productLinesResult.value : []
    availableFilters.value = (attributesResult.status === 'fulfilled' ? attributesResult.value : []) as FilterAttribute[]
    availableMaterials.value = materialsResult.status === 'fulfilled' ? materialsResult.value : []
    availableCountries.value = countriesResult.status === 'fulfilled' ? countriesResult.value : []

    const priceRangeData = priceRangeResult.status === 'fulfilled'
      ? priceRangeResult.value
      : { min_price: 0, max_price: 50000 }

    const priceMin = Math.floor(Number(priceRangeData.min_price))
    const priceMax = Math.ceil(Number(priceRangeData.max_price))
    priceRange.value = { min: priceMin, max: priceMax }

    // Диапазон количества деталей (может быть null если в категории нет товаров с piece_count)
    const pieceCountRangeData = pieceCountRangeResult.status === 'fulfilled' ? pieceCountRangeResult.value : null
    pieceCountRange.value = pieceCountRangeData
      ? { min: pieceCountRangeData.min_count, max: pieceCountRangeData.max_count }
      : null

    // Загружаем диапазоны для числовых атрибутов
    const numericAttrs = availableFilters.value.filter(f => f.display_type === 'numeric')
    const numericRangesResults = await Promise.allSettled(
      numericAttrs.map(attr => productsStore.fetchNumericAttributeRange(slug, attr.id)),
    )

    const newNumericRanges: Record<number, { min: number, max: number }> = {}
    for (let i = 0; i < numericAttrs.length; i++) {
      const attr = numericAttrs[i]
      const result = numericRangesResults[i]
      if (!attr || !result) continue

      if (result.status === 'fulfilled') {
        const value = result.value
        if (value) {
          newNumericRanges[attr.id] = value
        }
      }
    }
    numericAttributeRanges.value = newNumericRanges

    const newAttributeFilters: Record<string, (string | number)[]> = {}
    for (const attr of availableFilters.value) {
      const queryKey = `attr_${attr.slug}`
      const queryValue = route.query[queryKey]
      newAttributeFilters[attr.slug] = getArrayFromQuery(queryValue)
    }

    const priceMinFromQuery = route.query.price_min ? Number(route.query.price_min) : priceMin
    const priceMaxFromQuery = route.query.price_max ? Number(route.query.price_max) : priceMax

    // Диапазон деталей из query (если есть)
    const pieceCountMinFromQuery = route.query.piece_count_min ? Number(route.query.piece_count_min) : pieceCountRangeData?.min_count
    const pieceCountMaxFromQuery = route.query.piece_count_max ? Number(route.query.piece_count_max) : pieceCountRangeData?.max_count

    // Инициализируем числовые атрибуты их диапазонами (или из query)
    const initNumericAttrs: Record<number, [number, number]> = {}
    Object.entries(newNumericRanges).forEach(([attrId, range]) => {
      const id = Number(attrId)
      const queryMin = route.query[`numeric_${id}_min`]
      const queryMax = route.query[`numeric_${id}_max`]
      initNumericAttrs[id] = [
        queryMin ? Number(queryMin) : range.min,
        queryMax ? Number(queryMax) : range.max,
      ]
    })

    activeFilters.value = {
      sortBy: getSortByFromQuery(route.query.sort_by),
      subCategoryIds: getArrayFromQuery(route.query.subcategories),
      price: [priceMinFromQuery, priceMaxFromQuery],
      pieceCount: pieceCountRangeData ? [pieceCountMinFromQuery ?? pieceCountRangeData.min_count, pieceCountMaxFromQuery ?? pieceCountRangeData.max_count] : null,
      brandIds: getArrayFromQuery(route.query.brands),
      productLineIds: getArrayFromQuery(route.query.lines),
      materialIds: getArrayFromQuery(route.query.materials),
      countryIds: getArrayFromQuery(route.query.countries),
      attributes: newAttributeFilters,
      numericAttributes: initNumericAttrs,
    }

    currentPage.value = 1
    accumulatedProducts.value = []
  }
  catch (error: unknown) {
    // Игнорируем ошибки отмены
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Error loading filters:', error)
    }
  }
  finally {
    isLoadingFilters.value = false
  }
}

function loadMoreProducts() {
  if (currentPage.value === 1) {
    accumulatedProducts.value = [...currentPageProducts.value] as CatalogProduct[]
  }
  currentPage.value++
}

watch(currentPageProducts, (newProducts) => {
  if (currentPage.value > 1 && newProducts.length > 0) {
    const existingIds = new Set(accumulatedProducts.value.map(p => p.id))
    const uniqueNewProducts = newProducts.filter(p => !existingIds.has(p.id)) as CatalogProduct[]
    accumulatedProducts.value = [...accumulatedProducts.value, ...uniqueNewProducts]
  }
})

function updateAttribute(checked: boolean, attributeSlug: string, optionId: string | number) {
  const stringId = String(optionId)
  const currentSelection: string[] = (activeFilters.value.attributes[attributeSlug] || []).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (checked)
    newSelection.add(stringId)
  else
    newSelection.delete(stringId)

  activeFilters.value = {
    ...activeFilters.value,
    attributes: {
      ...activeFilters.value.attributes,
      [attributeSlug]: Array.from(newSelection),
    },
  }
}

function clearAttributeFilter(attributeSlug: string) {
  activeFilters.value = {
    ...activeFilters.value,
    attributes: {
      ...activeFilters.value.attributes,
      [attributeSlug]: [],
    },
  }
}

function toggleSubCategory(catId: string) {
  const newIds = new Set(activeFilters.value.subCategoryIds)
  if (newIds.has(catId)) {
    newIds.delete(catId)
  }
  else {
    newIds.add(catId)
  }
  activeFilters.value = {
    ...activeFilters.value,
    subCategoryIds: Array.from(newIds),
  }
}

// 🆕 Дебаунс для query params (уменьшен до 300ms)
function updateQueryParams() {
  const query: Record<string, any> = {}

  if (activeFilters.value.sortBy !== 'popularity') {
    query.sort_by = activeFilters.value.sortBy
  }

  if (activeFilters.value.subCategoryIds.length > 0) {
    query.subcategories = activeFilters.value.subCategoryIds
  }

  if (activeFilters.value.brandIds.length > 0) {
    query.brands = activeFilters.value.brandIds
  }

  if (activeFilters.value.productLineIds.length > 0) {
    query.lines = activeFilters.value.productLineIds
  }

  if (activeFilters.value.materialIds.length > 0) {
    query.materials = activeFilters.value.materialIds
  }

  if (activeFilters.value.countryIds.length > 0) {
    query.countries = activeFilters.value.countryIds
  }

  if (activeFilters.value.price[0] !== priceRange.value.min) {
    query.price_min = activeFilters.value.price[0]
  }

  if (activeFilters.value.price[1] !== priceRange.value.max) {
    query.price_max = activeFilters.value.price[1]
  }

  Object.entries(activeFilters.value.attributes).forEach(([slug, values]) => {
    if (values.length > 0) {
      query[`attr_${slug}`] = values
    }
  })

  router.replace({ query })
}

const hasActiveFilters = computed(() => {
  return activeFiltersCount.value > 0 || activeFilters.value.sortBy !== 'popularity'
})

// SEO описание: приоритет у описания из БД
const categoryDescription = computed(() => currentCategory.value?.description || null)

// Форматирование цены для SEO
function formatPriceForSeo(price: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(price))
}

const metaDescription = computed(() => {
  // Если есть фильтры - показываем общее описание
  if (hasActiveFilters.value) {
    return `Результаты фильтрации для категории "${categoryName.value}". Широкий выбор товаров.`
  }

  // 🆕 Приоритет: meta_description > description > автогенерация
  if (currentCategory.value?.meta_description) {
    return currentCategory.value.meta_description
  }

  // Если есть описание категории из БД - используем его
  if (categoryDescription.value) {
    return categoryDescription.value
  }

  // 🔥 Автогенерация в стиле detmir.kz
  const parts: string[] = []

  // Название категории
  parts.push(`${categoryName.value}`)

  // Диапазон цен (если загружен)
  if (priceRange.value.min > 0 || priceRange.value.max < 50000) {
    parts.push(`⚡ по цене от ${formatPriceForSeo(priceRange.value.min)} ₸ до ${formatPriceForSeo(priceRange.value.max)} ₸`)
  }

  // Количество товаров
  const productsCount = displayedProducts.value.length
  if (productsCount > 0) {
    const productWord = productsCount === 1 ? 'товар' : productsCount < 5 ? 'товара' : 'товаров'
    parts.push(`В наличии ${productsCount} ${productWord}`)
  }

  // Магазин и доставка
  parts.push('в интернет-магазине Ухтышка ✔️ Быстрая доставка в Алматы и по всему Казахстану')

  return parts.join('. ')
})

const metaTitle = computed(() => {
  if (hasActiveFilters.value) {
    return `${categoryName.value} - Фильтр | Ухтышка`
  }
  // 🆕 Приоритет: meta_title > seo_title > автогенерация
  if (currentCategory.value?.meta_title) {
    return currentCategory.value.meta_title
  }
  const seoTitle = currentCategory.value?.seo_title
  if (seoTitle) {
    return seoTitle
  }
  // 🔥 Формат как у detmir.kz: "Лего Майнкрафт купить в интернет-магазине Ухтышка"
  return `${categoryName.value} купить в интернет-магазине Ухтышка Казахстан`
})

// 🆕 Ключевые слова (приоритет: meta_keywords > seo_keywords)
const metaKeywords = computed(() => {
  // Приоритет новому полю meta_keywords
  const metaKw = currentCategory.value?.meta_keywords
  if (metaKw && metaKw.length > 0) {
    return metaKw.join(', ')
  }
  // Fallback на старое поле seo_keywords
  const keywords = currentCategory.value?.seo_keywords
  if (keywords && keywords.length > 0) {
    return keywords.join(', ')
  }
  return null
})

// SEO текст для отображения внизу страницы (с санитизацией)
const seoText = computed(() => {
  const text = currentCategory.value?.seo_text
  return text ? sanitizeHtml(text) : null
})

const robotsRule = computed(() => {
  // Если есть фильтры ИЛИ сортировка не по умолчанию
  if (activeFiltersCount.value > 0 || activeFilters.value.sortBy !== 'popularity') {
    return {
      noindex: true,
      follow: true, // Ссылки внутри сканируем, но страницу не сохраняем
    }
  }
  return {
    index: true,
    follow: true,
  }
})

// --- 5. Логика загрузки данных и реакции на изменения ---

await useAsyncData(
  `catalog-meta-${currentCategorySlug.value}`,
  () => categoriesStore.fetchCategoryData(),
  { watch: [currentCategorySlug] },
)

await useAsyncData(
  `catalog-filters-${currentCategorySlug.value}`,
  () => loadFilterData(currentCategorySlug.value),
  {
    watch: [currentCategorySlug],
    server: true,
  },
)

// 🆕 Загружаем FAQ вопросы для Schema.org
const { data: categoryQuestions } = await useAsyncData(
  `catalog-faq-${currentCategorySlug.value}`,
  async () => {
    // Получаем ID категории по slug
    const category = categoriesStore.allCategories.find(c => c.slug === currentCategorySlug.value)
    if (!category?.id || currentCategorySlug.value === 'all')
      return []

    try {
      return await categoryQuestionsStore.fetchQuestions(category.id)
    }
    catch (error) {
      console.error('Error fetching FAQ:', error)
      return []
    }
  },
  {
    watch: [currentCategorySlug],
    server: true,
  },
)

const faqQuestions = computed(() => categoryQuestions.value || [])

// 🆕 Агрегированный рейтинг категории для Schema.org aggregateRating
const supabase = useSupabaseClient()
const { data: categoryRatingData } = await useAsyncData(
  `catalog-rating-${currentCategorySlug.value}`,
  async () => {
    const category = categoriesStore.allCategories.find(c => c.slug === currentCategorySlug.value)
    if (!category?.id || currentCategorySlug.value === 'all')
      return null

    try {
      const { data, error } = await supabase.rpc('get_category_aggregate_rating', {
        p_category_id: category.id,
      })
      if (error) {
        console.error('Error fetching category rating:', error)
        return null
      }
      return data as { avg_rating: number, total_reviews: number } | null
    }
    catch {
      return null
    }
  },
  {
    watch: [currentCategorySlug],
    server: true,
  },
)

// 🆕 Уменьшен debounce до 300ms
watchDebounced(
  activeFilters,
  () => {
    currentPage.value = 1
    accumulatedProducts.value = []
    updateQueryParams()
  },
  { debounce: 300, deep: true },
)

useRobotsRule(robotsRule)

const isLoading = computed(() => isLoadingFilters.value || (isLoadingProducts.value && currentPage.value === 1))

// 🔥 Подготовка данных для OG Image
const ogImageDescription = computed(() => {
  if (hasActiveFilters.value) {
    return `Найдено товаров: ${displayedProducts.value.length}`
  }
  return 'Широкий ассортимент качественных товаров по выгодным ценам'
})

// 🔥 Используй кастомный OG Image компонент
defineOgImageComponent('OgImageCatalog', {
  title: title.value,
  description: ogImageDescription.value,
  categoryImage: categoryOgImageUrl.value,
  productsCount: displayedProducts.value.length || undefined,
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogUrl: canonicalUrl,
  ogSiteName: 'Ухтышка',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  robots: computed(() => robotsRule.value.noindex ? 'noindex, follow' : 'index, follow'),
})

// Добавляем keywords через useHead для совместимости
useHead({
  meta: [
    {
      name: 'keywords',
      content: () => metaKeywords.value || '',
    },
  ],
})

// SEO structured data & canonical
useHead(() => {
  const schemas = []

  // 1. Breadcrumb Schema (Хлебные крошки)
  if (breadcrumbs.value.length > 0) {
    schemas.push({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': breadcrumbs.value.map((crumb, index) => {
          const listItem: {
            '@type': 'ListItem'
            'position': number
            'name': string
            'item'?: string
          } = {
            '@type': 'ListItem',
            'position': index + 1,
            'name': crumb.name,
          }
          // Добавляем поле item только если есть href
          if (crumb.href) {
            listItem.item = `https://uhti.kz${crumb.href}`
          }
          return listItem
        }),
      }),
    })
  }

  // 2. CollectionPage Schema (Страница коллекции/категории)
  schemas.push({
    type: 'application/ld+json',
    children: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': metaTitle.value,
      'description': metaDescription.value,
      'url': canonicalUrl.value,
      'isPartOf': {
        '@type': 'WebSite',
        'name': 'Ухтышка',
        'url': 'https://uhti.kz',
      },
      // Если есть картинка категории
      ...(categoryOgImageUrl.value && {
        image: categoryOgImageUrl.value,
      }),
      // Ключевые слова категории
      ...(metaKeywords.value && {
        keywords: metaKeywords.value,
      }),
      // 🆕 Добавляем основной контент страницы (если есть SEO текст)
      ...(seoText.value && {
        mainEntity: {
          '@type': 'Article',
          'headline': title.value,
          'articleBody': seoText.value.replace(/<[^>]*>/g, '').substring(0, 500), // Убираем HTML теги для articleBody
          'author': {
            '@type': 'Organization',
            'name': 'Ухтышка',
          },
        },
      }),
      // Добавляем информацию о товарах для rich snippets
      ...(displayedProducts.value.length > 0 && {
        numberOfItems: displayedProducts.value.length,
      }),
      // Диапазон цен
      ...(priceRange.value.min > 0 && {
        offers: {
          '@type': 'AggregateOffer',
          'lowPrice': priceRange.value.min,
          'highPrice': priceRange.value.max,
          'priceCurrency': 'KZT',
          'offerCount': displayedProducts.value.length,
        },
      }),
      // Агрегированный рейтинг (только если есть реальные отзывы)
      ...(categoryRatingData.value && categoryRatingData.value.total_reviews > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          'ratingValue': categoryRatingData.value.avg_rating,
          'reviewCount': categoryRatingData.value.total_reviews,
          'bestRating': 5,
          'worstRating': 1,
        },
      }),
    }),
  })

  // 3. SiteNavigationElement Schema (Подкатегории для sitelinks)
  if (subcategories.value.length > 0) {
    schemas.push({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        'name': `Подкатегории ${categoryName.value}`,
        'hasPart': subcategories.value.slice(0, 6).map(cat => ({
          '@type': 'WebPage',
          'name': cat.name,
          'url': `https://uhti.kz${cat.href}`,
        })),
      }),
    })
  }

  // 4. ItemList Schema (Список товаров в категории с ценами)
  if (displayedProducts.value.length > 0) {
    schemas.push({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'numberOfItems': displayedProducts.value.length,
        'itemListElement': displayedProducts.value.slice(0, 10).map((product, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'item': {
            '@type': 'Product',
            'name': product.name,
            'description': product.description || product.name,
            'url': `https://uhti.kz/catalog/products/${product.slug}`,
            'sku': product.id,
            'image': product.product_images?.[0]?.image_url
              ? getImageUrl(BUCKET_NAME_PRODUCT, product.product_images?.[0]?.image_url, IMAGE_SIZES.CARD)
              : undefined,
            ...(product.brands?.name && {
              brand: {
                '@type': 'Brand',
                'name': product.brands.name,
                ...(product.brands.slug && {
                  url: `https://uhti.kz/brand/${product.brands.slug}`,
                }),
              },
            }),
            'offers': {
              '@type': 'Offer',
              'price': product.discount_percentage
                ? Math.round(product.price * (100 - product.discount_percentage) / 100)
                : product.price,
              'priceCurrency': 'KZT',
              'availability': product.stock_quantity > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
              'url': `https://uhti.kz/catalog/products/${product.slug}`,
              'priceValidUntil': new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
              'seller': {
                '@type': 'Organization',
                'name': 'Ухтышка',
              },
              'hasMerchantReturnPolicy': {
                '@type': 'MerchantReturnPolicy',
                'applicableCountry': 'KZ',
                'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays': 14,
                'returnMethod': 'https://schema.org/ReturnByMail',
                'returnFees': 'https://schema.org/FreeReturn',
              },
              'shippingDetails': {
                '@type': 'OfferShippingDetails',
                'shippingDestination': {
                  '@type': 'DefinedRegion',
                  'addressCountry': 'KZ',
                  'addressRegion': 'Алматы',
                },
                'shippingRate': {
                  '@type': 'MonetaryAmount',
                  'value': 0,
                  'currency': 'KZT',
                },
                'deliveryTime': {
                  '@type': 'ShippingDeliveryTime',
                  'handlingTime': {
                    '@type': 'QuantitativeValue',
                    'minValue': 0,
                    'maxValue': 1,
                    'unitCode': 'DAY',
                  },
                  'transitTime': {
                    '@type': 'QuantitativeValue',
                    'minValue': 1,
                    'maxValue': 3,
                    'unitCode': 'DAY',
                  },
                },
              },
            },
          },
        })),
      }),
    })
  }

  // 10. FAQPage Schema (Часто задаваемые вопросы категории)
  if (faqQuestions.value.length > 0 && !hasActiveFilters.value) {
    schemas.push({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': faqQuestions.value.map(q => ({
          '@type': 'Question',
          'name': q.question_text,
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': q.answer_text || 'Ответ скоро будет добавлен.',
          },
        })),
      }),
    })
  }

  return {
    link: [
      { rel: 'canonical', href: canonicalUrl.value },
    ],
    script: schemas,
  }
})
</script>

<template>
  <div :class="`${containerClass} py-4 lg:py-8`">
    <!-- Breadcrumbs и заголовок -->
    <ClientOnly>
      <Breadcrumbs
        v-if="breadcrumbs && breadcrumbs.length > 0"
        :items="breadcrumbs"
        class="mb-3 lg:mb-6"
        compact
      />
      <template #fallback>
        <div class="h-6 w-1/3 bg-muted rounded mb-3 lg:mb-6 animate-pulse" />
      </template>
    </ClientOnly>

    <!-- Блок с картинкой и описанием категории -->
    <div
      v-if="currentCategory && currentCategory.description"
      class="bg-white dark:bg-card rounded-xl p-4 lg:p-8 mb-6 lg:mb-8 border shadow-sm"
    >
      <!-- Мобильная версия (компактная) -->
      <div class="lg:hidden space-y-3">
        <!-- Заголовок и картинка в одну строку -->
        <div class="flex items-start gap-3">
          <!-- Компактная картинка -->
          <div
            v-if="currentCategory.image_url"
            class="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center"
          >
            <ProgressiveImage
              :src="getImageUrl(BUCKET_NAME_CATEGORY, currentCategory.image_url, IMAGE_SIZES.CATEGORY_IMAGE)"
              :alt="currentCategory.name"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="currentCategory.blur_placeholder || undefined"
              :eager="true"
              class="w-full h-full"
            />
          </div>

          <!-- Заголовок (только мобильная версия) -->
          <h1 class="text-xl font-bold capitalize flex-1 leading-tight lg:hidden">
            {{ title }}
          </h1>
        </div>

        <!-- Описание (обрезанное) -->
        <p class="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {{ currentCategory.description }}
        </p>

        <!-- Компактная статистика -->
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <Icon name="lucide:package" class="w-3.5 h-3.5 text-blue-500" />
            <span>{{ displayedProducts.length }}</span>
          </div>
          <ClientOnly>
            <div v-if="availableBrands.length > 0" class="flex items-center gap-1.5">
              <Icon name="lucide:award" class="w-3.5 h-3.5 text-purple-500" />
              <span>{{ availableBrands.length }}</span>
            </div>
          </ClientOnly>
          <ClientOnly>
            <div v-if="priceRange.min > 0 || priceRange.max < 50000" class="flex items-center gap-1.5">
              <Icon name="lucide:tag" class="w-3.5 h-3.5 text-green-500" />
              <span>от {{ new Intl.NumberFormat('ru-RU').format(priceRange.min) }} ₸</span>
            </div>
          </ClientOnly>
        </div>
      </div>

      <!-- Десктопная версия (оригинальная) -->
      <div class="hidden lg:grid grid-cols-12 gap-6 items-start">
        <!-- Картинка категории слева -->
        <div
          v-if="currentCategory.image_url"
          class="col-span-3"
        >
          <div class="w-full max-w-[220px] h-[160px] rounded-lg overflow-hidden shadow-md bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <ProgressiveImage
              :src="getImageUrl(BUCKET_NAME_CATEGORY, currentCategory.image_url, IMAGE_SIZES.CATEGORY_IMAGE)"
              :alt="currentCategory.name"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="currentCategory.blur_placeholder || undefined"
              :eager="true"
              class="w-full h-full"
            />
          </div>
        </div>

        <!-- Текстовый блок справа -->
        <div :class="currentCategory.image_url ? 'col-span-9' : 'col-span-12'" class="space-y-4">
          <!-- Заголовок (только десктопная версия) -->
          <h1 class="hidden lg:block text-2xl md:text-3xl font-bold capitalize">
            {{ title }}
          </h1>

          <!-- Описание категории из БД -->
          <p
            v-if="currentCategory.description"
            class="text-base text-muted-foreground leading-relaxed"
          >
            {{ currentCategory.description }}
          </p>

          <!-- Статистика категории -->
          <div class="flex flex-wrap gap-4 pt-2">
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:package" class="w-4 h-4 text-blue-500" />
              <span>{{ displayedProducts.length }} товаров</span>
            </div>
            <ClientOnly>
              <div v-if="availableBrands.length > 0" class="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="lucide:award" class="w-4 h-4 text-purple-500" />
                <span>{{ availableBrands.length }} брендов</span>
              </div>
            </ClientOnly>
            <ClientOnly>
              <div v-if="priceRange.min > 0 || priceRange.max < 50000" class="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="lucide:tag" class="w-4 h-4 text-green-500" />
                <span>от {{ new Intl.NumberFormat('ru-RU').format(priceRange.min) }} ₸</span>
              </div>
            </ClientOnly>
          </div>
        </div>
      </div>
    </div>

    <!-- Заголовок для случая с активными фильтрами или без описания -->
    <h1 v-else class="text-xl md:text-3xl font-bold mb-3 lg:mb-4 capitalize">
      {{ title }}
    </h1>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Десктоп фильтры -->
      <ClientOnly>
        <aside class="hidden lg:block col-span-1">
          <DynamicFilters
            v-model="activeFilters"
            :available-filters="availableFilters as unknown as AttributeWithValue[]"
            :available-brands="availableBrands"
            :available-product-lines="availableProductLines"
            :price-range="priceRange"
            :piece-count-range="pieceCountRange"
            :available-materials="availableMaterials"
            :available-countries="availableCountries"
            :numeric-attribute-ranges="numericAttributeRanges"
            :is-loading="isLoadingFilters"
          />
        </aside>

        <template #fallback>
          <aside class="hidden lg:block col-span-1">
            <div class="p-4 border rounded-lg bg-card space-y-6 sticky top-24">
              <Skeleton class="h-6 w-24" />
              <div class="space-y-4 pt-4">
                <Skeleton class="h-5 w-32" />
                <div class="space-y-2">
                  <div v-for="i in 4" :key="i" class="flex items-center space-x-2">
                    <Skeleton class="h-4 w-4 rounded" />
                    <Skeleton class="h-4 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </template>
      </ClientOnly>

      <div class="col-span-1 lg:col-span-3 min-w-0">
        <div class="mb-6 space-y-4">
          <!-- Подкатегории на мобильных -->
          <div v-if="subcategories.length > 0" class="lg:hidden">
            <div class="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                class="inline-flex flex-1 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-purple-500/40 transition-all duration-200 whitespace-nowrap shrink-0 snap-start hover:scale-[1.02] active:scale-95"
                @click="isSubcategoriesDrawerOpen = true"
              >
                <Icon
                  :name="activeFilters.subCategoryIds.length > 0 ? 'lucide:layers' : 'lucide:grid-2x2'"
                  class="w-4 h-4 shrink-0"
                />
                <span class="truncate">{{ activeSubcategoryLabel }}</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                :disabled="activeFilters.subCategoryIds.length === 0"
                class="inline-flex items-center gap-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-purple-500/40 transition-all duration-200 whitespace-nowrap shrink-0 snap-start hover:scale-[1.02] active:scale-95"
                @click="activeFilters.subCategoryIds = []"
              >
                <Icon name="lucide:x" class="w-5 h-5" />
              </Button>
            </div>
          </div>

          <!-- Панель управления -->
          <div class="flex flex-wrap items-center gap-2">
            <ClientOnly>
              <Button
                :variant="activeFiltersCount > 0 ? 'default' : 'outline'"
                class="lg:hidden h-11 w-11 p-0 shrink-0 relative transition-colors" :class="[
                  activeFiltersCount > 0 ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' : '',
                ]"
                @click="isMobileFiltersOpen = true"
              >
                <Icon name="lucide:sliders-horizontal" class="w-5 h-5" />
                <Badge
                  v-if="activeFiltersCount > 0"
                  variant="secondary"
                  class="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs bg-white text-blue-500 border-2 border-blue-500"
                >
                  {{ activeFiltersCount }}
                </Badge>
              </Button>
            </ClientOnly>

            <CatalogHeader v-model:sort-by="activeFilters.sortBy" />

            <div v-if="!isLoadingFilters && availableFilters.length > 0" class="h-6 w-px bg-border hidden lg:block" />

            <template v-if="!isLoadingFilters && availableFilters.length > 0">
              <template v-for="filter in displayableFilters" :key="filter.id">
                <!-- Select type -->
                <Popover v-if="filter.display_type === 'select'">
                  <PopoverTrigger as-child>
                    <Button
                      :variant="(activeFilters.attributes[filter.slug] || []).length > 0 ? 'default' : 'outline'"
                      class="hidden lg:inline-flex h-11 gap-2 transition-colors" :class="[
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
                          : '',
                      ]"
                    >
                      {{ filter.name }}
                      <Badge
                        v-if="(activeFilters.attributes[filter.slug] || []).length > 0"
                        variant="secondary"
                        class="h-5 min-w-5 flex items-center justify-center p-0 px-1.5 text-xs bg-white text-blue-500"
                      >
                        {{ (activeFilters.attributes[filter.slug] || []).length }}
                      </Badge>
                      <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="(activeFilters.attributes[filter.slug] || []).length > 0"
                          variant="ghost"
                          size="sm"
                          class="h-6 px-2 text-xs"
                          @click="clearAttributeFilter(filter.slug)"
                        >
                          <Icon name="lucide:x" class="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div class="max-h-64 overflow-y-auto space-y-2">
                        <div
                          v-for="option in filter.attribute_options"
                          :key="option.id"
                          class="flex items-center space-x-2"
                        >
                          <Checkbox
                            :id="`attr-${filter.slug}-${option.id}`"
                            :model-value="(activeFilters.attributes[filter.slug] || []).includes(option.id)"
                            @update:model-value="(checked) => updateAttribute(!!checked, filter.slug, option.id)"
                          />
                          <Label
                            :for="`attr-${filter.slug}-${option.id}`"
                            class="font-normal cursor-pointer text-sm"
                          >
                            {{ option.value }}
                          </Label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <!-- Color type -->
                <Popover v-else-if="filter.display_type === 'color'">
                  <PopoverTrigger as-child>
                    <Button
                      :variant="(activeFilters.attributes[filter.slug] || []).length > 0 ? 'default' : 'outline'"
                      class="hidden lg:inline-flex h-11 gap-2 transition-colors" :class="[
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
                          : '',
                      ]"
                    >
                      {{ filter.name }}
                      <Badge
                        v-if="(activeFilters.attributes[filter.slug] || []).length > 0"
                        variant="secondary"
                        class="h-5 min-w-5 flex items-center justify-center p-0 px-1.5 text-xs bg-white text-blue-500"
                      >
                        {{ (activeFilters.attributes[filter.slug] || []).length }}
                      </Badge>
                      <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="(activeFilters.attributes[filter.slug] || []).length > 0"
                          variant="ghost"
                          size="sm"
                          class="h-6 px-2 text-xs"
                          @click="clearAttributeFilter(filter.slug)"
                        >
                          <Icon name="lucide:x" class="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="option in filter.attribute_options"
                          :key="option.id"
                          type="button"
                          :title="option.value"
                          :style="{ backgroundColor: (option.meta as { hex?: string } | null)?.hex }"
                          class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                          :class="{
                            'border-primary ring-2 ring-primary ring-offset-2': (activeFilters.attributes[filter.slug] || []).includes(option.id),
                            'border-border': !(activeFilters.attributes[filter.slug] || []).includes(option.id),
                          }"
                          @click="() => {
                            const isCurrentlyChecked = (activeFilters.attributes[filter.slug] || []).includes(option.id);
                            updateAttribute(!isCurrentlyChecked, filter.slug, option.id);
                          }"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

              </template>
            </template>

            <!-- Подкатегории на десктопе -->
            <template v-if="subcategories.length > 0">
              <div class="hidden lg:block h-6 w-px bg-border" />
              <button
                v-for="cat in subcategories"
                :key="cat.id"
                type="button"
                class="hidden lg:inline-flex group relative items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0"
                :class="[
                  activeFilters.subCategoryIds.includes(cat.id)
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                    : 'bg-secondary/60 text-secondary-foreground hover:bg-secondary hover:scale-[1.02] hover:shadow-md active:scale-95',
                ]"
                @click="toggleSubCategory(cat.id)"
              >
                <div
                  v-if="activeFilters.subCategoryIds.includes(cat.id)"
                  class="flex items-center justify-center w-4 h-4 rounded-full bg-white/20"
                >
                  <Icon name="lucide:check" class="w-3 h-3" />
                </div>
                <span>{{ cat.name }}</span>
                <div
                  v-if="!activeFilters.subCategoryIds.includes(cat.id)"
                  class="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-primary/20 transition-colors"
                />
              </button>
            </template>
          </div>
        </div>

        <!-- Контент с плавным переходом -->
        <Transition
          enter-active-class="transition-opacity duration-200"
          leave-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
          mode="out-in"
        >
          <div :key="isLoading ? 'loading' : 'content'">
            <ProductGridSkeleton
              v-if="isLoading && displayedProducts.length === 0"
            />

            <div v-else-if="displayedProducts.length > 0" class="space-y-8">
              <ProductGrid :products="displayedProducts" />

              <div v-if="hasMore" class="text-center">
                <Button
                  variant="outline"
                  size="lg"
                  :disabled="isFetching"
                  @click="loadMoreProducts"
                >
                  <span v-if="isFetching">Загрузка...</span>
                  <span v-else>Показать ещё</span>
                </Button>
              </div>

              <div v-if="isFetching && currentPage > 1" class="text-center text-sm text-muted-foreground">
                Загрузка товаров...
              </div>
            </div>

            <div v-else class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
              <h3 class="text-2xl font-semibold">
                Товары не найдены
              </h3>
              <p class="mt-2">
                Попробуйте изменить фильтры или выбрать другую категорию.
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 📄 SEO описание после каталога (для Google индексации) -->
    <div
      v-if="seoText"
      class="mt-12 pt-8 border-t"
    >
      <div
        class="prose prose-sm max-w-none text-gray-700
               prose-headings:font-bold prose-headings:text-gray-900
               prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
               prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
               prose-p:leading-relaxed prose-p:mb-4
               prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
               prose-strong:text-gray-900 prose-strong:font-semibold
               prose-ul:list-disc prose-ul:ml-6 prose-ul:my-4
               prose-ol:list-decimal prose-ol:ml-6 prose-ol:my-4
               prose-li:my-1 prose-li:leading-relaxed
               prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
               prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
               prose-pre:bg-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
               prose-img:rounded-lg prose-img:shadow-md"
        v-html="seoText"
      />
    </div>

    <!-- FAQ блок для категории -->
    <ClientOnly>
      <CategoryQuestions
        v-if="currentCategory"
        :category-id="currentCategory.id"
        :category-name="currentCategory.name"
      />
    </ClientOnly>

    <!-- Бренды в категории -->
    <CategoryBrands
      v-if="availableBrands.length > 0"
      :brands="availableBrands"
    />

    <!-- Линейки продуктов в категории -->
    <CategoryProductLines
      v-if="availableProductLines.length > 0"
      :product-lines="availableProductLines"
      :brands="availableBrands"
    />

    <!-- Мобильные компоненты -->
    <ClientOnly>
      <!-- Мобильные фильтры (Sheet) -->
      <DynamicFiltersMobile
        v-model="activeFilters"
        :open="isMobileFiltersOpen"
        :available-filters="availableFilters as unknown as AttributeWithValue[]"
        :available-brands="availableBrands"
        :available-product-lines="availableProductLines"
        :price-range="priceRange"
        :piece-count-range="pieceCountRange"
        :available-materials="availableMaterials"
        :available-countries="availableCountries"
        :numeric-attribute-ranges="numericAttributeRanges"
        :is-loading="isLoadingFilters"
        @update:open="isMobileFiltersOpen = $event"
      />

      <!-- Drawer с подкатегориями -->
      <Drawer v-model:open="isSubcategoriesDrawerOpen">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle class="flex items-center gap-2">
              <Icon name="lucide:layers" class="w-5 h-5 text-primary" />
              Выберите подкатегории
            </DrawerTitle>
            <DrawerDescription>
              Фильтрация применяется автоматически
            </DrawerDescription>
          </DrawerHeader>

          <div class="px-4 pb-6 space-y-2 max-h-[60vh] overflow-y-auto">
            <button
              v-for="cat in subcategories"
              :key="cat.id"
              type="button"
              class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
              :class="[
                activeFilters.subCategoryIds.includes(cat.id)
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
              ]"
              @click="toggleSubCategory(cat.id)"
            >
              <div
                class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                :class="activeFilters.subCategoryIds.includes(cat.id) ? 'bg-white/20' : 'bg-background/50'"
              >
                <Icon
                  :name="activeFilters.subCategoryIds.includes(cat.id) ? 'lucide:check' : 'lucide:folder'"
                  class="w-5 h-5"
                />
              </div>
              <div class="flex-1 text-left">
                <div class="font-semibold text-base">
                  {{ cat.name }}
                </div>
              </div>
            </button>
          </div>

          <DrawerFooter class="gap-2">
            <Button
              v-if="activeFilters.subCategoryIds.length > 0"
              variant="outline"
              class="w-full"
              @click="activeFilters.subCategoryIds = []"
            >
              <Icon name="lucide:x" class="w-4 h-4 mr-2" />
              Сбросить все ({{ activeFilters.subCategoryIds.length }})
            </Button>
            <DrawerClose as-child>
              <Button class="w-full">
                <Icon name="lucide:check" class="w-4 h-4 mr-2" />
                Применить
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </ClientOnly>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}
</style>

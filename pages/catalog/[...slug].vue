<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type {
  AttributeFilter,
  AttributeWithValue,
  BrandForFilter,
  Country,
  IBreadcrumbItem,
  IProductFilters,
  Material,
  NumericAttributeFilter,
  ProductLine,
  SortByType,
} from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { watchDebounced } from '@vueuse/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCatalogQuery } from '@/composables/useCatalogQuery'
import { useSafeHtml } from '@/composables/useSafeHtml'
import { useSeoTemplates } from '@/composables/useSeoTemplates'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useCategoryQuestionsStore } from '@/stores/publicStore/categoryQuestionsStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { clampDescription, composeCategoryLead } from '@/utils/seoDescription'

// ─── Ленивая загрузка тяжёлых компонентов ────────────────────────────────────
// DynamicFilters: 28KB + MobileCatalogDrawer — основные виновники
// Script Evaluation 1459ms на мобилке. Грузим только когда нужны.
const DynamicFilters = defineAsyncComponent(
  () => import('@/components/global/DynamicFilters.vue'),
)
const MobileCatalogDrawer = defineAsyncComponent(
  () => import('@/components/category/MobileCatalogDrawer.vue'),
)

// Некритичные компоненты — грузим после первого рендера
const CategoryBrands = defineAsyncComponent(
  () => import('@/components/category/CategoryBrands.vue'),
)
const CategoryProductLines = defineAsyncComponent(
  () => import('@/components/category/CategoryProductLines.vue'),
)
const CategoryQuestions = defineAsyncComponent(
  () => import('@/components/category/CategoryQuestions.vue'),
)
const CategoryRatingBlock = defineAsyncComponent(
  () => import('@/components/category/CategoryRatingBlock.vue'),
)
const CategoryReviews = defineAsyncComponent(
  () => import('@/components/category/CategoryReviews.vue'),
)
const SEOContentRenderer = defineAsyncComponent(
  () => import('@/components/category/SEOContentRenderer.vue'),
)

definePageMeta({ layout: 'catalog-listing' })

// --- 1. Инициализация ---
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const categoriesStore = useCategoriesStore()
const categoryQuestionsStore = useCategoryQuestionsStore()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const { sanitizeHtml } = useSafeHtml()
const { generateBrandCategoryDescription, generateCategoryDescription }
  = useSeoTemplates()

const priceValidUntil = new Date(
  new Date().setFullYear(new Date().getFullYear() + 1),
)
  .toISOString()
  .split('T')[0]

const abortController = ref<AbortController | null>(null)

// ─── ОПТИМИЗАЦИЯ: флаг готовности некритичных данных ──────────────────────────
const isNonCriticalLoaded = ref(false)

onUnmounted(() => {
  if (abortController.value) {
    abortController.value.abort()
  }
})

// ─── Плавающая кнопка «Наверх» на десктопе (из Категория.dc.html) ──────────────
const showScrollTop = ref(false)
let scrollTopTicking = false

function applyScrollTopVisibility() {
  scrollTopTicking = false
  showScrollTop.value = window.scrollY > 560
}

function onWindowScroll() {
  if (!scrollTopTicking) {
    scrollTopTicking = true
    requestAnimationFrame(applyScrollTopVisibility)
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
})

function cleanDescription(html: string | null, maxLength = 200): string {
  if (!html)
    return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

// --- 1.5. Brand Landing ---
const activeBrandSlug = computed(() => {
  const brandParam = route.query.brand
  if (!brandParam || Array.isArray(brandParam))
    return null
  return brandParam as string
})

const categoryBrandSeo = ref<{
  brand_id: string
  seo_h1: string | null
  seo_title: string | null
  seo_description: string | null
  seo_text: string | null
} | null>(null)
const brandSeoLoading = ref(false)

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
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

const displayableFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(
    f => f.display_type !== 'number_range' && f.display_type !== 'numeric',
  )
})

const _numericFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(f => f.display_type === 'numeric')
})

const numericAttributeRanges = ref<
  Record<number, { min: number, max: number }>
>({})
const accumulatedProducts = ref<CatalogProduct[]>([])
const isMobileFiltersOpen = ref(false)
const isSortDrawerOpen = ref(false)
const isSortPopoverOpen = ref(false)
const isSeoTextExpanded = ref(false)

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

const filteredProductLines = computed(() => {
  const selectedBrands = activeFilters.value.brandIds
  if (selectedBrands.length === 0)
    return availableProductLines.value
  return availableProductLines.value.filter(line =>
    selectedBrands.includes(line.brand_id),
  )
})

// --- 3. Вычисляемые свойства ---
const currentCategorySlug = computed(
  () => (route.params.slug as string[] | undefined)?.slice(-1)[0] ?? 'all',
)

const activeBrand = computed(() => {
  if (!activeBrandSlug.value || availableBrands.value.length === 0)
    return null
  return (
    availableBrands.value.find(b => b.slug === activeBrandSlug.value) || null
  )
})

const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (currentCategorySlug.value === 'all') {
    return [{ id: 'all', name: 'Все товары', href: '/catalog/all' }]
  }
  const crumbs = categoriesStore.getBreadcrumbs(currentCategorySlug.value)

  if (activeBrand.value && crumbs.length > 0) {
    return [
      ...crumbs,
      {
        id: `brand-${activeBrand.value.id}`,
        name: activeBrand.value.name,
      },
    ]
  }

  return crumbs
})

const currentCategory = computed(() => {
  if (!categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(
    c => c.slug === currentCategorySlug.value,
  )
})

const categoryOgImageUrl = computed(() => {
  const imageFilename = currentCategory.value?.image_url
  if (!imageFilename)
    return undefined
  return getVariantUrl(BUCKET_NAME_CATEGORY, imageFilename, 'lg')
})

const categoryName = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }
  const crumbs = categoriesStore.getBreadcrumbs(currentCategorySlug.value)
  if (crumbs && crumbs.length > 0)
    return crumbs[crumbs.length - 1]?.name
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

const title = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }

  if (activeBrand.value) {
    if (categoryBrandSeo.value?.seo_h1) {
      return categoryBrandSeo.value.seo_h1
    }
    const catName = categoryName.value || ''
    const brandName = activeBrand.value.name
    const prefix
      = catName.toLowerCase() === brandName.toLowerCase()
        ? catName
        : `${catName} ${brandName}`
    return `${prefix} в Алматы`
  }

  return currentCategory.value?.seo_h1 || categoryName.value
})

const priceRange = ref({ min: 0, max: 50000 })
const pieceCountRange = ref<{ min: number, max: number } | null>(null)

const subcategories = computed(() =>
  categoriesStore.getSubcategories(currentCategorySlug.value),
)

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

  if (
    activeFilters.value.price[0] !== priceRange.value.min
    || activeFilters.value.price[1] !== priceRange.value.max
  ) {
    count += 1
  }

  if (pieceCountRange.value && activeFilters.value.pieceCount) {
    if (
      activeFilters.value.pieceCount[0] !== pieceCountRange.value.min
      || activeFilters.value.pieceCount[1] !== pieceCountRange.value.max
    ) {
      count += 1
    }
  }

  Object.entries(activeFilters.value.numericAttributes).forEach(
    ([attrId, range]) => {
      const attrRange = numericAttributeRanges.value[Number(attrId)]
      if (
        attrRange
        && (range[0] !== attrRange.min || range[1] !== attrRange.max)
      ) {
        count += 1
      }
    },
  )

  return count
})

const canonicalUrl = computed(() => {
  const baseUrl = 'https://uhti.kz'
  const basePath
    = currentCategory.value?.canonical_url
      || currentCategory.value?.href
      || route.path

  const hasUniqueSeoContent = activeBrandSlug.value && categoryBrandSeo.value

  if (hasUniqueSeoContent) {
    return `${baseUrl}${basePath}?brand=${activeBrandSlug.value}`
  }

  return `${baseUrl}${basePath}`
})

const catalogFilters = computed<IProductFilters>(() => {
  const attributeFilters: AttributeFilter[] = Object.entries(
    activeFilters.value.attributes,
  )
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  const numericAttributeFilters: NumericAttributeFilter[] = Object.entries(
    activeFilters.value.numericAttributes,
  )
    .filter(([attrId, range]) => {
      const attrRange = numericAttributeRanges.value[Number(attrId)]
      return (
        attrRange && (range[0] !== attrRange.min || range[1] !== attrRange.max)
      )
    })
    .map(([attrId, range]) => ({
      attributeId: Number(attrId),
      minValue: range[0],
      maxValue: range[1],
    }))

  return {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds:
      activeFilters.value.subCategoryIds.length > 0
        ? activeFilters.value.subCategoryIds
        : undefined,
    brandIds:
      activeFilters.value.brandIds.length > 0
        ? activeFilters.value.brandIds
        : undefined,
    productLineIds:
      activeFilters.value.productLineIds.length > 0
        ? activeFilters.value.productLineIds
        : undefined,
    materialIds:
      activeFilters.value.materialIds.length > 0
        ? activeFilters.value.materialIds
        : undefined,
    countryIds:
      activeFilters.value.countryIds.length > 0
        ? activeFilters.value.countryIds
        : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
    pieceCountMin: activeFilters.value.pieceCount?.[0],
    pieceCountMax: activeFilters.value.pieceCount?.[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
    numericAttributes:
      numericAttributeFilters.length > 0 ? numericAttributeFilters : undefined,
  }
})

const {
  products: currentPageProducts,
  hasMore,
  isLoading: isLoadingProducts,
  isFetching,
} = await useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE)

const displayedProducts = computed<CatalogProduct[]>(() => {
  if (currentPage.value === 1) {
    return currentPageProducts.value as CatalogProduct[]
  }
  return accumulatedProducts.value
})

// --- 4. Функции-обработчики ---

function getArrayFromQuery(
  queryValue: LocationQueryValue | LocationQueryValue[] | undefined,
): string[] {
  if (!queryValue)
    return []
  if (Array.isArray(queryValue))
    return queryValue.filter(Boolean) as string[]
  return queryValue ? [queryValue] : []
}

function getSortByFromQuery(
  queryValue: LocationQueryValue | LocationQueryValue[] | undefined,
): SortByType {
  if (!queryValue)
    return 'popularity'
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue
  if (
    value === 'popularity'
    || value === 'newest'
    || value === 'price_asc'
    || value === 'price_desc'
  ) {
    return value
  }
  return 'popularity'
}

// ─── ОПТИМИЗАЦИЯ: разделение на критичные и некритичные данные ────────────────
// Критичные данные нужны для первого рендера (цены → фильтр цены → URL params)
// Некритичные грузятся после — не блокируют FCP/LCP
async function loadFilterData(slug: string) {
  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()
  isLoadingFilters.value = true

  try {
    const productsStore = useProductsStore()

    // ── ШАГ 1: только критичные данные (быстро, нужны для SSR) ──────────────
    const [priceRangeResult, pieceCountRangeResult] = await Promise.allSettled([
      productsStore.fetchPriceRangeForCategory(slug),
      productsStore.fetchPieceCountRangeForCategory(slug),
    ])

    const priceRangeData
      = priceRangeResult.status === 'fulfilled'
        ? priceRangeResult.value
        : { min_price: 0, max_price: 50000 }

    const priceMin = Math.floor(Number(priceRangeData.min_price))
    const priceMax = Math.ceil(Number(priceRangeData.max_price))
    priceRange.value = { min: priceMin, max: priceMax }

    const pieceCountRangeData
      = pieceCountRangeResult.status === 'fulfilled'
        ? pieceCountRangeResult.value
        : null
    pieceCountRange.value = pieceCountRangeData
      ? {
          min: pieceCountRangeData.min_count,
          max: pieceCountRangeData.max_count,
        }
      : null

    // ── Читаем query params и сразу инициализируем activeFilters ────────────
    // Это нужно до первого рендера, чтобы товары грузились с правильными фильтрами
    const priceMinFromQuery = route.query.price_min
      ? Number(route.query.price_min)
      : priceMin
    const priceMaxFromQuery = route.query.price_max
      ? Number(route.query.price_max)
      : priceMax

    const pieceCountMinFromQuery = route.query.piece_count_min
      ? Number(route.query.piece_count_min)
      : pieceCountRangeData?.min_count
    const pieceCountMaxFromQuery = route.query.piece_count_max
      ? Number(route.query.piece_count_max)
      : pieceCountRangeData?.max_count

    // Бренды по slug из URL (временно без полного списка брендов)
    const resolvedBrandIds = getArrayFromQuery(route.query.brands)

    activeFilters.value = {
      sortBy: getSortByFromQuery(route.query.sort_by),
      subCategoryIds: getArrayFromQuery(route.query.subcategories),
      price: [priceMinFromQuery, priceMaxFromQuery],
      pieceCount: pieceCountRangeData
        ? [
            pieceCountMinFromQuery ?? pieceCountRangeData.min_count,
            pieceCountMaxFromQuery ?? pieceCountRangeData.max_count,
          ]
        : null,
      brandIds: resolvedBrandIds,
      productLineIds: getArrayFromQuery(route.query.lines),
      materialIds: getArrayFromQuery(route.query.materials),
      countryIds: getArrayFromQuery(route.query.countries),
      attributes: {},
      numericAttributes: {},
    }

    currentPage.value = 1
    accumulatedProducts.value = []

    // ── ШАГ 2: Brand SEO — нужен для H1/title, грузим если есть brand в URL ─
    const brandSlugParam = route.query.brand
    if (brandSlugParam && !Array.isArray(brandSlugParam)) {
      brandSeoLoading.value = true
      try {
        const { data: seoData } = await supabase.rpc('get_category_brand_seo', {
          p_category_slug: slug,
          p_brand_slug: brandSlugParam,
        })
        categoryBrandSeo.value
          = seoData && seoData.length > 0 ? seoData[0] : null
      }
      catch {
        categoryBrandSeo.value = null
      }
      finally {
        brandSeoLoading.value = false
      }
    }
    else {
      categoryBrandSeo.value = null
    }

    // ── ШАГ 3: Некритичные данные — грузим ПАРАЛЛЕЛЬНО после рендера ────────
    // На сервере грузим сразу (нужно для hydration), на клиенте — после nextTick
    const loadNonCritical = async () => {
      const [
        brandsResult,
        productLinesResult,
        attributesResult,
        materialsResult,
        countriesResult,
      ] = await Promise.allSettled([
        productsStore.fetchBrandsForCategory(slug),
        productsStore.fetchProductLinesForCategory(slug),
        productsStore.fetchAttributesForCategory(slug),
        productsStore.fetchAllMaterials(),
        productsStore.fetchAllCountries(),
      ])

      availableBrands.value
        = brandsResult.status === 'fulfilled' ? brandsResult.value : []
      availableProductLines.value
        = productLinesResult.status === 'fulfilled'
          ? productLinesResult.value
          : []
      availableFilters.value = (
        attributesResult.status === 'fulfilled' ? attributesResult.value : []
      ) as FilterAttribute[]
      availableMaterials.value
        = materialsResult.status === 'fulfilled' ? materialsResult.value : []
      availableCountries.value
        = countriesResult.status === 'fulfilled' ? countriesResult.value : []

      // Numeric attribute ranges
      const numericAttrs = availableFilters.value.filter(
        f => f.display_type === 'numeric',
      )
      const numericRangesResults = await Promise.allSettled(
        numericAttrs.map(attr =>
          productsStore.fetchNumericAttributeRange(slug, attr.id),
        ),
      )

      const newNumericRanges: Record<number, { min: number, max: number }> = {}
      for (let i = 0; i < numericAttrs.length; i++) {
        const attr = numericAttrs[i]
        const result = numericRangesResults[i]
        if (!attr || !result)
          continue

        if (result.status === 'fulfilled') {
          const value = result.value
          if (value) {
            newNumericRanges[attr.id] = value
          }
        }
      }
      numericAttributeRanges.value = newNumericRanges

      // Инициализируем attribute-фильтры из URL теперь, когда знаем список атрибутов
      const newAttributeFilters: Record<string, (string | number)[]> = {}
      for (const attr of availableFilters.value) {
        const queryKey = `attr_${attr.slug}`
        const queryValue = route.query[queryKey]
        newAttributeFilters[attr.slug] = getArrayFromQuery(queryValue)
      }

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

      // Резолвим brand id по slug теперь, когда есть список брендов
      let resolvedBrandIdsWithSlug = getArrayFromQuery(route.query.brands)
      if (
        brandSlugParam
        && !Array.isArray(brandSlugParam)
        && availableBrands.value.length > 0
      ) {
        const brandBySlug = availableBrands.value.find(
          b => b.slug === brandSlugParam,
        )
        if (brandBySlug) {
          resolvedBrandIdsWithSlug = [brandBySlug.id]
        }
      }

      // Обновляем только те поля, которые требовали некритичных данных
      activeFilters.value = {
        ...activeFilters.value,
        brandIds: resolvedBrandIdsWithSlug,
        attributes: newAttributeFilters,
        numericAttributes: initNumericAttrs,
      }

      isNonCriticalLoaded.value = true
    }

    if (import.meta.server) {
      // На сервере грузим сразу — нужно для SSR hydration
      await loadNonCritical()
    }
    else {
      // На клиенте не блокируем рендер — грузим после первого фрейма
      isLoadingFilters.value = false
      nextTick(() => {
        loadNonCritical().finally(() => {
          isLoadingFilters.value = false
        })
      })
    }

    return {
      brands: availableBrands.value,
      productLines: availableProductLines.value,
      filters: availableFilters.value as FilterAttribute[],
      materials: availableMaterials.value,
      countries: availableCountries.value,
      priceRange: priceRange.value,
      pieceCountRange: pieceCountRange.value,
      numericRanges: numericAttributeRanges.value,
      activeFilters: activeFilters.value,
      categoryBrandSeo: categoryBrandSeo.value,
    }
  }
  catch (error: unknown) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Error loading filters:', error)
    }
    return null
  }
  finally {
    if (import.meta.server) {
      isLoadingFilters.value = false
    }
  }
}

function loadMoreProducts() {
  if (currentPage.value === 1) {
    accumulatedProducts.value = [
      ...currentPageProducts.value,
    ] as CatalogProduct[]
  }
  currentPage.value++
}

watch(
  () => activeFilters.value.brandIds,
  (newBrandIds) => {
    if (newBrandIds.length === 0)
      return
    const validLineIds = activeFilters.value.productLineIds.filter((lineId) => {
      const line = availableProductLines.value.find(l => l.id === lineId)
      return line && newBrandIds.includes(line.brand_id)
    })
    if (validLineIds.length !== activeFilters.value.productLineIds.length) {
      activeFilters.value = {
        ...activeFilters.value,
        productLineIds: validLineIds,
      }
    }
  },
)

watch(activeBrandSlug, async (newSlug) => {
  if (newSlug && availableBrands.value.length > 0) {
    const brand = availableBrands.value.find(b => b.slug === newSlug)
    if (brand) {
      const alreadySet
        = activeFilters.value.brandIds.length === 1
          && activeFilters.value.brandIds[0] === brand.id
      if (!alreadySet) {
        activeFilters.value = {
          ...activeFilters.value,
          brandIds: [brand.id],
          productLineIds: [],
        }
        currentPage.value = 1
        accumulatedProducts.value = []
      }
    }
    brandSeoLoading.value = true
    try {
      const { data: seoData } = await supabase.rpc('get_category_brand_seo', {
        p_category_slug: currentCategorySlug.value,
        p_brand_slug: newSlug,
      })
      categoryBrandSeo.value
        = seoData && seoData.length > 0 ? seoData[0] : null
    }
    catch {
      categoryBrandSeo.value = null
    }
    finally {
      brandSeoLoading.value = false
    }
  }
  else if (!newSlug) {
    if (activeFilters.value.brandIds.length > 0) {
      activeFilters.value = {
        ...activeFilters.value,
        brandIds: getArrayFromQuery(route.query.brands),
      }
      currentPage.value = 1
      accumulatedProducts.value = []
    }
    categoryBrandSeo.value = null
  }
})

watch(currentPageProducts, (newProducts) => {
  if (currentPage.value > 1 && newProducts.length > 0) {
    const existingIds = new Set(accumulatedProducts.value.map(p => p.id))
    const uniqueNewProducts = newProducts.filter(
      p => !existingIds.has(p.id),
    ) as CatalogProduct[]
    accumulatedProducts.value = [
      ...accumulatedProducts.value,
      ...uniqueNewProducts,
    ]
  }
})

function updateAttribute(
  checked: boolean,
  attributeSlug: string,
  optionId: string | number,
) {
  const stringId = String(optionId)
  const currentSelection: string[] = (
    activeFilters.value.attributes[attributeSlug] || []
  ).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (checked)
    newSelection.add(stringId)
  else newSelection.delete(stringId)

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

// ─── Сортировка — стеклянная пилюля из CatalogFilterBar.dc.html (десктоп) ──────
const catalogSortOptions: { value: SortByType, label: string }[] = [
  { value: 'popularity', label: 'Популярные' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_asc', label: 'Цена: по возрастанию' },
  { value: 'price_desc', label: 'Цена: по убыванию' },
]

const currentSortLabel = computed(
  () =>
    catalogSortOptions.find(o => o.value === activeFilters.value.sortBy)
      ?.label ?? catalogSortOptions[0].label,
)

function selectCatalogSort(value: SortByType) {
  activeFilters.value = { ...activeFilters.value, sortBy: value }
  isSortPopoverOpen.value = false
}

// ─── Бренды — вторая пилюля из CatalogFilterBar.dc.html (десктоп) ──────────────
const isBrandPopoverOpen = ref(false)

// Только один из двух поповеров бара открыт одновременно — тот же приём,
// что и в CategoryScrollBar.vue для пары «Сортировка»/«Категории».
watch(isSortPopoverOpen, (open) => {
  if (open)
    isBrandPopoverOpen.value = false
})
watch(isBrandPopoverOpen, (open) => {
  if (open)
    isSortPopoverOpen.value = false
})

function toggleCatalogBrand(checked: boolean, brandId: string) {
  const current = activeFilters.value.brandIds
  const next = checked
    ? [...current, brandId]
    : current.filter(id => id !== brandId)
  activeFilters.value = { ...activeFilters.value, brandIds: next }
}

// CategoryScrollBar's list toggles by id only (no separate checked flag),
// same shape as toggleSubCategory below — compute checked from current state.
function toggleCatalogBrandById(brandId: string) {
  toggleCatalogBrand(!activeFilters.value.brandIds.includes(brandId), brandId)
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

function resetAllFilters() {
  activeFilters.value = {
    sortBy: 'popularity',
    subCategoryIds: [],
    price: [priceRange.value.min, priceRange.value.max],
    pieceCount: pieceCountRange.value
      ? [pieceCountRange.value.min, pieceCountRange.value.max]
      : null,
    brandIds: [],
    productLineIds: [],
    materialIds: [],
    countryIds: [],
    attributes: {},
    numericAttributes: {},
  }
}

function updateQueryParams() {
  const query: Record<string, any> = {}

  if (activeFilters.value.sortBy !== 'popularity') {
    query.sort_by = activeFilters.value.sortBy
  }

  if (activeFilters.value.subCategoryIds.length > 0) {
    query.subcategories = activeFilters.value.subCategoryIds
  }

  if (activeBrandSlug.value && activeFilters.value.brandIds.length === 1) {
    const matchedBrand = availableBrands.value.find(
      b => b.id === activeFilters.value.brandIds[0],
    )
    if (matchedBrand && matchedBrand.slug === activeBrandSlug.value) {
      query.brand = activeBrandSlug.value
    }
    else {
      query.brands = activeFilters.value.brandIds
    }
  }
  else if (activeFilters.value.brandIds.length > 0) {
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
  return (
    activeFiltersCount.value > 0 || activeFilters.value.sortBy !== 'popularity'
  )
})

const categoryDescription = computed(
  () => currentCategory.value?.description || null,
)

const selectedSingleLine = computed(() => {
  if (activeFilters.value.productLineIds.length !== 1)
    return null
  return (
    availableProductLines.value.find(
      l => l.id === activeFilters.value.productLineIds[0],
    ) || null
  )
})

const selectedSingleBrand = computed(() => {
  if (activeFilters.value.brandIds.length !== 1)
    return null
  return (
    availableBrands.value.find(
      b => b.id === activeFilters.value.brandIds[0],
    ) || null
  )
})

const minPrice = computed(() => {
  if (!displayedProducts.value || displayedProducts.value.length === 0)
    return null
  return Math.min(
    ...displayedProducts.value.map(p => p.final_price || p.price),
  )
})

const categoryStats = computed(() => {
  let totalReviews = 0
  let sumRatings = 0

  displayedProducts.value.forEach((p) => {
    if (Number(p.review_count) > 0) {
      totalReviews += Number(p.review_count)
      sumRatings += (Number(p.avg_rating) || 5) * Number(p.review_count)
    }
  })

  return {
    reviews: totalReviews,
    rating:
      totalReviews > 0
        ? (sumRatings / totalReviews).toFixed(1).replace('.', ',')
        : null,
  }
})

const topBrands = computed(() => {
  if (!availableBrands.value || availableBrands.value.length === 0)
    return []

  return availableBrands.value
    .slice()
    .sort((a, b) => (b.products_count || 0) - (a.products_count || 0))
    .slice(0, 3)
    .map(b => b.name)
})

const metaDescription = computed(() => {
  if (activeBrand.value && categoryBrandSeo.value) {
    if (categoryBrandSeo.value.seo_description) {
      return categoryBrandSeo.value.seo_description
    }

    return generateBrandCategoryDescription({
      brandName: activeBrand.value.name,
      brandSlug: activeBrand.value.slug,
      categoryName: categoryName.value,
      categorySlug: currentCategorySlug.value,
      productsCount:
        categoryBrandSeo.value.products_count || displayedProducts.value.length,
      minPrice: categoryBrandSeo.value.min_price || minPrice.value || 0,
      maxPrice: categoryBrandSeo.value.min_price || 0,
      rating: categoryBrandSeo.value.avg_rating || undefined,
      reviewsCount: categoryBrandSeo.value.total_reviews || undefined,
    })
  }

  if (currentCategory.value?.meta_description) {
    // Вводная часть: текст категории плюс ходовые бренды. Раньше тут стояли
    // две обрезки через substring, и обе рубили посреди слова — в выдаче это
    // читалось как «…оружие и транспорт дл», «…широкий выбо», «…помощники в ».
    // Логика с тестами лежит в utils/seoDescription.ts.
    // Хвостовая точка снимается там же, отдельная проверка больше не нужна.
    const cleanText = composeCategoryLead(
      currentCategory.value.meta_description,
      topBrands.value,
    )

    const parts = [cleanText]

    if (minPrice.value) {
      parts.push(
        `💰 Цены от ${new Intl.NumberFormat('ru-RU').format(minPrice.value)} ₸`,
      )
    }

    if (categoryStats.value.reviews > 0) {
      const ratingValue
        = Number.parseFloat(categoryStats.value.rating.replace(',', '.')) || 5
      const starCount = Math.round(ratingValue)
      const starEmojis = '⭐'.repeat(starCount)
      parts.push(
        `${starEmojis} ${categoryStats.value.rating} (${categoryStats.value.reviews} отз)`,
      )
    }

    parts.push('Быстрая доставка по Алматы за 1 день. Заказывайте оригиналы!')

    return clampDescription(parts.join('. '))
  }

  if (!hasActiveFilters.value && minPrice.value && topBrands.value.length > 0) {
    const ratingValue
      = categoryStats.value.reviews > 0
        ? Number.parseFloat(categoryStats.value.rating.replace(',', '.'))
        : undefined

    return generateCategoryDescription({
      categoryName: categoryName.value,
      topBrands: topBrands.value,
      minPrice: minPrice.value,
      city: 'Алматы',
      rating: ratingValue,
      reviewsCount:
        categoryStats.value.reviews > 0
          ? categoryStats.value.reviews
          : undefined,
    })
  }

  const catName = categoryName.value
  const productsCount = displayedProducts.value.length

  let snippet = `${catName} в Ухтышке`

  if (productsCount > 0) {
    snippet += `. В каталоге ${productsCount} ${productsCount === 1 ? 'модель' : productsCount < 5 ? 'модели' : 'моделей'}`
  }

  if (minPrice.value) {
    snippet += `. 💰 Цены от ${new Intl.NumberFormat('ru-RU').format(minPrice.value)} ₸`
  }

  if (categoryStats.value.reviews > 0) {
    const ratingValue
      = Number.parseFloat(categoryStats.value.rating.replace(',', '.')) || 5
    const starCount = Math.round(ratingValue)
    const starEmojis = '⭐'.repeat(starCount)
    snippet += `. ${starEmojis} ${categoryStats.value.rating} (${categoryStats.value.reviews} отз)`
  }

  snippet += '. Быстрая доставка по Алматы за 1 день. Заказывайте оригиналы!'

  return snippet.length > 165 ? `${snippet.substring(0, 162)}...` : snippet
})

const metaTitle = computed(() => {
  if (activeBrand.value) {
    if (categoryBrandSeo.value?.seo_title) {
      return categoryBrandSeo.value.seo_title
    }
    const catName = categoryName.value
    const brandName = activeBrand.value.name
    const prefix
      = catName.toLowerCase() === brandName.toLowerCase()
        ? catName
        : `${catName} ${brandName}`

    const priceText = minPrice.value
      ? ` — от ${formatPrice(minPrice.value)} ₸`
      : ''
    return `${prefix}${priceText} | Ухтышка`
  }

  if (selectedSingleLine.value) {
    const brandName = selectedSingleBrand.value?.name || ''
    const lineName = selectedSingleLine.value.name
    const prefix = brandName ? `${brandName} ${lineName}` : lineName
    const priceText = minPrice.value
      ? ` — от ${formatPrice(minPrice.value)} ₸`
      : ''
    return `${prefix}${priceText} | Ухтышка`
  }

  if (hasActiveFilters.value) {
    return `${categoryName.value} - Фильтр | Ухтышка`
  }

  if (currentCategory.value?.meta_title) {
    return currentCategory.value.meta_title
  }

  const seoTitle = currentCategory.value?.seo_title
  if (seoTitle) {
    return seoTitle
  }

  return `${categoryName.value} купить в интернет-магазине Ухтышка Казахстан`
})

const metaKeywords = computed(() => {
  const metaKw = currentCategory.value?.meta_keywords
  if (metaKw && metaKw.length > 0) {
    return metaKw.join(', ')
  }
  const keywords = currentCategory.value?.seo_keywords
  if (keywords && keywords.length > 0) {
    return keywords.join(', ')
  }
  return null
})

const seoText = computed(() => {
  if (activeBrand.value && categoryBrandSeo.value?.seo_text) {
    return sanitizeHtml(categoryBrandSeo.value.seo_text)
  }

  const text = currentCategory.value?.seo_text
  return text ? sanitizeHtml(text) : null
})

const seoBlocks = computed(() => {
  if (!seoText.value || import.meta.server)
    return []
  return parseHTMLToBlocks(seoText.value)
})

const robotsRule = computed(() => {
  const hasUniqueSeoContent = activeBrandSlug.value && categoryBrandSeo.value

  if (hasUniqueSeoContent) {
    return { index: true, follow: true }
  }

  if (
    activeFiltersCount.value > 0
    || activeFilters.value.sortBy !== 'popularity'
  ) {
    return { noindex: true, follow: true }
  }

  return { index: true, follow: true }
})

// --- 5. Загрузка данных ---
const [{ data: _categoriesData }, { data: _filterPayload }] = await Promise.all(
  [
    useAsyncData(
      `catalog-meta-${currentCategorySlug.value}`,
      () => categoriesStore.fetchCategoryData(),
      { watch: [currentCategorySlug] },
    ),
    useAsyncData(
      `catalog-filters-${currentCategorySlug.value}`,
      () => loadFilterData(currentCategorySlug.value),
      {
        watch: [currentCategorySlug],
        server: true,
      },
    ),
  ],
)

if (import.meta.client && _filterPayload.value) {
  availableBrands.value = _filterPayload.value.brands
  availableProductLines.value = _filterPayload.value.productLines
  availableFilters.value = _filterPayload.value.filters
  availableMaterials.value = _filterPayload.value.materials
  availableCountries.value = _filterPayload.value.countries
  priceRange.value = _filterPayload.value.priceRange
  pieceCountRange.value = _filterPayload.value.pieceCountRange
  numericAttributeRanges.value = _filterPayload.value.numericRanges
  activeFilters.value = _filterPayload.value.activeFilters
  categoryBrandSeo.value = _filterPayload.value.categoryBrandSeo
  isLoadingFilters.value = false
}

// FAQ загружаем обычным способом
const { data: categoryQuestions } = await useAsyncData(
  `catalog-faq-${currentCategorySlug.value}-${activeBrandSlug.value || 'all'}`,
  async () => {
    const category = categoriesStore.allCategories.find(
      c => c.slug === currentCategorySlug.value,
    )
    if (!category?.id || currentCategorySlug.value === 'all')
      return []

    try {
      if (activeBrandSlug.value && categoryBrandSeo.value) {
        const { data } = await supabase
          .from('category_brand_questions')
          .select('*')
          .eq('category_id', category.id)
          .eq('brand_id', categoryBrandSeo.value.brand_id)
          .order('created_at', { ascending: true })

        if (data && data.length > 0) {
          return data.map(q => ({
            id: q.id,
            question: q.question_text,
            answer: q.answer_text,
          }))
        }
      }

      return await categoryQuestionsStore.fetchQuestions(category.id)
    }
    catch (error) {
      console.error('Error fetching FAQ:', error)
      return []
    }
  },
  {
    watch: [currentCategorySlug, activeBrandSlug],
    server: true,
  },
)

const faqQuestions = computed(() => categoryQuestions.value || [])

const currentCategoryId = computed(() => {
  const cat = categoriesStore.allCategories.find(
    c => c.slug === currentCategorySlug.value,
  )
  return cat?.id || null
})

const { data: categoryRatingData } = useQuery({
  queryKey: ['category-rating', currentCategoryId],
  queryFn: async () => {
    if (!currentCategoryId.value || currentCategorySlug.value === 'all')
      return null

    const { data, error } = await supabase.rpc(
      'get_category_aggregate_rating',
      {
        p_category_id: currentCategoryId.value,
      },
    )
    if (error) {
      console.error('Error fetching category rating:', error)
      return null
    }
    return data as { avg_rating: number, total_reviews: number } | null
  },
  enabled: computed(
    () => !!currentCategoryId.value && currentCategorySlug.value !== 'all',
  ),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

const showCategoryRating = computed(
  () =>
    categoryRatingData.value
    && categoryRatingData.value.total_reviews >= 3
    && categoryRatingData.value.avg_rating > 0,
)

// ─── ОПТИМИЗАЦИЯ: stringify вместо deep watcher ────────────────────────────────
// deep: true на большом объекте — дорогая операция на каждое изменение
// JSON.stringify сравнивает строку — в разы дешевле для сложных объектов
watchDebounced(
  () => JSON.stringify(activeFilters.value),
  () => {
    currentPage.value = 1
    accumulatedProducts.value = []
    updateQueryParams()
  },
  { debounce: 300 },
)

useRobotsRule(robotsRule)

const isLoading = computed(
  () =>
    isLoadingFilters.value
    || (isLoadingProducts.value && currentPage.value === 1),
)

const ogImageDescription = computed(() => {
  if (hasActiveFilters.value) {
    return `Найдено товаров: ${displayedProducts.value.length}`
  }
  return 'Широкий ассортимент качественных товаров по выгодным ценам'
})

defineOgImageComponent('OgImageCatalog', {
  title: title.value,
  description: ogImageDescription.value,
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
  robots: computed(() =>
    robotsRule.value.noindex ? 'noindex, follow' : 'index, follow',
  ),
})

useBreadcrumbSchema(
  computed(() =>
    breadcrumbs.value.map(crumb => ({
      name: crumb.name,
      ...(crumb.href ? { path: crumb.href } : {}),
    })),
  ),
)

/**
 * Preload картинки первого товара.
 *
 * LCP страницы категории — это именно она. Сетка теперь приходит в разметке,
 * но браузер добирается до её <img> только дочитав тело страницы, а тело
 * конкурирует за канал с двумя десятками modulepreload из <head>. Ссылка
 * в самой голове даёт запросу стартовать раньше.
 *
 * srcset и sizes повторяют то, что объявляет карточка (ProductCard.vue ->
 * ProgressiveImage): иначе браузер выберет другой кандидат и скачает лишний
 * файл вместо нужного.
 */
const lcpImageVariants = computed(() => {
  const imageUrl = displayedProducts.value?.[0]?.product_images?.[0]?.image_url
  if (!imageUrl)
    return null

  return {
    sm: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm'),
    md: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'md'),
    lg: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'lg'),
  }
})

useHead(() => {
  const links: any[] = [{ rel: 'canonical', href: canonicalUrl.value }]

  const lcp = lcpImageVariants.value
  if (lcp?.sm) {
    links.push({
      rel: 'preload',
      as: 'image',
      href: lcp.sm,
      imagesrcset: [
        lcp.sm ? `${lcp.sm} 400w` : null,
        lcp.md ? `${lcp.md} 800w` : null,
        lcp.lg ? `${lcp.lg} 1440w` : null,
      ]
        .filter(Boolean)
        .join(', '),
      imagesizes: '(max-width: 767px) 50vw, (max-width: 1024px) 33vw, 25vw',
      fetchpriority: 'high',
    })
  }

  return {
    meta: [{ name: 'keywords', content: metaKeywords.value || '' }],
    link: links,
  }
})

// ─── ОПТИМИЗАЦИЯ: useSchemaOrg откладываем на клиенте ─────────────────────────
// JSON-LD с 10 товарами + ShippingDetails + ReturnPolicy = тяжёлый computation
// На сервере нужен для SEO, на клиенте — блокирует главный поток без пользы
const schemaData = computed(() => {
  const schemas: any[] = []

  // CollectionPage — самая важная для SEO, генерируем всегда
  schemas.push({
    '@type': 'CollectionPage',
    'name': metaTitle.value,
    'description': metaDescription.value,
    'url': canonicalUrl.value,
    'isPartOf': {
      '@type': 'WebSite',
      'name': 'Ухтышка',
      'url': 'https://uhti.kz',
    },
    ...(categoryOgImageUrl.value && { image: categoryOgImageUrl.value }),
    ...(metaKeywords.value && { keywords: metaKeywords.value }),
    ...(seoText.value && {
      mainEntity: {
        '@type': 'Article',
        'headline': title.value,
        'image': 'https://uhti.kz/logo.png',
        'articleBody': cleanDescription(seoText.value, 500),
        'author': {
          '@type': 'Organization',
          'name': 'Ухтышка',
          'url': 'https://uhti.kz',
        },
      },
    }),
    ...(displayedProducts.value.length > 0 && {
      numberOfItems: displayedProducts.value.length,
    }),
    ...(categoryRatingData.value
      && categoryRatingData.value.total_reviews > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        'ratingValue': categoryRatingData.value.avg_rating,
        'reviewCount': categoryRatingData.value.total_reviews,
        'bestRating': 5,
        'worstRating': 1,
      },
    }),
  })

  // SiteNavigationElement
  const subcatParts = subcategories.value.slice(0, 6).map(cat => ({
    '@type': 'WebPage',
    'name': cat.name,
    'url': `https://uhti.kz${cat.href}`,
  }))
  const brandParts = availableBrands.value.slice(0, 6).map(brand => ({
    '@type': 'WebPage',
    'name': `${categoryName.value} ${brand.name}`,
    'url': `https://uhti.kz${currentCategory.value?.href}?brand=${brand.slug}`,
  }))
  const navParts = [...subcatParts, ...brandParts]
  if (navParts.length > 0) {
    schemas.push({
      '@type': 'SiteNavigationElement',
      'name': `Подкатегории ${categoryName.value}`,
      'hasPart': navParts,
    })
  }

  // ItemList — тяжёлая часть, только если данные загружены
  if (displayedProducts.value.length > 0) {
    schemas.push({
      '@type': 'ItemList',
      'numberOfItems': displayedProducts.value.length,
      'itemListElement': displayedProducts.value
        .slice(0, 10)
        .map((product, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'item': {
            '@type': 'Product',
            'name': product.name,
            'description': cleanDescription(product.description) || product.name,
            'url': `https://uhti.kz/catalog/products/${product.slug}`,
            'sku': product.sku || product.id,
            'mpn': product.sku || product.id,
            'brand': {
              '@type': 'Brand',
              'name': product.brands?.name || 'Ухтышка',
              ...(product.brands?.slug && {
                url: `https://uhti.kz/brand/${product.brands.slug}`,
              }),
            },
            ...(product.barcode && { gtin: product.barcode }),
            ...(product.product_images?.[0]?.image_url && {
              image: getImageUrl(
                BUCKET_NAME_PRODUCT,
                product.product_images[0].image_url,
                IMAGE_SIZES.CARD,
              ),
            }),
            'offers': {
              '@type': 'Offer',
              'price': product.final_price || product.price,
              'priceCurrency': 'KZT',
              'availability':
                product.stock_quantity > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              'url': `https://uhti.kz/catalog/products/${product.slug}`,
              'priceValidUntil': priceValidUntil,
              'seller': { '@type': 'Organization', 'name': 'Ухтышка' },
              'hasMerchantReturnPolicy': {
                '@type': 'MerchantReturnPolicy',
                'applicableCountry': 'KZ',
                'returnPolicyCategory':
                  'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays': 14,
                'returnMethod': 'https://schema.org/ReturnByMail',
                'returnFees': 'https://schema.org/FreeReturn',
              },
              'shippingDetails': {
                '@type': 'OfferShippingDetails',
                'shippingDestination': {
                  '@type': 'DefinedRegion',
                  'addressCountry': 'KZ',
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
            ...(Number(product.review_count) > 0
              && product.avg_rating && {
              aggregateRating: {
                '@type': 'AggregateRating',
                'ratingValue': product.avg_rating,
                'reviewCount': product.review_count,
                'bestRating': 5,
                'worstRating': 1,
              },
            }),
          },
        })),
    })
  }

  return schemas
})

if (import.meta.server) {
  // На сервере регистрируем сразу — нужно для SEO-краулеров
  useSchemaOrg(schemaData)
}
else {
  // На клиенте откладываем до после первого рендера — не блокируем главный поток
  onMounted(() => {
    nextTick(() => {
      useSchemaOrg(schemaData)
    })
  })
}
</script>

<template>
  <CategoryMobileHeader
    :sort-active="isSortDrawerOpen"
    :filters-active="isMobileFiltersOpen"
    :has-active-filters="activeFiltersCount > 0"
    @sort="isSortDrawerOpen = true"
    @filters="isMobileFiltersOpen = true"
  />

  <CategoryScrollBar
    v-model:sort-by="activeFilters.sortBy"
    :subcategories="subcategories"
    :active-subcategory-ids="activeFilters.subCategoryIds"
    :brands="availableBrands"
    :active-brand-ids="activeFilters.brandIds"
    @toggle-subcategory="toggleSubCategory"
    @toggle-brand="toggleCatalogBrandById"
  />

  <div :class="`${containerClass} py-4 lg:py-8`">
    <!-- ─── ОПТИМИЗАЦИЯ: убрали ClientOnly — breadcrumbs доступны на сервере ─── -->
    <!-- ClientOnly скрывал хлебные крошки до гидрации, увеличивая FCP -->
    <Breadcrumbs
      v-if="breadcrumbs && breadcrumbs.length > 0"
      :items="breadcrumbs"
      class="mb-3 lg:mb-6"
      compact
    />

    <!-- ЕДИНСТВЕННЫЙ H1 ДЛЯ SEO И ЛЮДЕЙ -->
    <h1
      class="text-xl md:text-3xl font-bold mb-1 lg:mb-2 transition-opacity duration-200"
      :class="brandSeoLoading ? 'opacity-0' : 'opacity-100'"
    >
      {{ title }}
    </h1>
    <CategoryRatingBlock
      v-if="showCategoryRating"
      :avg-rating="categoryRatingData!.avg_rating"
      :total-reviews="categoryRatingData!.total_reviews"
      class="mb-3 lg:mb-4"
    />
    <div v-else class="mb-3 lg:mb-4" />

    <!-- Бренды как 3-й уровень навигации (перед товарами) -->
    <CategoryBrands
      v-if="availableBrands.length > 1 && !activeBrandSlug"
      :brands="availableBrands"
      :category-slug="currentCategorySlug"
      :category-name="categoryName || undefined"
      :active-brand-slug="activeBrandSlug"
    />

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Десктоп фильтры -->
      <ClientOnly>
        <aside class="hidden lg:block col-span-1">
          <DynamicFilters
            v-model="activeFilters"
            :available-filters="
              availableFilters as unknown as AttributeWithValue[]
            "
            :available-brands="availableBrands"
            :available-product-lines="filteredProductLines"
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
                  <div
                    v-for="i in 4"
                    :key="i"
                    class="flex items-center space-x-2"
                  >
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
          <!-- Подкатегории на мобильных — горизонтальная лента чипов, из Категория.dc.html -->
          <div
            v-if="subcategories.length > 0"
            class="flex lg:hidden cf-chip-scroller"
          >
            <button
              v-for="cat in subcategories"
              :key="cat.id"
              type="button"
              class="cf-chip"
              :class="{
                'cf-chip--active': activeFilters.subCategoryIds.includes(
                  cat.id,
                ),
              }"
              @click="toggleSubCategory(cat.id)"
            >
              {{ cat.name }}
            </button>
          </div>

          <!-- Атрибутные фильтры (в потоке, не sticky) — сортировка и чипы подкатегорий
               теперь в статичном баре CatalogFilterBar над breadcrumbs. Скрываем весь
               блок целиком, если показывать нечего — иначе остаётся пустая полоса
               с бордером (сортировка раньше всегда заполняла эту строку). -->
          <div
            v-if="!isLoadingFilters && displayableFilters.length > 0"
            class="lg:bg-white dark:lg:bg-card lg:py-3 lg:border-b lg:border-border"
          >
            <div class="flex flex-wrap items-center gap-2">
              <template v-for="filter in displayableFilters" :key="filter.id">
                <!-- Select type -->
                <Popover v-if="filter.display_type === 'select'">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="cf-glass-btn hidden lg:inline-flex"
                      :class="{
                        'cf-glass-btn--active':
                          (activeFilters.attributes[filter.slug] || []).length
                          > 0,
                      }"
                    >
                      {{ filter.name }}
                      <span
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        class="cf-glass-badge"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </span>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-60"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="
                            (activeFilters.attributes[filter.slug] || [])
                              .length > 0
                          "
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
                            :model-value="
                              (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id)
                            "
                            @update:model-value="
                              (checked) =>
                                updateAttribute(
                                  !!checked,
                                  filter.slug,
                                  option.id,
                                )
                            "
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
                    <button
                      type="button"
                      class="cf-glass-btn hidden lg:inline-flex"
                      :class="{
                        'cf-glass-btn--active':
                          (activeFilters.attributes[filter.slug] || []).length
                          > 0,
                      }"
                    >
                      {{ filter.name }}
                      <span
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        class="cf-glass-badge"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </span>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-60"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="
                            (activeFilters.attributes[filter.slug] || [])
                              .length > 0
                          "
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
                          :style="{
                            backgroundColor: (
                              option.meta as { hex?: string } | null
                            )?.hex,
                          }"
                          class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                          :class="{
                            'border-primary ring-2 ring-primary ring-offset-2':
                              (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id),
                            'border-border': !(
                              activeFilters.attributes[filter.slug] || []
                            ).includes(option.id),
                          }"
                          @click="
                            () => {
                              const isCurrentlyChecked = (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id);
                              updateAttribute(
                                !isCurrentlyChecked,
                                filter.slug,
                                option.id,
                              );
                            }
                          "
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </template>
            </div>
          </div>

          <!-- Сортировка + бренды + чипы подкатегорий (десктоп) — над сеткой
               товаров, из CatalogFilterBar.dc.html. Без фона: просто ряд пилюль. -->
          <div class="hidden lg:flex items-center gap-2">
            <CatalogHeader
              v-model:sort-by="activeFilters.sortBy"
              v-model:open="isSortDrawerOpen"
              hide-mobile-trigger
              hide-desktop-trigger
            />

            <Popover v-model:open="isSortPopoverOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="cf-glass-btn inline-flex"
                  :class="{
                    'cf-glass-btn--active': activeFilters.sortBy !== 'popularity',
                  }"
                >
                  {{ currentSortLabel }}
                  <Icon
                    name="lucide:chevron-down"
                    class="w-3.5 h-3.5 opacity-60 transition-transform"
                    :class="{ 'rotate-180': isSortPopoverOpen }"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                class="w-56 p-1.5 rounded-2xl shadow-xl flex flex-col gap-0.5"
              >
                <button
                  v-for="option in catalogSortOptions"
                  :key="option.value"
                  type="button"
                  class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-accent"
                  :class="{ 'font-bold': activeFilters.sortBy === option.value }"
                  @click="selectCatalogSort(option.value)"
                >
                  {{ option.label }}
                  <Icon
                    v-if="activeFilters.sortBy === option.value"
                    name="lucide:check"
                    class="w-4 h-4 text-primary"
                  />
                </button>
              </PopoverContent>
            </Popover>

            <Popover v-if="availableBrands.length > 0" v-model:open="isBrandPopoverOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="cf-glass-btn inline-flex"
                  :class="{ 'cf-glass-btn--active': activeFilters.brandIds.length > 0 }"
                >
                  Бренды
                  <span v-if="activeFilters.brandIds.length > 0" class="cf-glass-badge">
                    {{ activeFilters.brandIds.length }}
                  </span>
                  <Icon
                    name="lucide:chevron-down"
                    class="w-3.5 h-3.5 opacity-60 transition-transform"
                    :class="{ 'rotate-180': isBrandPopoverOpen }"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                class="w-60 p-1.5 rounded-2xl shadow-xl flex flex-col gap-1 max-h-80 overflow-y-auto"
              >
                <div
                  v-for="brand in availableBrands"
                  :key="brand.id"
                  class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent"
                >
                  <Checkbox
                    :id="`cfb-brand-${brand.id}`"
                    :model-value="activeFilters.brandIds.includes(brand.id)"
                    @update:model-value="(checked) => toggleCatalogBrand(!!checked, brand.id)"
                  />
                  <Label
                    :for="`cfb-brand-${brand.id}`"
                    class="flex-1 min-w-0 flex items-center justify-between gap-2 font-normal cursor-pointer text-sm"
                  >
                    <span class="truncate">{{ brand.name }}</span>
                    <span v-if="brand.products_count" class="text-xs text-muted-foreground shrink-0">
                      {{ brand.products_count }}
                    </span>
                  </Label>
                </div>
              </PopoverContent>
            </Popover>

            <div
              v-if="subcategories.length > 0"
              class="flex cf-chip-scroller flex-1 min-w-0"
            >
              <button
                v-for="cat in subcategories"
                :key="cat.id"
                type="button"
                class="cf-chip"
                :class="{
                  'cf-chip--active': activeFilters.subCategoryIds.includes(cat.id),
                }"
                @click="toggleSubCategory(cat.id)"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>
        </div>

        <!-- Контент с плавным переходом.
             ClientOnly здесь больше нет: под ним сетка товаров не попадала
             в разметку вовсе, сервер отдавал 68 скелетонов, и LCP на мобиле
             доходил до 10 с — картинки начинали грузиться только после того,
             как браузер скачает и разберёт JS и заново сходит за товарами.
             Данные для сервера даёт useCatalogQuery. -->
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
                <button
                  type="button"
                  class="cf-glass-btn cf-glass-btn--lg inline-flex"
                  :disabled="isFetching"
                  @click="loadMoreProducts"
                >
                  <span v-if="isFetching">Загрузка...</span>
                  <template v-else>
                    <span>Показать ещё</span>
                    <Icon name="lucide:chevron-down" class="w-4 h-4" />
                  </template>
                </button>
              </div>

              <div
                v-if="isFetching && currentPage > 1"
                class="text-center text-sm text-muted-foreground"
              >
                Загрузка товаров...
              </div>
            </div>

            <div
              v-else
              class="text-center py-16 bg-white dark:bg-card border border-border rounded-[22px]"
            >
              <div
                class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4"
              >
                <Icon
                  name="lucide:package-open"
                  class="w-7 h-7 text-muted-foreground"
                />
              </div>
              <h3 class="text-xl font-bold">
                {{
                  hasActiveFilters
                    ? "Товары не найдены"
                    : "Скоро здесь появятся товары"
                }}
              </h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{
                  hasActiveFilters
                    ? "Попробуйте изменить фильтры или выбрать другую категорию."
                    : "Мы работаем над наполнением этой категории. Загляните позже!"
                }}
              </p>
              <button
                v-if="hasActiveFilters"
                type="button"
                class="cf-glass-btn cf-glass-btn--primary mt-5 inline-flex"
                @click="resetAllFilters"
              >
                <Icon name="lucide:x" class="w-4 h-4" />
                Сбросить все фильтры
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- SEO текст категории -->
    <ClientOnly>
      <SEOContentRenderer
        v-if="seoBlocks.length > 0 && !hasActiveFilters"
        :blocks="seoBlocks"
        class="mt-8"
      />
    </ClientOnly>

    <!-- FAQ блок для категории -->
    <ClientOnly>
      <CategoryQuestions
        v-if="currentCategory"
        :category-id="currentCategory.id"
        :category-name="currentCategory.name"
      />
    </ClientOnly>

    <!-- Отзывы категории -->
    <ClientOnly>
      <!-- Показывать или нет — решает сам компонент: у него есть данные по всей
           категории, а categoryStats считает только по текущей странице выдачи,
           из-за чего блок то появлялся, то исчезал при смене страницы -->
      <CategoryReviews
        v-if="currentCategory"
        :category-id="currentCategory.id"
        :category-name="currentCategory.name"
        class="mt-8"
      />
    </ClientOnly>

    <!-- Другие бренды внизу (показываем только когда бренд уже выбран) -->
    <CategoryBrands
      v-if="availableBrands.length > 1 && activeBrandSlug"
      :brands="availableBrands"
      :category-slug="currentCategorySlug"
      :category-name="categoryName || undefined"
      :active-brand-slug="activeBrandSlug"
    />

    <!-- Линейки продуктов в категории -->
    <CategoryProductLines
      v-if="availableProductLines.length > 0"
      :product-lines="availableProductLines"
      :brands="availableBrands"
    />

    <!-- Мобильные компоненты -->
    <ClientOnly>
      <!-- Мобильные фильтры (bottom sheet) -->
      <MobileCatalogDrawer
        v-model="activeFilters"
        :open="isMobileFiltersOpen"
        :available-filters="availableFilters as unknown as AttributeWithValue[]"
        :available-brands="availableBrands"
        :available-product-lines="filteredProductLines"
        :price-range="priceRange"
        :piece-count-range="pieceCountRange"
        :available-materials="availableMaterials"
        :available-countries="availableCountries"
        :numeric-attribute-ranges="numericAttributeRanges"
        :is-loading="isLoadingFilters"
        @update:open="isMobileFiltersOpen = $event"
      />
    </ClientOnly>
  </div>

  <!-- Плавающая кнопка «Наверх» — только десктоп, из Категория.dc.html -->
  <button
    v-if="showScrollTop"
    type="button"
    class="hidden lg:flex cf-scrolltop"
    aria-label="Наверх"
    @click="scrollToTop"
  >
    <Icon name="lucide:arrow-up" class="w-4 h-4 text-primary" />
    Наверх
  </button>
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
  @keyframes shimmer {
    0% {
      background-position: -200% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  /* ─── Стеклянные пилюли из Категория.dc.html (панель управления, чипсы, "Наверх") ─── */
  /* display здесь задавать нельзя: scoped-стиль компилируется вне @layer, а
     утилиты Tailwind лежат в @layer utilities, и беслойное правило бьёт слой
     независимо от специфичности. Пока тут стоял display: inline-flex, классы
     `hidden` и `lg:inline-flex` на кнопках атрибутных фильтров не работали
     вовсе, и кнопки для десктопа были видны на мобильном. Раскладку задаём
     утилитами на самой кнопке. */
  .cf-glass-btn {
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.9), rgba(224, 233, 247, 0.55));
    -webkit-backdrop-filter: blur(14px) saturate(1.7);
    backdrop-filter: blur(14px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 -1px 2px rgba(15, 23, 42, 0.06),
      0 6px 18px rgba(15, 23, 42, 0.1);
    color: var(--foreground);
    font: 600 14px var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .cf-glass-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .cf-glass-btn--active {
    border-color: var(--primary);
    background: linear-gradient(150deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.6));
    color: var(--blue-700);
  }

  .cf-glass-btn--lg {
    height: 50px;
    padding: 0 26px;
    font-size: 15px;
  }

  .cf-glass-btn--primary {
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: linear-gradient(150deg, rgba(77, 148, 255, 0.95), rgba(23, 101, 235, 0.85));
    color: #fff;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -2px 8px rgba(6, 53, 138, 0.28),
      0 8px 20px rgba(43, 127, 255, 0.35);
  }

  .cf-glass-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font: 700 11px var(--font-sans);
  }

  .cf-chip-scroller {
    /* display is driven by the Tailwind flex/hidden/lg:* utilities on each
       usage site — a scoped display here would out-specificity them (see
       mobilenav-dc-port memory) and the element would never actually hide. */
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .cf-chip-scroller::-webkit-scrollbar {
    display: none;
  }

  .cf-chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: none;
    background: var(--muted);
    color: var(--foreground);
    font: 600 13.5px var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .cf-chip--active {
    background: rgba(43, 127, 255, 0.12);
    color: var(--primary);
    font-weight: 700;
  }

  .cf-scrolltop {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 70;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.18));
    -webkit-backdrop-filter: blur(24px) saturate(1.9);
    backdrop-filter: blur(24px) saturate(1.9);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 0 -1px 1px rgba(15, 23, 42, 0.05),
      0 12px 32px rgba(15, 23, 42, 0.18);
    color: var(--foreground);
    font: 700 13px var(--font-sans);
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .cf-scrolltop:active {
    transform: translateX(-50%) scale(0.96);
  }
}
</style>

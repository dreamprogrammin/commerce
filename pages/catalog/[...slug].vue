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
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CategoryBrands from '@/components/category/CategoryBrands.vue'
import CategoryProductLines from '@/components/category/CategoryProductLines.vue'
import CategoryQuestions from '@/components/category/CategoryQuestions.vue'
import CategoryRatingBlock from '@/components/category/CategoryRatingBlock.vue'
import CategoryReviews from '@/components/category/CategoryReviews.vue'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import DynamicFiltersMobile from '@/components/global/DynamicFiltersMobile.vue'
import SEOContentRenderer from '@/components/category/SEOContentRenderer.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCatalogQuery } from '@/composables/useCatalogQuery'
import { useSafeHtml } from '@/composables/useSafeHtml'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants'
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
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const { sanitizeHtml } = useSafeHtml()

// Загружаем категории если ещё не загружены
if (!categoriesStore.allCategories.length) {
  await categoriesStore.fetchAllCategories()
}

const priceValidUntil = new Date(
  new Date().setFullYear(new Date().getFullYear() + 1),
)
  .toISOString()
  .split('T')[0]

const abortController = ref<AbortController | null>(null)

onUnmounted(() => {
  if (abortController.value) {
    abortController.value.abort()
  }
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
const isSubcategoriesDrawerOpen = ref(false)
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
  () => (route.params.slug as string[]).slice(-1)[0] ?? 'all',
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
  let basePath: string

  if (currentCategory.value?.canonical_url) {
    basePath = currentCategory.value.canonical_url
  }
  else if (currentCategory.value?.href) {
    basePath = currentCategory.value.href
  }
  else {
    basePath = route.path
  }

  if (activeBrandSlug.value) {
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
} = useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE)

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

const supabase = useSupabaseClient()

async function loadFilterData(slug: string) {
  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()
  isLoadingFilters.value = true

  try {
    const productsStore = useProductsStore()

    const results = await Promise.allSettled([
      productsStore.fetchBrandsForCategory(slug),
      productsStore.fetchProductLinesForCategory(slug),
      productsStore.fetchAttributesForCategory(slug),
      productsStore.fetchAllMaterials(),
      productsStore.fetchAllCountries(),
      productsStore.fetchPriceRangeForCategory(slug),
      productsStore.fetchPieceCountRangeForCategory(slug),
    ])

    const [
      brandsResult,
      productLinesResult,
      attributesResult,
      materialsResult,
      countriesResult,
      priceRangeResult,
      pieceCountRangeResult,
    ] = results

    availableBrands.value
      = brandsResult.status === 'fulfilled' ? brandsResult.value : []
    availableProductLines.value
      = productLinesResult.status === 'fulfilled' ? productLinesResult.value : []
    availableFilters.value = (
      attributesResult.status === 'fulfilled' ? attributesResult.value : []
    ) as FilterAttribute[]
    availableMaterials.value
      = materialsResult.status === 'fulfilled' ? materialsResult.value : []
    availableCountries.value
      = countriesResult.status === 'fulfilled' ? countriesResult.value : []

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

    const newAttributeFilters: Record<string, (string | number)[]> = {}
    for (const attr of availableFilters.value) {
      const queryKey = `attr_${attr.slug}`
      const queryValue = route.query[queryKey]
      newAttributeFilters[attr.slug] = getArrayFromQuery(queryValue)
    }

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

    let resolvedBrandIds = getArrayFromQuery(route.query.brands)
    const brandSlugParam = route.query.brand
    if (
      brandSlugParam
      && !Array.isArray(brandSlugParam)
      && availableBrands.value.length > 0
    ) {
      const brandBySlug = availableBrands.value.find(
        b => b.slug === brandSlugParam,
      )
      if (brandBySlug) {
        resolvedBrandIds = [brandBySlug.id]
      }
    }

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
      attributes: newAttributeFilters,
      numericAttributes: initNumericAttrs,
    }

    currentPage.value = 1
    accumulatedProducts.value = []

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
    isLoadingFilters.value = false
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
    pieceCount: pieceCountRange.value ? [pieceCountRange.value.min, pieceCountRange.value.max] : null,
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

// 1. Ищем минимальную цену для заманухи
const minPrice = computed(() => {
  if (!displayedProducts.value || displayedProducts.value.length === 0)
    return null
  return Math.min(
    ...displayedProducts.value.map(p => p.final_price || p.price),
  )
})

// 2. Считаем реальные отзывы категории
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

const metaDescription = computed(() => {
  // Базовый текст в зависимости от контекста
  let baseText = ''

  if (activeBrand.value) {
    if (categoryBrandSeo.value?.seo_description) {
      baseText = categoryBrandSeo.value.seo_description
    }
    else {
      const catName = (categoryName.value || '').toLowerCase()
      const brandName = activeBrand.value.name
      const productName
        = catName === brandName.toLowerCase()
          ? brandName
          : `${catName} ${brandName}`
      baseText = `В каталоге Ухтышка вы можете купить ${productName}. Большой выбор, гарантия оригинала, доставка по Алматы.`
    }
  }
  else if (selectedSingleLine.value) {
    const brandName = selectedSingleBrand.value?.name || ''
    const lineName = selectedSingleLine.value.name
    const prefix = brandName ? `${brandName} ${lineName}` : lineName
    baseText = `${prefix} — широкий ассортимент в интернет-магазине Ухтышка. Быстрая доставка в Алматы и по Казахстану.`
  }
  else if (hasActiveFilters.value) {
    baseText = `Результаты фильтрации для категории "${categoryName.value}". Широкий выбор товаров.`
  }
  else if (currentCategory.value?.meta_description) {
    baseText = currentCategory.value.meta_description
  }
  else if (categoryDescription.value) {
    baseText = categoryDescription.value
  }
  else {
    baseText = `${categoryName.value} купить в интернет-магазине Ухтышка ✔️ Большой выбор, доставка по Алматы и Казахстану`
  }

  // Очищаем от HTML-тегов
  const cleanText = baseText.replace(/<[^>]*>/g, '').trim()

  // Добавляем динамические данные (цена и рейтинг)
  const pricePart = minPrice.value
    ? ` 💰 От ${new Intl.NumberFormat('ru-RU').format(minPrice.value)} ₸.`
    : ''

  const ratingPart
    = categoryStats.value.reviews > 0
      ? ` ⭐ Рейтинг: ${categoryStats.value.rating} (${categoryStats.value.reviews} отз).`
      : ''

  // Склеиваем и обрезаем до безопасной длины (200 символов для Google)
  const finalSnippet = `${cleanText}${pricePart}${ratingPart}`
  return finalSnippet.length > 200
    ? `${finalSnippet.substring(0, 197)}...`
    : finalSnippet
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
    return `Купить ${prefix} в Алматы | Ухтышка`
  }

  if (selectedSingleLine.value) {
    const brandName = selectedSingleBrand.value?.name || ''
    const lineName = selectedSingleLine.value.name
    const prefix = brandName ? `${brandName} ${lineName}` : lineName
    return `Купить ${prefix} в Алматы | Ухтышка`
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
  if (activeBrandSlug.value && activeFilters.value.brandIds.length === 1) {
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

await useAsyncData(
  `catalog-meta-${currentCategorySlug.value}`,
  () => categoriesStore.fetchCategoryData(),
  { watch: [currentCategorySlug] },
)

const { data: _filterPayload } = await useAsyncData(
  `catalog-filters-${currentCategorySlug.value}`,
  () => loadFilterData(currentCategorySlug.value),
  {
    watch: [currentCategorySlug],
    server: true,
  },
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

const { data: categoryQuestions } = await useAsyncData(
  `catalog-faq-${currentCategorySlug.value}`,
  async () => {
    const category = categoriesStore.allCategories.find(
      c => c.slug === currentCategorySlug.value,
    )
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

// ─── useHead: только meta keywords + canonical, без JSON-LD ─────────────────
useHead(() => ({
  meta: [{ name: 'keywords', content: metaKeywords.value || '' }],
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))

// ─── useSchemaOrg: все JSON-LD схемы — гарантированный SSR ──────────────────
useSchemaOrg(
  computed(() => {
    const schemas: any[] = []

    // 1. CollectionPage
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
      // FIX: добавлены image и url в author для Article schema
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

    // 2. SiteNavigationElement (подкатегории + бренды)
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

    // 3. ItemList (список товаров с ценами)
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
              // FIX: очищаем HTML и обрезаем до 200 символов
              'description':
                cleanDescription(product.description) || product.name,
              'url': `https://uhti.kz/catalog/products/${product.slug}`,

              // ✅ 1. Артикул (есть всегда)
              'sku': product.sku || product.id,
              'mpn': product.sku || product.id,

              // ✅ 2. Бренд (с фоллбэком на магазин)
              'brand': {
                '@type': 'Brand',
                'name': product.brands?.name || 'Ухтышка',
                ...(product.brands?.slug && {
                  url: `https://uhti.kz/brand/${product.brands.slug}`,
                }),
              },

              // ✅ 3. Штрихкод (только если существует)
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
                // 🔥 Используем final_price из базы данных (с психологическим округлением)
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
              // Показываем рейтинг только если есть реальные отзывы
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

    // 4. FAQPage — без фильтров ИЛИ на Brand Landing (?brand=X)
    if (
      faqQuestions.value.length > 0
      && (!hasActiveFilters.value || activeBrand.value)
    ) {
      schemas.push({
        '@type': 'FAQPage',
        'mainEntity': faqQuestions.value.map(q => ({
          '@type': 'Question',
          'name': q.question_text,
          'acceptedAnswer': {
            '@type': 'Answer',
            // Удаляем HTML-теги для Schema.org, но сохраняем структуру текста
            'text': (q.answer_text || 'Ответ скоро будет добавлен.')
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
              .trim(),
          },
        })),
      })
    }

    return schemas
  }),
)
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
      v-if="currentCategory && (currentCategory.description || seoText)"
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
              :src="
                getVariantUrl(
                  BUCKET_NAME_CATEGORY,
                  currentCategory.image_url,
                  'md',
                )
              "
              :alt="currentCategory.name"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="currentCategory.blur_placeholder || undefined"
              :eager="true"
              class="w-full h-full"
            />
          </div>

          <!-- Заголовок (только мобильная версия) -->
          <h1
            class="text-xl font-bold flex-1 leading-tight lg:hidden transition-opacity duration-200"
            :class="brandSeoLoading ? 'opacity-0' : 'opacity-100'"
          >
            {{ title }}
          </h1>
        </div>

        <!-- Рейтинг категории (мобильная) -->
        <CategoryRatingBlock
          v-if="showCategoryRating"
          :avg-rating="categoryRatingData!.avg_rating"
          :total-reviews="categoryRatingData!.total_reviews"
        />

        <!-- Описание (обрезанное) -->
        <p
          v-if="currentCategory.description"
          class="text-sm text-muted-foreground leading-relaxed line-clamp-2"
        >
          {{ currentCategory.description }}
        </p>

        <!-- SEO текст (HTML) -->
        <div
          v-else-if="seoText"
          class="text-sm text-muted-foreground leading-relaxed line-clamp-2 prose prose-sm max-w-none"
          v-html="seoText"
        />

        <!-- Компактная статистика -->
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <ClientOnly>
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:package" class="w-3.5 h-3.5 text-blue-500" />
              <span>{{ displayedProducts.length }}</span>
            </div>
          </ClientOnly>
          <ClientOnly>
            <div
              v-if="availableBrands.length > 0"
              class="flex items-center gap-1.5"
            >
              <Icon name="lucide:award" class="w-3.5 h-3.5 text-purple-500" />
              <span>{{ availableBrands.length }}</span>
            </div>
          </ClientOnly>
          <ClientOnly>
            <div
              v-if="priceRange.min > 0 || priceRange.max < 50000"
              class="flex items-center gap-1.5"
            >
              <Icon name="lucide:tag" class="w-3.5 h-3.5 text-green-500" />
              <span>от
                {{ new Intl.NumberFormat("ru-RU").format(priceRange.min) }}
                ₸</span>
            </div>
          </ClientOnly>
        </div>
      </div>

      <!-- Десктопная версия (оригинальная) -->
      <div class="hidden lg:grid grid-cols-12 gap-6 items-start">
        <!-- Картинка категории слева -->
        <div v-if="currentCategory.image_url" class="col-span-3">
          <div
            class="w-full max-w-[220px] h-[160px] rounded-lg overflow-hidden shadow-md bg-gray-50 dark:bg-gray-900 flex items-center justify-center"
          >
            <ProgressiveImage
              :src="
                getVariantUrl(
                  BUCKET_NAME_CATEGORY,
                  currentCategory.image_url,
                  'md',
                )
              "
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
        <div
          :class="currentCategory.image_url ? 'col-span-9' : 'col-span-12'"
          class="space-y-4"
        >
          <!-- Заголовок (только десктопная версия) -->
          <h1
            class="hidden lg:block text-2xl md:text-3xl font-bold min-h-[4.5rem] transition-opacity duration-200"
            :class="brandSeoLoading ? 'opacity-0' : 'opacity-100'"
          >
            {{ title }}
          </h1>

          <!-- Рейтинг категории (десктоп) -->
          <CategoryRatingBlock
            v-if="showCategoryRating"
            :avg-rating="categoryRatingData!.avg_rating"
            :total-reviews="categoryRatingData!.total_reviews"
          />

          <!-- Описание категории из БД -->
          <p
            v-if="currentCategory.description"
            class="text-base text-muted-foreground leading-relaxed"
          >
            {{ currentCategory.description }}
          </p>

          <!-- SEO текст (HTML) -->
          <div
            v-else-if="seoText"
            class="text-base text-muted-foreground leading-relaxed prose max-w-none"
            v-html="seoText"
          />

          <!-- Статистика категории -->
          <div class="flex flex-wrap gap-4 pt-2">
            <ClientOnly>
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon name="lucide:package" class="w-4 h-4 text-blue-500" />
                <span>{{ displayedProducts.length }} товаров</span>
              </div>
            </ClientOnly>
            <ClientOnly>
              <div
                v-if="availableBrands.length > 0"
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon name="lucide:award" class="w-4 h-4 text-purple-500" />
                <span>{{ availableBrands.length }} брендов</span>
              </div>
            </ClientOnly>
            <ClientOnly>
              <div
                v-if="priceRange.min > 0 || priceRange.max < 50000"
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon name="lucide:tag" class="w-4 h-4 text-green-500" />
                <span>от
                  {{ new Intl.NumberFormat("ru-RU").format(priceRange.min) }}
                  ₸</span>
              </div>
            </ClientOnly>
          </div>
        </div>
      </div>
    </div>

    <!-- Заголовок для случая с активными фильтрами или без описания -->
    <template v-else>
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
    </template>

    <!-- 🔥 Бренды как 3-й уровень навигации (перед товарами) -->
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
          <!-- Подкатегории на мобильных -->
          <div v-if="subcategories.length > 0" class="lg:hidden">
            <div class="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                class="inline-flex flex-1 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-purple-500/40 transition-all duration-200 whitespace-nowrap shrink-0 snap-start hover:scale-[1.02] active:scale-95"
                @click="isSubcategoriesDrawerOpen = true"
              >
                <Icon
                  :name="
                    activeFilters.subCategoryIds.length > 0
                      ? 'lucide:layers'
                      : 'lucide:grid-2x2'
                  "
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
                class="lg:hidden h-11 w-11 p-0 shrink-0 relative transition-colors"
                :class="[
                  activeFiltersCount > 0
                    ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
                    : '',
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

            <div
              v-if="!isLoadingFilters && availableFilters.length > 0"
              class="h-6 w-px bg-border hidden lg:block"
            />

            <template v-if="!isLoadingFilters && availableFilters.length > 0">
              <template v-for="filter in displayableFilters" :key="filter.id">
                <!-- Select type -->
                <Popover v-if="filter.display_type === 'select'">
                  <PopoverTrigger as-child>
                    <Button
                      :variant="
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'default'
                          : 'outline'
                      "
                      class="hidden lg:inline-flex h-11 gap-2 transition-colors"
                      :class="[
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
                          : '',
                      ]"
                    >
                      {{ filter.name }}
                      <Badge
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        variant="secondary"
                        class="h-5 min-w-5 flex items-center justify-center p-0 px-1.5 text-xs bg-white text-blue-500"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </Badge>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-50"
                      />
                    </Button>
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
                    <Button
                      :variant="
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'default'
                          : 'outline'
                      "
                      class="hidden lg:inline-flex h-11 gap-2 transition-colors"
                      :class="[
                        (activeFilters.attributes[filter.slug] || []).length > 0
                          ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
                          : '',
                      ]"
                    >
                      {{ filter.name }}
                      <Badge
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        variant="secondary"
                        class="h-5 min-w-5 flex items-center justify-center p-0 px-1.5 text-xs bg-white text-blue-500"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </Badge>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-50"
                      />
                    </Button>
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

              <div
                v-if="isFetching && currentPage > 1"
                class="text-center text-sm text-muted-foreground"
              >
                Загрузка товаров...
              </div>
            </div>

            <div
              v-else
              class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg"
            >
              <Icon name="lucide:package-open" class="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 class="text-2xl font-semibold">
                {{ hasActiveFilters ? 'Товары не найдены' : 'Скоро здесь появятся товары' }}
              </h3>
              <p class="mt-2">
                {{ hasActiveFilters 
                  ? 'Попробуйте изменить фильтры или выбрать другую категорию.' 
                  : 'Мы работаем над наполнением этой категории. Загляните позже!' 
                }}
              </p>
              <Button
                v-if="hasActiveFilters"
                variant="outline"
                class="mt-4"
                @click="resetAllFilters"
              >
                <Icon name="lucide:x" class="w-4 h-4 mr-2" />
                Сбросить все фильтры
              </Button>
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
      <CategoryReviews
        v-if="currentCategory && categoryStats.reviews > 0"
        :category-id="currentCategory.id"
        :category-name="currentCategory.name"
        :total-reviews="categoryStats.reviews"
        :average-rating="categoryStats.rating"
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
      <!-- Мобильные фильтры (Sheet) -->
      <DynamicFiltersMobile
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
                :class="
                  activeFilters.subCategoryIds.includes(cat.id)
                    ? 'bg-white/20'
                    : 'bg-background/50'
                "
              >
                <Icon
                  :name="
                    activeFilters.subCategoryIds.includes(cat.id)
                      ? 'lucide:check'
                      : 'lucide:folder'
                  "
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

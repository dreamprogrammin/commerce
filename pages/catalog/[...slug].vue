<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type { AttributeFilter, AttributeWithValue, BrandForFilter, Country, IBreadcrumbItem, IProductFilters, Material, ProductWithGallery, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()
const containerClass = carouselContainerVariants({ contained: 'always' })

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ СТРАНИЦЫ ---
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true)
const isLoadingMore = ref(false)
const hasMoreProducts = ref(true)
const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<AttributeWithValue[]>([])
const availableBrands = ref<BrandForFilter[]>([])
const availableMaterials = ref<Material[]>([])
const availableCountries = ref<Country[]>([])
const isInitialLoad = ref(true)
const priceRange = ref({ min: 0, max: 50000 })

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
  brandIds: string[]
  materialIds: string[]
  countryIds: string[]
  attributes: Record<string, (string | number)[]>
}

const activeFilters = ref<ActiveFilters>({
  sortBy: getSortByFromQuery(route.query.sort_by),
  subCategoryIds: [],
  price: [0, 50000],
  brandIds: [],
  materialIds: [],
  countryIds: [],
  attributes: {},
})

// --- 3. Вычисляемые свойства ---
const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? 'all')
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (currentCategorySlug.value === 'all') {
    return [{ id: 'all', name: 'Все товары', href: '/catalog/all' }]
  }
  return categoriesStore.getBreadcrumbs(currentCategorySlug.value)
})
const title = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }
  const path = breadcrumbs.value
  if (path && path.length > 0)
    return path[path.length - 1]?.name
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

// --- 4. Функции-обработчики ---

function getSortByFromQuery(queryValue: LocationQueryValue | LocationQueryValue[] | undefined): SortByType {
  if (!queryValue) {
    return 'popularity'
  }
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue
  if (value === 'popularity' || value === 'newest' || value === 'price_asc' || value === 'price_desc') {
    return value
  }
  return 'popularity'
}

/**
 * Инициализирует фильтры с загруженными данными
 */
function initializeFiltersWithData(brands: BrandForFilter[], attributes: AttributeWithValue[], materials: Material[], countries: Country[], priceRangeData: any) {
  availableBrands.value = brands
  availableFilters.value = attributes
  availableMaterials.value = materials
  availableCountries.value = countries

  const priceMin = priceRangeData.min_price
  const priceMax = priceRangeData.max_price
  priceRange.value = { min: priceMin, max: priceMax }

  // Инициализируем динамические атрибуты
  const newAttributeFilters: Record<string, any[]> = {}
  for (const attr of attributes) {
    newAttributeFilters[attr.slug] = []
  }

  activeFilters.value = {
    sortBy: getSortByFromQuery(route.query.sort_by),
    subCategoryIds: [],
    price: [priceMin, priceMax],
    brandIds: [],
    materialIds: [],
    countryIds: [],
    attributes: newAttributeFilters,
  }
}

/**
 * Главная функция загрузки товаров
 */
async function loadProducts(isLoadMore = false) {
  const slug = currentCategorySlug.value
  if (!slug)
    return

  if (isLoadMore) {
    isLoadingMore.value = true
  }
  else {
    isLoading.value = true
    currentPage.value = 1
    products.value = []
  }

  const brandIds = activeFilters.value.brandIds
  const materialIds = activeFilters.value.materialIds
  const countryIds = activeFilters.value.countryIds

  const attributeFilters: AttributeFilter[] = Object.entries(activeFilters.value.attributes)
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    brandIds: brandIds.length > 0 ? brandIds : undefined,
    materialIds: materialIds.length > 0 ? materialIds : undefined,
    countryIds: countryIds.length > 0 ? countryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
  }

  try {
    const { products: newProducts, hasMore } = await productsStore.fetchProducts(filters, currentPage.value, PAGE_SIZE)

    if (isLoadMore) {
      products.value.push(...newProducts)
    }
    else {
      products.value = newProducts
    }

    hasMoreProducts.value = hasMore

    if (!isLoadMore && newProducts.length > 0) {
      const prices = newProducts.map(p => Number(p.price))
      const newMin = Math.floor(Math.min(...prices))
      const newMax = Math.ceil(Math.max(...prices))
      priceRange.value = { min: newMin, max: newMax }
    }

    currentPage.value++
  }
  finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

async function loadMoreProducts() {
  await loadProducts(true)
}

// --- 5. SSR ЗАГРУЗКА ДАННЫХ (СЕРВЕРНАЯ СТОРОНА) ---
// ⭐ Загружаем ФИЛЬТРЫ и ТОВАРЫ на сервере
const { data: catalogData } = await useAsyncData(
  `catalog-data-${currentCategorySlug.value}`,
  async () => {
    // Загружаем категории на сервере
    await categoriesStore.fetchCategoryData()

    const slug = currentCategorySlug.value

    // Загружаем фильтры параллельно
    const [brands, attributes, materials, countries, priceRange] = await Promise.all([
      productsStore.fetchBrandsForCategory(slug),
      productsStore.fetchAttributesForCategory(slug),
      productsStore.fetchAllMaterials(),
      productsStore.fetchAllCountries(),
      productsStore.fetchPriceRangeForCategory(slug),
    ])

    // Формируем начальные фильтры для первой загрузки товаров
    const newAttributeFilters: Record<string, any[]> = {}
    for (const attr of attributes) {
      newAttributeFilters[attr.slug] = []
    }

    const priceMin = priceRange.min_price
    const priceMax = priceRange.max_price

    const initialFilters: IProductFilters = {
      categorySlug: slug,
      sortBy: getSortByFromQuery(route.query.sort_by),
      subCategoryIds: undefined,
      brandIds: undefined,
      materialIds: undefined,
      countryIds: undefined,
      priceMin,
      priceMax,
      attributes: undefined,
    }

    // ⭐ Загружаем ТОВАРЫ на сервере тоже!
    const { products: initialProducts, hasMore } = await productsStore.fetchProducts(
      initialFilters,
      1,
      PAGE_SIZE,
    )

    return {
      brands,
      attributes,
      materials,
      countries,
      priceRange,
      initialProducts,
      hasMore,
    }
  },
  { watch: [currentCategorySlug], lazy: false },
)

// Инициализируем фильтры и товары, когда данные загрузились
watch(
  catalogData,
  (data) => {
    if (data) {
      initializeFiltersWithData(
        data.brands,
        data.attributes,
        data.materials,
        data.countries,
        data.priceRange,
      )

      // Устанавливаем товары, которые уже загрузились на сервере
      products.value = data.initialProducts
      hasMoreProducts.value = data.hasMore
      currentPage.value = 2 // Следующая страница будет 2
      isLoading.value = false
      isInitialLoad.value = false // Пропускаем первое срабатывание watch на activeFilters
    }
  },
  { immediate: true },
)

// Реактивная загрузка товаров при изменении фильтров
watchDebounced(
  activeFilters,
  () => {
    if (isInitialLoad.value) {
      isInitialLoad.value = false
      return
    }
    loadProducts(false)
  },
  { debounce: 500, deep: true },
)
</script>

<template>
  <div :class="`${containerClass} py-8`">
    <ClientOnly>
      <Breadcrumbs :items="breadcrumbs" class="mb-6" />
      <h1 class="text-3xl font-bold mb-6 capitalize">
        {{ title }}
      </h1>
      <template #fallback>
        <div class="mb-6 h-6 w-1/3 rounded-lg bg-gray-200 animate-pulse" />
      </template>
    </ClientOnly>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <DynamicFilters
          v-model="activeFilters"
          :available-filters="availableFilters"
          :available-brands="availableBrands"
          :price-range="priceRange"
          :available-materials="availableMaterials"
          :available-countries="availableCountries"
          :is-loading="isLoading"
        />
      </aside>

      <main class="col-span-3 min-w-0">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" />

        <ProductGridSkeleton v-if="isLoading" />
        <div v-else-if="products.length > 0" class="space-y-8">
          <ProductGrid :products="products" />
          <div v-if="hasMoreProducts" class="text-center">
            <Button variant="outline" size="lg" :disabled="isLoadingMore" @click="loadMoreProducts">
              <span v-if="isLoadingMore">Загрузка...</span>
              <span v-else>Показать ещё</span>
            </Button>
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
      </main>
    </div>
  </div>
</template>

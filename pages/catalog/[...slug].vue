<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type { AttributeFilter, AttributeWithValue, BrandForFilter, Country, IBreadcrumbItem, IProductFilters, Material, ProductWithGallery, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import DynamicFiltersMobile from '@/components/global/DynamicFiltersMobile.vue'
import { useCatalogQuery } from '@/composables/useCatalogQuery'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()
const containerClass = carouselContainerVariants({ contained: 'always' })

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<AttributeWithValue[]>([])
const availableBrands = ref<BrandForFilter[]>([])
const availableMaterials = ref<Material[]>([])
const availableCountries = ref<Country[]>([])
const isLoadingFilters = ref(true)
const accumulatedProducts = ref<ProductWithGallery[]>([])
const isMobileFiltersOpen = ref(false) // 🔥 Состояние для мобильных фильтров

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

const priceRange = ref({ min: 0, max: 50000 })

// 🔥 Подсчет активных фильтров
const activeFiltersCount = computed(() => {
  let count = 0

  count += activeFilters.value.subCategoryIds.length
  count += activeFilters.value.brandIds.length
  count += activeFilters.value.materialIds.length
  count += activeFilters.value.countryIds.length

  Object.values(activeFilters.value.attributes).forEach((values) => {
    count += values.length
  })

  if (activeFilters.value.price[0] !== priceRange.value.min
    || activeFilters.value.price[1] !== priceRange.value.max) {
    count += 1
  }

  return count
})

// 🔥 Формируем фильтры для запроса
const catalogFilters = computed<IProductFilters>(() => {
  const attributeFilters: AttributeFilter[] = Object.entries(activeFilters.value.attributes)
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  return {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    brandIds: activeFilters.value.brandIds.length > 0 ? activeFilters.value.brandIds : undefined,
    materialIds: activeFilters.value.materialIds.length > 0 ? activeFilters.value.materialIds : undefined,
    countryIds: activeFilters.value.countryIds.length > 0 ? activeFilters.value.countryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
  }
})

// 🔥 НОВОЕ: Используем Vue Query для товаров
const {
  products: currentPageProducts,
  hasMore,
  isLoading: isLoadingProducts,
  isFetching,
} = useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE)

// 🔥 Отображаемые товары (накопленные при "Показать еще")
const displayedProducts = computed(() => {
  if (currentPage.value === 1) {
    return currentPageProducts.value
  }
  return accumulatedProducts.value
})

// --- 4. Функции-обработчики ---

function getSortByFromQuery(queryValue: LocationQueryValue | LocationQueryValue[] | undefined): SortByType {
  if (!queryValue)
    return 'popularity'
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue
  if (value === 'popularity' || value === 'newest' || value === 'price_asc' || value === 'price_desc') {
    return value
  }
  return 'popularity'
}

// 🔥 Загрузка метаданных фильтров (из Pinia Store с кэшем)
async function loadFilterData(slug: string) {
  isLoadingFilters.value = true

  try {
    const [brands, attributes, materials, countries, priceRangeData] = await Promise.all([
      productsStore.fetchBrandsForCategory(slug),
      productsStore.fetchAttributesForCategory(slug),
      productsStore.fetchAllMaterials(),
      productsStore.fetchAllCountries(),
      productsStore.fetchPriceRangeForCategory(slug),
    ])

    availableBrands.value = brands
    availableFilters.value = attributes
    availableMaterials.value = materials
    availableCountries.value = countries

    const priceMin = priceRangeData.min_price
    const priceMax = priceRangeData.max_price
    priceRange.value = { min: priceMin, max: priceMax }

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

    currentPage.value = 1
    accumulatedProducts.value = []
  }
  finally {
    isLoadingFilters.value = false
  }
}

// 🔥 Загрузка следующей страницы
function loadMoreProducts() {
  if (currentPage.value === 1) {
    accumulatedProducts.value = [...currentPageProducts.value]
  }
  currentPage.value++
}

// 🔥 Отслеживаем загрузку новой страницы и добавляем товары
watch(currentPageProducts, (newProducts) => {
  if (currentPage.value > 1 && newProducts.length > 0) {
    const existingIds = new Set(accumulatedProducts.value.map(p => p.id))
    const uniqueNewProducts = newProducts.filter(p => !existingIds.has(p.id))
    accumulatedProducts.value = [...accumulatedProducts.value, ...uniqueNewProducts]
  }
})

// --- 5. Логика загрузки данных и реакции на изменения ---

await useAsyncData(
  `catalog-meta-${currentCategorySlug.value}`,
  () => categoriesStore.fetchCategoryData(),
  { watch: [currentCategorySlug] },
)

watch(
  currentCategorySlug,
  (newSlug) => {
    if (newSlug) {
      loadFilterData(newSlug)
    }
  },
  { immediate: true },
)

// 🔥 При изменении фильтров - сбрасываем на первую страницу
watchDebounced(
  activeFilters,
  () => {
    currentPage.value = 1
    accumulatedProducts.value = []
  },
  { debounce: 500, deep: true },
)

// 🔥 Общий индикатор загрузки
const isLoading = computed(() => isLoadingFilters.value || (isLoadingProducts.value && currentPage.value === 1))
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
      <!-- Десктоп фильтры -->
      <aside class="hidden lg:block col-span-1 lg:sticky top-24 self-start">
        <DynamicFilters
          v-model="activeFilters"
          :available-filters="availableFilters"
          :available-brands="availableBrands"
          :price-range="priceRange"
          :available-materials="availableMaterials"
          :available-countries="availableCountries"
          :is-loading="isLoadingFilters"
        />
      </aside>

      <div class="col-span-1 lg:col-span-3 min-w-0">
        <!-- Мобильная кнопка фильтров + CatalogHeader в одной строке -->
        <div class="mb-4 flex items-center gap-3">
          <!-- Кнопка фильтров (только на мобилке) -->
          <Button
            variant="outline"
            class="lg:hidden h-11 shrink-0"
            @click="isMobileFiltersOpen = true"
          >
            <Icon name="lucide:sliders-horizontal" class="w-4 h-4 mr-2" />
            Фильтры
            <Badge v-if="activeFiltersCount > 0" variant="secondary" class="ml-2">
              {{ activeFiltersCount }}
            </Badge>
          </Button>

          <!-- CatalogHeader (занимает оставшееся место) -->
          <div class="flex-1 min-w-0">
            <CatalogHeader v-model:sort-by="activeFilters.sortBy" />
          </div>
        </div>

        <!-- Скелетон при первой загрузке -->
        <ProductGridSkeleton v-if="isLoading" />

        <!-- Товары -->
        <div v-else-if="displayedProducts.length > 0" class="space-y-8">
          <ProductGrid :products="displayedProducts" />

          <!-- Кнопка "Показать еще" -->
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

          <!-- Индикатор фоновой загрузки -->
          <div v-if="isFetching && currentPage > 1" class="text-center text-sm text-muted-foreground">
            Загрузка товаров...
          </div>
        </div>

        <!-- Пустое состояние -->
        <div v-else class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
          <h3 class="text-2xl font-semibold">
            Товары не найдены
          </h3>
          <p class="mt-2">
            Попробуйте изменить фильтры или выбрать другую категорию.
          </p>
        </div>
      </div>
    </div>

    <!-- Мобильные фильтры (Sheet) -->
    <DynamicFiltersMobile
      v-model="activeFilters"
      :open="isMobileFiltersOpen"
      :available-filters="availableFilters"
      :available-brands="availableBrands"
      :price-range="priceRange"
      :available-materials="availableMaterials"
      :available-countries="availableCountries"
      :is-loading="isLoadingFilters"
      @update:open="isMobileFiltersOpen = $event"
    />
  </div>
</template>

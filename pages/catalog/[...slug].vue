<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type { AttributeFilter, AttributeWithValue, BrandForFilter, Country, IBreadcrumbItem, IProductFilters, Material, ProductWithGallery, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import DynamicFiltersMobile from '@/components/global/DynamicFiltersMobile.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCatalogQuery } from '@/composables/useCatalogQuery'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants' // Проверь правильность пути
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация ---
const route = useRoute()
const router = useRouter()
const categoriesStore = useCategoriesStore()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl } = useSupabaseStorage()
// Флаг монтирования для корректной гидратации
const isMounted = ref(false)

// 🆕 Отмена запросов при размонтировании
const abortController = ref<AbortController | null>(null)

onMounted(() => {
  isMounted.value = true
})

onUnmounted(() => {
  // Отменяем все активные запросы при уходе со страницы
  if (abortController.value) {
    abortController.value.abort()
  }
})

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<AttributeWithValue[]>([])
const availableBrands = ref<BrandForFilter[]>([])
const availableMaterials = ref<Material[]>([])
const availableCountries = ref<Country[]>([])
const isLoadingFilters = ref(true)
const accumulatedProducts = ref<ProductWithGallery[]>([])
const isMobileFiltersOpen = ref(false)
const isSubcategoriesDrawerOpen = ref(false)

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
  subCategoryIds: getArrayFromQuery(route.query.subcategories),
  price: [0, 50000],
  brandIds: getArrayFromQuery(route.query.brands),
  materialIds: getArrayFromQuery(route.query.materials),
  countryIds: getArrayFromQuery(route.query.countries),
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
const currentCategory = computed(() => {
  if (!categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(c => c.slug === currentCategorySlug.value)
})

const categoryOgImageUrl = computed(() => {
  const imageFilename = currentCategory.value?.image_url

  if (!imageFilename)
    return undefined

  // Используем твой композабл.
  // Важно: OG Image требует полный URL. Supabase composable обычно возвращает полный.
  // Третий аргумент (размер) можно не передавать, чтобы получить оригинал,
  // или передать 'lg'/'xl', если у тебя есть такие пресеты для лучшего качества.
  return getImageUrl(BUCKET_NAME_CATEGORY, imageFilename)
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
const canonicalUrl = computed(() => {
  const baseUrl = 'https://uhti.kz'
  const path = route.path
  return `${baseUrl}${path}`
})

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

const {
  products: currentPageProducts,
  hasMore,
  isLoading: isLoadingProducts,
  isFetching,
} = useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE)

const displayedProducts = computed(() => {
  if (currentPage.value === 1) {
    return currentPageProducts.value
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
      productsStore.fetchAttributesForCategory(slug),
      productsStore.fetchAllMaterials(),
      productsStore.fetchAllCountries(),
      productsStore.fetchPriceRangeForCategory(slug),
    ])

    // Обрабатываем успешные результаты
    const [brandsResult, attributesResult, materialsResult, countriesResult, priceRangeResult] = results

    availableBrands.value = brandsResult.status === 'fulfilled' ? brandsResult.value : []
    availableFilters.value = attributesResult.status === 'fulfilled' ? attributesResult.value : []
    availableMaterials.value = materialsResult.status === 'fulfilled' ? materialsResult.value : []
    availableCountries.value = countriesResult.status === 'fulfilled' ? countriesResult.value : []

    const priceRangeData = priceRangeResult.status === 'fulfilled'
      ? priceRangeResult.value
      : { min_price: 0, max_price: 50000 }

    const priceMin = priceRangeData.min_price
    const priceMax = priceRangeData.max_price
    priceRange.value = { min: priceMin, max: priceMax }

    const newAttributeFilters: Record<string, any[]> = {}
    for (const attr of availableFilters.value) {
      const queryKey = `attr_${attr.slug}`
      const queryValue = route.query[queryKey]
      newAttributeFilters[attr.slug] = getArrayFromQuery(queryValue)
    }

    const priceMinFromQuery = route.query.price_min ? Number(route.query.price_min) : priceMin
    const priceMaxFromQuery = route.query.price_max ? Number(route.query.price_max) : priceMax

    activeFilters.value = {
      sortBy: getSortByFromQuery(route.query.sort_by),
      subCategoryIds: getArrayFromQuery(route.query.subcategories),
      price: [priceMinFromQuery, priceMaxFromQuery],
      brandIds: getArrayFromQuery(route.query.brands),
      materialIds: getArrayFromQuery(route.query.materials),
      countryIds: getArrayFromQuery(route.query.countries),
      attributes: newAttributeFilters,
    }

    currentPage.value = 1
    accumulatedProducts.value = []
  }
  catch (error: any) {
    // Игнорируем ошибки отмены
    if (error.name !== 'AbortError') {
      console.error('Error loading filters:', error)
    }
  }
  finally {
    isLoadingFilters.value = false
  }
}

function loadMoreProducts() {
  if (currentPage.value === 1) {
    accumulatedProducts.value = [...currentPageProducts.value]
  }
  currentPage.value++
}

watch(currentPageProducts, (newProducts) => {
  if (currentPage.value > 1 && newProducts.length > 0) {
    const existingIds = new Set(accumulatedProducts.value.map(p => p.id))
    const uniqueNewProducts = newProducts.filter(p => !existingIds.has(p.id))
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

const metaDescription = computed(() => {
  if (hasActiveFilters.value) {
    return `Результаты фильтрации для категории "${title.value}". Широкий выбор товаров.`
  }
  return `Каталог товаров в категории "${title.value}". Широкий ассортимент качественных товаров по выгодным ценам.`
})

const metaTitle = computed(() => {
  if (hasActiveFilters.value) {
    return `${title.value} - Фильтр | Ваш магазин`
  }
  return `${title.value} - Купить в интернет-магазине | Ваш магазин`
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

// SEO метаданные
useHead(() => ({
  link: [
    {
      rel: 'canonical',
      href: canonicalUrl.value,
    },
  ],
}))

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

// SEO метаданные
useHead(() => {
  const schemas = []

  // 1. Breadcrumb Schema (Хлебные крошки)
  if (breadcrumbs.value.length > 0) {
    schemas.push({
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': breadcrumbs.value.map((crumb, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': crumb.name,
          'item': crumb.href
            ? `https://uhti.kz${crumb.href}`
            : undefined,
        })),
      }),
    })
  }

  // 2. CollectionPage Schema (Страница коллекции/категории)
  schemas.push({
    type: 'application/ld+json',
    children: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': title.value,
      'description': metaDescription.value,
      'url': canonicalUrl.value,
      'isPartOf': {
        '@type': 'WebSite',
        'name': 'Ваш магазин',
        'url': 'https://uhti.kz',
      },
      // Если есть картинка категории
      ...(categoryOgImageUrl.value && {
        image: categoryOgImageUrl.value,
      }),
    }),
  })

  // 3. ItemList Schema (Список товаров в категории)
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
          'url': `https://uhti.kz/catalog/products/${product.slug}`,
          'name': product.name,
          'image': product.product_images?.[0]?.image_url
            ? getImageUrl(BUCKET_NAME_PRODUCT, product.product_images?.[0]?.image_url, IMAGE_SIZES.CARD)
            : undefined,
        })),
      }),
    })
  }

  return {
    title: metaTitle.value,
    meta: [
      { name: 'description', content: metaDescription.value },
      { property: 'og:title', content: metaTitle.value },
      { property: 'og:description', content: metaDescription.value },
      { property: 'og:url', content: canonicalUrl.value },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Ваш магазин' },
      { property: 'og:locale', content: 'ru_RU' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: metaTitle.value },
      { name: 'twitter:description', content: metaDescription.value },
      { name: 'robots', content: robotsRule.value.noindex ? 'noindex, follow' : 'index, follow' },
    ],
    link: [
      { rel: 'canonical', href: canonicalUrl.value },
    ],
    // 🔥 Добавляем все schemas
    script: schemas,
  }
})

useRobotsRule(robotsRule)
</script>

<template>
  <div :class="`${containerClass} py-8`">
    <!-- Breadcrumbs и заголовок -->
    <ClientOnly>
      <Breadcrumbs
        v-if="breadcrumbs && breadcrumbs.length > 0"
        :items="breadcrumbs"
        class="mb-6"
        compact
      />
      <template #fallback>
        <div class="h-6 w-1/3 bg-muted rounded mb-6 animate-pulse" />
      </template>
    </ClientOnly>

    <h1 class="text-xl md:text-3xl font-bold mb-6 capitalize">
      {{ title }}
    </h1>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Десктоп фильтры -->
      <ClientOnly>
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

        <template #fallback>
          <aside class="hidden lg:block col-span-1 lg:sticky top-24 self-start">
            <div class="p-4 border rounded-lg bg-card space-y-6">
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
              <template v-for="filter in availableFilters" :key="filter.id">
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
                          :style="{ backgroundColor: ((option.meta as unknown) as { hex: string })?.hex }"
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
              v-if="(isLoading && isMounted) || (isLoading && displayedProducts.length === 0)"
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

    <!-- Мобильные компоненты -->
    <ClientOnly>
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

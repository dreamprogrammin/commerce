<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type { AttributeFilter, AttributeWithValue, BrandForFilter, IBreadcrumbItem, IProductFilters, ProductWithGallery, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DynamicFilters from '@/components/global/DynamicFilters.vue'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ СТРАНИЦЫ ---
// Все данные, связанные с отображением каталога, теперь живут здесь, а не в сторе.
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true) // Главный флаг для первоначальной загрузки и перезагрузки по фильтрам
const isLoadingMore = ref(false) // Флаг для кнопки "Показать еще"
const hasMoreProducts = ref(true)
const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<AttributeWithValue[]>([])
const availableBrands = ref<BrandForFilter[]>([])

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
  attributes: Record<string, (string | number)[]>
}
const activeFilters = ref<ActiveFilters>({
  sortBy: getSortByFromQuery(route.query.sort_by),
  subCategoryIds: [],
  price: [0, 50000], // Временный диапазон, будет обновлен
  attributes: {},
})

// --- 3. Вычисляемые свойства (Computeds) ---
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
// Вычисляемый диапазон цен на основе УЖЕ загруженных товаров
const priceRange = ref({ min: 0, max: 50000 })

// --- 4. Функции-обработчики ---

/**
 * Безопасно извлекает и валидирует параметр сортировки из URL.
 * @param queryValue - Значение из route.query.
 * @returns Валидное значение SortByType или 'popularity' по умолчанию.
 */
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

async function loadFilterData(slug: string) {
  // Теперь загружаем и сохраняем данные раздельно
  const [brands, attributes] = await Promise.all([
    productsStore.fetchBrandsForCategory(slug),
    productsStore.fetchAttributesForCategory(slug),
  ])

  availableBrands.value = brands
  availableFilters.value = attributes

  // Сбрасываем activeFilters
  const newAttributeFilters: Record<string, any[]> = {
    brand: [], // <-- Добавляем 'brand' сюда
  }
  for (const attr of attributes) {
    newAttributeFilters[attr.slug] = []
  }
  activeFilters.value.attributes = newAttributeFilters
}

/**
 * Главная функция загрузки товаров. Управляет локальным состоянием.
 * @param isLoadMore - `true` для дозагрузки, `false` для полной перезагрузки.
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

  // 1. Извлекаем brandIds из нового объекта `attributes`
  const brandIds = (activeFilters.value.attributes.brand as string[]) || []

  // 2. Готовим фильтры по остальным атрибутам для RPC
  const attributeFilters: AttributeFilter[] = Object.entries(activeFilters.value.attributes)
    .filter(([slug]) => slug !== 'brand') // Исключаем 'brand'
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  // 3. Формируем финальный объект фильтров для передачи в Pinia Store

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    brandIds: brandIds.length > 0 ? brandIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
  }

  console.log('Отправляю в RPC следующие фильтры:', filters)
  try {
    const { products: newProducts, hasMore } = await productsStore.fetchProducts(filters, currentPage.value, PAGE_SIZE)

    if (isLoadMore) {
      products.value.push(...newProducts)
    }
    else {
      products.value = newProducts
    }

    hasMoreProducts.value = hasMore

    // Обновляем диапазон цен только при первой загрузке (не при "Показать еще")
    if (!isLoadMore && newProducts.length > 0) {
      const prices = newProducts.map(p => Number(p.price))
      const newMin = Math.floor(Math.min(...prices))
      const newMax = Math.ceil(Math.max(...prices))
      priceRange.value = { min: newMin, max: newMax }
      activeFilters.value.price = [newMin, newMax]
      // Не сбрасываем `activeFilters.value.price` здесь, чтобы сохранить выбор пользователя
    }

    currentPage.value++
  }
  finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

/**
 * Обертка для кнопки "Показать еще".
 */
async function loadMoreProducts() {
  await loadProducts(true)
}

// --- 5. Логика загрузки данных и реакции на изменения ---

// `useAsyncData` грузит только "легкие" мета-данные на сервере (меню, хлебные крошки).
await useAsyncData(
  `catalog-meta-${currentCategorySlug.value}`,
  () => categoriesStore.fetchCategoryData(),
  { watch: [currentCategorySlug] },
)
// `watch` на `currentCategorySlug` запускает загрузку товаров
// при первом заходе на страницу и при каждой смене категории.
watch(
  currentCategorySlug,
  (newSlug) => {
    if (newSlug) {
      // <-- ИЗМЕНЕНО: Сбрасываем фильтры правильно
      activeFilters.value = {
        sortBy: getSortByFromQuery(route.query.sort_by),
        subCategoryIds: [],
        price: [0, 50000],
        attributes: {},
      }
      Promise.all([
        loadProducts(false),
        loadFilterData(newSlug),
      ])
    }
  },
  { immediate: true },
)

watchDebounced(activeFilters, () => {
  loadProducts(false)
}, { debounce: 500, deep: true })
</script>

<template>
  <div class="container py-8">
    <ClientOnly>
      <Breadcrumbs :items="breadcrumbs" class="mb-6" />

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
          :is-loading="isLoading"
        />
      </aside>
      <main class="col-span-3  min-w-0">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title ?? ''" />

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

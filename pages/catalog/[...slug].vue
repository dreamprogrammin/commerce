<script setup lang="ts">
import type { IProductFilters } from '@/types'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация и Реактивное Состояние ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

const { products, isLoadingList, isLoadingMore, hasMoreProducts, priceRange } = storeToRefs(productsStore)

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))
const title = computed(() => {
  const path = breadcrumbs.value
  if (Array.isArray(path) && path.length > 0) {
    const lastCrumb = path[path.length - 1]
    if (lastCrumb) {
      return lastCrumb.name // <-- `return` есть только здесь
    }
  }
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

const activeFilters = ref({
  sortBy: 'popularity' as const,
  subCategoryIds: [] as string[],
  price: [0, 50000] as [number, number],
})

// --- 2. Главная логика загрузки данных ---

// `useAsyncData` - наш единственный "дирижер" для загрузки при смене URL.
const { pending: isLoading, refresh } = await useAsyncData(
  'catalog-data', // Используем статичный ключ, но с `watch` на URL
  async () => {
    if (!currentCategorySlug.value)
      return

    const filters: IProductFilters = {
      categorySlug: currentCategorySlug.value,
      sortBy: activeFilters.value.sortBy,
      subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
      priceMin: activeFilters.value.price[0],
      priceMax: activeFilters.value.price[1],
    }

    // `useAsyncData` вызывает actions, которые наполняют наши сторы
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      productsStore.fetchProducts(filters, false),
    ])
  },
  {
    // Этот `watch` заставит `useAsyncData` перезапуститься при смене категории
    watch: [currentCategorySlug],
  },
)
const debouncedRefresh = useDebounceFn(() => {
  refresh()
}, 500)

watch(activeFilters, () => {
  debouncedRefresh()
}, { deep: true })

async function fetchInitialProducts() {
  if (!currentCategorySlug.value)
    return

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, false)
}

// Функция для кнопки "Показать еще"
async function loadMoreProducts() {
  if (!currentCategorySlug.value || isLoadingMore.value)
    return
  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price?.[0],
    priceMax: activeFilters.value.price?.[1],
  }
  await productsStore.fetchProducts(filters, true)
}
</script>

<template>
  <div class="container py-8">
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <FilterSidebar v-model="activeFilters" :price-range="priceRange" :is-loading="isLoading" />
      </aside>
      <main class="col-span-3">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title" />

        <!--
          Используем `isLoadingList` для показа скелетона.
          Он будет `true` только когда идет полная перезагрузка СПИСКА товаров,
          и не будет затрагиваться при переходе на страницу отдельного товара.
        -->
        <ProductGridSkeleton v-if="isLoading && products.length === 0" />
        <div v-else-if="products.length > 0" class="space-y-8">
          <ProductGrid :products="products" />
          <div v-if="hasMoreProducts" class="text-center">
            <Button variant="outline" size="lg" :disabled="isLoadingMore" @click="loadMoreProducts">
              <span v-if="isLoadingMore">Загрузка...</span>
              <span v-else>Показать ещё</span>
            </Button>
          </div>
        </div>
        <!-- Этот блок показывается, если загрузка завершена, но товаров нет -->
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

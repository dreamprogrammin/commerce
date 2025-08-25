<script setup lang="ts">
import type { IProductFilters, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
// Убедись, что все компоненты лежат в `components/global/` или импортированы явно

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

// --- 2. Реактивное состояние из сторов ---
// `pending` из useAsyncData будет нашим главным флагом загрузки
const { products, isLoadingMore, hasMoreProducts, priceRange } = storeToRefs(productsStore)
const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
}

// --- 3. Главная логика загрузки данных (SSR-First) ---
// `useAsyncData` отвечает за загрузку на сервере и при смене URL.
// `refresh` - функция для его ручного перезапуска.
const { pending, refresh } = await useAsyncData(
  `catalog-data-${route.fullPath}`, // Уникальный ключ для каждой страницы каталога
  async () => {
    if (!currentCategorySlug.value)
      return

    // Собираем фильтры для первого запроса.
    // При смене URL мы всегда используем дефолтные фильтры.
    const initialFilters: IProductFilters = {
      categorySlug: currentCategorySlug.value,
      sortBy: 'popularity',
      // subCategoryIds, priceMin, priceMax - здесь undefined, так как это начальная загрузка
    }

    // Параллельно грузим категории и первую страницу товаров.
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      productsStore.fetchProducts(initialFilters, false),
    ])

    return true // Возвращаем что-то, чтобы `useAsyncData` был доволен
  },
  { watch: [() => route.fullPath] }, // Перезапускаем `useAsyncData` при смене URL
)

// --- 4. Локальное состояние для фильтров ---
// ВАЖНО: Инициализируем фильтры ПОСЛЕ `useAsyncData`,
// чтобы `priceRange` уже содержал актуальные данные.
const activeFilters = ref<ActiveFilters>({
  sortBy: 'popularity',
  subCategoryIds: [] as string[],
  price: [priceRange.value.min, priceRange.value.max] as [number, number],
})

// --- 5. Вычисляемые свойства (Computeds), зависящие от данных ---
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))
const title = computed(() => {
  const path = breadcrumbs.value
  if (Array.isArray(path) && path.length > 0) {
    const lastCrumb = path[path.length - 1]
    if (lastCrumb)
      return lastCrumb.name
  }
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

// --- 6. Клиентская логика ---

// `watchDebounced` реагирует ТОЛЬКО на изменения фильтров на клиенте
watchDebounced(
  activeFilters,
  () => {
    // При любом изменении фильтров мы просто перезапускаем наш `useAsyncData`.
    // Он заново выполнит блок кода, но уже с новыми значениями `activeFilters`.
    refresh()
  },
  { debounce: 500, deep: true },
)

// Функция для кнопки "Показать еще"
async function loadMoreProducts() {
  if (!currentCategorySlug.value || isLoadingMore.value)
    return
  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, true)
}
</script>

<template>
  <div class="container py-8">
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <!--
          Сайдбар можно не оборачивать в ClientOnly, так как
          `priceRange` (для слайдера) и `subcategories`
          будут доступны сразу после серверного рендеринга.
        -->
        <FilterSidebar v-model="activeFilters" />
      </aside>
      <main class="col-span-3">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title" />

        <!--
          Используем `pending` из `useAsyncData` как наш главный индикатор загрузки.
          Он будет `true` и при смене URL, и при смене фильтров.
        -->
        <ProductGridSkeleton v-if="pending" />
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

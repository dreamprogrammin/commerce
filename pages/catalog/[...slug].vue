<script setup lang="ts">
import type { IProductFilters } from '@/types'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import CatalogHeader from '@/components/catalog/CatalogHeader.vue'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

// Подписываемся на состояние сторов
const { products, isLoading, isLoadingMore, hasMoreProducts } = storeToRefs(productsStore)

// --- Локальное состояние и Computeds ---
const activeFilters = ref({
  sortBy: 'popularity',
  subCategoryIds: [] as string[],
  price: [0, 50000] as [number, number],
})

// Отложенная версия фильтров для отправки запросов
const filtersForRequest = refDebounced(activeFilters, 400) // Увеличил задержку для слайдера

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))

// --- Функции-обработчики ---

/**
 * Главная функция, которая запускает ПОЛНУЮ перезагрузку товаров.
 */
async function fetchInitialProducts() {
  if (!currentCategorySlug.value)
    return

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: filtersForRequest.value.sortBy as IProductFilters['sortBy'],
    subCategoryIds: filtersForRequest.value.subCategoryIds.length > 0 ? filtersForRequest.value.subCategoryIds : undefined,
    priceMin: filtersForRequest.value.price[0],
    priceMax: filtersForRequest.value.price[1],
  }

  // ИСПРАВЛЕНИЕ: Вызываем `fetchProducts` из стора
  await productsStore.fetchProducts(filters, false)
}

/**
 * Функция для ДОЗАГРУЗКИ следующей "порции" товаров.
 */
async function loadMoreProducts() {
  if (!currentCategorySlug.value || isLoadingMore.value)
    return

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: filtersForRequest.value.sortBy as IProductFilters['sortBy'],
    subCategoryIds: filtersForRequest.value.subCategoryIds.length > 0 ? filtersForRequest.value.subCategoryIds : undefined,
    priceMin: filtersForRequest.value.price[0],
    priceMax: filtersForRequest.value.price[1],
  }

  // ИСПРАВЛЕНИЕ: Вызываем `fetchProducts` из стора
  await productsStore.fetchProducts(filters, true)
}

// --- Наблюдатели (Watchers) и хуки ---

// ИСПРАВЛЕНИЕ: Логика загрузки данных стала гораздо проще.
// Мы используем `useAsyncData` ОДИН раз для загрузки ВСЕХ необходимых данных на сервере.

await useAsyncData(
  `catalog-${currentCategorySlug.value}`, // Ключ зависит от слага, чтобы данные перезагружались при смене категории
  async () => {
    // Параллельно загружаем и категории, и первую порцию товаров
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      fetchInitialProducts(),
    ])
  },
)

// ИСПРАВЛЕНИЕ: Этот `watch` теперь отвечает ТОЛЬКО за перезагрузку при смене фильтров НА КЛИЕНТЕ.
watch(filtersForRequest, () => {
  // Мы не вызываем fetchInitialProducts напрямую, чтобы избежать двойного вызова при смене URL.
  // Вместо этого мы можем использовать `refresh` от `useAsyncData` или просто вызвать fetch.
  fetchInitialProducts()
}, {
  deep: true,
})
</script>

<template>
  <div class="container py-8">
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <FilterSidebar v-model="activeFilters" />
      </aside>
      <main class="col-span-3">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :category-slug="currentCategorySlug" />

        <ProductGridSkeleton v-if="isLoading && products.length === 0" />
        <div v-else-if="products.length > 0" class="space-y-8">
          <ProductGrid :products="products" />
          <div v-if="hasMoreProducts" class="text-center">
            <!-- ИСПРАВЛЕНИЕ: `@click` должен вызывать `loadMoreProducts` -->
            <Button variant="outline" size="lg" :disabled="isLoadingMore" @click="loadMoreProducts">
              <span v-if="isLoadingMore">Загрузка...</span>
              <span v-else>Показать ещё</span>
            </Button>
          </div>
        </div>
        <div v-else class="text-center ...">
          ...
        </div>
      </main>
    </div>
  </div>
</template>

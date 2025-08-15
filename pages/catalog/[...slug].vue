<script setup lang="ts">
import type { IProductFilters } from '@/types'
import { refDebounced, watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import CatalogHeader from '@/components/catalog/CatalogHeader.vue'
import FilterSidebar from '@/components/catalog/FilterSidebar.vue'
import ProductGridSkeleton from '@/components/catalog/ProductGridSkeleton.vue'
// ... импорты компонентов ...
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()
const { products, isLoading, isLoadingMore, hasMoreProducts } = storeToRefs(productsStore)

// --- Локальное состояние ---
const activeFilters = ref({
  sortBy: 'popularity',
  subCategoryIds: [] as string[],
  price: [0, 50000] as [number, number],
})

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))

// --- Функции-обработчики ---

async function fetchInitialProducts() {
  // Защита остается, она не помешает
  if (!currentCategorySlug.value)
    return

  const filters: IProductFilters = {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy as IProductFilters['sortBy'],
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, false)
}

async function loadMoreProducts() { /* ... (без изменений) ... */ }

// --- Главная логика загрузки данных ---

// 1. `useAsyncData` отвечает за загрузку при смене URL
const { refresh } = await useAsyncData(
  `catalog-${route.fullPath}`, // Используем `route.fullPath` чтобы ключ был уникален и для `/catalog/boys` и для `/catalog/girls`
  async () => {
    // Ждем, пока slug будет доступен
    if (!currentCategorySlug.value)
      return

    // Сбрасываем фильтры при смене категории
    activeFilters.value.subCategoryIds = []
    // (цену можно не сбрасывать, это дело вкуса)

    await Promise.all([
      categoriesStore.fetchCategoryData(),
      fetchInitialProducts(),
    ])
  },
  {
    // Этот watch гарантирует, что useAsyncData будет перезапущен при смене URL
    watch: [currentCategorySlug],
  },
)

// 2. `watchDebounced` отвечает ТОЛЬКО за реакцию на изменение ФИЛЬТРОВ
watchDebounced(
  activeFilters,
  () => {
    // Мы не вызываем `useAsyncData` снова, а просто перезапускаем загрузку товаров.
    // Это не будет конфликтовать с серверной загрузкой.
    fetchInitialProducts()
  },
  {
    debounce: 500, // Задержка в 500мс после последнего изменения фильтров
    deep: true,
  },
)
</script>

<template>
  <div class="container py-8">
    <!-- Breadcrumbs рендерятся и на сервере, и на клиенте, с ними все ОК -->
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <!--
          Фильтры зависят от данных, которые могут меняться.
          Оборачиваем их в <ClientOnly>, чтобы они рендерились
          только в браузере. На сервере будет заглушка.
        -->
        <ClientOnly>
          <FilterSidebar v-model="activeFilters" />
          <template #fallback>
            <!-- Заглушка, которая будет на сервере и при первой загрузке -->
            <div class="p-4 border rounded-lg bg-card space-y-4">
              <Skeleton class="h-8 w-1/2" />
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-full" />
            </div>
          </template>
        </ClientOnly>
      </aside>

      <main class="col-span-3">
        <!--
          Заголовок тоже зависит от клиентского состояния.
          Оборачиваем его.
        -->
        <ClientOnly>
          <CatalogHeader v-model:sort-by="activeFilters.sortBy" :category-slug="currentCategorySlug" />
          <template #fallback>
            <div class="flex justify-between items-center mb-6">
              <Skeleton class="h-10 w-1/3" />
              <Skeleton class="h-10 w-[220px]" />
            </div>
          </template>
        </ClientOnly>

        <!--
          Сетка товаров - самое важное место.
          Логика `v-if="isLoading"` на клиенте может отличаться от сервера.
          Поэтому всю эту логику мы рендерим только на клиенте.
        -->
        <ClientOnly>
          <ProductGridSkeleton v-if="isLoading && products.length === 0" />
          <div v-else-if="products.length > 0" class="space-y-8">
            <CatalogProductGrid :products="products" />
            <div v-if="hasMoreProducts" class="text-center">
              <Button variant="outline" size="lg" :disabled="isLoadingMore" @click="loadMoreProducts">
                <span v-if="isLoadingMore">Загрузка...</span>
                <span v-else>Показать ещё</span>
              </Button>
            </div>
          </div>
          <div v-else class="text-center ...">
            товары не найдены
          </div>

          <template #fallback>
            <!-- Эта заглушка будет и на сервере, и пока клиент не смонтировался -->
            <ProductGridSkeleton />
          </template>
        </ClientOnly>
      </main>
    </div>
  </div>
</template>

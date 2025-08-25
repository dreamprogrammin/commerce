<script setup lang="ts">
import type { IProductFilters, SortByType } from '@/types'
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 1. Инициализация и Реактивное Состояние ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

const { products, isLoadingList, isLoadingMore, hasMoreProducts, priceRange } = storeToRefs(productsStore)

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
}
const activeFilters = ref<ActiveFilters>({
  sortBy: 'popularity',
  subCategoryIds: [],
  price: [0, 50000], // Временное начальное значение
})

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)

// --- 2. Главная логика загрузки данных ---

// `useAsyncData` - наш единственный "дирижер" для загрузки при смене URL.
const { refresh } = await useAsyncData(
  `catalog-${route.fullPath}`,
  async () => {
    if (!currentCategorySlug.value)
      return

    // Сбрасываем фильтры при каждой новой загрузке категории
    activeFilters.value = {
      sortBy: 'popularity',
      subCategoryIds: [],
      price: [0, 50000], // Сбрасываем на дефолт
    }

    const initialFilters: IProductFilters = {
      categorySlug: currentCategorySlug.value,
      sortBy: activeFilters.value.sortBy,
    }

    // Параллельно грузим категории и первую страницу товаров
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      productsStore.fetchProducts(initialFilters, false),
    ])

    // ПОСЛЕ загрузки товаров, устанавливаем ПРАВИЛЬНЫЙ диапазон цен в фильтры
    const newPriceRange = priceRange.value
    activeFilters.value.price = [newPriceRange.min, newPriceRange.max]
  },
  { watch: [() => route.fullPath] },
)

// --- 3. Вычисляемые свойства, зависящие от загруженных данных ---
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

// --- 4. Клиентская логика для реакции на действия пользователя ---

// `watchDebounced` реагирует ТОЛЬКО на изменения фильтров, сделанные пользователем.
watchDebounced(
  activeFilters,
  () => {
    // Не нужно ничего проверять. Просто перезапускаем `useAsyncData`.
    // Он сам возьмет новые значения из `activeFilters`.
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
        <FilterSidebar v-model="activeFilters" />
      </aside>
      <main class="col-span-3">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title" />

        <!--
          Используем `isLoadingList` для показа скелетона.
          Он будет `true` только когда идет полная перезагрузка СПИСКА товаров,
          и не будет затрагиваться при переходе на страницу отдельного товара.
        -->
        <ProductGridSkeleton v-if="isLoadingList" />
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

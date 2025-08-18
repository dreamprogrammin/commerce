<script setup lang="ts">
import type { IProductFilters } from '@/types'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
// Убедись, что все компоненты импортированы или лежат в `components/global`

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

// --- 2. Источник правды для шаблона ---
// `storeToRefs` создает реактивные ссылки на состояние сторов.
// Шаблон будет автоматически обновляться при их изменении.
const { products, isLoading, isLoadingMore, hasMoreProducts } = storeToRefs(productsStore)

// --- 3. Локальное состояние для фильтров ---
interface ActiveFilters {
  sortBy: 'popularity' | 'newest' | 'price_asc' | 'price_desc'
  subCategoryIds: string[]
  price: [number, number]
}
const activeFilters = ref<ActiveFilters>({
  sortBy: 'popularity',
  subCategoryIds: [],
  price: [0, 50000], // Начальный диапазон цен
})

// --- 4. COMPUTED-свойства для UI ---
const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)

// `breadcrumbs` и `title` теперь реактивно зависят от `categoriesStore`.
// Они обновятся, как только `fetchCategoryData` заполнит стор.
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))

const title = computed(() => {
  const path = breadcrumbs.value
  // Безопасная проверка, чтобы избежать ошибок `undefined`
  if (Array.isArray(path) && path.length > 0) {
    const lastCrumb = path[path.length - 1]
    if (lastCrumb)
      return lastCrumb.name
  }
  // Запасной вариант, если "хлебные крошки" еще не готовы
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

// --- 5. Функции-обработчики ---

/**
 * Запускает полную перезагрузку товаров с текущими фильтрами.
 */
async function fetchInitialProducts() {
  const slug = currentCategorySlug.value
  if (!slug)
    return

  const filters: IProductFilters = {
    categorySlug: slug,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, false)
}

/**
 * Запускает дозагрузку следующей страницы товаров.
 */
async function loadMoreProducts() {
  const slug = currentCategorySlug.value
  if (!slug || isLoadingMore.value)
    return

  const filters: IProductFilters = {
    categorySlug: slug,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, true)
}

// --- 6. Главная логика загрузки данных ---

// `useAsyncData` наполняет наши сторы при первой загрузке (на сервере).
await useAsyncData(
  `catalog-${route.fullPath}`, // Уникальный ключ для кэширования
  async () => {
    // Параллельно наполняем оба стора
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      fetchInitialProducts(),
    ])
    return true // Возвращаем что-то, чтобы Nuxt был доволен
  },
  {
    watch: [() => route.fullPath], // Перезапускаем, только если меняется URL
  },
)

// `watch` реагирует на ИЗМЕНЕНИЯ фильтров на клиенте.
watch(activeFilters, () => {
  // При любой смене фильтров, мы делаем полную перезагрузку товаров.
  fetchInitialProducts()
}, {
  deep: true, // `deep` нужен для отслеживания изменений внутри объекта `activeFilters`
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
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title" />

        <!-- Логика отображения теперь полностью зависит от реактивных данных из сторов -->
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
